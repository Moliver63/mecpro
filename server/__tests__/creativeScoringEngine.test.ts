import assert from "node:assert/strict";
import test from "node:test";
import { scoreCreative } from "../creativeScoringEngine";

// ── Achado real (relato de Michel): "O validador provavelmente está
// confundindo um trecho com uma palavra. Ele acusa 'cura', mas o texto
// contém 'procura'." A checagem original usava String.includes(), que casa
// qualquer substring — "cura" é substring literal de "procura"/"escura".
// O texto do teste é exatamente o gerado por buildRealEstateCarouselAngles
// (server/carouselCopy.ts, card de estrutura): "O que você procura...".
test("does not flag 'cura' as a compliance risk inside 'procura'", () => {
  const result = scoreCreative({
    headline: "Conheça a estrutura",
    copy: "O que você procura na estrutura do seu próximo espaço? O espaço conta com dois aparelhos de ar-condicionado.",
  });
  assert.equal(result.complianceRisk, "Baixo");
});

test("does not flag 'cura' inside 'escura' either", () => {
  const result = scoreCreative({
    headline: "Ambiente aconchegante",
    copy: "Mesmo em uma sala mais escura, a estrutura favorece o conforto durante o dia.",
  });
  assert.equal(result.complianceRisk, "Baixo");
});

test("still flags 'cura' as a real compliance risk when it's an actual standalone word", () => {
  const result = scoreCreative({
    headline: "A cura definitiva",
    copy: "Este produto oferece a cura para o seu problema.",
  });
  assert.equal(result.complianceRisk, "Alto");
});

test("still flags a real high-risk phrase (garantia de resultado)", () => {
  const result = scoreCreative({
    headline: "Oferta imperdível",
    copy: "Garantia de resultado em 7 dias ou seu dinheiro de volta.",
  });
  assert.equal(result.complianceRisk, "Alto");
});

// ── Urgencia so conta com condicao real (docs/specs/2026-11-14-urgencia-e-resultado-com-prazo.md)
import { ofertaTemUrgenciaConfirmada, aplicarFlagDeUrgencia } from "../creativeScoringEngine";

const criativo806 = {
  headline: "Aula Autoconhecimento: R$ 19,90",
  hook: "Cansado de se sentir preso em padrões emocionais?",
  // texto real do card 0 da campanha 806
  copy: "Sente-se preso em padrões emocionais que te impedem de avançar? A psicóloga Shadia Hasan oferece uma aula completa por R$ 19,90 para iniciar seu autoconhecimento prático. Descubra exercícios que transformam e ganhe clareza sobre seus comportamentos. O acesso é liberado após pagamento único e vale por 7 dias. Experimente agora!",
  cta: "Quero minha aula por R$ 19,90",
  pain: "Padrões emocionais e comportamentais repetitivos que limitam seu avanço e a falta de clareza sobre seus próprios comportamentos.",
  solution: "Uma aula completa com exercícios práticos do Método Shadia Hasan para iniciar sua jornada de autoconhecimento, com acesso por 7 dias após pagamento único.",
};

test("sem condicao de urgencia: urgencia com piso 60 na nota e sem recomendacao de urgencia", () => {
  const com = scoreCreative(criativo806);
  const sem = scoreCreative({ ...criativo806, urgencyApplicable: false });
  assert.ok(com.recommendations.some(r => /urg[eê]ncia leg[ií]tima/i.test(r)));
  assert.ok(!sem.recommendations.some(r => /urg[eê]ncia leg[ií]tima/i.test(r)));
  const esperado = Math.round(sem.hookStrength * 0.3 + sem.clarity * 0.3 + Math.max(sem.urgency, 60) * 0.2 + sem.specificity * 0.2);
  assert.equal(sem.finalScore, esperado);
  assert.ok(sem.finalScore >= 75, `806 sem urgencia aplicavel deveria passar: ${sem.finalScore}`);
  assert.ok(com.finalScore < 75);
});

test("portao nao afrouxa: card so com campos no tamanho certo e sem dado concreto continua abaixo de 75", () => {
  const estrutural = {
    headline: "Conheça nosso método agora",
    hook: "Você quer mudar 1 coisa na sua vida?",
    copy: "Uma proposta para você que busca evolução pessoal com acompanhamento.",
    cta: "Saiba mais",
    pain: "Sensação de estagnação.",
    solution: "Acompanhamento próximo.",
    urgencyApplicable: false,
  };
  const r = scoreCreative(estrutural);
  assert.ok(r.finalScore < 75, `nota ${r.finalScore} (hook ${r.hookStrength}, clareza ${r.clarity}, especificidade ${r.specificity})`);
});

test("criativo antigo sem o flag e true explicito pontuam igual a hoje", () => {
  assert.deepEqual(scoreCreative({ ...criativo806, urgencyApplicable: true }), scoreCreative(criativo806));
});

test("recomendacao de especificidade nao pede prazo", () => {
  const r = scoreCreative({ headline: "Oi", hook: "", copy: "texto" });
  assert.ok(r.recommendations.every(x => !/prazo/i.test(x) || /urg[eê]ncia/i.test(x)));
});

test("condicao de urgencia real e reconhecida", () => {
  for (const t of [
    "Desconto de 20% até o dia 30", "Inscrições até 15/12", "Promoção válida até domingo",
    "Segundo lote de ingressos", "Vagas limitadas para a turma", "Black Friday", "Use o cupom BEMVINDO",
    "Matrículas encerram na sexta", "Oferta só até amanhã", "Pré-venda", "Últimas unidades",
  ]) assert.equal(ofertaTemUrgenciaConfirmada(t), true, t);
});

test("palavra solta nao vira urgencia (falsos positivos da revisao)", () => {
  for (const t of [
    "Aula por R$ 19,90, pagamento único, acesso por 7 dias, não renova",
    "Sem prazo de validade", "Lote de 360m² no centro", "Lançamento na planta", "Atendimento 24/7",
    "Bônus de material de apoio", "Inscrições abertas, turma contínua", "Desconto de 5% à vista",
    "Prazo de entrega de 30 dias",
  ]) assert.equal(ofertaTemUrgenciaConfirmada(t), false, t);
});

test("aplicarFlagDeUrgencia grava pelos fatos e remove flag forjado sem fatos", () => {
  const [a] = aplicarFlagDeUrgencia([{ headline: "x" }], "aula por R$ 19,90");
  assert.equal(a.urgencyApplicable, false);
  const [b] = aplicarFlagDeUrgencia([{ headline: "x" }], "desconto ate o dia 30");
  assert.equal(b.urgencyApplicable, true);
  const [c] = aplicarFlagDeUrgencia([{ headline: "x", urgencyApplicable: false }], undefined);
  assert.equal("urgencyApplicable" in c, false);
  const [d] = aplicarFlagDeUrgencia([{ headline: "x", urgencyApplicable: true }], "aula sem prazo");
  assert.equal(d.urgencyApplicable, false);
});

test("promocao real que o detector nao reconhece nao perde nota (bloqueante da rodada 2)", () => {
  const card = {
    headline: "Plano anual da academia",
    hook: "Quer treinar o ano todo pagando menos?",
    copy: "Plano anual com 50% de desconto só hoje para novos alunos. Agende agora sua aula experimental.",
    cta: "Agende agora",
  };
  const [marcado] = aplicarFlagDeUrgencia([card], "plano anual com 50% de desconto so hoje para novos alunos");
  assert.ok(scoreCreative(marcado).finalScore >= scoreCreative(card).finalScore);
});
