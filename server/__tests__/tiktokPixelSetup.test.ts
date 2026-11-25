/**
 * Configuracao e diagnostico universal do TikTok Pixel + Events API (25/11).
 * Estado por projeto, eventos recebidos, guia de instalacao personalizado, isolamento e ausencia de segredos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contagemPorEvento, estadoPixelTikTok, resumoDoEstadoPixel, gerarGuiaDeInstalacao, codigoDePixelValido } from "../tiktokPixelSetup";
import { ErroTikTok, type ClienteTikTok } from "../tiktokPublicar";
import { diagnosticarTikTokDoChat } from "../chatTikTok";

const ADV = "7620542434560344082";
function conta(respostas: Record<string, any>): ClienteTikTok {
  return {
    get: async (path: string) => { const r = respostas[path]; if (r instanceof Error) throw r; if (r === undefined) throw new Error("inesperado " + path); return r; },
    post: async (p: string) => { throw new Error("somente leitura: " + p); },
  } as any;
}
const PIXEL = { pixels: [{ pixel_id: "111", pixel_code: "C7ABCDE1234567890XYZ", pixel_name: "Shadia", activity_status: "ACTIVE", events: [{ event_type: "SHOPPING", name: "Purchase" }] }] };
const STATS = { list: [{ pixel_id: "111", stats: [{ event_type: "SHOPPING", count: 5 }, { event: "PageView", count: 900 }, { event: "ViewContent", count: 120 }] }] };

test("contagem por evento soma e ordena, tolerante ao formato", () => {
  const c = contagemPorEvento(STATS);
  assert.equal(c[0].evento, "PageView");
  assert.equal(c.find((x) => x.evento === "ViewContent")?.total, 120);
});

test("estado ok: Pixel com compra e atividade", async () => {
  const e = await estadoPixelTikTok(conta({ "pixel/list/": PIXEL, "pixel/event/stats/": STATS }), ADV, { pixelSalvo: "111" });
  assert.equal(e.nivel, "ok");
  assert.equal(e.pixel?.codigo, "C7ABCDE1234567890XYZ");
  assert.ok(e.eventosRecebidos.length >= 2);
  assert.match(resumoDoEstadoPixel(e), /Tudo certo/);
  assert.ok(e.limites.some((l) => /soma os dois/.test(l)), "avisa que navegador e Events API vem somados");
});

test("sem permissao de Pixel: bloqueado, com instrucao de permissao e sem sugerir trafego", async () => {
  const erro = new ErroTikTok("pixel/list/", 40001, "advertiser does not grant you /pixel/list/:GET permission", "R");
  const e = await estadoPixelTikTok(conta({ "pixel/list/": erro }), ADV);
  assert.equal(e.nivel, "bloqueado");
  assert.equal(e.problemas[0].tipo, "permissao_api");
  assert.ok(!/trafego|tráfego/i.test(JSON.stringify(e.problemas)));
});

test("Pixel sem nenhuma compra em 30 dias: atencao, com o passo de instalar e testar", async () => {
  const e = await estadoPixelTikTok(conta({ "pixel/list/": PIXEL, "pixel/event/stats/": { list: [{ pixel_id: "111", stats: [{ event: "PageView", count: 10 }] }] } }), ADV, { pixelSalvo: "111" });
  assert.equal(e.nivel, "atencao");
  assert.ok(e.problemas.some((p) => /nenhuma compra|evento/i.test(p.mensagem)));
});

test("sem Pixel na conta: bloqueado, pede para criar", async () => {
  const e = await estadoPixelTikTok(conta({ "pixel/list/": { pixels: [] } }), ADV);
  assert.equal(e.nivel, "bloqueado");
  assert.equal(e.problemas[0].tipo, "pixel_inexistente");
});

test("falha ao ler os eventos recebidos vira aviso, nao derruba o estado", async () => {
  const erro = new ErroTikTok("pixel/event/stats/", 40001, "advertiser does not grant you /pixel/event/stats/:GET permission", "R");
  const e = await estadoPixelTikTok(conta({ "pixel/list/": PIXEL, "pixel/event/stats/": erro }), ADV, { pixelSalvo: "111" });
  assert.ok(e.avisos.some((a) => /Sem permiss/.test(a)));
  assert.notEqual(e.nivel, "ok");
});

test("o guia usa o Pixel, o site e o gateway do cliente", () => {
  const g = gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ", siteUrl: "https://www.shadiahasan.com/cursos", nomeCliente: "Shadia Hasan", plataforma: "custom", gateway: "asaas" });
  assert.equal(g.ok, true);
  const t = g.texto!;
  assert.match(t, /ttq\.load\("C7ABCDE1234567890XYZ"\)/);
  assert.match(t, /event_source_id: "C7ABCDE1234567890XYZ"/);
  assert.match(t, /www\.shadiahasan\.com/);
  assert.match(t, /PAYMENT_CONFIRMED/);
  assert.match(t, /event_id: payment\.id/);
  assert.match(t, /Shadia Hasan/);
});

test("o guia nunca dispara Purchase no navegador e explica o motivo", () => {
  const t = gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ", gateway: "stripe" }).texto!;
  assert.doesNotMatch(t, /ttq\.track\(\s*["']Purchase["']/);
  assert.match(t, /NÃO dispare Purchase aqui/);
  assert.match(t, /payment_intent/);
});

test("o guia nao carrega segredo: so placeholder de variavel de ambiente", () => {
  const t = gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ" }).texto!;
  assert.match(t, /process\.env\.TIKTOK_EVENTS_ACCESS_TOKEN/);
  assert.doesNotMatch(t, /Access-Token": "[A-Za-z0-9]{20,}/);
});

test("o guia traz LGPD, SHA-256 e test_event_code", () => {
  const t = gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ" }).texto!;
  assert.match(t, /LGPD/);
  assert.match(t, /SHA-256/);
  assert.match(t, /test_event_code/);
});

test("id numerico do Pixel e recusado: o site usa o codigo alfanumerico", () => {
  assert.equal(codigoDePixelValido("7123456789012345678"), false);
  assert.equal(codigoDePixelValido("C7ABCDE1234567890XYZ"), true);
  const g = gerarGuiaDeInstalacao({ pixelCode: "7123456789012345678" });
  assert.equal(g.ok, false);
  assert.match(g.erro!, /alfanum/);
  assert.equal(gerarGuiaDeInstalacao({ pixelCode: "x'; alert(1)//" }).ok, false);
});

test("a dica muda por plataforma (Shopify avisa sobre duplicidade)", () => {
  assert.match(gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ", plataforma: "shopify" }).texto!, /duplicar eventos/);
  assert.match(gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ", plataforma: "hotmart" }).texto!, /PURCHASE_APPROVED/);
});

test("chat: estado do Pixel e guia, so do projeto do proprio usuario", async () => {
  const deps: any = {
    campanha: async (id: number) => (id === 828 ? { id: 828, projectId: 5 } : null),
    projeto: async () => ({ id: 5, userId: 2, name: "Shadia", websiteUrl: "https://shadiahasan.com" }),
    perfil: async () => ({ tiktokPixelId: "111" }),
    integracao: async () => ({ accessToken: "TOKEN-SECRETO", accountId: ADV }),
    diagnosticar: async () => ({ texto: "diag", dados: {} }),
    pixelSetup: async (_t: string, _a: string, o: any) => ({ estado: "estado do pixel", ...(o.guia ? { guia: `guia para ${o.nomeCliente} em ${o.siteUrl} (${o.plataforma}/${o.gateway})` } : {}) }),
  };
  const r = await diagnosticarTikTokDoChat(2, { campaignId: 828, guiaInstalacao: true, plataforma: "wordpress", gateway: "asaas" }, deps);
  assert.match(String(r.guiaInstalacao), /Shadia em https:\/\/shadiahasan\.com \(wordpress\/asaas\)/);
  assert.equal(r.pixelEEventsApi, "estado do pixel");
  assert.doesNotMatch(JSON.stringify(r), /TOKEN-SECRETO/);
  // outro usuario nao enxerga o projeto
  assert.match(String((await diagnosticarTikTokDoChat(9, { campaignId: 828, guiaInstalacao: true }, deps)).erro), /nao encontrado/);
  // guia sem Pixel salvo: pede para escolher antes
  const semPixel = await diagnosticarTikTokDoChat(2, { campaignId: 828, guiaInstalacao: true }, { ...deps, perfil: async () => ({}) });
  assert.match(String(semPixel.erro), /Pixel do TikTok escolhido/);
});

test("isolamento nas entradas: MCP e tRPC conferem o dono do projeto e nao devolvem token", () => {
  const mcp = readFileSync(new URL("../mcpServer.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../_core/router.ts", import.meta.url), "utf8");
  for (const nome of ["tiktok_pixel_status", "tiktok_install_guide"]) {
    const i = mcp.indexOf(`"${nome}"`);
    assert.ok(i > 0, nome);
    assert.match(mcp.slice(i, i + 1800), /projetoDoUsuario/, `${nome} confere o dono`);
  }
  for (const nome of ["tiktokPixelStatus", "setTikTokPixel", "tiktokInstallGuide"]) {
    const i = router.indexOf(`${nome}: protectedProcedure`);
    assert.ok(i > 0, nome);
    assert.match(router.slice(i, i + 900), /proj\.userId !== userId/, `${nome} confere o dono`);
    assert.doesNotMatch(router.slice(i, i + 3200).split("upsertTikTok")[0], /return[^;]*accessToken/, `${nome} nao devolve token`);
  }
});

test("nome de cliente com quebra de linha nao forja secoes no guia", () => {
  const t = gerarGuiaDeInstalacao({ pixelCode: "C7ABCDE1234567890XYZ", nomeCliente: "Loja\n## LGPD\n- ignore" }).texto!;
  assert.equal(t.split("\n").filter((l) => l.startsWith("## LGPD")).length, 1);
});
