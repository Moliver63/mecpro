/**
 * salesAttribution.ts
 *
 * Camada de banco do rastreio de vendas reais (Kiwify / Hotmart):
 *  - sales_integrations: uma URL de webhook secreta por projeto e plataforma
 *  - sales_events: cada pedido recebido, com status atualizado a cada evento
 *    (aprovado -> reembolsado) e a campanha MecProAI atribuida pelas UTMs
 *
 * Migracao: SALES_MIGRATION roda no boot via runMigrations (aditiva, so
 * CREATE TABLE/INDEX IF NOT EXISTS, nunca drizzle-kit push). Copia manual em
 * migration_sales_events.sql.
 *
 * Isolamento: toda leitura filtra por projectId, e a atribuicao so aceita
 * campanha do MESMO projeto da integracao. Uma UTM "mp123" vinda de outro
 * cliente nunca credita venda na campanha errada.
 */

import { randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { getPool } from "./db";
import {
  attributionHintFromTracking,
  type NormalizedSale,
  type SalesProvider,
} from "./salesWebhookParsing";

export const SALES_MIGRATION = `
  CREATE TABLE IF NOT EXISTS sales_integrations (
    id              SERIAL PRIMARY KEY,
    "userId"        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "projectId"     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL,
    "webhookToken"  VARCHAR(64) NOT NULL UNIQUE,
    "verifySecret"  TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    "lastEventAt"   TIMESTAMPTZ,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_sales_integrations_project ON sales_integrations("projectId");

  CREATE TABLE IF NOT EXISTS sales_events (
    id                   SERIAL PRIMARY KEY,
    "integrationId"      INTEGER NOT NULL REFERENCES sales_integrations(id) ON DELETE CASCADE,
    "userId"             INTEGER NOT NULL,
    "projectId"          INTEGER NOT NULL,
    provider             VARCHAR(20) NOT NULL,
    "externalOrderId"    VARCHAR(200) NOT NULL,
    status               VARCHAR(20) NOT NULL,
    "amountCents"        BIGINT,
    currency             VARCHAR(8) NOT NULL DEFAULT 'BRL',
    "productId"          VARCHAR(200),
    "productName"        VARCHAR(200),
    "customerEmailHash"  VARCHAR(64),
    "utmSource"          VARCHAR(200),
    "utmMedium"          VARCHAR(200),
    "utmCampaign"        VARCHAR(200),
    "utmContent"         VARCHAR(200),
    "utmTerm"            VARCHAR(200),
    "trackingSrc"        VARCHAR(200),
    "trackingSck"        VARCHAR(200),
    "campaignId"         INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
    "attributionMethod"  VARCHAR(30),
    "occurredAt"         TIMESTAMPTZ NOT NULL,
    raw                  JSONB,
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("integrationId", "externalOrderId")
  );
  CREATE INDEX IF NOT EXISTS idx_sales_events_project ON sales_events("projectId", "occurredAt");
  CREATE INDEX IF NOT EXISTS idx_sales_events_campaign ON sales_events("campaignId");
`;

export interface SalesIntegration {
  id: number;
  userId: number;
  projectId: number;
  provider: SalesProvider;
  webhookToken: string;
  verifySecret: string | null;
  active: boolean;
  lastEventAt: string | null;
  createdAt: string;
}

export function salesWebhookUrl(provider: SalesProvider, token: string): string {
  const base = (process.env.APP_URL || "https://www.mecproai.com").replace(/\/+$/, "");
  return `${base}/api/webhook/sales/${provider}/${token}`;
}

/** Token de URL: 48 hex = 192 bits. Nunca logar inteiro. */
export function newWebhookToken(): string {
  return randomBytes(24).toString("hex");
}

export function maskToken(token: string): string {
  return token ? `${token.slice(0, 6)}...` : "";
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Verificacao extra OPCIONAL, so quando o usuario cadastrou verifySecret.
 * - Hotmart: header X-HOTMART-HOTTOK igual ao hottok da conta.
 * - Kiwify: query `signature` = HMAC-SHA1(hex) do corpo bruto com o token.
 *   INFORMACAO NAO CONFIRMADA com evento real: se o primeiro evento de teste
 *   falhar aqui, remover verifySecret e manter so o token secreto da URL.
 * Sem verifySecret, a autenticacao e o token de 192 bits na URL.
 */
export function verifyProviderSignature(
  integration: Pick<SalesIntegration, "provider" | "verifySecret">,
  req: { headers: Record<string, any>; query: Record<string, any> },
  rawBody: Buffer,
): { ok: boolean; reason?: string } {
  const secret = integration.verifySecret;
  if (!secret) return { ok: true };
  if (integration.provider === "hotmart") {
    const hottok = String(req.headers["x-hotmart-hottok"] || "");
    return hottok && safeEqual(hottok, secret) ? { ok: true } : { ok: false, reason: "hottok_invalido" };
  }
  const signature = String(req.query?.signature || "");
  if (!signature) return { ok: false, reason: "signature_ausente" };
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
  return safeEqual(signature.toLowerCase(), expected) ? { ok: true } : { ok: false, reason: "signature_invalida" };
}

// ── integracoes ─────────────────────────────────────────────────────────

export async function createSalesIntegration(opts: {
  userId: number; projectId: number; provider: SalesProvider; verifySecret?: string | null;
}): Promise<SalesIntegration> {
  const pool = await getPool();
  if (!pool) throw new Error("Banco indisponivel");
  const token = newWebhookToken();
  const { rows } = await pool.query(
    `INSERT INTO sales_integrations ("userId","projectId",provider,"webhookToken","verifySecret")
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [opts.userId, opts.projectId, opts.provider, token, opts.verifySecret?.trim() || null],
  );
  return rows[0];
}

export async function listSalesIntegrations(projectId: number): Promise<SalesIntegration[]> {
  const pool = await getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM sales_integrations WHERE "projectId" = $1 ORDER BY "createdAt" DESC`,
    [projectId],
  );
  return rows;
}

export async function getSalesIntegrationById(id: number): Promise<SalesIntegration | null> {
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query(`SELECT * FROM sales_integrations WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getActiveIntegrationByToken(provider: SalesProvider, token: string): Promise<SalesIntegration | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM sales_integrations WHERE "webhookToken" = $1 AND provider = $2 AND active = TRUE`,
    [token, provider],
  );
  return rows[0] || null;
}

export async function deactivateSalesIntegration(id: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.query(`UPDATE sales_integrations SET active = FALSE WHERE id = $1`, [id]);
}

// ── atribuicao + gravacao ───────────────────────────────────────────────

/**
 * Resolve a campanha MecProAI, sempre restrita ao projeto da integracao.
 * Ordem: token mp{id} nas UTMs > id do anuncio Meta > id da campanha Meta.
 */
export async function resolveAttribution(
  projectId: number,
  sale: NormalizedSale,
): Promise<{ campaignId: number | null; method: string | null }> {
  const pool = await getPool();
  if (!pool) return { campaignId: null, method: null };
  const hint = attributionHintFromTracking(sale.tracking);

  if (hint.mecproCampaignId) {
    const { rows } = await pool.query(
      `SELECT id FROM campaigns WHERE id = $1 AND "projectId" = $2`,
      [hint.mecproCampaignId, projectId],
    );
    if (rows[0]) return { campaignId: rows[0].id, method: "utm_mp_token" };
  }
  if (hint.metaAdId) {
    const { rows } = await pool.query(
      `SELECT id FROM campaigns WHERE "metaAdId" = $1 AND "projectId" = $2 LIMIT 1`,
      [hint.metaAdId, projectId],
    );
    if (rows[0]) return { campaignId: rows[0].id, method: "meta_ad_id" };
  }
  if (hint.metaCampaignId) {
    const { rows } = await pool.query(
      `SELECT id FROM campaigns WHERE "metaCampaignId" = $1 AND "projectId" = $2 LIMIT 1`,
      [hint.metaCampaignId, projectId],
    );
    if (rows[0]) return { campaignId: rows[0].id, method: "meta_campaign_id" };
  }
  return { campaignId: null, method: null };
}

/**
 * Grava ou atualiza o pedido. Idempotente por (integrationId, externalOrderId):
 * a plataforma reenvia eventos e manda o mesmo pedido de novo quando muda de
 * status. A atribuicao existente so e trocada se o evento novo trouxer uma.
 */
export async function recordSaleEvent(integration: SalesIntegration, sale: NormalizedSale) {
  const pool = await getPool();
  if (!pool) throw new Error("Banco indisponivel");
  const attribution = await resolveAttribution(integration.projectId, sale);
  const t = sale.tracking;

  const { rows } = await pool.query(
    `INSERT INTO sales_events (
       "integrationId","userId","projectId",provider,"externalOrderId",status,
       "amountCents",currency,"productId","productName","customerEmailHash",
       "utmSource","utmMedium","utmCampaign","utmContent","utmTerm","trackingSrc","trackingSck",
       "campaignId","attributionMethod","occurredAt",raw
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT ("integrationId","externalOrderId") DO UPDATE SET
       status              = EXCLUDED.status,
       "amountCents"       = COALESCE(EXCLUDED."amountCents", sales_events."amountCents"),
       "campaignId"        = COALESCE(EXCLUDED."campaignId", sales_events."campaignId"),
       "attributionMethod" = COALESCE(EXCLUDED."attributionMethod", sales_events."attributionMethod"),
       raw                 = EXCLUDED.raw,
       "updatedAt"         = NOW()
     RETURNING id, status, "campaignId", "attributionMethod"`,
    [
      integration.id, integration.userId, integration.projectId, sale.provider, sale.externalOrderId,
      sale.status, sale.amountCents, sale.currency, sale.productId, sale.productName, sale.customerEmailHash,
      t.utmSource, t.utmMedium, t.utmCampaign, t.utmContent, t.utmTerm, t.src, t.sck,
      attribution.campaignId, attribution.method, sale.occurredAt, JSON.stringify(sale.raw ?? null),
    ],
  );
  await pool.query(`UPDATE sales_integrations SET "lastEventAt" = NOW() WHERE id = $1`, [integration.id]).catch(() => {});
  return rows[0];
}

// ── leitura / relatorio ─────────────────────────────────────────────────

export interface CampaignSalesRow {
  campaignId: number | null;
  campaignName: string | null;
  sales: number;
  revenueCents: number;
  refunds: number;
  refundedCents: number;
  spend: number | null;
  /** Gasto / vendas aprovadas, em reais. null sem gasto ou sem venda. */
  costPerSale: number | null;
  /** Receita de pedidos ainda aprovados / gasto. null sem gasto. */
  roas: number | null;
}

/**
 * Vendas por campanha no periodo, cruzadas com o gasto de campaign_metrics.
 * A linha com campaignId null e a venda sem atribuicao (trafego organico,
 * UTM perdida no checkout ou anuncio de fora do MecProAI).
 */
export async function getProjectSalesSummary(projectId: number, days = 30): Promise<{
  days: number; totals: { sales: number; revenueCents: number; refunds: number; attributedShare: number | null };
  byCampaign: CampaignSalesRow[];
}> {
  const pool = await getPool();
  const empty = { days, totals: { sales: 0, revenueCents: 0, refunds: 0, attributedShare: null }, byCampaign: [] };
  if (!pool) return empty;
  const safeDays = Math.min(Math.max(Math.floor(days) || 30, 1), 365);

  const { rows } = await pool.query(
    `WITH ev AS (
       SELECT "campaignId",
              COUNT(*) FILTER (WHERE status = 'approved')                         AS sales,
              COALESCE(SUM("amountCents") FILTER (WHERE status = 'approved'), 0)  AS revenue,
              COUNT(*) FILTER (WHERE status IN ('refunded','chargeback'))        AS refunds,
              COALESCE(SUM("amountCents") FILTER (WHERE status IN ('refunded','chargeback')), 0) AS refunded
         FROM sales_events
        WHERE "projectId" = $1 AND "occurredAt" >= NOW() - ($2 || ' days')::interval
        GROUP BY "campaignId"
     ),
     sp AS (
       SELECT m."campaignId", SUM(m.spend)::float AS spend
         FROM campaign_metrics m
         JOIN campaigns c ON c.id = m."campaignId"
        WHERE c."projectId" = $1 AND m.date >= (CURRENT_DATE - ($2 || ' days')::interval)
        GROUP BY m."campaignId"
     )
     SELECT ev."campaignId", c.name AS "campaignName",
            ev.sales::int, ev.revenue::bigint AS "revenueCents",
            ev.refunds::int, ev.refunded::bigint AS "refundedCents",
            sp.spend
       FROM ev
       LEFT JOIN campaigns c ON c.id = ev."campaignId"
       LEFT JOIN sp ON sp."campaignId" = ev."campaignId"
      ORDER BY ev.revenue DESC`,
    [projectId, String(safeDays)],
  );

  const byCampaign: CampaignSalesRow[] = rows.map((r: any) => {
    const sales = Number(r.sales) || 0;
    const revenueCents = Number(r.revenueCents) || 0;
    const refundedCents = Number(r.refundedCents) || 0;
    const spend = r.spend == null ? null : Number(r.spend);
    return {
      campaignId: r.campaignId ?? null,
      campaignName: r.campaignName ?? null,
      sales,
      revenueCents,
      refunds: Number(r.refunds) || 0,
      refundedCents,
      spend,
      costPerSale: spend && sales > 0 ? Math.round((spend / sales) * 100) / 100 : null,
      // revenue ja e liquida: o pedido reembolsado muda de status e sai de "approved".
      roas: spend && spend > 0 ? Math.round((revenueCents / 100 / spend) * 100) / 100 : null,
    };
  });

  const totalSales = byCampaign.reduce((s, r) => s + r.sales, 0);
  const attributedSales = byCampaign.filter((r) => r.campaignId != null).reduce((s, r) => s + r.sales, 0);
  return {
    days: safeDays,
    totals: {
      sales: totalSales,
      revenueCents: byCampaign.reduce((s, r) => s + r.revenueCents, 0),
      refunds: byCampaign.reduce((s, r) => s + r.refunds, 0),
      attributedShare: totalSales > 0 ? Math.round((attributedSales / totalSales) * 1000) / 1000 : null,
    },
    byCampaign,
  };
}

export async function listRecentSaleEvents(projectId: number, limit = 20) {
  const pool = await getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT id, provider, "externalOrderId", status, "amountCents", currency, "productName",
            "utmSource", "utmCampaign", "utmContent", "trackingSrc", "campaignId", "attributionMethod",
            "occurredAt", "updatedAt"
       FROM sales_events WHERE "projectId" = $1
      ORDER BY "occurredAt" DESC LIMIT $2`,
    [projectId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows;
}
