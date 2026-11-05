import test from "node:test";
import assert from "node:assert/strict";
import { montarFunil, aplicarFunil } from "../funilDeTrafego";

test("Meta separa clique total de clique no destino e de visualizacao da pagina", () => {
  const f = montarFunil("meta", {
    totals: { spend: 50.75, clicks: 673, linkClicks: 600, landingPageViews: 266, purchases: 0, leads: 0 },
  });
  assert.equal(f.cliquesTotais, 673);
  assert.equal(f.cliquesNoDestino, 600);
  assert.equal(f.visualizacoesDaPagina, 266);
  assert.ok(Math.abs(f.custoPorVisualizacaoDaPagina! - 0.190789) < 0.0001);
  assert.ok(Math.abs(f.custoPorCliqueNoDestino! - 0.084583) < 0.0001);
});

test("Google: clicks conta como clique no destino, e o que ele nao fornece fica null", () => {
  const f = montarFunil("google", { totals: { spend: 120, clicks: 300, conversions: 12 } });
  assert.equal(f.cliquesNoDestino, 300);
  assert.equal(f.cliquesTotais, null, "o Google nao tem equivalente a clique total da Meta");
  assert.equal(f.visualizacoesDaPagina, null);
  assert.equal(f.custoPorVisualizacaoDaPagina, null, "sem o degrau, o custo nao pode ser inventado");
  assert.equal(f.custoPorConversao, 10);
});

test("TikTok usa a sondagem para os degraus que a API so entrega por metrica extra", () => {
  const f = montarFunil("tiktok", {
    totals: { spend: 58.95, clicks: 3040, conversions: 0 },
    metricasDeFunil: { engagements: 5000, landing_page_view: 400 },
  });
  assert.equal(f.cliquesNoDestino, 3040);
  assert.equal(f.cliquesTotais, 5000);
  assert.equal(f.visualizacoesDaPagina, 400);
  assert.ok(Math.abs(f.custoPorVisualizacaoDaPagina! - 0.147375) < 0.0001);
});

test("TikTok sem sondagem bem-sucedida deixa os degraus desconhecidos em null", () => {
  const f = montarFunil("tiktok", { totals: { spend: 58.95, clicks: 3040, conversions: 0 } });
  assert.equal(f.cliquesNoDestino, 3040, "esse vem do resumo e deve continuar");
  assert.equal(f.cliquesTotais, null);
  assert.equal(f.visualizacoesDaPagina, null);
  assert.equal(f.custoPorVisualizacaoDaPagina, null);
});

test("total_landing_page_view serve de alternativa a landing_page_view", () => {
  const f = montarFunil("tiktok", {
    totals: { spend: 10, clicks: 100 },
    metricasDeFunil: { total_landing_page_view: 50 },
  });
  assert.equal(f.visualizacoesDaPagina, 50);
  assert.equal(f.custoPorVisualizacaoDaPagina, 0.2);
});

// Zero e um numero, nao uma ausencia: dividir por ele daria Infinity, e tratar
// como ausencia esconderia que a campanha entregou e ninguem chegou na pagina.
test("degrau zerado mantem o zero e deixa o custo em null, sem Infinity", () => {
  const f = montarFunil("meta", {
    totals: { spend: 30, clicks: 100, linkClicks: 80, landingPageViews: 0, purchases: 0, leads: 0 },
  });
  assert.equal(f.visualizacoesDaPagina, 0, "zero e informacao: entregou e ninguem chegou");
  assert.equal(f.custoPorVisualizacaoDaPagina, null);
  assert.ok(Number.isFinite(f.custoPorCliqueNoDestino!));
});

test("aplicarFunil anexa o funil a cada plataforma com totais", () => {
  const report: any = {
    meta:   { configured: true, totals: { spend: 10, clicks: 10, linkClicks: 8, landingPageViews: 4, purchases: 1, leads: 0 } },
    google: { configured: true, totals: { spend: 0, clicks: 0, conversions: 0 } },
    tiktok: { configured: true, totals: { spend: 5, clicks: 50, conversions: 0 }, metricasDeFunil: {} },
  };
  aplicarFunil(report);
  assert.ok(report.meta.funil && report.google.funil && report.tiktok.funil);
  assert.equal(report.meta.funil.custoPorVisualizacaoDaPagina, 2.5);
  assert.ok(report.tiktok.funil.observacoes.includes("terceiros"), "a origem nao confirmada precisa viajar junto com o numero");
});

test("plataforma com erro ou sem totais fica intacta, sem funil zerado", () => {
  const report: any = {
    meta:   { configured: true, error: "token expirado" },
    google: { configured: false, error: "nao configurada" },
    tiktok: { configured: true, totals: { spend: 1, clicks: 2, conversions: 0 } },
  };
  aplicarFunil(report);
  assert.equal(report.meta.funil, undefined, "erro nao pode virar desempenho ruim");
  assert.equal(report.google.funil, undefined);
  assert.ok(report.tiktok.funil);
});

test("aplicarFunil nao quebra com relatorio vazio ou plataforma ausente", () => {
  assert.doesNotThrow(() => aplicarFunil({}));
  assert.doesNotThrow(() => aplicarFunil({ meta: null } as any));
});
