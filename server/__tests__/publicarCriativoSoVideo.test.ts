import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCampaignFacts } from "../campaignFactGuard";
import { pendenciasLocaisParaPublicar } from "../publishPreflight";
import { campanhaTemMidiaPublicavel, getCreativeVideoId } from "../carouselAudit";
import { buildPublishMediaFromCreative } from "../../shared/campaignCreative.schema";

// Caso real: campanha 817 (20/11/2026). O anuncio 1 tinha so o video enviado
// pela MCP (storyVideoId + capa) e o pre-voo recusava com "Nenhuma imagem",
// embora a publicacao real saiba usar o videoId.

const facts = buildCampaignFacts({
  input: { name: "Aula", objective: "traffic", extraContext: "Oferta: uma aula por R$ 19,90, pagamento único, acesso por 7 dias." },
  clientProfile: {},
  segment: "infoprodutos",
});

const base = {
  headline: "Black Friday: aula R$19,90",
  description: "Acesso por 7 dias",
  copy: "Black Friday: uma aula por R$19,90. Pagamento único, acesso por 7 dias.",
  cta: "Quero a aula por R$19,90",
  needsReview: false,
};

const soVideo = {
  ...base,
  storyVideoId: "943465205366380",
  storyVideoThumbnailUrl: "https://example.com/capa.jpg",
};

function campanha(creatives: any[]) {
  return {
    id: 817, projectId: 49, name: "Aula", objective: "traffic",
    adSets: '[{"name":"Conjunto 1","budget":6}]',
    aiResponse: JSON.stringify({ campaignFacts: facts }),
    creatives: JSON.stringify(creatives),
  };
}

test("criativo so com video conta como midia publicavel", () => {
  assert.equal(getCreativeVideoId(soVideo), "943465205366380");
  assert.equal(campanhaTemMidiaPublicavel([soVideo, base]), true);
});

test("video gravado so no creativeSystemV2 tambem conta", () => {
  const v2 = { ...base, creativeSystemV2: { channels: { meta: { placements: { reels: { legacyProjection: { publishMedia: { videoId: "v2" } } } } } } } };
  assert.equal(getCreativeVideoId(v2), "v2");
});

test("pre-voo da 817 nao recusa por falta de imagem quando ha video", () => {
  const r = pendenciasLocaisParaPublicar(campanha([soVideo, base]));
  assert.equal(r.pendencias?.some((p) => p.tipo === "sem_imagem") ?? false, false);
});

test("sem imagem e sem video continua bloqueando", () => {
  const r = pendenciasLocaisParaPublicar(campanha([base, base]));
  assert.equal(r.ok, false);
  assert.ok(r.pendencias?.some((p) => p.tipo === "sem_imagem"));
});

test("a publicacao real resolve o video do criativo mesmo no formato feed", () => {
  assert.equal(buildPublishMediaFromCreative(soVideo as any, "feed")?.videoId, "943465205366380");
});

test("MCP e campaignPublish nao mandam imageHashes vazio (schema exige 2+)", () => {
  for (const arq of ["../mcpServer.ts", "../campaignPublish.ts"]) {
    const src = readFileSync(new URL(arq, import.meta.url), "utf8");
    assert.match(src, /else if \(uniqueImages\.length >= 2\) \{/, arq);
    assert.doesNotMatch(src, /\} else \{\n\s+imageHashes = await Promise\.all\(uniqueImages\.map\(resolveToHash\)\);/, arq);
  }
});
