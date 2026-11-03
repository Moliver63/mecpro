import test from "node:test";
import assert from "node:assert/strict";
import { conferirEntradaTikTok, inicioTikTok, acharVideoPorNome, publicarCampanhaTikTok, TIKTOK_BRASIL_LOCATION_ID, type ClienteTikTok } from "../tiktokPublicar";

const base = {
  advertiserId: "123", campaignName: "Shadia | Trafego", dailyBudgetReais: 30, landingPageUrl: "https://shadiahasan.com",
  adText: "Uma aula por R$ 19,90", callToAction: "LEARN_MORE", displayName: "Shadia Hasan",
  videos: [{ videoId: "v1" }],
};

test("entrada valida nao tem problemas", () => assert.deepEqual(conferirEntradaTikTok(base), []));

test("recusa http, orcamento zero, texto longo e video sem origem", () => {
  const p = conferirEntradaTikTok({ ...base, landingPageUrl: "http://x.com", dailyBudgetReais: 0, adText: "a".repeat(101), videos: [{}] });
  assert.equal(p.length, 4);
});

test("inicio fica 15 minutos a frente, formato do TikTok", () => {
  assert.equal(inicioTikTok(new Date("2026-11-03T20:00:00Z")), "2026-11-03 20:15:00");
});

test("acha video por nome sem extensao nem caixa", () => {
  assert.equal(acharVideoPorNome([{ video_id: "9", file_name: "IMG_2934.mp4" }], "img_2934"), "9");
  assert.equal(acharVideoPorNome([], "x"), null);
});

function falso() {
  const chamadas: Array<{ m: string; path: string; body: any }> = [];
  const c: ClienteTikTok = {
    async post(path: string, body: any) {
      chamadas.push({ m: "POST", path, body });
      if (path === "campaign/create/") return { campaign_id: "C1" };
      if (path === "adgroup/create/") return { adgroup_id: "G1" };
      if (path === "file/image/ad/upload/") return { image_id: "IMG1" };
      if (path === "file/video/ad/upload/") return [{ video_id: "VUP" }];
      if (path === "ad/create/") return { ad_ids: ["A" + chamadas.length] };
      throw new Error("inesperado " + path);
    },
    async get(path: string, params: any) {
      chamadas.push({ m: "GET", path, body: params });
      if (path === "identity/get/") return params.identity_type === "TT_USER" ? { identity_list: [{ identity_id: "ID1", identity_type: "TT_USER", display_name: "Shadia Hasan" }] } : { identity_list: [] };
      if (path === "campaign/get/" || path === "adgroup/get/") return { list: [] };
      if (path === "file/video/ad/info/") return [{ video_cover_url: "https://c/x.jpg" }];
      throw new Error("inesperado " + path);
    },
  } as any;
  return { c, chamadas };
}

test("tudo nasce PAUSADO, Brasil por ID e um anuncio por video", async () => {
  const { c, chamadas } = falso();
  const r = await publicarCampanhaTikTok(c, { ...base, videos: [{ videoId: "v1" }, { videoUrl: "https://h/a.mp4" }] });
  assert.equal(r.ads.length, 2);
  assert.equal(r.ads[1].videoId, "VUP");
  const camp = chamadas.find((x) => x.path === "campaign/create/")!.body;
  const grupo = chamadas.find((x) => x.path === "adgroup/create/")!.body;
  assert.equal(camp.operation_status, "DISABLE");
  assert.equal(grupo.operation_status, "DISABLE");
  assert.deepEqual(grupo.location_ids, [TIKTOK_BRASIL_LOCATION_ID]);
  for (const a of chamadas.filter((x) => x.path === "ad/create/")) {
    assert.equal(a.body.operation_status, "DISABLE");
    assert.equal(a.body.creatives[0].identity_id, "ID1");
    assert.equal(a.body.creatives[0].identity_type, "TT_USER");
    assert.deepEqual(a.body.creatives[0].image_ids, ["IMG1"]);
  }
  assert.equal(chamadas.find((x) => x.path === "file/video/ad/upload/")!.body.upload_type, "UPLOAD_BY_URL");
});

test("erro do TikTok interrompe e nao cria o resto", async () => {
  const { c, chamadas } = falso();
  (c as any).post = async (path: string, body: any) => { chamadas.push({ m: "POST", path, body }); if (path === "adgroup/create/") throw new Error("TikTok [adgroup/create/] 40002: budget too low"); return { campaign_id: "C1" }; };
  await assert.rejects(publicarCampanhaTikTok(c, base), /budget too low/);
  assert.equal(chamadas.some((x) => x.path === "ad/create/"), false);
});

test("sem conta de TikTok autorizada: erro claro e nada criado", async () => {
  const { c, chamadas } = falso();
  (c as any).get = async (path: string) => { chamadas.push({ m: "GET", path, body: {} }); return { identity_list: [] }; };
  await assert.rejects(publicarCampanhaTikTok(c, base), /autorizar uma conta de TikTok/);
  assert.equal(chamadas.some((x) => x.path === "campaign/create/"), false);
});

test("reaproveita campanha e grupo existentes em vez de criar de novo", async () => {
  const { c, chamadas } = falso();
  const getOrig = c.get.bind(c);
  (c as any).get = async (path: string, params: any) => {
    if (path === "campaign/get/") return { list: [{ campaign_id: "CX", campaign_name: base.campaignName }] };
    if (path === "adgroup/get/") return { list: [{ adgroup_id: "GX" }] };
    return getOrig(path, params);
  };
  const r = await publicarCampanhaTikTok(c, base);
  assert.equal(r.campaignId, "CX");
  assert.equal(r.adGroupId, "GX");
  assert.equal(chamadas.some((x) => x.path === "campaign/create/" || x.path === "adgroup/create/"), false);
});
