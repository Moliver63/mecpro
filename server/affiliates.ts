/**
 * affiliates.ts
 *
 * Programa de parceiros (indicacao com comissao sobre a mensalidade).
 *
 *  - affiliates: parceiro, codigo de indicacao e regras (percentual, meses, carencia)
 *  - affiliate_referrals: qual usuario veio de qual parceiro (1 parceiro por usuario)
 *  - affiliate_commissions: uma linha por fatura paga (idempotente por stripeInvoiceId)
 *
 * Regras (padrao, ajustaveis por parceiro):
 *  - 10% sobre o valor efetivamente pago da assinatura, nos 3 primeiros pagamentos
 *  - carencia de 7 dias corridos (direito de arrependimento, art. 49 do CDC):
 *    a comissao so fica "liberada" apos esse prazo. Nada e pago antes.
 *  - reembolso total: comissao pendente e cancelada; se ja foi paga, vira
 *    desconto (clawback) no proximo repasse
 *  - o valor pago ao Stripe como credito de midia (wallet_deposit) NAO gera comissao:
 *    so faturas de assinatura chegam aqui
 *
 * Migracao: AFFILIATES_MIGRATION roda no boot via runMigrations (aditiva, so
 * CREATE TABLE/INDEX IF NOT EXISTS). Falha aqui nunca bloqueia cobranca nem
 * ativacao de plano: todos os pontos de entrada sao try/catch no chamador.
 */

import { getPool } from "./db";

export const AFFILIATES_MIGRATION = `
  CREATE TABLE IF NOT EXISTS affiliates (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(40) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    email           VARCHAR(255),
    "pixKey"        VARCHAR(255),
    "commissionPct" INTEGER NOT NULL DEFAULT 10,
    "maxPayments"   INTEGER NOT NULL DEFAULT 3,
    "holdDays"      INTEGER NOT NULL DEFAULT 7,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id            SERIAL PRIMARY KEY,
    "affiliateId" INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    "userId"      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_aff ON affiliate_referrals("affiliateId");

  CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id                      SERIAL PRIMARY KEY,
    "affiliateId"           INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    "userId"                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "stripeInvoiceId"       VARCHAR(255) NOT NULL UNIQUE,
    "stripePaymentIntentId" VARCHAR(255),
    "amountCents"           INTEGER NOT NULL,
    "commissionCents"       INTEGER NOT NULL,
    "paymentNumber"         INTEGER NOT NULL DEFAULT 1,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    "releaseAt"             TIMESTAMPTZ NOT NULL,
    "paidAt"                TIMESTAMPTZ,
    "payoutRef"             VARCHAR(255),
    "clawback"              BOOLEAN NOT NULL DEFAULT FALSE,
    note                    TEXT,
    "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_aff ON affiliate_commissions("affiliateId", status);
  CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_pi ON affiliate_commissions("stripePaymentIntentId");
`;

/** Valor minimo (centavos) para o repasse ser feito. */
export const MIN_PAYOUT_CENTS = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeCode(raw: string): string {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

/** Comissao em centavos, arredondada para baixo (nunca paga a mais). */
export function computeCommissionCents(amountPaidCents: number, pct: number): number {
  if (!Number.isFinite(amountPaidCents) || amountPaidCents <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.floor((amountPaidCents * pct) / 100);
}

/** Data em que a comissao fica liberada: pagamento + carencia em dias corridos. */
export function computeReleaseAt(paidAt: Date, holdDays: number): Date {
  return new Date(paidAt.getTime() + Math.max(0, holdDays) * DAY_MS);
}

export function isReleased(releaseAt: Date, now: Date = new Date()): boolean {
  return releaseAt.getTime() <= now.getTime();
}

// ── Cadastro e vinculo ────────────────────────────────────────────────────

export async function createAffiliate(input: {
  code: string; name: string; email?: string | null; pixKey?: string | null;
  commissionPct?: number; maxPayments?: number; holdDays?: number;
}) {
  const pool = await getPool();
  if (!pool) throw new Error("Banco indisponivel");
  const code = normalizeCode(input.code);
  if (code.length < 3) throw new Error("Codigo invalido (minimo 3 caracteres)");
  const r = await pool.query(
    `INSERT INTO affiliates (code, name, email, "pixKey", "commissionPct", "maxPayments", "holdDays")
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [code, input.name.trim(), input.email ?? null, input.pixKey ?? null,
     input.commissionPct ?? 10, input.maxPayments ?? 3, Math.max(7, input.holdDays ?? 7)],
  );
  return r.rows[0];
}

/**
 * Vincula o usuario ao parceiro do codigo. Nunca lanca erro: indicacao nao pode
 * bloquear cadastro. Ignora codigo inexistente/inativo, usuario ja vinculado e
 * auto-indicacao (mesmo e-mail do parceiro).
 */
export async function attachReferral(userId: number, rawCode: string | null | undefined): Promise<boolean> {
  try {
    const code = normalizeCode(rawCode || "");
    if (!code) return false;
    const pool = await getPool();
    if (!pool) return false;
    const aff = await pool.query(`SELECT id, email FROM affiliates WHERE code = $1 AND active = TRUE LIMIT 1`, [code]);
    if (!aff.rows[0]) return false;
    const usr = await pool.query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const userEmail = String(usr.rows[0]?.email || "").toLowerCase();
    if (aff.rows[0].email && userEmail && String(aff.rows[0].email).toLowerCase() === userEmail) return false;
    const r = await pool.query(
      `INSERT INTO affiliate_referrals ("affiliateId","userId") VALUES ($1,$2) ON CONFLICT ("userId") DO NOTHING RETURNING id`,
      [aff.rows[0].id, userId],
    );
    return !!r.rows[0];
  } catch (err: any) {
    console.warn("[affiliates] attachReferral falhou:", err?.message);
    return false;
  }
}

// ── Eventos do Stripe ─────────────────────────────────────────────────────

/**
 * Chamado em invoice.payment_succeeded. Cria a comissao da fatura (idempotente).
 * Retorna a linha criada ou null quando nao ha comissao a gerar.
 */
export async function recordCommissionFromInvoice(invoice: {
  id?: string; customer?: string; amount_paid?: number; payment_intent?: string | null; created?: number;
}) {
  const invoiceId = invoice?.id;
  const customerId = invoice?.customer;
  const amount = Number(invoice?.amount_paid ?? 0);
  if (!invoiceId || !customerId || amount <= 0) return null;

  const pool = await getPool();
  if (!pool) return null;

  const ref = await pool.query(
    `SELECT r."affiliateId", u.id AS "userId", a."commissionPct", a."maxPayments", a."holdDays", a.active
       FROM users u
       JOIN affiliate_referrals r ON r."userId" = u.id
       JOIN affiliates a ON a.id = r."affiliateId"
      WHERE u."stripeCustomerId" = $1 LIMIT 1`,
    [customerId],
  );
  const row = ref.rows[0];
  if (!row || !row.active) return null;

  const counted = await pool.query(
    `SELECT COUNT(*)::int AS n FROM affiliate_commissions
      WHERE "userId" = $1 AND "affiliateId" = $2 AND status <> 'cancelled'`,
    [row.userId, row.affiliateId],
  );
  const n = counted.rows[0]?.n ?? 0;
  if (n >= row.maxPayments) return null;

  const commission = computeCommissionCents(amount, row.commissionPct);
  if (commission <= 0) return null;

  const paidAt = invoice.created ? new Date(invoice.created * 1000) : new Date();
  const releaseAt = computeReleaseAt(paidAt, row.holdDays);

  const ins = await pool.query(
    `INSERT INTO affiliate_commissions
       ("affiliateId","userId","stripeInvoiceId","stripePaymentIntentId","amountCents","commissionCents","paymentNumber","releaseAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT ("stripeInvoiceId") DO NOTHING RETURNING *`,
    [row.affiliateId, row.userId, invoiceId, invoice.payment_intent ?? null, amount, commission, n + 1, releaseAt],
  );
  return ins.rows[0] ?? null;
}

/**
 * Chamado em charge.refunded. Reembolso total: cancela a comissao pendente ou,
 * se ja foi paga, marca clawback (desconto no proximo repasse).
 * Reembolso parcial: so registra nota para revisao manual.
 */
export async function handleChargeRefunded(charge: {
  invoice?: string | null; payment_intent?: string | null; amount?: number; amount_refunded?: number; refunded?: boolean;
}) {
  const pool = await getPool();
  if (!pool) return 0;
  const invoiceId = charge?.invoice ?? null;
  const pi = charge?.payment_intent ?? null;
  if (!invoiceId && !pi) return 0;

  const full = charge.refunded === true ||
    (Number(charge.amount_refunded ?? 0) > 0 && Number(charge.amount_refunded) >= Number(charge.amount ?? Infinity));

  if (!full) {
    const r = await pool.query(
      `UPDATE affiliate_commissions SET note = COALESCE(note || E'\\n','') || 'Reembolso parcial: revisar manualmente'
        WHERE ("stripeInvoiceId" = $1 OR "stripePaymentIntentId" = $2)`,
      [invoiceId, pi],
    );
    return r.rowCount ?? 0;
  }

  const cancelled = await pool.query(
    `UPDATE affiliate_commissions SET status = 'cancelled', note = COALESCE(note || E'\\n','') || 'Cancelada por reembolso'
      WHERE status = 'pending' AND ("stripeInvoiceId" = $1 OR "stripePaymentIntentId" = $2)`,
    [invoiceId, pi],
  );
  const claw = await pool.query(
    `UPDATE affiliate_commissions SET clawback = TRUE, note = COALESCE(note || E'\\n','') || 'Reembolsada apos o repasse: descontar do proximo'
      WHERE status = 'paid' AND ("stripeInvoiceId" = $1 OR "stripePaymentIntentId" = $2)`,
    [invoiceId, pi],
  );
  return (cancelled.rowCount ?? 0) + (claw.rowCount ?? 0);
}

// ── Relatorio e repasse ───────────────────────────────────────────────────

export async function affiliateReport() {
  const pool = await getPool();
  if (!pool) return [];
  const r = await pool.query(`
    SELECT a.id, a.code, a.name, a.email, a."pixKey", a."commissionPct", a."maxPayments", a."holdDays", a.active,
      (SELECT COUNT(*)::int FROM affiliate_referrals r WHERE r."affiliateId" = a.id) AS referrals,
      COALESCE(SUM(c."commissionCents") FILTER (WHERE c.status = 'pending' AND c."releaseAt" >  NOW()), 0)::int AS "carenciaCents",
      COALESCE(SUM(c."commissionCents") FILTER (WHERE c.status = 'pending' AND c."releaseAt" <= NOW()), 0)::int AS "liberadoCents",
      COALESCE(SUM(c."commissionCents") FILTER (WHERE c.status = 'paid' AND c.clawback), 0)::int AS "descontarCents",
      COALESCE(SUM(c."commissionCents") FILTER (WHERE c.status = 'paid'), 0)::int AS "pagoCents"
    FROM affiliates a
    LEFT JOIN affiliate_commissions c ON c."affiliateId" = a.id
    GROUP BY a.id ORDER BY a.id`);
  return r.rows.map((x: any) => {
    const aPagar = Math.max(0, x.liberadoCents - x.descontarCents);
    return { ...x, aPagarCents: aPagar, atingeMinimo: aPagar >= MIN_PAYOUT_CENTS };
  });
}

export async function listCommissions(affiliateId: number) {
  const pool = await getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT id, "userId", "paymentNumber", "amountCents", "commissionCents", status, "releaseAt", "paidAt", "payoutRef", clawback, note, "createdAt"
       FROM affiliate_commissions WHERE "affiliateId" = $1 ORDER BY "createdAt" DESC LIMIT 500`,
    [affiliateId],
  );
  return r.rows;
}

/**
 * Marca como pagas as comissoes liberadas (apos a carencia) do parceiro, depois
 * de o admin ter feito o Pix. Respeita o minimo e abate clawbacks.
 */
export async function markAffiliatePaid(affiliateId: number, payoutRef: string) {
  const pool = await getPool();
  if (!pool) throw new Error("Banco indisponivel");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sums = await client.query(
      `SELECT
         COALESCE(SUM("commissionCents") FILTER (WHERE status = 'pending' AND "releaseAt" <= NOW()), 0)::int AS liberado,
         COALESCE(SUM("commissionCents") FILTER (WHERE status = 'paid' AND clawback), 0)::int AS descontar
       FROM affiliate_commissions WHERE "affiliateId" = $1`,
      [affiliateId],
    );
    const aPagar = Math.max(0, sums.rows[0].liberado - sums.rows[0].descontar);
    if (aPagar < MIN_PAYOUT_CENTS) {
      await client.query("ROLLBACK");
      throw new Error(`Valor a pagar abaixo do minimo (R$ ${(MIN_PAYOUT_CENTS / 100).toFixed(2)})`);
    }
    const upd = await client.query(
      `UPDATE affiliate_commissions SET status = 'paid', "paidAt" = NOW(), "payoutRef" = $2
        WHERE "affiliateId" = $1 AND status = 'pending' AND "releaseAt" <= NOW()`,
      [affiliateId, payoutRef.slice(0, 255)],
    );
    // clawbacks ja descontados neste repasse deixam de contar
    await client.query(
      `UPDATE affiliate_commissions SET clawback = FALSE, note = COALESCE(note || E'\\n','') || 'Descontada no repasse ' || $2
        WHERE "affiliateId" = $1 AND status = 'paid' AND clawback = TRUE`,
      [affiliateId, payoutRef.slice(0, 100)],
    );
    await client.query("COMMIT");
    return { paidCents: aPagar, commissions: upd.rowCount ?? 0 };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ja revertido */ }
    throw e;
  } finally {
    client.release();
  }
}
