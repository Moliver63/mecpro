/**
 * Ativacao de plano por pagamento confirmado no Asaas + evento `purchase` no GA4.
 *
 * Achado (15/11): com o Asaas como gateway ativo, nada ativava o plano quando a
 * assinatura (cartao ou Pix) ou o plano anual era pago. O webhook
 * /api/webhook/asaas so tratava deposito de verba de midia; o plano anual
 * creditava saldo e nao mudava `users.plan`.
 *
 * Regras:
 *  - Nunca confia no corpo do webhook: busca o pagamento na API do Asaas pelo id.
 *  - So ativa com status pago, referencia gerada pelo proprio MecProAI e valor
 *    igual a um preco valido do plano (mensal ou anual).
 *  - Cada pagamento e processado uma vez (tabela payment_events, chave paymentId).
 *  - `purchase` no GA4 so na PRIMEIRA ativacao paga do usuario, com
 *    transaction_id = id do pagamento (o GA4 tambem deduplica por ele).
 * Ver docs/specs/2026-11-15-asaas-ativacao-de-plano.md.
 */

export type PlanSlug = "basic" | "premium" | "vip";

// Mesma tabela de server/paymentService.ts (AsaasProvider.createSubscription) e
// de subscriptions.createAsaasAnnual (router.ts). Se mudar la, muda aqui: o
// teste "precos" trava os valores.
export const PRECO_MENSAL: Record<PlanSlug, number> = { basic: 97, premium: 197, vip: 397 };
export const precoAnual = (plano: PlanSlug) => Math.floor(PRECO_MENSAL[plano] * 0.8) * 12;

export const PAYMENT_EVENTS_MIGRATION = `
CREATE TABLE IF NOT EXISTS payment_events (
  id                 SERIAL PRIMARY KEY,
  provider           VARCHAR(20)  NOT NULL,
  "paymentId"        VARCHAR(80)  NOT NULL UNIQUE,
  "userId"           INTEGER      NOT NULL,
  "planSlug"         VARCHAR(20)  NOT NULL,
  origem             VARCHAR(20)  NOT NULL,
  value              NUMERIC(12,2) NOT NULL,
  "planActivatedAt"  TIMESTAMPTZ,
  "gaPurchaseSentAt" TIMESTAMPTZ,
  "gaPurchaseNote"   TEXT,
  "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_events_user ON payment_events("userId");
CREATE TABLE IF NOT EXISTS checkout_attribution (
  ref           VARCHAR(80) PRIMARY KEY,
  "userId"      INTEGER     NOT NULL,
  "gaClientId"  VARCHAR(100),
  "gaSessionId" VARCHAR(40),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** Referencias que o proprio MecProAI grava no Asaas ao criar a cobranca. */
export function interpretarReferencia(ref: unknown): { userId: number; plano: PlanSlug; origem: "assinatura" | "anual" } | null {
  const s = String(ref ?? "");
  let m = s.match(/^user_(\d{1,10})_(basic|premium|vip)$/);
  if (m) return { userId: Number(m[1]), plano: m[2] as PlanSlug, origem: "assinatura" };
  m = s.match(/^mecpro_annual_uid_(\d{1,10})_(basic|premium|vip)$/);
  if (m) return { userId: Number(m[1]), plano: m[2] as PlanSlug, origem: "anual" };
  return null;
}

export const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

const ORDEM_PLANO: Record<string, number> = { free: 0, basic: 1, premium: 2, vip: 3 };
/** Ativar nunca rebaixa: devolve o maior entre o plano atual e o pago. */
export function planoResultante(atual: unknown, pago: PlanSlug): PlanSlug {
  const a = String(atual ?? "free");
  return (ORDEM_PLANO[a] ?? 0) > ORDEM_PLANO[pago] ? (a as PlanSlug) : pago;
}

/** Valor pago bate com um preco valido do plano (mensal ou anual)? */
export function valorConfere(plano: PlanSlug, valor: unknown): boolean {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return false;
  return [PRECO_MENSAL[plano], precoAnual(plano)].some((p) => Math.abs(p - v) < 0.01);
}

export type ValidacaoPagamento =
  | { ok: true; userId: number; plano: PlanSlug; origem: "assinatura" | "anual"; valor: number }
  | { ok: false; motivo: string };

/** Decide, so com o pagamento vindo da API do Asaas, se ativa plano. */
export function validarPagamentoDePlano(pagamento: any): ValidacaoPagamento {
  if (!pagamento?.id) return { ok: false, motivo: "pagamento_inexistente" };
  if (!STATUS_PAGO.has(String(pagamento.status))) return { ok: false, motivo: `status_${pagamento.status}` };
  const ref = interpretarReferencia(pagamento.externalReference);
  if (!ref) return { ok: false, motivo: "referencia_nao_e_plano" };
  // Pago com juros/multa, o Asaas muda `value` e guarda o original em
  // `originalValue`: aceita qualquer um dos dois que bata com o preco.
  const confere = [pagamento.originalValue, pagamento.value].find((x) => x != null && valorConfere(ref.plano, x));
  if (confere === undefined) return { ok: false, motivo: `valor_nao_confere_${pagamento.value}` };
  return { ok: true, ...ref, valor: Number(pagamento.value) };
}

// ── GA4 ──────────────────────────────────────────────────────────────────────

export { clientIdDoCookieGa, sessionIdDoCookieGa } from "../shared/gaCookies";

export function montarPurchase(p: {
  clientId: string; sessionId?: string | null; paymentId: string; valor: number; plano: PlanSlug; origem: string;
}) {
  return {
    client_id: p.clientId,
    events: [{
      name: "purchase",
      params: {
        transaction_id: p.paymentId,
        value: p.valor,
        currency: "BRL",
        engagement_time_msec: 1,
        ...(p.sessionId ? { session_id: p.sessionId } : {}),
        items: [{ item_id: p.plano, item_name: `Plano ${p.plano} (${p.origem})`, price: p.valor, quantity: 1 }],
      },
    }],
  };
}

// ── Processamento (dependencias injetaveis para teste) ───────────────────────

export interface Dependencias {
  pool: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
  buscarPagamento: (paymentId: string) => Promise<any>;
  ativarPlano: (userId: number, plano: PlanSlug) => Promise<void>;
  enviarGa4: (corpo: any) => Promise<{ ok: boolean; nota: string }>;
  log: (nivel: "info" | "warn", msg: string, dados?: any) => void;
}

export type Resultado =
  | { acao: "ativado"; userId: number; plano: PlanSlug; purchase: string }
  | { acao: "ignorado"; motivo: string }
  | { acao: "duplicado" };

export async function processarPagamentoDePlano(paymentId: string, d: Dependencias): Promise<Resultado> {
  const pagamento = await d.buscarPagamento(paymentId);
  const validacao = validarPagamentoDePlano(pagamento);
  if (validacao.ok === false) {
    d.log("info", "Pagamento nao ativa plano", { paymentId, motivo: validacao.motivo });
    return { acao: "ignorado", motivo: validacao.motivo };
  }
  const v = validacao;

  // Grava antes de ativar: o webhook chega duas vezes no cartao (CONFIRMED e
  // RECEIVED) e pode chegar em paralelo. Quem nao inseriu so segue se a linha
  // ainda nao tem planActivatedAt (falha no meio, ou execucao paralela): ativar
  // o mesmo plano duas vezes e inofensivo; o purchase tem trava propria abaixo.
  // Se a ativacao ganhar efeito colateral (e-mail, comissao), precisa de trava
  // atomica como a do purchase.
  const ins = await d.pool.query(
    `INSERT INTO payment_events (provider, "paymentId", "userId", "planSlug", origem, value)
     VALUES ('asaas', $1, $2, $3, $4, $5)
     ON CONFLICT ("paymentId") DO NOTHING RETURNING id`,
    [String(pagamento.id), v.userId, v.plano, v.origem, v.valor],
  );
  let eventoId = ins.rows[0]?.id;
  if (!eventoId) {
    // Ja registrado. Se a ativacao anterior falhou no meio (linha sem
    // planActivatedAt), tenta de novo: ativar o mesmo plano duas vezes e inofensivo.
    const exist = await d.pool.query(
      `SELECT id, "planActivatedAt" FROM payment_events WHERE "paymentId" = $1`, [String(pagamento.id)]);
    if (!exist.rows[0] || exist.rows[0].planActivatedAt) return { acao: "duplicado" };
    eventoId = exist.rows[0].id;
  }

  await d.ativarPlano(v.userId, v.plano);
  await d.pool.query(`UPDATE payment_events SET "planActivatedAt" = NOW() WHERE id = $1`, [eventoId]);
  d.log("info", "Plano ativado por pagamento Asaas", { paymentId: pagamento.id, userId: v.userId, plano: v.plano, origem: v.origem });

  // purchase so na primeira ativacao paga do usuario
  const anteriores = await d.pool.query(
    `SELECT COUNT(*)::int AS n FROM payment_events WHERE "userId" = $1 AND id <> $2 AND "planActivatedAt" IS NOT NULL`,
    [v.userId, eventoId],
  );
  let notaGa = "nao_e_primeira_assinatura";
  // Trava atomica: so uma execucao envia o purchase deste pagamento.
  const vez = await d.pool.query(
    `UPDATE payment_events SET "gaPurchaseNote" = 'processando' WHERE id = $1 AND "gaPurchaseNote" IS NULL RETURNING id`, [eventoId]);
  if (!vez.rows[0]) return { acao: "ativado", userId: v.userId, plano: v.plano, purchase: "ja_processado" };
  try {
  if ((anteriores.rows[0]?.n ?? 0) === 0) {
    const refs = [pagamento.subscription, pagamento.id].filter(Boolean).map(String);
    const attr = await d.pool.query(
      `SELECT "gaClientId", "gaSessionId" FROM checkout_attribution WHERE ref = ANY($1) AND "userId" = $2 LIMIT 1`,
      [refs, v.userId],
    );
    const clientId = attr.rows[0]?.gaClientId || null;
    if (!clientId) {
      notaGa = "sem_client_id_do_checkout";
    } else {
      const r = await d.enviarGa4(montarPurchase({
        clientId, sessionId: attr.rows[0]?.gaSessionId, paymentId: String(pagamento.id), valor: v.valor, plano: v.plano, origem: v.origem,
      }));
      notaGa = r.nota;
      if (r.ok) await d.pool.query(`UPDATE payment_events SET "gaPurchaseSentAt" = NOW() WHERE id = $1`, [eventoId]);
    }
  }
  } catch (e: any) {
    notaGa = `erro_${String(e?.message || e).slice(0, 60)}`;
  }
  // Sempre grava a nota final (nunca fica preso em 'processando').
  await d.pool.query(`UPDATE payment_events SET "gaPurchaseNote" = $2 WHERE id = $1`, [eventoId, notaGa]);
  return { acao: "ativado", userId: v.userId, plano: v.plano, purchase: notaGa };
}

/** Dependencias reais (producao). */
export function dependenciasDeProducao(pool: Dependencias["pool"], log: Dependencias["log"], ativarPlano: Dependencias["ativarPlano"]): Dependencias {
  return {
    pool,
    log,
    ativarPlano,
    buscarPagamento: async (paymentId) => {
      const key = process.env.ASAAS_API_KEY;
      if (!key) throw new Error("ASAAS_API_KEY ausente");
      const res = await fetch(`https://api.asaas.com/v3/payments/${encodeURIComponent(paymentId)}`, {
        headers: { access_token: key }, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Asaas GET payment ${res.status}`);
      return res.json();
    },
    enviarGa4: async (corpo) => {
      const secret = process.env.GA4_API_SECRET;
      const mid = process.env.GA4_MEASUREMENT_ID || "G-JJ1H7MV9B7";
      if (!secret) return { ok: false, nota: "sem_GA4_API_SECRET" };
      try {
        const res = await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`,
          { method: "POST", body: JSON.stringify(corpo), signal: AbortSignal.timeout(6000) },
        );
        return res.ok ? { ok: true, nota: "purchase_enviado" } : { ok: false, nota: `ga4_http_${res.status}` };
      } catch (e: any) {
        return { ok: false, nota: `ga4_erro_${String(e?.name || "rede")}` };
      }
    },
  };
}
