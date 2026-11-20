import assert from "node:assert/strict";
import test from "node:test";
import { escolherIndiceDoCriativoDoConjunto } from "../carouselAudit.ts";

const comVideo = (id: string) => ({ storyVideoId: id });
const semMidia = {};

test("funil: cada conjunto usa o criativo de mesmo indice", () => {
  const creatives = [comVideo("1"), comVideo("2")];
  assert.equal(escolherIndiceDoCriativoDoConjunto({ adSetIndex: 0, adSetsCount: 2, creatives }), 0);
  assert.equal(escolherIndiceDoCriativoDoConjunto({ adSetIndex: 1, adSetsCount: 2, creatives }), 1);
});

test("mantem a regra antiga com 1 conjunto, creativeIndex fixo ou criativo sem midia", () => {
  const creatives = [comVideo("1"), comVideo("2")];
  assert.equal(escolherIndiceDoCriativoDoConjunto({ adSetIndex: 1, adSetsCount: 1, creatives }), null);
  assert.equal(escolherIndiceDoCriativoDoConjunto({ creativeIndex: 0, adSetIndex: 1, adSetsCount: 2, creatives }), null);
  assert.equal(escolherIndiceDoCriativoDoConjunto({ adSetIndex: 1, adSetsCount: 2, creatives: [comVideo("1"), semMidia] }), null);
});
