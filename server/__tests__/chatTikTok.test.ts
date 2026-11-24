import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicarNoTikTokDoChat, urlH264, textoAte, type DepsTikTokChat } from "../chatTikTok";
import { conferirEntradaTikTok } from "../tiktokPublicar";

function deps(over: Partial<DepsTikTokChat> = {}) {
  const chamadas: string[] = [];
  const d: DepsTikTokChat = {
    campanha: async (id) => (id === 824 ? { id: 824, projectId: 49, name: "Teste — Shadia Hasan", objective: "sales", suggestedBudgetDaily: 6, creatives: JSON.stringify([{ headline: "Autoconhecimento que muda sua rotina" }]) } : null),
    projeto: async () => ({ id: 49, userId: 2, name: "Shadia Hasan" }),
    perfil: async () => ({ websiteUrl: "shadiahasan.com/cursos", companyName: "Shadia Hasan" }),
    integracao: async () => ({ isActive: true, accessToken: "tok", accountId: "7000" }),
    videosDaSessao: async () => [{ url: "https://res.cloudinary.com/x/video/upload/v1/a.mp4", fileName: "IMG_7994.mov" }],
    reservar: async () => ({ kind: "proceed", recordId: 1 }),
    concluir: async () => { chamadas.push("concluir"); },
    falhar: async () => { chamadas.push("falhar"); },
    publicar: async () => { chamadas.push("publicar"); return { campaignId: "c1", adGroupId: "g1", identityId: "i1", ads: [{ adId: "a1", videoId: "v1" }], avisos: [] }; },
    conferir: (e) => conferirEntradaTikTok(e),
    salvarIds: async () => { chamadas.push("salvar"); },
    ...over,
  };
  return { d, chamadas };
}

test("sem confirmado devolve previa e nao publica", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: false }, d);
  assert.equal(chamadas.includes("publicar"), false);
  assert.equal(r.previa.destino, "https://shadiahasan.com/cursos");
  assert.equal(r.previa.status, "nasce PAUSADA");
  assert.ok(r.avisos.some((a: string) => /US\$ 20/.test(a)), "avisa o minimo diario");
  assert.ok(r.avisos.some((a: string) => /TRAFEGO/.test(a)), "avisa que publica como trafego");
});

test("com confirmado publica, salva ids e conclui", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true, dailyBudgetReais: 120 }, d);
  assert.equal(r.publicada, true);
  assert.equal(r.status, "PAUSADA");
  assert.deepEqual(chamadas, ["publicar", "salvar", "concluir"]);
});

test("campanha de outro usuario e recusada", async () => {
  const { d, chamadas } = deps();
  const r: any = await publicarNoTikTokDoChat(99, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /nao encontrado/);
  assert.equal(chamadas.length, 0);
});

test("sem TikTok conectado nao publica", async () => {
  const { d } = deps({ integracao: async () => null });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /nao esta conectado/);
});

test("sem videos na conversa bloqueia a publicacao", async () => {
  const { d, chamadas } = deps({ videosDaSessao: async () => [] });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.ok(r.erro);
  assert.equal(chamadas.includes("publicar"), false);
});

test("repetir depois de publicada nao cria nada novo", async () => {
  const { d, chamadas } = deps({ reservar: async () => ({ kind: "cached_result", result: { tiktokCampaignId: "c1" } }) });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.equal(r.jaPublicada, true);
  assert.equal(chamadas.includes("publicar"), false);
});

test("falha do TikTok registra e devolve a etapa", async () => {
  const { d, chamadas } = deps({ publicar: async (_t, _e, etapa) => { etapa("grupo"); throw new Error("budget too low"); } });
  const r: any = await publicarNoTikTokDoChat(2, 28, { campaignId: 824, confirmado: true }, d);
  assert.match(r.erro, /etapa "grupo".*budget too low/);
  assert.ok(chamadas.includes("falhar"));
});

test("urlH264 pede H.264 ao Cloudinary uma vez so", () => {
  const u = urlH264("https://res.cloudinary.com/d/video/upload/v1/a.mp4");
  assert.equal(u, "https://res.cloudinary.com/d/video/upload/vc_h264,f_mp4/v1/a.mp4");
  assert.equal(urlH264(u), u);
  assert.equal(urlH264("https://exemplo.com/a.mp4"), "https://exemplo.com/a.mp4");
});

test("textoAte respeita 100 caracteres sem quebrar palavra", () => {
  const t = textoAte("palavra ".repeat(30), 100);
  assert.ok(t.length <= 100);
  assert.ok(!t.endsWith(" "));
});

test("o chat nao diz mais que TikTok e manual e registra a ferramenta nos 3 provedores", () => {
  const src = readFileSync(new URL("../chat.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /TikTok continuam sendo publicados manualmente/);
  assert.equal((src.match(/=== "publicar_no_tiktok"/g) || []).length, 3);
  assert.equal((src.match(/name: "publicar_no_tiktok"/g) || []).length, 2);
});
