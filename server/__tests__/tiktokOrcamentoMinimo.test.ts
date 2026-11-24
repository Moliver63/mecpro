import { test } from "node:test";
import assert from "node:assert/strict";
import { cotacaoDoDolar, minimoNaMoeda, minimoDiarioTikTok, limparCacheCotacao, OrcamentoAbaixoDoMinimo } from "../tiktokOrcamentoMinimo";
import { publicarCampanhaTikTok } from "../tiktokPublicar";

const fetchCom = (taxas: Record<string, number>) => (async () => ({ json: async () => ({ rates: taxas }) })) as unknown as typeof fetch;
const fetchFora = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;

test("minimo na moeda: acima de US$ 20 com 5% de folga, arredondado para cima", () => {
  assert.equal(minimoNaMoeda(1), 21);
  assert.equal(minimoNaMoeda(5.4), 114);
});

test("cotacao: API do dia, depois env, depois reserva; dolar e 1", async () => {
  limparCacheCotacao();
  assert.deepEqual(await cotacaoDoDolar("USD", fetchFora), { cotacao: 1, fonte: "dolar" });
  assert.deepEqual(await cotacaoDoDolar("BRL", fetchCom({ BRL: 5.4 })), { cotacao: 5.4, fonte: "api" });
  limparCacheCotacao();
  process.env.TIKTOK_COTACAO_USD_BRL = "5.9";
  assert.deepEqual(await cotacaoDoDolar("BRL", fetchFora), { cotacao: 5.9, fonte: "reserva" });
  delete process.env.TIKTOK_COTACAO_USD_BRL;
  limparCacheCotacao();
  assert.equal((await cotacaoDoDolar("BRL", fetchFora))!.fonte, "reserva");
  limparCacheCotacao();
  assert.equal(await cotacaoDoDolar("XYZ", fetchFora), null, "moeda desconhecida nao inventa valor");
});

test("minimo da conta usa a moeda que o TikTok informa", async () => {
  limparCacheCotacao();
  const c: any = { get: async (p: string) => (p === "advertiser/info/" ? { list: [{ currency: "BRL" }] } : null) };
  const m = await minimoDiarioTikTok(c, "1", fetchCom({ BRL: 5.4 }));
  assert.deepEqual(m, { moeda: "BRL", minimo: 114, cotacao: 5.4, fonte: "api" });
});

test("publicador recusa abaixo do minimo antes de criar ou subir qualquer coisa (MCP e chat)", async () => {
  limparCacheCotacao();
  const chamadas: string[] = [];
  const c: any = {
    get: async (p: string) => { chamadas.push(p); return p === "advertiser/info/" ? { list: [{ currency: "USD" }] } : { list: [] }; },
    post: async (p: string) => { chamadas.push(p); return {}; },
  };
  const entrada: any = { advertiserId: "1", campaignName: "x", dailyBudgetReais: 6, landingPageUrl: "https://a.com", adText: "t", callToAction: "LEARN_MORE", displayName: "d", videos: [{ videoId: "v" }] };
  await assert.rejects(publicarCampanhaTikTok(c, entrada), (e: any) => e instanceof OrcamentoAbaixoDoMinimo && /21\/dia/.test(e.message));
  assert.deepEqual(chamadas, ["advertiser/info/"], "nada alem de ler a moeda");
});
