/**
 * salesWebhookParsing.ts
 *
 * Funcoes PURAS (sem banco, sem env) que transformam o payload de webhook de
 * venda da Kiwify ou da Hotmart num formato unico, e extraem a atribuicao
 * MecProAI dos parametros de rastreio.
 *
 * Por que existe: o MecProAI nao media venda real (campaign_scores com zero
 * linhas de roas > 0). Sem o evento de compra, nao ha como calcular custo por
 * venda nem otimizar por receita. Este modulo e a porta de entrada desse dado.
 *
 * Convencao de atribuicao (gerada em publishToMeta via url_tags):
 *   utm_source=mecproai&utm_medium=paid_social&utm_campaign=mp{campaignId}
 *   &utm_content={{ad.id}}&utm_term={{adset.id}}&src=mp{campaignId}
 * `src` existe porque a Hotmart repassa `src`/`sck` do link de checkout, mas
 * nao repassa utm_* de forma confirmada.
 *
 * MAPEAMENTO DE CAMPOS — INFORMACAO NAO CONFIRMADA COM EVENTO REAL:
 * os caminhos abaixo seguem o formato publico mais comum dos webhooks
 * (Kiwify: order_id/order_status/Commissions/TrackingParameters; Hotmart v2:
 * event/data.purchase/data.product). O parser procura em varios caminhos e
 * guarda o payload sanitizado em `raw`, justamente para conferir com o
 * primeiro evento de teste real antes de confiar nos valores.
 */

import { createHash } from "node:crypto";

export type SalesProvider = "kiwify" | "hotmart";
export type SaleStatus = "approved" | "refunded" | "chargeback" | "canceled" | "pending" | "other";

export interface SaleTracking {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  src: string | null;
  sck: string | null;
}

export interface NormalizedSale {
  provider: SalesProvider;
  externalOrderId: string;
  status: SaleStatus;
  /** Valor em centavos. null quando o payload nao trouxe valor reconhecivel. */
  amountCents: number | null;
  currency: string;
  productId: string | null;
  productName: string | null;
  /** sha256 do e-mail normalizado. O e-mail em si nunca e gravado. */
  customerEmailHash: string | null;
  tracking: SaleTracking;
  occurredAt: Date;
  /** Payload sem dados pessoais do comprador. */
  raw: unknown;
}

// ── utilitarios ─────────────────────────────────────────────────────────

function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    let cur = obj;
    for (const key of p.split(".")) {
      if (cur == null || typeof cur !== "object") { cur = undefined; break; }
      cur = cur[key];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

function str(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 200) : null;
}

/** Inteiro em centavos (Kiwify costuma mandar centavos). */
function centsFromInteger(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Valor decimal em reais (Hotmart manda 297.0). */
function centsFromDecimal(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const s = String(v).trim();
    // "1.250,50" -> 1250.50 ; "1250.50" -> 1250.50
    const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    n = Number(normalized);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function toDate(v: any): Date | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    // Hotmart usa epoch em milissegundos; aceita segundos por seguranca.
    const d = new Date(v < 1e12 ? v * 1000 : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hashEmail(email: any): string | null {
  const e = str(email);
  if (!e || !e.includes("@")) return null;
  return createHash("sha256").update(e.toLowerCase()).digest("hex");
}

const PII_KEYS = new Set([
  "customer", "buyer", "email", "cpf", "cnpj", "document", "doc", "phone",
  "mobile", "telefone", "address", "endereco", "zipcode", "cep", "name_buyer",
  "full_name", "first_name", "last_name", "ip", "card", "credit_card",
]);

/** Remove dados pessoais do comprador antes de gravar o payload (LGPD). */
export function sanitizePayload(value: any, depth = 0): any {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizePayload(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k.toLowerCase())) continue;
      out[k] = sanitizePayload(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.slice(0, 500);
  return value;
}

// ── status ──────────────────────────────────────────────────────────────

export function mapKiwifyStatus(orderStatus: any, eventType: any): SaleStatus {
  const s = String(orderStatus || "").toLowerCase();
  const e = String(eventType || "").toLowerCase();
  if (s === "paid" || s === "approved" || e === "order_approved") return "approved";
  if (s === "refunded" || e === "order_refunded") return "refunded";
  if (s.startsWith("chargedback") || s === "chargeback" || e === "chargeback") return "chargeback";
  if (s === "refused" || s === "canceled" || s === "cancelled" || e === "order_rejected" || e.includes("canceled")) return "canceled";
  if (s === "waiting_payment" || s === "pending" || e.endsWith("_created")) return "pending";
  return "other";
}

export function mapHotmartStatus(event: any, purchaseStatus: any): SaleStatus {
  const e = String(event || "").toUpperCase();
  const s = String(purchaseStatus || "").toUpperCase();
  if (e === "PURCHASE_APPROVED" || e === "PURCHASE_COMPLETE" || s === "APPROVED" || s === "COMPLETE") return "approved";
  if (e === "PURCHASE_REFUNDED" || s === "REFUNDED") return "refunded";
  if (e === "PURCHASE_CHARGEBACK" || s === "CHARGEBACK") return "chargeback";
  if (e === "PURCHASE_CANCELED" || e === "PURCHASE_EXPIRED" || e === "PURCHASE_PROTEST" || s === "CANCELED" || s === "CANCELLED" || s === "EXPIRED") return "canceled";
  if (e === "PURCHASE_BILLET_PRINTED" || e === "PURCHASE_DELAYED" || s === "WAITING_PAYMENT" || s === "BILLET_PRINTED") return "pending";
  return "other";
}

// ── parsers ─────────────────────────────────────────────────────────────

export function parseKiwifyPayload(body: any, now: Date = new Date()): NormalizedSale | null {
  if (!body || typeof body !== "object") return null;
  const orderId = str(pick(body, ["order_id", "order_ref", "id"]));
  if (!orderId) return null;

  const tp = pick(body, ["TrackingParameters", "tracking_parameters", "tracking"]) || {};
  const amountCents =
    centsFromInteger(pick(body, ["Commissions.charge_amount", "Commissions.product_base_price"])) ??
    centsFromDecimal(pick(body, ["amount", "total", "price"]));

  return {
    provider: "kiwify",
    externalOrderId: orderId,
    status: mapKiwifyStatus(pick(body, ["order_status", "status"]), pick(body, ["webhook_event_type", "event"])),
    amountCents,
    currency: (str(pick(body, ["Commissions.currency", "currency"])) || "BRL").toUpperCase().slice(0, 8),
    productId: str(pick(body, ["Product.product_id", "product_id", "Product.id"])),
    productName: str(pick(body, ["Product.product_name", "product_name", "Product.name"])),
    customerEmailHash: hashEmail(pick(body, ["Customer.email", "customer.email", "email"])),
    tracking: {
      utmSource: str(tp.utm_source),
      utmMedium: str(tp.utm_medium),
      utmCampaign: str(tp.utm_campaign),
      utmContent: str(tp.utm_content),
      utmTerm: str(tp.utm_term),
      src: str(tp.src),
      sck: str(tp.sck),
    },
    occurredAt: toDate(pick(body, ["approved_date", "updated_at", "created_at"])) || now,
    raw: sanitizePayload(body),
  };
}

export function parseHotmartPayload(body: any, now: Date = new Date()): NormalizedSale | null {
  if (!body || typeof body !== "object") return null;
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const orderId = str(pick(data, ["purchase.transaction", "transaction"]));
  if (!orderId) return null;

  const origin = pick(data, ["purchase.origin"]) || {};
  const tracking = pick(data, ["purchase.tracking", "tracking"]) || {};

  return {
    provider: "hotmart",
    externalOrderId: orderId,
    status: mapHotmartStatus(body.event, pick(data, ["purchase.status", "status"])),
    amountCents: centsFromDecimal(pick(data, ["purchase.price.value", "purchase.full_price.value", "price.value"])),
    currency: (str(pick(data, ["purchase.price.currency_value", "price.currency_value"])) || "BRL").toUpperCase().slice(0, 8),
    productId: str(pick(data, ["product.id", "product.ucode"])),
    productName: str(pick(data, ["product.name"])),
    customerEmailHash: hashEmail(pick(data, ["buyer.email"])),
    tracking: {
      utmSource: str(tracking.utm_source),
      utmMedium: str(tracking.utm_medium),
      utmCampaign: str(tracking.utm_campaign),
      utmContent: str(tracking.utm_content),
      utmTerm: str(tracking.utm_term),
      src: str(origin.src ?? tracking.src),
      sck: str(origin.sck ?? tracking.sck ?? origin.xcod),
    },
    occurredAt: toDate(pick(data, ["purchase.approved_date", "purchase.order_date"])) || toDate(body.creation_date) || now,
    raw: sanitizePayload(body),
  };
}

export function parseSalesPayload(provider: SalesProvider, body: any, now?: Date): NormalizedSale | null {
  return provider === "kiwify" ? parseKiwifyPayload(body, now) : parseHotmartPayload(body, now);
}

// ── atribuicao ──────────────────────────────────────────────────────────

const MP_TOKEN = /(?:^|[^a-z0-9])mp[-_]?(\d{1,10})(?![0-9])/i;

/** Extrai o campaignId MecProAI de "mp123", "mp-123" ou "mp_123". */
export function extractMecproCampaignId(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(MP_TOKEN);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Id numerico da Meta (ad/adset/campaign) vindo de {{ad.id}} etc. */
export function extractMetaNumericId(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return /^\d{6,25}$/.test(s) ? s : null;
}

export interface AttributionHint {
  mecproCampaignId: number | null;
  metaAdId: string | null;
  metaCampaignId: string | null;
}

export function attributionHintFromTracking(t: SaleTracking): AttributionHint {
  const mecproCampaignId =
    extractMecproCampaignId(t.utmCampaign) ??
    extractMecproCampaignId(t.src) ??
    extractMecproCampaignId(t.sck);
  return {
    mecproCampaignId,
    metaAdId: extractMetaNumericId(t.utmContent),
    metaCampaignId: extractMetaNumericId(t.utmCampaign),
  };
}

/**
 * url_tags enviados no criativo da Meta. Os {{...}} sao parametros dinamicos
 * que a propria Meta substitui pelo id real na hora do clique.
 */
export function buildMecproUrlTags(campaignId: number): string {
  return [
    "utm_source=mecproai",
    "utm_medium=paid_social",
    `utm_campaign=mp${campaignId}`,
    "utm_content={{ad.id}}",
    "utm_term={{adset.id}}",
    `src=mp${campaignId}`,
  ].join("&");
}

/**
 * Decide se o criativo deve receber url_tags. Nao aplica em destino WhatsApp
 * nem formulario nativo (nao ha checkout), e respeita rastreio que o cliente
 * ja colocou no proprio link.
 */
export function shouldApplyUrlTags(opts: { link: string | null | undefined; isWhatsApp: boolean; isLeadForm: boolean }): boolean {
  if (opts.isWhatsApp || opts.isLeadForm) return false;
  const link = String(opts.link || "").trim();
  if (!/^https?:\/\//i.test(link)) return false;
  if (/(^|\/\/)(www\.)?(wa\.me|api\.whatsapp\.com|facebook\.com|fb\.com|instagram\.com)\b/i.test(link)) return false;
  if (/[?&](utm_[a-z]+|src|sck)=/i.test(link)) return false;
  return true;
}
