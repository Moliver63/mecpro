import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planoResultante,
  interpretarReferencia, valorConfere, validarPagamentoDePlano, precoAnual, PRECO_MENSAL,
  clientIdDoCookieGa, sessionIdDoCookieGa, processarPagamentoDePlano, type Dependencias,
} from "../asaasPlanPayments";

// Ver docs/specs/2026-11-15-asaas-ativacao-de-plano.md

test("precos travados (mesma tabela do paymentService e do createAsaasAnnual)", () => {
  assert.deepEqual(PRECO_MENSAL, { basic: 97, premium: 197, vip: 397 });
  assert.equal(precoAnual("basic"), 924);
  assert.equal(precoAnual("premium"), 1884);
  assert.equal(precoAnual("vip"), 3804);
});

test("so aceita referencia gerada pelo MecProAI", () => {
  assert.deepEqual(interpretarReferencia("user_12_premium"), { userId: 12, plano: "premium", origem: "assinatura" });
  assert.deepEqual(interpretarReferencia("mecpro_annual_uid_7_vip"), { userId: 7, plano: "vip", origem: "anual" });
  for (const r of ["mecpro_uid_12", "user_12", "user_12_gold", "wallet-12-1700", "12", "", null, "user_12_premium_x"]) {
    assert.equal(interpretarReferencia(r), null, String(r));
  }
});

test("valor precisa ser preco valido do plano", () => {
  assert.equal(valorConfere("premium", 197), true);
  assert.equal(valorConfere("premium", 1884), true);
  assert.equal(valorConfere("premium", 97), false);
  assert.equal(valorConfere("premium", 1), false);
  assert.equal(valorConfere("vip", "397.00"), true);
});

test("status precisa ser pago", () => {
  const base = { id: "pay_1", externalReference: "user_1_basic", value: 97 };
  assert.equal(validarPagamentoDePlano({ ...base, status: "PENDING" }).ok, false);
  assert.equal(validarPagamentoDePlano({ ...base, status: "OVERDUE" }).ok, false);
  assert.equal(validarPagamentoDePlano({ ...base, status: "REFUNDED" }).ok, false);
  assert.equal(validarPagamentoDePlano({ ...base, status: "CONFIRMED" }).ok, true);
  assert.equal(validarPagamentoDePlano({ ...base, status: "RECEIVED" }).ok, true);
});

test("cookies do GA", () => {
  assert.equal(clientIdDoCookieGa("GA1.1.123456789.1700000000"), "123456789.1700000000");
  assert.equal(clientIdDoCookieGa("lixo"), null);
  assert.equal(sessionIdDoCookieGa("GS1.1.1700000123.3.1.1700000200.0.0.0"), "1700000123");
  assert.equal(sessionIdDoCookieGa("GS2.1.s1700000123$o3$g1$t1700000200$j0$l0$h0"), "1700000123");
  assert.equal(sessionIdDoCookieGa(""), null);
});

// ── processamento com banco falso ──────────────────────────────────────────
function fakeDeps(pagamento: any, attr: any = { gaClientId: "1.2", gaSessionId: "99" }) {
  const eventos: any[] = [];
  const ativacoes: any[] = [];
  const enviados: any[] = [];
  let falharAtivacao = false;
  const pool = {
    async query(sql: string, p: any[] = []) {
      if (sql.includes("INSERT INTO payment_events")) {
        if (eventos.some(e => e.paymentId === p[0])) return { rows: [] };
        const e = { id: eventos.length + 1, paymentId: p[0], userId: p[1], planActivatedAt: null, gaPurchaseNote: null };
        eventos.push(e); return { rows: [{ id: e.id }] };
      }
      if (sql.includes('SELECT id, "planActivatedAt"')) {
        const e = eventos.find(x => x.paymentId === p[0]); return { rows: e ? [e] : [] };
      }
      if (sql.includes('SET "planActivatedAt"')) { eventos.find(x => x.id === p[0]).planActivatedAt = new Date(); return { rows: [] }; }
      if (sql.includes("COUNT(*)::int AS n FROM payment_events")) {
        return { rows: [{ n: eventos.filter(e => e.userId === p[0] && e.id !== p[1] && e.planActivatedAt).length }] };
      }
      if (sql.includes(`"gaPurchaseNote" = 'processando'`)) {
        const e = eventos.find(x => x.id === p[0]);
        // so trava se o SQL pedir (AND "gaPurchaseNote" IS NULL)
        if (sql.includes('"gaPurchaseNote" IS NULL') && e.gaPurchaseNote !== null) return { rows: [] };
        e.gaPurchaseNote = "processando"; return { rows: [{ id: e.id }] };
      }
      // respeita o filtro por usuario (ref = ANY($1) AND "userId" = $2)
      if (sql.includes("FROM checkout_attribution")) {
        if (!sql.includes('"userId" = $2')) return { rows: attr ? [{ ...attr, userId: 999 }] : [] };
        return { rows: attr && (attr.userId ?? 5) === p[1] ? [attr] : [] };
      }
      if (sql.includes('SET "gaPurchaseNote" = $2')) { eventos.find(x => x.id === p[0]).gaPurchaseNote = p[1]; return { rows: [] }; }
      return { rows: [] };
    },
  };
  const d: Dependencias = {
    pool,
    buscarPagamento: async () => pagamento,
    ativarPlano: async (userId, plano) => { if (falharAtivacao) throw new Error("db"); ativacoes.push({ userId, plano }); },
    enviarGa4: async (corpo) => { enviados.push(corpo); return { ok: true, nota: "purchase_enviado" }; },
    log: () => {},
  };
  return { d, eventos, ativacoes, enviados, setFalha: (v: boolean) => { falharAtivacao = v; } };
}

const pago = { id: "pay_abc", status: "CONFIRMED", externalReference: "user_5_premium", value: 197, subscription: "sub_1" };

test("pagamento valido ativa o plano e envia purchase uma vez", async () => {
  const f = fakeDeps(pago);
  const r = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal(r.acao, "ativado");
  assert.deepEqual(f.ativacoes, [{ userId: 5, plano: "premium" }]);
  assert.equal(f.enviados.length, 1);
  assert.equal(f.enviados[0].events[0].params.transaction_id, "pay_abc");
  assert.equal(f.enviados[0].events[0].params.currency, "BRL");
});

test("webhook repetido (CONFIRMED e depois RECEIVED) nao ativa nem envia de novo", async () => {
  const f = fakeDeps(pago);
  await processarPagamentoDePlano("pay_abc", f.d);
  const r2 = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal(r2.acao, "duplicado");
  assert.equal(f.ativacoes.length, 1);
  assert.equal(f.enviados.length, 1);
});

test("falha na ativacao: a proxima chamada tenta de novo (nao fica preso como duplicado)", async () => {
  const f = fakeDeps(pago);
  f.setFalha(true);
  await assert.rejects(processarPagamentoDePlano("pay_abc", f.d));
  f.setFalha(false);
  const r = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal(r.acao, "ativado");
  assert.equal(f.ativacoes.length, 1);
  assert.equal(f.enviados.length, 1);
});

test("segunda mensalidade ativa (renova) mas nao manda purchase", async () => {
  const f = fakeDeps(pago);
  await processarPagamentoDePlano("pay_abc", f.d);
  f.d.buscarPagamento = async () => ({ ...pago, id: "pay_mes2" });
  const r = await processarPagamentoDePlano("pay_mes2", f.d);
  assert.equal(r.acao, "ativado");
  assert.equal((r as any).purchase, "nao_e_primeira_assinatura");
  assert.equal(f.enviados.length, 1);
});

test("pagamento de deposito, pendente ou com valor errado nao ativa nada", async () => {
  for (const p of [
    { ...pago, externalReference: "mecpro_uid_5" },
    { ...pago, status: "PENDING" },
    { ...pago, value: 1 },
  ]) {
    const f = fakeDeps(p);
    const r = await processarPagamentoDePlano(p.id, f.d);
    assert.equal(r.acao, "ignorado");
    assert.equal(f.ativacoes.length, 0);
    assert.equal(f.eventos.length, 0);
  }
});

test("sem client_id do checkout: ativa, nao envia purchase e registra o motivo", async () => {
  const f = fakeDeps(pago, null);
  const r = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal(r.acao, "ativado");
  assert.equal((r as any).purchase, "sem_client_id_do_checkout");
  assert.equal(f.enviados.length, 0);
});

import { idsDoGa } from "../../shared/gaCookies";

test("idsDoGa le os dois cookies do navegador", () => {
  assert.deepEqual(
    idsDoGa("foo=1; _ga=GA1.1.111.222; _ga_JJ1H7MV9B7=GS2.1.s1700000123$o3$g1$t1700000200"),
    { clientId: "111.222", sessionId: "1700000123" },
  );
  assert.deepEqual(idsDoGa("_ga=GA1.1.111.222"), { clientId: "111.222" });
  assert.equal(idsDoGa("foo=1"), null);
});

test("ativar nunca rebaixa", () => {
  assert.equal(planoResultante("vip", "basic"), "vip");
  assert.equal(planoResultante("free", "basic"), "basic");
  assert.equal(planoResultante("basic", "premium"), "premium");
  assert.equal(planoResultante(undefined, "premium"), "premium");
  assert.equal(planoResultante("premium", "premium"), "premium");
});

test("pago com juros: vale o originalValue", () => {
  const r = validarPagamentoDePlano({ id: "p", status: "RECEIVED", externalReference: "user_1_basic", value: 99.42, originalValue: 97 });
  assert.equal(r.ok, true);
});

test("client_id de outro usuario nunca e usado", async () => {
  const f = fakeDeps(pago, { gaClientId: "9.9", gaSessionId: "1", userId: 777 });
  const r = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal((r as any).purchase, "sem_client_id_do_checkout");
  assert.equal(f.enviados.length, 0);
});

test("webhooks em paralelo: ativa o plano e manda purchase uma vez so", async () => {
  const f = fakeDeps(pago);
  // ativacao lenta: a segunda chamada chega com a linha ainda sem
  // planActivatedAt e segue ate a trava do purchase
  const ativar = f.d.ativarPlano;
  f.d.ativarPlano = async (u, pl) => { await new Promise(r => setTimeout(r, 20)); return ativar(u, pl); };
  await Promise.all([processarPagamentoDePlano("pay_abc", f.d), processarPagamentoDePlano("pay_abc", f.d)]);
  assert.equal(f.eventos.length, 1);
  assert.equal(f.enviados.length, 1);
});

test("erro na busca de atribuicao nao deixa a nota presa em processando", async () => {
  const f = fakeDeps(pago);
  const original = f.d.pool.query;
  f.d.pool = { query: async (sql: string, p?: any[]) => {
    if (sql.includes("FROM checkout_attribution")) throw new Error("tabela");
    return original(sql, p);
  } };
  const r = await processarPagamentoDePlano("pay_abc", f.d);
  assert.equal(r.acao, "ativado");
  assert.match(String(f.eventos[0].gaPurchaseNote), /^erro_/);
});
