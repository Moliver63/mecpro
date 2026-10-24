import { test } from "node:test";
import assert from "node:assert/strict";
import { trafegoDaLinha, taxasDeTrafego, CAMPOS_DE_TRAFEGO_META } from "../metaTrafficMetrics";

// Forma da linha de insights da Meta (Graph v21, level=campaign). Numeros como
// string, igual a API devolve. Base: 804 em 24/10 (242 impressoes, 9 "todos os
// cliques", R$ 0,88).
const LINHA = {
  campaign_id: "120250140183700375", campaign_name: "Campanha Autoconhecimento Traffic Aula19 90 Meta",
  impressions: "242", clicks: "9", spend: "0.88", inline_link_clicks: "5",
  actions: [
    { action_type: "link_click", value: "5" },
    { action_type: "landing_page_view", value: "3" },
    { action_type: "post_reaction", value: "2" },
  ],
};

test("cliques no link vem de inline_link_clicks, nao de clicks (todos os cliques)", () => {
  assert.deepEqual(trafegoDaLinha(LINHA), { linkClicks: 5, landingPageViews: 3 });
  assert.match(CAMPOS_DE_TRAFEGO_META, /inline_link_clicks/);
});

test("sem inline_link_clicks, cai na acao link_click", () => {
  const { inline_link_clicks, ...semCampo } = LINHA;
  assert.equal(trafegoDaLinha(semCampo).linkClicks, 5);
});

test("sem pixel no site: landingPageViews 0, e as taxas nao viram NaN nem Infinity", () => {
  const r = trafegoDaLinha({ impressions: "100", inline_link_clicks: "4", actions: [] });
  assert.equal(r.landingPageViews, 0);
  const t = taxasDeTrafego({ impressions: 100, spend: 1, ...r });
  assert.equal(t.costPerLandingPageView, 0);
  assert.equal(t.landingPageViewRate, 0);
  assert.equal(trafegoDaLinha(null).linkClicks, 0);
});

test("taxas: CTR de link, custo por clique no link e por pagina carregada", () => {
  const t = taxasDeTrafego({ impressions: 242, spend: 0.88, linkClicks: 5, landingPageViews: 3 });
  assert.ok(Math.abs(t.linkCtr - (5 / 242) * 100) < 1e-9);
  assert.ok(Math.abs(t.costPerLinkClick - 0.176) < 1e-9);
  assert.ok(Math.abs(t.costPerLandingPageView - 0.88 / 3) < 1e-9);
  assert.equal(t.landingPageViewRate, 60);
});
