import test from "node:test";
import assert from "node:assert/strict";
import { tikTokReportGet } from "../tiktokRelatorio";

const BASE = {
  advertiserId: "7620004082",
  accessToken: "token-de-teste",
  dimensions: ["campaign_id"],
  metrics: ["spend", "clicks"],
  startDate: "2026-10-29",
  endDate: "2026-11-05",
};

let ultimaUrl = "";
let ultimoInit: any = null;
function respostaFalsa(corpo: string, status = 200) {
  (globalThis as any).fetch = async (url: any, init: any) => {
    ultimaUrl = String(url);
    ultimoInit = init;
    return { status, text: async () => corpo } as any;
  };
}

test("usa GET com os parametros na query, nunca POST com body", async () => {
  respostaFalsa(JSON.stringify({ code: 0, data: { list: [{ dimensions: { campaign_id: "1" }, metrics: { spend: "3.5" } }] } }));
  const linhas = await tikTokReportGet(BASE);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].metrics.spend, "3.5");
  assert.ok(!ultimoInit?.method || ultimoInit.method === "GET", "o endpoint de relatorio nao aceita POST");
  assert.equal(ultimoInit?.body, undefined, "nao deve enviar body");
  assert.equal(ultimoInit?.headers?.["Access-Token"], "token-de-teste");
});

test("manda data_level, report_type e dimensions/metrics como strings JSON", async () => {
  respostaFalsa(JSON.stringify({ code: 0, data: { list: [] } }));
  await tikTokReportGet(BASE);
  const url = decodeURIComponent(ultimaUrl);
  assert.ok(url.includes("data_level=AUCTION_CAMPAIGN"), "data_level e obrigatorio com dimensions=campaign_id");
  assert.ok(url.includes("report_type=BASIC"));
  assert.ok(url.includes('dimensions=["campaign_id"]'));
  assert.ok(url.includes('metrics=["spend","clicks"]'));
  assert.ok(url.includes("start_date=2026-10-29"));
  assert.ok(url.includes("end_date=2026-11-05"));
});

// Regressao do bug que cegou os relatorios de TikTok: o POST antigo recebia uma
// pagina HTML do gateway e o res.json() estourava com
// 'Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON', mensagem que nao
// dizia nada sobre a causa.
test("resposta HTML vira erro legivel, nao 'Unexpected token'", async () => {
  respostaFalsa("<!DOCTYPE html><html><head><title>404 Not Found</title></head><body>nope</body></html>", 404);
  await assert.rejects(
    () => tikTokReportGet(BASE),
    (e: any) => {
      assert.ok(e.message.includes("HTTP 404"), `sem o status: ${e.message}`);
      assert.ok(e.message.includes("nao-JSON"), `sem a causa: ${e.message}`);
      assert.ok(!e.message.includes("Unexpected token"), `vazou o erro cru: ${e.message}`);
      return true;
    },
  );
});

test("erro da API da TikTok propaga a mensagem dela", async () => {
  respostaFalsa(JSON.stringify({ code: 40002, message: "data_level is required" }));
  await assert.rejects(() => tikTokReportGet(BASE), /data_level is required/);
});

test("sem access token avisa antes de chamar a rede", async () => {
  let chamou = false;
  (globalThis as any).fetch = async () => { chamou = true; return {} as any; };
  await assert.rejects(() => tikTokReportGet({ ...BASE, accessToken: undefined }), /sem access token/);
  assert.equal(chamou, false);
});

test("lista vazia quando a conta nao tem dados no periodo", async () => {
  respostaFalsa(JSON.stringify({ code: 0, data: {} }));
  assert.deepEqual(await tikTokReportGet(BASE), []);
});
