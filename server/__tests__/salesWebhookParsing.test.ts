import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionHintFromTracking,
  buildMecproUrlTags,
  extractMecproCampaignId,
  mapHotmartStatus,
  mapKiwifyStatus,
  parseHotmartPayload,
  parseKiwifyPayload,
  sanitizePayload,
  shouldApplyUrlTags,
} from "../salesWebhookParsing";

const kiwifyApproved = {
  order_id: "ab12-cd34",
  order_status: "paid",
  webhook_event_type: "order_approved",
  approved_date: "2026-11-02 14:30",
  Product: { product_id: "p-1", product_name: "Curso Teste" },
  Customer: { email: "Fulano@Exemplo.com", CPF: "12345678909", mobile: "+5547999999999", full_name: "Fulano" },
  Commissions: { charge_amount: 57500, currency: "BRL" },
  TrackingParameters: { utm_source: "mecproai", utm_campaign: "mp812", utm_content: "120210000000000001", utm_term: "120210000000000002", src: "mp812", sck: null },
};

const hotmartApproved = {
  event: "PURCHASE_APPROVED",
  creation_date: 1793700000000,
  data: {
    product: { id: 99, name: "Curso Hotmart" },
    buyer: { email: "a@b.com", name: "Comprador", document: "123" },
    purchase: {
      transaction: "HP123456",
      status: "APPROVED",
      price: { value: 297.0, currency_value: "BRL" },
      origin: { src: "mp45", sck: "x" },
      approved_date: 1793700000000,
    },
  },
};

test("kiwify: pedido aprovado vira venda normalizada com atribuicao", () => {
  const sale = parseKiwifyPayload(kiwifyApproved)!;
  assert.equal(sale.externalOrderId, "ab12-cd34");
  assert.equal(sale.status, "approved");
  assert.equal(sale.amountCents, 57500);
  assert.equal(sale.productName, "Curso Teste");
  assert.equal(sale.tracking.utmCampaign, "mp812");
  assert.match(sale.customerEmailHash!, /^[a-f0-9]{64}$/);
  const hint = attributionHintFromTracking(sale.tracking);
  assert.equal(hint.mecproCampaignId, 812);
  assert.equal(hint.metaAdId, "120210000000000001");
});

test("kiwify: dados pessoais nao vao para o raw", () => {
  const sale = parseKiwifyPayload(kiwifyApproved)!;
  const raw = JSON.stringify(sale.raw);
  assert.ok(!raw.includes("Fulano"));
  assert.ok(!raw.includes("12345678909"));
  assert.ok(!raw.includes("5547999999999"));
  assert.ok(raw.includes("Curso Teste"));
});

test("kiwify: sem order_id e ignorado", () => {
  assert.equal(parseKiwifyPayload({ webhook_event_type: "order_approved" }), null);
  assert.equal(parseKiwifyPayload(null), null);
});

test("hotmart: compra aprovada com src mp{id} e valor decimal", () => {
  const sale = parseHotmartPayload(hotmartApproved)!;
  assert.equal(sale.externalOrderId, "HP123456");
  assert.equal(sale.status, "approved");
  assert.equal(sale.amountCents, 29700);
  assert.equal(sale.tracking.src, "mp45");
  assert.equal(attributionHintFromTracking(sale.tracking).mecproCampaignId, 45);
  assert.ok(!JSON.stringify(sale.raw).includes("a@b.com"));
});

test("status: reembolso e chargeback mapeados nas duas plataformas", () => {
  assert.equal(mapKiwifyStatus("refunded", "order_refunded"), "refunded");
  assert.equal(mapKiwifyStatus("chargedback", "chargeback"), "chargeback");
  assert.equal(mapKiwifyStatus("waiting_payment", "pix_created"), "pending");
  assert.equal(mapHotmartStatus("PURCHASE_REFUNDED", ""), "refunded");
  assert.equal(mapHotmartStatus("PURCHASE_CHARGEBACK", ""), "chargeback");
  assert.equal(mapHotmartStatus("PURCHASE_BILLET_PRINTED", ""), "pending");
});

test("token mp{id}: aceita variacoes e nao confunde com outras palavras", () => {
  assert.equal(extractMecproCampaignId("mp812"), 812);
  assert.equal(extractMecproCampaignId("mp-812"), 812);
  assert.equal(extractMecproCampaignId("black_friday|mp_33"), 33);
  assert.equal(extractMecproCampaignId("amp812"), null);
  assert.equal(extractMecproCampaignId("campanha"), null);
  assert.equal(extractMecproCampaignId(null), null);
});

test("url_tags: formato com parametros dinamicos da Meta", () => {
  const tags = buildMecproUrlTags(812);
  assert.ok(tags.includes("utm_campaign=mp812"));
  assert.ok(tags.includes("utm_content={{ad.id}}"));
  assert.ok(tags.includes("src=mp812"));
});

test("url_tags: so em link de site sem rastreio proprio", () => {
  assert.equal(shouldApplyUrlTags({ link: "https://curso.com/aula", isWhatsApp: false, isLeadForm: false }), true);
  assert.equal(shouldApplyUrlTags({ link: "https://wa.me/5547999", isWhatsApp: false, isLeadForm: false }), false);
  assert.equal(shouldApplyUrlTags({ link: "https://curso.com/aula", isWhatsApp: true, isLeadForm: false }), false);
  assert.equal(shouldApplyUrlTags({ link: "https://curso.com/aula", isWhatsApp: false, isLeadForm: true }), false);
  assert.equal(shouldApplyUrlTags({ link: "https://curso.com/aula?utm_source=x", isWhatsApp: false, isLeadForm: false }), false);
  assert.equal(shouldApplyUrlTags({ link: "https://www.facebook.com/123", isWhatsApp: false, isLeadForm: false }), false);
  assert.equal(shouldApplyUrlTags({ link: "", isWhatsApp: false, isLeadForm: false }), false);
});

test("sanitizePayload: remove chaves pessoais em qualquer nivel", () => {
  const out = sanitizePayload({ a: { buyer: { email: "x" }, keep: 1 }, list: [{ phone: "1", ok: true }] });
  assert.deepEqual(out, { a: { keep: 1 }, list: [{ ok: true }] });
});
