import assert from "node:assert/strict";
import test from "node:test";

import { getPlacementGuidance, normalizeRatio } from "../placementGuidance";

test("normalizeRatio normaliza formatos clássicos e resolução", () => {
  assert.equal(normalizeRatio("9:16"), "9:16");
  assert.equal(normalizeRatio("1080x1920"), "9:16");
  assert.equal(normalizeRatio("1080×1920"), "9:16");
  assert.equal(normalizeRatio("1080x1350"), "4:5");
  assert.equal(normalizeRatio("1080x1080"), "1:1");
});

test("normalizeRatio normaliza formatos decimais e horizontais", () => {
  assert.equal(normalizeRatio(0.5625), "9:16");
  assert.equal(normalizeRatio("0.5625"), "9:16");
  assert.equal(normalizeRatio(0.8), "4:5");
  assert.equal(normalizeRatio("0.8"), "4:5");
  assert.equal(normalizeRatio("1.91:1"), "horizontal");
  assert.equal(normalizeRatio(1.91), "horizontal");
  assert.equal(normalizeRatio("square"), "1:1");
  assert.equal(normalizeRatio("vertical"), "9:16");
  assert.equal(normalizeRatio("horizontal"), "horizontal");
  assert.equal(normalizeRatio("mixed"), "mixed");
});

test("normalizeRatio retorna unknown para casos inválidos", () => {
  assert.equal(normalizeRatio("abc"), "unknown");
  assert.equal(normalizeRatio(""), "unknown");
  assert.equal(normalizeRatio(null), "unknown");
  assert.equal(normalizeRatio(undefined), "unknown");
  assert.equal(normalizeRatio(0), "unknown");
  assert.equal(normalizeRatio(-1), "unknown");
});

test("getPlacementGuidance retorna guidance correto para feed", () => {
  const ideal = getPlacementGuidance({
    placement: "feed",
    mediaType: "image",
    ratio: "4:5",
    cardsCount: 1,
  });
  assert.equal(ideal.status, "ideal");
  assert.equal(ideal.title, "Feed — formato ideal");

  const vertical = getPlacementGuidance({
    placement: "feed",
    mediaType: "image",
    ratio: "1080x1920",
    cardsCount: 1,
  });
  assert.equal(vertical.status, "warning");
  assert.equal(vertical.title, "Feed — mídia vertical usada em placement de feed");

  const horizontal = getPlacementGuidance({
    placement: "feed",
    mediaType: "image",
    ratio: "1.91:1",
    cardsCount: 1,
  });
  assert.equal(horizontal.status, "info");
  assert.equal(horizontal.title, "Feed — formato não recomendado");
});

test("getPlacementGuidance retorna guidance correto para stories", () => {
  const idealImage = getPlacementGuidance({
    placement: "stories",
    mediaType: "image",
    ratio: "9:16",
    cardsCount: 1,
  });
  assert.equal(idealImage.status, "ideal");
  assert.equal(idealImage.title, "Stories — formato ideal");

  const idealVideo = getPlacementGuidance({
    placement: "stories",
    mediaType: "video",
    ratio: "1080x1920",
    cardsCount: 1,
  });
  assert.equal(idealVideo.status, "ideal");
  assert.equal(idealVideo.title, "Stories — vídeo em formato ideal");

  const warning = getPlacementGuidance({
    placement: "stories",
    mediaType: "image",
    ratio: "1080x1350",
    cardsCount: 1,
  });
  assert.equal(warning.status, "warning");
  assert.equal(warning.title, "Stories — formato aceitável com ajuste visual");

  const invalid = getPlacementGuidance({
    placement: "stories",
    mediaType: "image",
    ratio: "abc",
    cardsCount: 1,
  });
  assert.equal(invalid.status, "info");
  assert.equal(invalid.title, "Stories — formato não recomendado");
});

test("getPlacementGuidance retorna guidance correto para reels", () => {
  const ideal = getPlacementGuidance({
    placement: "reels",
    mediaType: "video",
    ratio: 0.5625,
    cardsCount: 1,
  });
  assert.equal(ideal.status, "ideal");
  assert.equal(ideal.title, "Reels — formato ideal");

  const compatible = getPlacementGuidance({
    placement: "reels",
    mediaType: "video",
    ratio: 0.8,
    cardsCount: 1,
  });
  assert.equal(compatible.status, "warning");
  assert.equal(compatible.title, "Reels — vídeo compatível, mas fora do formato ideal");

  const imageVertical = getPlacementGuidance({
    placement: "reels",
    mediaType: "image",
    ratio: "1080×1920",
    cardsCount: 1,
  });
  assert.equal(imageVertical.status, "warning");
  assert.equal(imageVertical.title, "Reels — imagem permitida, mas vídeo é mais recomendado");

  const horizontal = getPlacementGuidance({
    placement: "reels",
    mediaType: "video",
    ratio: "1.91:1",
    cardsCount: 1,
  });
  assert.equal(horizontal.status, "info");
  assert.equal(horizontal.title, "Reels — baixa aderência ao placement");
});

test("getPlacementGuidance retorna guidance correto para carrossel", () => {
  const minimum = getPlacementGuidance({
    placement: "carousel",
    mediaType: "image",
    ratio: "1:1",
    cardsCount: 2,
  });
  assert.equal(minimum.status, "warning");
  assert.equal(minimum.title, "Carrossel — quantidade mínima recomendada atingida");

  const ideal = getPlacementGuidance({
    placement: "carousel",
    mediaType: "image",
    ratio: "1080x1080",
    cardsCount: 3,
  });
  assert.equal(ideal.status, "ideal");
  assert.equal(ideal.title, "Carrossel — formato ideal");

  const compatible = getPlacementGuidance({
    placement: "carousel",
    mediaType: "image",
    ratio: "1080x1350",
    cardsCount: 4,
  });
  assert.equal(compatible.status, "ideal");
  assert.equal(compatible.title, "Carrossel — formato compatível");

  const mixed = getPlacementGuidance({
    placement: "carousel",
    mediaType: "image",
    ratio: "mixed",
    cardsCount: 4,
  });
  assert.equal(mixed.status, "warning");
  assert.equal(mixed.title, "Carrossel — tamanhos diferentes entre os cards");

  const invalid = getPlacementGuidance({
    placement: "carousel",
    mediaType: "image",
    ratio: "invalido",
    cardsCount: 4,
  });
  assert.equal(invalid.status, "info");
  assert.equal(invalid.title, "Carrossel — mídia fora do padrão mais recomendado");
});
