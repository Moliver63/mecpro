import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Defeito de origem: a campanha Google era criada com `status: 2, // PAUSED`,
 * mas CampaignStatus.ENABLED = 2 e PAUSED = 3. A campanha nascia ATIVADA.
 */
const router = readFileSync(fileURLToPath(new URL("../_core/router.ts", import.meta.url)), "utf8");

test("campanha Google nasce pausada (CampaignStatus.PAUSED = 3)", () => {
  const trecho = router.slice(router.indexOf("const buildGoogleCampaignCreate"), router.indexOf("const buildGoogleCampaignCreate") + 400);
  assert.match(trecho, /status:\s*3,\s*\/\/\s*PAUSED/);
});

test("nenhum 'status: 2' comentado como PAUSED no router", () => {
  assert.equal(/status:\s*2,?\s*\/\/\s*PAUSED/.test(router), false);
});
