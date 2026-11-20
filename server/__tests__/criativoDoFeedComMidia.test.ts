import test from "node:test";
import assert from "node:assert/strict";
import { escolherCriativoComMidia, criativoTemMidia } from "../carouselAudit";

const feedLike = () => true;
const score = (c: any) => Number(c.finalScore || 0);

test("carrossel sem midia (67) perde para o criativo com video (65)", () => {
  const video = { headline: "video", finalScore: 65, storyVideoId: "123" };
  const carrossel = { headline: "carrossel", finalScore: 67 };
  assert.equal(escolherCriativoComMidia([carrossel, video], feedLike, score), video);
});

test("sem nenhum criativo com midia devolve null (regra antiga continua)", () => {
  assert.equal(escolherCriativoComMidia([{ finalScore: 70 }, { finalScore: 80 }], feedLike, score), null);
});

test("entre criativos com midia vale o de maior score, preferindo os de feed", () => {
  const a = { finalScore: 90, storyVideoId: "1" };
  const b = { finalScore: 60, feedImageHash: "h" };
  assert.equal(escolherCriativoComMidia([a, b], (c) => c === b, score), b);
  assert.equal(escolherCriativoComMidia([a, b], () => false, score), a);
});

test("criativoTemMidia reconhece imagem e video", () => {
  assert.equal(criativoTemMidia({ feedImageHash: "h" }), true);
  assert.equal(criativoTemMidia({ publishMedia: { videoId: "9" } }), true);
  assert.equal(criativoTemMidia({ headline: "x" }), false);
});
