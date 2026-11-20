import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCampaignFacts, validateCampaignFactIntegrity, type CampaignFacts } from "../campaignFactGuard";
import { assertCampaignPublishIntegrity, avaliarIntegridade, descreverConflito } from "../campaignPublishIntegrity";
import { ajustarRascunhoCampanha } from "../campaignDraftEdit";
import { auditCreativeSegmentAlignment } from "../ai";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { publishChatAds } from "../chatAdsTools";

/**
 * Regra geral: com preco confirmado no briefing da campanha, "gratis" so passa
 * se o PROPRIO briefing da campanha confirma a gratuidade daquele produto.
 * Perfil da conta, outra campanha ou o texto misturado de um snapshot antigo
 * (sem campaignClaimsRaw/campaignProductRaw) nao confirmam. Os valores abaixo
 * (R$ 19,90, R$ 200, produtos) sao so exemplos de teste.
 */

type Briefing = { produto: string; preco?: string; extra?: string; perfil?: Record<string, string>; servico?: string };

function fatos(b: Briefing): CampaignFacts {
  return buildCampaignFacts({
    input: {
      productName: b.produto, productService: b.servico || b.produto,
      ...(b.preco ? { productPrice: b.preco } : {}),
      name: "Campanha de teste", objective: "leads", extraContext: b.extra || "",
    },
    clientProfile: { ...(b.perfil || {}) },
    segment: "infoprodutos",
  });
}
// Snapshot gravado antes da correcao: sem os campos que separam briefing de perfil.
function antigo(f: CampaignFacts): CampaignFacts {
  const c: any = JSON.parse(JSON.stringify(f));
  delete c.campaignClaimsRaw; delete c.campaignProductRaw;
  return c;
}

const IMG = { feedImageUrl: "https://example.com/a.jpg" };
const criativo = (headline: string) => ({ headline, description: "Conheça a oferta", copy: "Veja como funciona.", cta: "Quero participar", needsReview: false, ...IMG });
const campanha = (f: CampaignFacts, headline: string, id = 12, projectId = 1) => ({
  id, projectId, name: "Campanha de teste", objective: "leads", publishStatus: "draft",
  adSets: '[{"name":"Conjunto 1","budget":50}]', aiResponse: JSON.stringify({ campaignFacts: f }), creatives: JSON.stringify([criativo(headline)]),
});
const conflitos = (f: CampaignFacts, headline: string) => validateCampaignFactIntegrity([{ headline }], f).conflicts;
const bloqueia = (f: CampaignFacts, h: string) => conflitos(f, h).length > 0;
const msg = (f: CampaignFacts, h: string) => {
  const av = avaliarIntegridade(campanha(f, h));
  return av.conflitos.map((c) => descreverConflito(c, av.totalCriativos)).join(" | ");
};

// ── 1. Precos diferentes, produtos diferentes ────────────────────────────────
for (const k of [
  { produto: "Aula de gestão de tráfego", preco: "R$ 19,90", errado: "R$ 29,90" },
  { produto: "Aula de gestão de tráfego", preco: "R$ 200,00", errado: "R$ 150,00" },
  { produto: "Consultoria de energia solar", preco: "R$ 1.490,00", errado: "R$ 990,00" },
  { produto: "Pizza grande de calabresa", preco: "R$ 39,90", errado: "R$ 19,90" },
]) {
  test(`preço confirmado ${k.preco} (${k.produto}): preço certo passa, preço errado e "grátis" bloqueiam`, () => {
    const f = fatos({ produto: k.produto, preco: k.preco, extra: "Pagamento único." });
    const nome = k.produto.split(" ")[0];
    assert.equal(bloqueia(f, `${k.produto} por ${k.preco}`), false);
    assert.equal(bloqueia(f, `${k.produto} por ${k.errado}`), true);
    assert.equal(bloqueia(f, `${nome} grátis`), true, `${nome} grátis`);
    assert.equal(bloqueia(f, `${k.produto} gratuita`), true);
    // A mensagem usa so o preco confirmado, sem inventar valor nem desconto.
    const texto = msg(f, `${nome} grátis`);
    const valores = texto.match(/R\$\s?[\d.,]+/g) || [];
    assert.ok(valores.every((v) => v.replace(/\s/g, "") === k.preco.replace(/\s/g, "")), texto);
    assert.ok(!/%|desconto de/i.test(texto), texto);
  });
}

// ── 2. Oferta realmente gratuita ─────────────────────────────────────────────
test("oferta gratuita confirmada no briefing da campanha: 'grátis' passa", () => {
  const f = fatos({ produto: "Aula aberta de gestão de tráfego", extra: "Aula gratuita, sem custo para participar." });
  assert.equal(bloqueia(f, "Aula grátis de gestão de tráfego"), false);
  assert.equal(bloqueia(f, "Participe sem pagar nada"), false);
});

// ── 3. Produto pago + bonus gratuito ─────────────────────────────────────────
test("produto pago com bônus gratuito: 'grátis' passa no bônus e bloqueia no produto pago", () => {
  const f = fatos({ produto: "Curso de fotografia", preco: "R$ 200,00", extra: "Bônus gratuito: e-book de composição." });
  assert.equal(bloqueia(f, "Ganhe um bônus grátis: e-book de composição"), false);
  assert.equal(bloqueia(f, "Curso de fotografia por R$ 200,00"), false);
  assert.equal(bloqueia(f, "Curso de fotografia grátis"), true);
  const g = fatos({ produto: "Curso de fotografia", preco: "R$ 200,00", extra: "Bônus gratuito do curso: e-book de composição." });
  assert.equal(bloqueia(g, "Curso grátis"), true, "gratuidade do bônus não vale para o curso, mesmo citando 'curso' logo depois");
});

// ── 4. Aula introdutoria gratuita ao lado de curso pago ──────────────────────
test("aula introdutória gratuita + curso pago, ambos no briefing: 'grátis' passa na aula e bloqueia no curso", () => {
  for (const extra of [
    "Aula introdutória gratuita de 15 minutos. O curso completo custa R$ 200,00.",
    "O curso completo custa R$ 200,00. Aula introdutória gratuita de 15 minutos.",
    "Aula gratuita. Curso completo por R$ 200,00.",
  ]) {
    const f = fatos({ produto: "Curso completo de fotografia", preco: "R$ 200,00", extra });
    assert.equal(bloqueia(f, "Aula grátis de fotografia"), false, `aula: ${extra}`);
    assert.equal(bloqueia(f, "Curso completo de fotografia por R$ 200,00"), false, `preço: ${extra}`);
    assert.equal(bloqueia(f, "Curso completo grátis"), true, `curso: ${extra}`);
  }
});

// ── 5. Perfil da conta e outra campanha nao confirmam ────────────────────────
test("gratuidade só no perfil da conta (snapshot novo): bloqueia e pede confirmação no briefing da campanha", () => {
  const f = fatos({ produto: "Aula de gestão de tráfego", preco: "R$ 19,90", extra: "Pagamento único.", perfil: { productService: "Aula gratuita de gestão de tráfego" } });
  const c = conflitos(f, "Aula grátis")[0] as any;
  assert.ok(c, "deveria bloquear");
  assert.equal(c.confirmacao, "briefing_campanha");
  assert.match(msg(f, "Aula grátis"), /briefing desta campanha/);
  assert.equal(bloqueia(f, "Aula por R$ 19,90"), false);
});

// ── 6. Snapshot antigo ───────────────────────────────────────────────────────
test("snapshot antigo REAL (gerado antes da correção): gratuidade no perfil + preço na campanha", () => {
  const f = JSON.parse(readFileSync(new URL("./fixtures/snapshot-fatos-pre-correcao.json", import.meta.url), "utf8")) as CampaignFacts;
  assert.equal((f as any).campaignClaimsRaw, undefined);
  assert.match(f.confirmedClaimsRaw, /aula gratuita/);
  assert.equal(bloqueia(f, "Aula grátis de tráfego pago"), true, "Aula grátis tem que ser barrada");
  assert.equal(bloqueia(f, "Aula por R$ 19,90"), false, "preço confirmado continua passando");
  const c = conflitos(f, "Aula grátis de tráfego pago")[0] as any;
  assert.equal(c.confirmacao, "snapshot_antigo");
  assert.match(msg(f, "Aula grátis de tráfego pago"), /gerado antes da checagem por campanha[\s\S]*confirme[\s\S]*briefing da campanha/i);
});

test("snapshot antigo sem como verificar a origem: nem oferta gratuita é aceita sem confirmar no briefing", () => {
  const f = antigo(fatos({ produto: "Aula aberta de gestão de tráfego", extra: "Aula gratuita, sem custo." }));
  assert.equal(bloqueia(f, "Aula grátis"), true);
  assert.equal(conflitos(f, "Aula grátis")[0] && (conflitos(f, "Aula grátis")[0] as any).confirmacao, "snapshot_antigo");
});

for (const preco of ["R$ 19,90", "R$ 200,00"]) {
  test(`snapshot antigo com preço ${preco}: preço certo passa, "grátis" bloqueia, mensagem sem valor inventado`, () => {
    const f = antigo(fatos({ produto: "Aula de gestão de tráfego", preco, extra: "Pagamento único.", perfil: { productService: "Aula gratuita de gestão de tráfego" } }));
    assert.equal(bloqueia(f, `Aula por ${preco}`), false);
    assert.equal(bloqueia(f, "Aula grátis"), true);
    const texto = msg(f, "Aula grátis");
    const valores = texto.match(/R\$\s?[\d.,]+/g) || [];
    assert.ok(valores.every((v) => v.replace(/\s/g, "") === preco.replace(/\s/g, "")), texto);
    assert.ok(!/%|desconto de/i.test(texto), texto);
  });
}

// ── 7. Briefing que chama a mesma oferta de paga e gratuita ──────────────────
test("briefing contraditório (mesmo produto pago e gratuito, sem diferenciar): pede esclarecimento, não sugere preço", () => {
  const f = fatos({ produto: "Aula de gestão de tráfego", preco: "R$ 19,90", extra: "A aula é paga e também gratuita." });
  const c = conflitos(f, "Aula grátis")[0] as any;
  assert.ok(c, "deveria bloquear");
  assert.equal(c.confirmacao, "oferta_ambigua");
  assert.equal(c.suggestion ?? null, null);
  assert.match(msg(f, "Aula grátis"), /esclare/i);
  assert.equal(bloqueia(f, "Aula por R$ 19,90"), false);
});

// ── 8. Duas contas, mesmo ID de campanha ─────────────────────────────────────
test("mesmo ID de campanha em duas contas (paga x gratuita), alternando: cada uma usa o próprio briefing", () => {
  const A = fatos({ produto: "Aula de gestão de tráfego", preco: "R$ 47,00", extra: "Pagamento único." });
  const B = fatos({ produto: "Aula de gestão de tráfego", extra: "Aula gratuita e aberta ao público." });
  for (let i = 0; i < 20; i++) {
    const a = campanha(A, "Aula grátis", 7, 100);
    const b = campanha(B, "Aula grátis", 7, 200);
    const ordem = i % 2 ? [b, a] : [a, b];
    for (const c of ordem) {
      const ok = avaliarIntegridade(c).conflitos.length === 0;
      assert.equal(ok, c.projectId === 200, `rodada ${i}, conta ${c.projectId}`);
    }
  }
  const certo = campanha(A, "Aula por R$ 47,00", 7, 100);
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(certo));
});

// ── 9. Mesmo codigo do editor e da publicacao, Meta simulada ─────────────────
function chatFixture(c: any) {
  let calls = 0;
  const db: any = {
    getCampaignById: async () => c, getProjectById: async () => ({ userId: 1 }), getUserById: async () => ({ id: 1 }),
    getCampaignMetricsDaily: async () => [],
    reserveMcpIdempotencyKey: async () => ({ kind: "proceed", recordId: 1 }),
    completeMcpIdempotencyKey: async () => {}, failMcpIdempotencyKey: async () => {},
    publish: async () => { calls++; return { ok: true }; },
    caller: { unified: { getFullReport: async () => ({ meta: { configured: false } }) } },
  };
  return { db, calls: () => calls };
}

for (const [rotulo, montar] of [
  ["snapshot antigo", (b: Briefing) => antigo(fatos(b))],
  ["snapshot novo", (b: Briefing) => fatos(b)],
] as const) {
  test(`${rotulo}: editor e publicação (Meta simulada) recusam "grátis" e aceitam o preço confirmado`, async () => {
    const f = montar({ produto: "Aula de gestão de tráfego", preco: "R$ 19,90", extra: "Pagamento único.", perfil: { productService: "Aula gratuita de gestão de tráfego" } });
    // Editor de rascunho
    const editar = (headline: string): any => ajustarRascunhoCampanha(campanha(f, "Aula de tráfego por R$ 19,90"), { campaignId: 12, creativeEdits: [{ index: 0, headline }] } as any, auditCreativeSegmentAlignment as any);
    const rGratis = editar("Aula grátis");
    assert.ok(rGratis.erro, "editor deveria recusar");
    assert.match(String(rGratis.erro), /briefing/);
    assert.equal(editar("Aula por R$ 19,90").erro, undefined);
    // Publicacao: pre-voo, integridade e chat com Meta simulada
    const ruim = campanha(f, "Aula grátis");
    assert.ok(pendenciasLocaisParaPublicar(ruim).pendencias?.some((p) => p.tipo === "oferta_divergente"));
    assert.throws(() => assertCampaignPublishIntegrity(ruim), /CAMPAIGN_INTEGRITY/);
    const fx = chatFixture(ruim);
    const r: any = await publishChatAds(1, { campaignId: 12, pageId: "123", linkUrl: "https://example.com" }, fx.db);
    assert.equal(r.ok, false);
    assert.notEqual(r.confirmationRequired, true, "não pode nem emitir token para texto indevido");
    assert.equal(fx.calls(), 0);
    const bom = campanha(f, "Aula por R$ 19,90");
    assert.equal(pendenciasLocaisParaPublicar(bom).pendencias?.some((p) => p.tipo === "oferta_divergente"), false);
    assert.doesNotThrow(() => assertCampaignPublishIntegrity(bom));
  });
}
