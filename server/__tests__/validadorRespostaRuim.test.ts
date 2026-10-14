import test from "node:test";
import assert from "node:assert/strict";
import { validateCampaignImage } from "../campaignImageValidator";
import { causaEhPermanente, causaPedeNovaImagem, causaPermanenteEmPortugues, resumoDeTarefasDeImagem } from "../imageWorkflowPolicy";

const url = "https://res.cloudinary.com/test/image.png";
const aprovado = { matchesBrief: true, safe: true, illegibleText: false, quality: 0.9, evidence: "Cena coerente", issues: [], blockers: [] };

// Achado real (log de producao, 14/10, campanha 798): o job 74 falhou TRES vezes
// com `excecao_syntaxerror` enquanto o job 75 era aprovado na mesma campanha. O
// SyntaxError saia de `JSON.parse(text)` e tinha tres origens que o rotulo unico
// nao distinguia — e cada uma pede acao diferente.
async function validarCom(resposta: unknown, status = 200) {
  const antes = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const fetchAntes = globalThis.fetch;
  try {
    process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "test-only";
    globalThis.fetch = (async (alvo: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      return new Response(typeof resposta === "string" ? resposta : JSON.stringify(resposta), { status });
    }) as typeof fetch;
    return await validateCampaignImage(url, { segment: "infoprodutos" });
  } finally {
    globalThis.fetch = fetchAntes;
    if (antes === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = antes;
  }
}

test("resposta sem candidato nao vira mais SyntaxError opaco", async () => {
  // `candidates` ausente: `text` era undefined e `JSON.parse(undefined)`
  // estourava com "undefined is not valid JSON".
  const r = await validarCom({ usageMetadata: {} });
  assert.equal(r.status, "pending_validation");
  assert.equal(r.reason, "visual_validator_unavailable:sem_candidato");
});

test("bloqueio de seguranca e nomeado, nos dois lugares em que o Gemini reporta", async () => {
  const noPrompt = await validarCom({ promptFeedback: { blockReason: "SAFETY" } });
  assert.equal(noPrompt.reason, "visual_validator_unavailable:bloqueado_seguranca_safety");

  const noCandidato = await validarCom({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] });
  assert.equal(noCandidato.reason, "visual_validator_unavailable:bloqueado_seguranca_safety");

  for (const r of [noPrompt, noCandidato]) assert.equal(r.status, "pending_validation", "nunca aprova por bloqueio");
});

test("JSON cortado por teto de token tem motivo proprio", async () => {
  const r = await validarCom({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"matchesBrief":tr' }] } }] });
  assert.equal(r.reason, "visual_validator_unavailable:resposta_truncada");
});

test("resposta vazia e JSON invalido se distinguem entre si", async () => {
  const vazia = await validarCom({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "   " }] } }] });
  assert.equal(vazia.reason, "visual_validator_unavailable:resposta_vazia");

  const invalida = await validarCom({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "não é json" }] } }] });
  assert.equal(invalida.reason, "visual_validator_unavailable:json_invalido");

  const corpoRuim = await validarCom("<html>502</html>");
  assert.equal(corpoRuim.reason, "visual_validator_unavailable:corpo_nao_json");
});

test("o caminho bom continua aprovando", async () => {
  const r = await validarCom({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(aprovado) }] } }] });
  assert.equal(r.status, "approved");
  assert.equal(r.score, 0.9);
});

// A classificacao e o que decide o que o chat diz ao Michel.
test("bloqueio de seguranca e permanente e pede imagem nova, nao revalidate", () => {
  const motivo = "visual_validator_unavailable:bloqueado_seguranca_safety";
  assert.equal(causaEhPermanente(motivo), true, "repetir na MESMA imagem da o mesmo veredito");
  assert.equal(causaPedeNovaImagem(motivo), true);
  assert.equal(causaPermanenteEmPortugues(motivo), "o filtro de conteudo do validador barrou esta imagem");

  // As causas da RESPOSTA ficam transitorias: podem passar numa nova tentativa.
  for (const transitoria of ["resposta_truncada", "json_invalido", "sem_candidato", "corpo_nao_json", "resposta_vazia"]) {
    const r = `visual_validator_unavailable:${transitoria}`;
    assert.equal(causaEhPermanente(r), false, transitoria);
    assert.equal(causaPedeNovaImagem(r), false, transitoria);
  }

  // Defeito pre-existente que o caso novo expos: isto tambem esta na imagem.
  assert.equal(causaPedeNovaImagem("visual_validator_unavailable:mime_inesperado"), true);
  assert.equal(causaPedeNovaImagem("visual_validator_unavailable:download_http_404"), true);
  // E isto nao: e configuracao.
  assert.equal(causaPedeNovaImagem("visual_validator_unavailable:sem_chave_gemini"), false);
  assert.equal(causaPedeNovaImagem("visual_validator_unavailable:gemini_http_403"), false);
});

test("destravar manda gerar outra imagem quando o problema e a imagem", () => {
  const soImagem = resumoDeTarefasDeImagem([
    { status: "pending_validation", attempts: 1, reason: "visual_validator_unavailable:bloqueado_seguranca_safety" },
  ] as any);
  assert.match(String(soImagem.destravar), /problema esta na imagem gravada/);
  assert.match(String(soImagem.destravar), /Precisa gerar outra/);
  assert.doesNotMatch(String(soImagem.destravar), /Precisa corrigir a configuracao/);
  assert.equal(soImagem.esperarResolve, false);

  const soConfig = resumoDeTarefasDeImagem([
    { status: "pending_validation", attempts: 1, reason: "visual_validator_unavailable:sem_chave_gemini" },
  ] as any);
  assert.match(String(soConfig.destravar), /corrigir a configuracao da validacao/);

  const mista = resumoDeTarefasDeImagem([
    { status: "pending_validation", attempts: 1, reason: "visual_validator_unavailable:bloqueado_seguranca_safety" },
    { status: "pending_validation", attempts: 1, reason: "visual_validator_unavailable:sem_chave_gemini" },
  ] as any);
  assert.match(String(mista.destravar), /1 de 2 esta na imagem gravada/);
});
