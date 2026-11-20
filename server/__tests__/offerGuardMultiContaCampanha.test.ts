import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCampaignFacts } from "../campaignFactGuard";
import { assertCampaignPublishIntegrity, avaliarIntegridade, descreverConflito } from "../campaignPublishIntegrity";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";

/**
 * A regra de oferta e geral: so le o snapshot de fatos gravado na PROPRIA
 * campanha (aiResponse.campaignFacts), montado do briefing dela + perfil da
 * conta dela. Aqui duas contas e varias campanhas, com precos e produtos
 * escolhidos so neste arquivo, alternadas na mesma execucao.
 */

type Oferta = { conta: string; produto: string; preco?: string; extra?: string; perfil?: Record<string, string> };

function fatos(o: Oferta, objective = "leads") {
  return buildCampaignFacts({
    input: {
      productName: o.produto,
      productService: o.produto,
      ...(o.preco ? { productPrice: o.preco } : {}),
      name: "Aula | Campanha", // mesmo nome em todas as contas e campanhas
      objective,
      extraContext: o.extra || "",
    },
    clientProfile: { ...(o.perfil || {}) },
    segment: "infoprodutos",
  });
}

const IMG = { feedImageUrl: "https://example.com/a.jpg" };
const criativo = (headline: string, extra: Record<string, unknown> = {}) => ({
  headline, description: "Conheça a oferta", copy: "Veja como funciona.", cta: "Quero participar",
  needsReview: false, ...IMG, ...extra,
});

function campanha(o: Oferta, creatives: any[], id: number, projectId: number) {
  return {
    id, projectId, name: "Aula | Campanha", objective: "leads",
    adSets: '[{"name":"Conjunto 1","budget":50}]',
    aiResponse: JSON.stringify({ campaignFacts: fatos(o) }),
    creatives: JSON.stringify(creatives),
  };
}

const razoes = (c: any) => avaliarIntegridade(c).conflitos.map((x) => x.reason);
const bloqueia = (c: any) => razoes(c).length > 0;

// Contas de teste (valores so deste arquivo; a regra nao os conhece).
const PAGA: Oferta = { conta: "A", produto: "Aula de gestão de tráfego", preco: "R$ 47,00", extra: "Pagamento único. Acesso por 30 dias." };
const GRATIS: Oferta = { conta: "B", produto: "Aula de gestão de tráfego", extra: "Aula gratuita e aberta ao público, sem custo para participar." };

test("conta A (paga): 'aula grátis' e preço errado bloqueiam; preço certo passa", () => {
  const grat = campanha(PAGA, [criativo("Aula grátis de gestão de tráfego")], 1, 100);
  const errado = campanha(PAGA, [criativo("Aula de gestão de tráfego por R$ 27,00")], 1, 100);
  const certo = campanha(PAGA, [criativo("Aula de gestão de tráfego por R$ 47,00")], 1, 100);
  assert.ok(razoes(grat).includes("offer_free_claim_not_confirmed"), JSON.stringify(razoes(grat)));
  assert.ok(razoes(errado).some((r) => r.startsWith("price_conflict_expected_")), JSON.stringify(razoes(errado)));
  assert.equal(razoes(certo).length, 0, JSON.stringify(razoes(certo)));
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(certo));
  assert.throws(() => assertCampaignPublishIntegrity(grat), /CAMPAIGN_INTEGRITY/);
});

test("conta B (gratuita de verdade): 'aula grátis' passa", () => {
  const c = campanha(GRATIS, [criativo("Aula grátis de gestão de tráfego")], 1, 200);
  assert.deepEqual(razoes(c), []);
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(c));
});

test("alternando A e B na mesma execucao: cada campanha usa o proprio briefing", () => {
  // Mesmo texto, mesmo nome de campanha, mesmos ids de campanha; so a conta muda.
  const texto = "Aula grátis de gestão de tráfego";
  for (let i = 0; i < 25; i++) {
    const a = campanha(PAGA, [criativo(texto)], 1, 100);
    const b = campanha(GRATIS, [criativo(texto)], 1, 200);
    if (i % 2) { assert.equal(bloqueia(b), false, `B rodada ${i}`); assert.equal(bloqueia(a), true, `A rodada ${i}`); }
    else { assert.equal(bloqueia(a), true, `A rodada ${i}`); assert.equal(bloqueia(b), false, `B rodada ${i}`); }
  }
  // Objetos reaproveitados (como num cache de campanha) tambem se mantem estaveis.
  const a = campanha(PAGA, [criativo(texto)], 1, 100);
  const b = campanha(GRATIS, [criativo(texto)], 1, 200);
  const seq = [a, b, b, a, a, b, a, b].map(bloqueia);
  assert.deepEqual(seq, [true, false, false, true, true, false, true, false]);
  // Nao ha estado global: o snapshot de A nao menciona a oferta de B e vice-versa.
  assert.ok(!JSON.parse(a.aiResponse).campaignFacts.confirmedClaimsRaw.includes("gratuita"));
  assert.ok(!JSON.parse(b.aiResponse).campaignFacts.confirmedClaimsRaw.includes("47"));
});

test("regra vale para outros precos, produtos e unidades (nada fixo no codigo)", () => {
  const casos: Array<{ preco: string; produto: string; certo: string; errado: string }> = [
    { preco: "R$ 9,90", produto: "E-book de receitas", certo: "E-book de receitas por R$ 9,90", errado: "E-book de receitas por R$ 19,90" },
    { preco: "R$ 297,00", produto: "Mentoria em grupo", certo: "Mentoria em grupo por R$ 297,00", errado: "Mentoria em grupo por R$ 97,00" },
    { preco: "R$ 1.490,00", produto: "Curso de fotografia", certo: "Curso de fotografia por R$ 1.490,00", errado: "Curso de fotografia por R$ 1.049,00" },
  ];
  for (const k of casos) {
    const o: Oferta = { conta: "X", produto: k.produto, preco: k.preco };
    assert.equal(bloqueia(campanha(o, [criativo(k.certo)], 7, 9)), false, k.certo);
    assert.equal(bloqueia(campanha(o, [criativo(k.errado)], 7, 9)), true, k.errado);
    assert.ok(razoes(campanha(o, [criativo(`${k.produto} grátis`)], 7, 9)).includes("offer_free_claim_not_confirmed"), k.produto);
    assert.equal(bloqueia(campanha(o, [criativo(`${k.produto} com 50% de desconto`)], 7, 9)), true, k.produto);
  }
});

test("mesma conta, duas campanhas com ofertas diferentes: o bloqueio de uma nao trava a outra", () => {
  const perfil = { productService: "Escola de marketing digital" }; // perfil da mesma conta
  const paga: Oferta = { conta: "A", produto: "Workshop de anúncios", preco: "R$ 67,00", perfil };
  const gratis: Oferta = { conta: "A", produto: "Aula aberta de anúncios", extra: "Aula gratuita, sem custo.", perfil };
  const c1 = campanha(paga, [criativo("Workshop grátis de anúncios")], 11, 100);
  const c2 = campanha(gratis, [criativo("Aula grátis de anúncios")], 12, 100);
  const p1 = pendenciasLocaisParaPublicar(c1);
  const p2 = pendenciasLocaisParaPublicar(c2);
  assert.ok(p1.pendencias?.some((p) => p.tipo === "oferta_divergente"), "c1 deveria ter pendencia de oferta");
  assert.equal(p2.pendencias?.some((p) => p.tipo === "oferta_divergente"), false, "c2 nao pode herdar o bloqueio de c1");
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(c2));
  assert.throws(() => assertCampaignPublishIntegrity(c1), /CAMPAIGN_INTEGRITY/);
});

test("mensagem ao usuario: diz campo, trecho, motivo e o que corrigir", () => {
  const c = campanha(PAGA, [criativo("Aula grátis de gestão de tráfego")], 1, 100);
  const av = avaliarIntegridade(c);
  const msg = descreverConflito(av.conflitos[0], av.totalCriativos);
  assert.match(msg, /Criativo 1/);
  assert.match(msg, /Título/);
  assert.match(msg, /grátis/i);
  assert.match(msg, /gratuidade que não está confirmada/);
  assert.match(msg, /Sugestão|Falta confirmar/);
  let erro = "";
  try { assertCampaignPublishIntegrity(c); } catch (e: any) { erro = e.message; }
  assert.match(erro, /grátis/i);
});

test("briefing sem a informacao: pede confirmacao, nao inventa oferta nem usa outra campanha", () => {
  // Campanha sem preco, sem gratuidade, sem nada sobre custo.
  const vazia: Oferta = { conta: "C", produto: "Aula de gestão de tráfego" };
  const grat = campanha(vazia, [criativo("Aula grátis de gestão de tráfego")], 1, 300);
  const av = avaliarIntegridade(grat);
  assert.ok(av.conflitos.some((x) => x.reason === "offer_free_claim_not_confirmed"));
  assert.ok(av.conflitos.every((x) => x.kind ? x.suggestion?.replaceWith === undefined || !/R\$/.test(String(x.suggestion.replaceWith)) : true),
    "a sugestao nao pode inventar preco");
  assert.match(descreverConflito(av.conflitos[0], av.totalCriativos), /confirmar|Sugestão/);
  // Preco no anuncio sem preco no briefing: bloqueia pedindo confirmacao.
  const comPreco = campanha(vazia, [criativo("Aula de gestão de tráfego por R$ 10,00")], 1, 300);
  assert.ok(razoes(comPreco).includes("price_not_confirmed_in_current_briefing"), JSON.stringify(razoes(comPreco)));
  // Copy neutra, sem promessa de custo, passa.
  assert.deepEqual(razoes(campanha(vazia, [criativo("Aula de gestão de tráfego, inscreva-se")], 1, 300)), []);
  // Sem snapshot de fatos: erro estrutural, nunca fallback para outra campanha.
  const semFatos = { ...grat, aiResponse: "{}" };
  assert.match(avaliarIntegridade(semFatos).erroEstrutural || "", /sem briefing validado/);
  const outra = campanha(GRATIS, [criativo("Aula grátis")], 2, 200); // existe na mesma execucao
  assert.equal(bloqueia(outra), false);
  assert.match(avaliarIntegridade(semFatos).erroEstrutural || "", /sem briefing validado/);
});

test("briefing da campanha vence o perfil da conta: perfil 'gratuito' nao libera campanha paga", () => {
  const o: Oferta = {
    conta: "A", produto: "Workshop de anúncios", preco: "R$ 67,00",
    extra: "Workshop pago. Pagamento único.",
    perfil: { productService: "Temos aula gratuita aberta todo mês" }, // outra oferta da conta
  };
  const c = campanha(o, [criativo("Workshop grátis de anúncios")], 1, 100);
  assert.ok(razoes(c).includes("offer_free_claim_not_confirmed"),
    "gratuidade vinda do perfil da conta nao pode liberar o workshop pago desta campanha: " + JSON.stringify(razoes(c)));
});

test("perfil da conta com o MESMO produto gratuito nao libera 'grátis' numa campanha paga", () => {
  const perfil = { productService: "Workshop gratuito mensal de anúncios" };
  const paga: Oferta = { conta: "A", produto: "Workshop de anúncios", preco: "R$ 67,00", extra: "Pagamento único.", perfil };
  assert.ok(razoes(campanha(paga, [criativo("Workshop grátis de anúncios")], 1, 100)).includes("offer_free_claim_not_confirmed"));
  assert.deepEqual(razoes(campanha(paga, [criativo("Workshop de anúncios por R$ 67,00")], 1, 100)), []);
  // A campanha gratuita da mesma conta (briefing dela confirma) continua passando.
  const gratis: Oferta = { conta: "A", produto: "Workshop de anúncios", extra: "Workshop gratuito, sem custo.", perfil };
  assert.deepEqual(razoes(campanha(gratis, [criativo("Workshop grátis de anúncios")], 2, 100)), []);
  // Briefing da propria campanha paga que cita uma etapa gratuita do mesmo produto continua valendo.
  const mista: Oferta = { conta: "A", produto: "Workshop de anúncios", preco: "R$ 67,00", extra: "Primeira aula do workshop gratuita; o restante é pago.", perfil };
  assert.deepEqual(razoes(campanha(mista, [criativo("Primeira aula do workshop gratuita")], 3, 100)), []);
});

test("perfil gratuito de OUTRO produto da conta continua valendo; snapshot antigo segue a regra anterior", () => {
  const perfil = { productDifferentials: "Primeira consulta gratuita" };
  const o: Oferta = { conta: "A", produto: "Mentoria em grupo", preco: "R$ 297,00", perfil };
  assert.deepEqual(razoes(campanha(o, [criativo("Primeira consulta gratuita")], 1, 100)), []);
  // Snapshot gravado antes desta regra (sem os campos novos): comportamento anterior, sem erro.
  const antigo = campanha({ ...o, perfil: { productService: "Workshop gratuito de anúncios" }, produto: "Workshop de anúncios" }, [criativo("Workshop grátis de anúncios")], 2, 100);
  const resp = JSON.parse(antigo.aiResponse);
  delete resp.campaignFacts.campaignClaimsRaw; delete resp.campaignFacts.campaignProductRaw;
  antigo.aiResponse = JSON.stringify(resp);
  assert.doesNotThrow(() => avaliarIntegridade(antigo));
});

test("fonte: nenhum id, preco ou conta fixos nos arquivos da regra", () => {
  for (const f of ["campaignOfferGuard.ts", "campaignPublishIntegrity.ts", "offerDivergenceFix.ts", "metaOutgoingTextGuard.ts"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8")
      .split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.ok(!/\b(799|814)\b/.test(src), `${f} cita id de campanha`);
    assert.ok(!/19[,.]90/.test(src), `${f} cita preco fixo`);
    assert.ok(!/projectId\s*===|userId\s*===/.test(src), `${f} ramifica por conta`);
  }
});
