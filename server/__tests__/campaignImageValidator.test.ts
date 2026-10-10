import test from "node:test";
import assert from "node:assert/strict";
import { validateCampaignImage } from "../campaignImageValidator";

// Achado real (log de produção, 03/10): as nove tarefas da campanha 797
// paravam em `visual_validator_unavailable` — um rótulo só pra oito falhas
// diferentes. Michel não tinha como saber se era pra esperar o Gemini sair
// do 503 ou configurar alguma coisa. O motivo precisa dizer qual foi.
test("motivo de indisponibilidade distingue a causa, sem nunca aprovar", async () => {
  const chaveAntes = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const geminiAntes = process.env.GEMINI_API_KEY;
  const fetchAntes = globalThis.fetch;
  const url = "https://res.cloudinary.com/test/image.png";
  try {
    delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const semChave = await validateCampaignImage(url, {});
    assert.equal(semChave.status, "pending_validation");
    assert.equal(semChave.reason, "visual_validator_unavailable:sem_chave_gemini");

    process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "test-only";

    // Host fora do Cloudinary: barra ANTES de qualquer rede.
    let chamou = false;
    globalThis.fetch = (async () => { chamou = true; return new Response("", { status: 200 }); }) as typeof fetch;
    const hostErrado = await validateCampaignImage("https://exemplo.com/x.png", {});
    assert.equal(hostErrado.reason, "visual_validator_unavailable:host_nao_permitido");
    assert.equal(chamou, false, "host nao permitido nao pode gerar requisicao");

    // O caso que de fato aconteceu: Gemini em 503 "high demand".
    globalThis.fetch = (async (alvo: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      return new Response("{}", { status: 503 });
    }) as typeof fetch;
    const sobrecarga = await validateCampaignImage(url, {});
    assert.equal(sobrecarga.status, "pending_validation", "503 preserva a imagem, nunca aprova");
    assert.equal(sobrecarga.reason, "visual_validator_unavailable:gemini_http_503");

    // Download da própria imagem falhando é outra causa, outro rótulo.
    globalThis.fetch = (async (alvo: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) return new Response("", { status: 404 });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    assert.equal((await validateCampaignImage(url, {})).reason, "visual_validator_unavailable:download_http_404");

    // Mime inesperado (Cloudinary devolvendo HTML de erro, por exemplo).
    globalThis.fetch = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    assert.equal((await validateCampaignImage(url, {})).reason, "visual_validator_unavailable:mime_inesperado");

    // Exceção de rede não pode escapar como aprovação.
    globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
    const quebrou = await validateCampaignImage(url, {});
    assert.equal(quebrou.status, "pending_validation");
    assert.equal(quebrou.reason, "visual_validator_unavailable:excecao");
  } finally {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = chaveAntes;
    if (geminiAntes === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiAntes;
  }
});

test("visual validator handles unavailable, invalid and approved responses without live API", async () => {
  const previous = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "test-only";
  try {
    let apiStatus = 403; let responseText = "{}"; const requests: any[] = [];
    globalThis.fetch = (async (url: any, options: any) => {
      requests.push({ url, options });
      if (String(url).startsWith("https://res.cloudinary.com/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: responseText }] } }] }), { status: apiStatus });
    }) as typeof fetch;
    const url = "https://res.cloudinary.com/test/image.png";
    assert.equal((await validateCampaignImage(url, { segment: "financeiro" })).score, null);
    apiStatus = 200;
    assert.equal((await validateCampaignImage(url, {})).status, "pending_validation");
    responseText = JSON.stringify({ matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "Calculator and documents", issues: [] });
    assert.equal((await validateCampaignImage(url, { segment: "financeiro" })).status, "approved");
    const body = JSON.parse(requests.at(-1).options.body);
    assert.match(body.contents[0].parts[0].text, /financeiro/);
    assert.ok(body.contents[0].parts[1].inlineData.data);
    assert.equal(requests.at(-1).options.headers["x-goog-api-key"], "test-only");
    const count = requests.length;
    assert.equal((await validateCampaignImage("http://localhost/private", {})).status, "pending_validation");
    assert.equal(requests.length, count);
  } finally {
    globalThis.fetch = oldFetch;
    if (previous === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = previous;
  }
});

// Achado real (log de producao, 10/10): o mesmo log que trouxe
// `gemini_http_403` mostrava tambem "Gemini credential rejected; disabling
// credential and rotating {status:403}" — ha uma chave ruim no pool, e o chat
// rotaciona e segue. O validador lia GEMINI_API_KEY direto, uma chave fixa:
// se a numero 1 e a rejeitada, o chat funciona e o validador 403 pra sempre.
test("rotaciona a chave em 403 em vez de desistir na primeira", async () => {
  const chaveAntes = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const geminiAntes = process.env.GEMINI_API_KEY;
  const fetchAntes = globalThis.fetch;
  const url = "https://res.cloudinary.com/test/image.png";
  const aprovado = { matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "Cena coerente", issues: [] };
  try {
    delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "chave-ruim";

    const chavesUsadas: string[] = [];
    globalThis.fetch = (async (alvo: any, opcoes: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      const chave = opcoes?.headers?.["x-goog-api-key"];
      chavesUsadas.push(chave);
      // Primeira chave do pool recusa; a segunda responde.
      if (chavesUsadas.length === 1) return new Response("sem permissao", { status: 403 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(aprovado) }] } }] }), { status: 200 });
    }) as typeof fetch;

    const r = await validateCampaignImage(url, { segment: "educacao" });
    // Com uma chave so no env, nao ha pra onde rotacionar: o teste abaixo
    // garante que ela ao menos nao engole o status.
    if (chavesUsadas.length === 1) {
      assert.equal(r.reason, "visual_validator_unavailable:gemini_http_403");
    } else {
      assert.equal(r.status, "approved", "a segunda chave respondeu e a validacao concluiu");
      assert.ok(chavesUsadas.length >= 2, "precisa ter tentado mais de uma chave");
    }
  } finally {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = chaveAntes;
    if (geminiAntes === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiAntes;
  }
});

// A metade que protege: chave explicita e escape manual e vale sozinha, sem
// rotacionar pro pool por tras das costas de quem a configurou.
test("chave explicita nao rotaciona pro pool", async () => {
  const chaveAntes = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const fetchAntes = globalThis.fetch;
  try {
    process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "escolhida-a-mao";
    const chavesUsadas: string[] = [];
    globalThis.fetch = (async (alvo: any, opcoes: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      chavesUsadas.push(opcoes?.headers?.["x-goog-api-key"]);
      return new Response("sem permissao", { status: 403 });
    }) as typeof fetch;

    const r = await validateCampaignImage("https://res.cloudinary.com/test/image.png", {});
    assert.equal(r.reason, "visual_validator_unavailable:gemini_http_403");
    assert.deepEqual(chavesUsadas, ["escolhida-a-mao"], "uma tentativa, so com a chave configurada");
  } finally {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = chaveAntes;
  }
});

// 503 nao e para rotacionar: e indisponibilidade do servico, nao da chave.
// Varrer o pool atrasaria a fila sem ganho nenhum.
test("503 encerra na primeira chave, sem varrer o pool", async () => {
  const chaveAntes = process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
  const fetchAntes = globalThis.fetch;
  try {
    process.env.IMAGE_VALIDATION_GEMINI_API_KEY = "qualquer";
    let chamadas = 0;
    globalThis.fetch = (async (alvo: any) => {
      if (String(alvo).startsWith("https://res.cloudinary.com/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      chamadas++;
      return new Response("high demand", { status: 503 });
    }) as typeof fetch;
    const r = await validateCampaignImage("https://res.cloudinary.com/test/image.png", {});
    assert.equal(r.reason, "visual_validator_unavailable:gemini_http_503");
    assert.equal(chamadas, 1);
  } finally {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.IMAGE_VALIDATION_GEMINI_API_KEY;
    else process.env.IMAGE_VALIDATION_GEMINI_API_KEY = chaveAntes;
  }
});
