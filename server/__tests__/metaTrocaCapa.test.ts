import test from "node:test";
import assert from "node:assert/strict";
import { specComNovaCapa, trocarCapaDoAnuncio } from "../metaTrocaCapa";

const specVideo = { page_id: "1", video_data: { video_id: "99", message: "Texto", title: "T", image_hash: "abc", image_url: "https://antiga.jpg", call_to_action: { type: "LEARN_MORE", value: { link: "https://x.com" } } } };

test("specComNovaCapa: troca so a capa e preserva texto, CTA e video", () => {
  const novo = specComNovaCapa(specVideo, "https://cdn.exemplo.com/capa.jpg");
  assert.equal(novo.video_data.image_url, "https://cdn.exemplo.com/capa.jpg");
  assert.equal(novo.video_data.image_hash, undefined);
  assert.equal(novo.video_data.video_id, "99");
  assert.equal(novo.video_data.message, "Texto");
  assert.deepEqual(novo.video_data.call_to_action, specVideo.video_data.call_to_action);
  assert.equal(specVideo.video_data.image_hash, "abc", "nao muta o original");
});

test("specComNovaCapa: recusa anuncio de imagem e URL que nao e https", () => {
  assert.throws(() => specComNovaCapa({ link_data: { image_hash: "x" } }, "https://a.jpg"), /nao e de video/);
  assert.throws(() => specComNovaCapa(specVideo, "http://a.jpg"), /https/);
});

test("trocarCapaDoAnuncio: le o anuncio, cria criativo novo na conta certa e aponta o anuncio para ele", async () => {
  const chamadas: Array<{ url: string; body?: any }> = [];
  const doFetch = async (url: string, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    chamadas.push({ url, body });
    if (!body) return new Response(JSON.stringify({ account_id: "553", creative: { id: "C1", name: "Criativo", object_story_spec: specVideo } }));
    if (url.endsWith("/act_553/adcreatives")) return new Response(JSON.stringify({ id: "C2" }));
    return new Response(JSON.stringify({ success: true }));
  };
  const r = await trocarCapaDoAnuncio({ token: "tok", adId: "AD1", capaUrl: "https://cdn.exemplo.com/capa.jpg", doFetch: doFetch as any });
  assert.deepEqual(r, { adId: "AD1", creativeAnterior: "C1", creativeNovo: "C2" });
  assert.equal(chamadas.length, 3);
  assert.equal(chamadas[1].body.object_story_spec.video_data.image_url, "https://cdn.exemplo.com/capa.jpg");
  assert.match(chamadas[2].url, /\/AD1$/);
  assert.deepEqual(chamadas[2].body.creative, { creative_id: "C2" });
});

test("trocarCapaDoAnuncio: erro da Meta na criacao nao mexe no anuncio", async () => {
  const urls: string[] = [];
  const doFetch = async (url: string, init?: any) => {
    urls.push(url);
    if (!init?.body) return new Response(JSON.stringify({ account_id: "553", creative: { id: "C1", object_story_spec: specVideo } }));
    return new Response(JSON.stringify({ error: { message: "Invalid parameter" } }), { status: 400 });
  };
  await assert.rejects(trocarCapaDoAnuncio({ token: "t", adId: "AD1", capaUrl: "https://c.jpg", doFetch: doFetch as any }), /Invalid parameter/);
  assert.equal(urls.filter((u) => /\/AD1$/.test(u)).length, 0);
});
