import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_ADS_API_VERSION_PADRAO, GOOGLE_ADS_API_VERSAO_MINIMA,
  resolverVersao, versaoPrincipal, urlDoCliente, urlDoClienteComMetodo, urlListarContasAcessiveis,
} from "../googleAdsApi";

/**
 * Versao da Google Ads API. O defeito de origem: v19 (e v17) escritas a mao em
 * varios arquivos, desligadas pelo Google, e o erro nunca aponta para a versao.
 */

test("a versao padrao nao esta abaixo do minimo aceito", () => {
  assert.ok(versaoPrincipal(GOOGLE_ADS_API_VERSION_PADRAO) >= GOOGLE_ADS_API_VERSAO_MINIMA);
});

test("sem variavel de ambiente usa o padrao", () => {
  assert.deepEqual(resolverVersao(undefined), { versao: GOOGLE_ADS_API_VERSION_PADRAO });
  assert.deepEqual(resolverVersao("  "), { versao: GOOGLE_ADS_API_VERSION_PADRAO });
});

test("variavel valida e recente e respeitada", () => {
  assert.deepEqual(resolverVersao("v26"), { versao: "v26" });
});

test("variavel esquecida com versao desligada e IGNORADA, com motivo", () => {
  for (const velha of ["v19", "v19_1", "v17", "v22"]) {
    const r = resolverVersao(velha);
    assert.equal(r.versao, GOOGLE_ADS_API_VERSION_PADRAO, velha);
    assert.match(r.descartada!, /desligada/);
  }
});

test("lixo na variavel nao vira URL quebrada", () => {
  const r = resolverVersao("latest");
  assert.equal(r.versao, GOOGLE_ADS_API_VERSION_PADRAO);
  assert.match(r.descartada!, /nao e uma versao/);
});

test("versaoPrincipal le v25 e v25_1", () => {
  assert.equal(versaoPrincipal("v25"), 25);
  assert.equal(versaoPrincipal("v25_1"), 25);
  assert.ok(Number.isNaN(versaoPrincipal("25")));
});

test("URLs: recurso, metodo com dois-pontos e lista de contas", () => {
  assert.equal(urlDoCliente("418-018-4854", "googleAds:search", "v25"),
    "https://googleads.googleapis.com/v25/customers/4180184854/googleAds:search");
  assert.equal(urlDoClienteComMetodo("385-699-2760", "generateKeywordIdeas", "v25"),
    "https://googleads.googleapis.com/v25/customers/3856992760:generateKeywordIdeas");
  assert.equal(urlListarContasAcessiveis("v25"),
    "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers");
});

test("nenhum arquivo do servidor escreve versao da API a mao", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "__tests__") continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { varrer(caminho); continue; }
      if (!/\.(ts|js)$/.test(nome) || nome === "googleAdsApi.ts") continue;
      readFileSync(caminho, "utf8").split("\n").forEach((linha, i) => {
        if (/googleads\.googleapis\.com\/v\d/.test(linha)) achados.push(`${caminho}:${i + 1}`);
      });
    }
  };
  const { fileURLToPath } = await import("node:url");
  varrer(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
  assert.deepEqual(achados, [], "versao escrita a mao; use urlDoCliente");
});
