import test from "node:test";
import assert from "node:assert/strict";
import { visualDecision, QUALIDADE_MINIMA } from "../imageWorkflowPolicy";

const boa = {
  matchesBrief: true, safe: true, illegibleText: false, quality: 0.84,
  evidence: "Sala de aula com estudantes e material sobre a mesa, luz natural.",
  blockers: [], issues: [],
};

// Achado real: DEZ DIAS e ZERO imagens aprovadas. O portao antigo era
//   approved = matchesBrief && safe && !hasText && quality >= 0.72 && !issues.length
// e `issues` e campo OBRIGATORIO no schema, com a instrucao pedindo ao modelo
// pra apontar problemas. Modelo de visao a quem se pede lista de problemas
// preenche a lista. Uma observacao estava funcionando como veto.
test("observacao cosmetica NAO reprova mais — era isto que travava tudo", () => {
  const comRessalva = visualDecision({
    ...boa,
    issues: ["o enquadramento poderia ser mais fechado", "a luz da esquerda estoura um pouco"],
  });
  assert.equal(comRessalva.status, "approved", "ressalva estetica nao e motivo pra reprovar");
  // E a observacao nao se perde: fica registrada na tarefa pra revisao.
  assert.deepEqual(comRessalva.issues, ["o enquadramento poderia ser mais fechado", "a luz da esquerda estoura um pouco"]);
  assert.equal(comRessalva.reason, "visual_checks_passed");
});

// A metade que protege: o poder de veto nao desapareceu, virou explicito.
test("impedimento real continua reprovando", () => {
  const comImpedimento = visualDecision({ ...boa, blockers: ["imagem mostra um imovel, o segmento e curso online"] });
  assert.equal(comImpedimento.status, "rejected");
  assert.match(comImpedimento.reason, /impedimentos: imagem mostra um imovel/);

  assert.equal(visualDecision({ ...boa, matchesBrief: false }).status, "rejected");
  assert.equal(visualDecision({ ...boa, safe: false }).status, "rejected");
});

// Antes `!hasText` reprovava QUALQUER texto visivel — rotulo de embalagem,
// placa ao fundo, numero numa fachada. O proprio systemInstruction dizia que o
// critério era "illegible text", e o FLUX quase sempre renderiza algum glifo.
test("texto legivel passa; so o ilegivel reprova", () => {
  assert.equal(visualDecision({ ...boa, illegibleText: false }).status, "approved");
  const ilegivel = visualDecision({ ...boa, illegibleText: true });
  assert.equal(ilegivel.status, "rejected");
  assert.match(ilegivel.reason, /texto ilegivel/);
});

test("qualidade abaixo do minimo reprova, e o motivo diz o numero", () => {
  assert.equal(visualDecision({ ...boa, quality: QUALIDADE_MINIMA }).status, "approved", "no limite, aprova");
  const fraca = visualDecision({ ...boa, quality: 0.5 });
  assert.equal(fraca.status, "rejected");
  assert.match(fraca.reason, /qualidade 0\.50 abaixo de 0\.72/);
  assert.equal(fraca.score, 0.5, "o score vai pra tarefa mesmo reprovado");
});

// O motivo antigo era "visual_mismatch_or_quality" pra QUALQUER uma das cinco
// causas — a mesma doenca do visual_validator_unavailable, que levou sete dias
// pra ser diagnosticado por isso.
test("motivo da reprova nomeia todos os criterios que falharam", () => {
  const r = visualDecision({
    ...boa, matchesBrief: false, safe: false, illegibleText: true, quality: 0.3,
    blockers: ["garantia de retorno financeiro no anuncio"],
  });
  assert.equal(r.status, "rejected");
  for (const esperado of [/fora do briefing/, /conteudo inseguro/, /texto ilegivel/, /qualidade 0\.30/, /garantia de retorno/]) {
    assert.match(r.reason, esperado);
  }
  assert.ok(r.reason.length <= 300, "motivo vai pra coluna do banco: tem teto");
});

test("resposta malformada continua pendente, nunca aprovada por omissao", () => {
  for (const ruim of [
    null, undefined, "texto", 42, [],
    { ...boa, matchesBrief: "sim" },
    { ...boa, quality: 1.4 },
    { ...boa, quality: Number.NaN },
    { ...boa, evidence: "   " },
    { ...boa, blockers: "nenhum" },
    { ...boa, issues: [1, 2] },
    // Formato ANTIGO: tinha hasText e nao tinha blockers. Nao pode ser
    // interpretado pela metade — aprovar com criterio nao avaliado e pior que
    // deixar pendente.
    { matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "x", issues: [] },
  ]) {
    const r = visualDecision(ruim as any);
    assert.equal(r.status, "pending_validation", `${JSON.stringify(ruim)} devia ficar pendente`);
    assert.equal(r.score, null, "sem score fabricado");
    assert.equal(r.reason, "validator_invalid_response");
  }
});

test("listas longas sao cortadas sem estourar a coluna", () => {
  const r = visualDecision({
    ...boa,
    issues: Array.from({ length: 30 }, (_, i) => "x".repeat(500) + i),
    blockers: [],
  });
  assert.equal(r.status, "approved", "30 observacoes ainda aprovam");
  assert.equal(r.issues.length, 10);
  assert.ok(r.issues.every(i => i.length <= 300));
});
