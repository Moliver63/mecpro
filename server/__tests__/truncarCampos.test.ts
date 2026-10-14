import test from "node:test";
import assert from "node:assert/strict";
import { cortarNoLimite, truncarCamposNoLimite, creativeTextIssues, CREATIVE_TEXT_LIMITS } from "../creativeRewriteGuard";
import { buildCampaignFacts } from "../campaignFactGuard";

const facts = buildCampaignFacts({ input: {}, clientProfile: {}, segment: "infoprodutos" });

test("corte respeita o limite sem quebrar palavra nem pendurar conector", () => {
  // Fronteira de palavra: mantem tudo que cabe, sem quebrar "Hasan" no meio.
  assert.equal(cortarNoLimite("Jornada de autoconhecimento com Shadia Hasan", 40), "Jornada de autoconhecimento com Shadia");
  // Conector pendurado no fim sai ("Jornada de autoconhecimento de" nao serve).
  assert.equal(cortarNoLimite("Jornada de autoconhecimento de verdade", 31), "Jornada de autoconhecimento");
  // Janela que termina exatamente em fim de palavra nao perde a ultima.
  assert.equal(cortarNoLimite("Resultado para todos os alunos agora", 30), "Resultado para todos os alunos");
  // Ja dentro do limite: devolve igual (sem trim-surpresa no meio).
  assert.equal(cortarNoLimite("Curso de autoconhecimento", 40), "Curso de autoconhecimento");
  // Fim de frase e preferido sobre fronteira de palavra.
  const duas = "Entenda sua historia. Comece a jornada agora mesmo com a gente";
  assert.equal(cortarNoLimite(duas, 40), "Entenda sua historia.");
  // Sem reticencias nunca — headline terminando em "..." parece bug.
  for (const limite of [20, 30, 40, 80]) {
    const r = cortarNoLimite("Transforme sua relacao com voce mesma em poucas semanas de pratica", limite);
    assert.ok(r.length <= limite, `${limite}: ${r.length}`);
    assert.doesNotMatch(r, /\.\.\.$|…$/);
    assert.doesNotMatch(r, /[,;:\-–—/|]$/, `pontuacao solta no fim: ${r}`);
  }
  // Palavra unica maior que o limite: corte duro e a unica saida, mas cabe.
  assert.equal(cortarNoLimite("Autoconhecimentoprofundo", 10).length, 10);
  // Colchete aberto e nao fechado nao pode sobrar visivel no anuncio.
  assert.doesNotMatch(cortarNoLimite("Garanta sua vaga [turma de setembro agora]", 30), /\[/);
});

// Achado real (log de producao, 14/10, projeto 49): card 1 com headline acima de
// 40 e card 4 com copy acima de 500, as duas reprovadas nas duas tentativas de
// reescrita. O laco terminava segurando o campo ORIGINAL invalido e a campanha
// inteira morria em CREATIVE_REPAIR_REQUIRED.
test("campo que sobreviveu as reescritas sai do laco dentro do limite", () => {
  const criativo = {
    headline: "Descubra o Metodo Shadia Hasan de autoconhecimento integrativo",
    description: "Comece hoje",
    copy: "Uma jornada para entender sua propria historia. ".repeat(12),
    hook: "Voce se conhece de verdade?",
    cta: "Saiba mais",
  };
  assert.ok(creativeTextIssues(criativo).length, "o criativo de partida precisa estar invalido");

  const { candidate, truncados, naoResolvidos } = truncarCamposNoLimite(criativo, facts);
  assert.deepEqual(naoResolvidos, []);
  assert.deepEqual(truncados.sort(), ["copy", "headline"]);
  assert.deepEqual(creativeTextIssues(candidate), [], "depois do corte nao sobra violacao de comprimento");
  assert.ok(candidate.headline.length <= CREATIVE_TEXT_LIMITS.headline);
  assert.ok(candidate.copy.length <= CREATIVE_TEXT_LIMITS.copy);
  // O espelho acompanha, senao o par divergiria dentro do criativo.
  assert.equal(candidate.bodyText, candidate.copy);
  // Nao inventa: o corte e prefixo do original.
  assert.ok(criativo.headline.startsWith(candidate.headline));
  // Nao mutila o original.
  assert.ok(creativeTextIssues(criativo).length);
});

// A trava que importa mais que a correcao: cortar texto PODE inverter sentido.
// Aqui a ressalva esta na CAUDA, exatamente o trecho que o corte come — e o que
// sobraria ("Resultado para todos os alunos") afirma o oposto do original.
test("corte que removeria negacao e recusado, campo fica invalido de proposito", () => {
  const criativo = {
    headline: "Resultado para todos os alunos, sem excecao nenhuma",
    description: "Comece hoje",
    copy: "Fale com a equipe.",
    hook: "Oi",
    cta: "Saiba mais",
  };
  const { candidate, truncados, naoResolvidos } = truncarCamposNoLimite(criativo, facts);

  assert.deepEqual(truncados, [], "nao pode truncar quando a negacao cai fora");
  assert.match(naoResolvidos.join(" "), /headline: corte removeria uma negacao/);
  assert.equal(candidate.headline, criativo.headline, "campo segue intacto, e invalido");
  assert.ok(creativeTextIssues(candidate).length, "a campanha continua falhando aqui, e esse e o comportamento certo");
});

test("negacao preservada no corte libera a truncagem", () => {
  const criativo = {
    headline: "Nao prometemos atalho nenhum para o autoconhecimento profundo",
    description: "Comece hoje",
    copy: "Fale com a equipe.",
    hook: "Oi",
    cta: "Saiba mais",
  };
  const { candidate, truncados } = truncarCamposNoLimite(criativo, facts);
  assert.deepEqual(truncados, ["headline"]);
  assert.match(candidate.headline, /^Nao prometemos atalho nenhum/);
  assert.ok(candidate.headline.length <= 40);
});

test("criativo ja valido passa sem ser tocado", () => {
  const criativo = { headline: "Curso de autoconhecimento", description: "Comece hoje", copy: "Fale com a equipe.", hook: "Oi", cta: "Saiba mais" };
  const r = truncarCamposNoLimite(criativo, facts);
  assert.deepEqual(r.truncados, []);
  assert.deepEqual(r.naoResolvidos, []);
  assert.equal(r.candidate, criativo, "sem mudanca, devolve a mesma referencia");
});
