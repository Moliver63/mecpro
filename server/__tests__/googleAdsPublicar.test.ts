import test from "node:test";
import assert from "node:assert/strict";
import { conferirCampanhaPesquisa, dataGoogle, type EntradaPesquisa } from "../googleAdsPublicar";

const ok = (): EntradaPesquisa => ({
  campaignName: "Shadia | Aula",
  dailyBudgetReais: 10,
  durationDays: 14,
  keywords: ['"aula de autoconhecimento"'],
  ads: [{
    headlines: ["Aula de autoconhecimento", "Aula avulsa por R$ 19,90", "Acesso por 7 dias"],
    descriptions: ["Aula de autoconhecimento com RV. Pagamento único de R$ 19,90 e acesso por 7 dias.", "Pague com Pix, cartão ou boleto. Exercícios práticos para entender seus padrões."],
    finalUrl: "https://shadiahasan.com/",
  }],
});

test("campanha completa passa", () => assert.deepEqual(conferirCampanhaPesquisa(ok()), []));

test("titulo de 32 caracteres e recusado com o texto e o tamanho (nao cortado)", () => {
  const e = ok(); e.ads[0].headlines.push("Aula VR Autoconhecimento R$19,90");
  const r = conferirCampanhaPesquisa(e);
  assert.equal(r.length, 1);
  assert.match(r[0], /32 caracteres.*R\$19,90/);
});

test("descricao acima de 90 e recusada", () => {
  const e = ok(); e.ads[0].descriptions[0] = "x".repeat(91);
  assert.match(conferirCampanhaPesquisa(e)[0], /91 caracteres/);
});

test("minimos: 3 titulos, 2 descricoes, palavras-chave", () => {
  const e = ok(); e.ads[0].headlines = ["A", "B"]; e.ads[0].descriptions = ["uma so"]; e.keywords = [];
  const r = conferirCampanhaPesquisa(e).join("|");
  assert.match(r, /minimo de 3 titulos/); assert.match(r, /minimo de 2 descricoes/); assert.match(r, /sem palavras-chave/);
});

test("titulos repetidos (ignorando caixa) e URL http sao recusados", () => {
  const e = ok(); e.ads[0].headlines = ["Aula", "aula", "Outro"]; e.ads[0].finalUrl = "http://x.com";
  const r = conferirCampanhaPesquisa(e).join("|");
  assert.match(r, /repetidos/); assert.match(r, /https/);
});

test("orcamento: zero e acima do teto sao recusados", () => {
  const a = ok(); a.dailyBudgetReais = 0;
  assert.match(conferirCampanhaPesquisa(a).join("|"), /maior que zero/);
  const b = ok(); b.dailyBudgetReais = 5000;
  assert.match(conferirCampanhaPesquisa(b).join("|"), /acima de R\$ 500/);
});

test("dataGoogle: formato YYYYMMDD no fuso de Sao Paulo", () => {
  // 02:00 UTC de 04/11 ainda e 23:00 de 03/11 em Sao Paulo
  assert.equal(dataGoogle(new Date("2026-11-04T02:00:00Z")), "20261103");
  assert.equal(dataGoogle(new Date("2026-11-04T02:00:00Z"), 14), "20261117");
});
