import { test } from "node:test";
import assert from "node:assert/strict";
import { acrescentarAnexo, somenteFotos, somenteVideos, semFotos, etapaDaConversa, notaDeRetomada } from "../chatAttachments";
import { anexarVideoAoCriativo, registrarVideoDoChat, limparRegistroDeVideosDoChat } from "../chatCreativeVideo";

const V = (n: number) => `https://res.cloudinary.com/demo/video/upload/mecpro/chat-videos/v${n}.mp4`;

test("F7: video e foto convivem na sessao e cada leitor so ve o seu tipo", () => {
  let l = acrescentarAnexo([], { url: "https://x/a.jpg", fileName: "a.jpg" }).lista;
  l = acrescentarAnexo(l, { url: V(1), fileName: "v.mp4", kind: "video" }).lista;
  assert.equal(somenteFotos(l).length, 1);
  assert.equal(somenteVideos(l).length, 1);
});

test("F7: reenvio do mesmo video (URL ou hash) nao duplica", () => {
  const a = acrescentarAnexo([], { url: V(1), fileName: "v.mp4", kind: "video", sha: "abc" });
  const b = acrescentarAnexo(a.lista, { url: V(2), fileName: "v.mp4", kind: "video", sha: "abc" });
  assert.equal(b.lista.length, 1);
  assert.equal(b.duplicado?.url, V(1));
  const c = acrescentarAnexo(a.lista, { url: V(1), fileName: "v.mp4", kind: "video" });
  assert.equal(c.lista.length, 1);
});

test("F7: foto e video com a mesma URL nao se confundem e o limite mantem os mais recentes", () => {
  let l: any[] = [];
  for (let i = 0; i < 12; i++) l = acrescentarAnexo(l, { url: `https://x/${i}.jpg`, fileName: `${i}` }).lista;
  assert.equal(l.length, 10);
  assert.equal(l[0].url, "https://x/2.jpg");
});

test("F7: gerar a campanha consome as fotos e preserva os videos", () => {
  const l = [{ url: "https://x/a.jpg", fileName: "a" }, { url: V(1), fileName: "v", kind: "video" as const }];
  assert.deepEqual(semFotos(l).map((a) => a.url), [V(1)]);
});

test("F7: etapa da conversa reflete briefing, rascunho e conta", () => {
  const base = { briefingCompleto: false, temRascunho: false, contaEscolhida: false, fotos: 0, videos: 0 };
  assert.equal(etapaDaConversa(base), "coletando_briefing");
  assert.equal(etapaDaConversa({ ...base, briefingCompleto: true }), "pronto_para_gerar");
  assert.equal(etapaDaConversa({ ...base, temRascunho: true }), "rascunho_criado");
  assert.equal(etapaDaConversa({ ...base, temRascunho: true, contaEscolhida: true }), "conta_escolhida");
});

test("F7: nota de retomada manda nao repetir briefing nem pedir reenvio, sem expor URL", () => {
  const n = notaDeRetomada({ briefingCompleto: true, temRascunho: false, contaEscolhida: false, fotos: 2, videos: 1 });
  assert.match(n, /gere o rascunho/i);
  assert.match(n, /2 foto\(s\) e 1 video\(s\)/);
  assert.match(n, /Nao peca o reenvio/);
  assert.doesNotMatch(n, /https?:/);
  assert.match(notaDeRetomada({ briefingCompleto: true, temRascunho: true, contaEscolhida: false, fotos: 0, videos: 0 }), /Nao crie outro/);
});

// ── Autorizacao do anexo depois de reiniciar o servidor ─────────────────────
const campanha = { id: 7, projectId: 3, creatives: JSON.stringify([{ headline: "x" }]), aiResponse: null, status: "draft" } as any;
function deps(over: any = {}) {
  const chamadas = { baixar: 0, contas: 0 };
  return {
    chamadas,
    d: {
      getCampaignById: async () => campanha,
      getProjectsByUserId: async () => [{ id: 3 }],
      videoDoUsuarioPersistido: async () => false,
      listarContas: async () => { chamadas.contas++; return { ok: false as const, erro: "sem conta" }; },
      contaDaConexao: async () => null,
      baixar: async () => { chamadas.baixar++; return { ok: false as const, erro: "parou aqui" }; },
      ...over,
    } as any,
  };
}
const args = { campaignId: 7, creativeIndex: 0, format: "feed", videoUrl: V(1) };

test("F7: video do banco vale depois do restart, mesmo sem o registro em memoria", async () => {
  limparRegistroDeVideosDoChat();
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  const { d, chamadas } = deps({ videoDoUsuarioPersistido: async (u: number, url: string) => u === 1 && url === V(1) });
  const r: any = await anexarVideoAoCriativo(1, args, d);
  assert.doesNotMatch(String(r.erro), /nao esta entre os enviados/);
  assert.equal(chamadas.contas, 1, "passou da checagem de dono e chegou na checagem de conta");
});

test("F7: outro usuario nao usa o video de alguem, nem pelo banco", async () => {
  limparRegistroDeVideosDoChat();
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  const { d, chamadas } = deps({ videoDoUsuarioPersistido: async (u: number) => u === 1 });
  const r: any = await anexarVideoAoCriativo(2, args, d);
  assert.match(String(r.erro), /nao esta entre os enviados/);
  assert.equal(chamadas.baixar + chamadas.contas, 0);
});

test("F7: falha na consulta ao banco nega o acesso em vez de liberar", async () => {
  limparRegistroDeVideosDoChat();
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  const { d } = deps({ videoDoUsuarioPersistido: async () => { throw new Error("db fora"); } });
  const r: any = await anexarVideoAoCriativo(1, args, d);
  assert.match(String(r.erro), /nao esta entre os enviados/);
});

test("F7: registro em memoria continua valendo sem o banco", async () => {
  limparRegistroDeVideosDoChat();
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  registrarVideoDoChat(1, V(1));
  const { d, chamadas } = deps({ videoDoUsuarioPersistido: undefined });
  await anexarVideoAoCriativo(1, args, d);
  assert.equal(chamadas.contas, 1);
});
