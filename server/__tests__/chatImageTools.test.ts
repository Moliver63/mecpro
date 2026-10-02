import { test } from "node:test";
import assert from "node:assert/strict";
import { generateChatImage } from "../chatImageTools";

function fixture(creative: any = {}) {
  const calls: any[] = [];
  const deps = {
    getCampaignById: async () => ({ projectId: 3, creatives: JSON.stringify([creative]) }),
    getProjectById: async () => ({ userId: 1 }),
    getUserById: async () => ({ id: 1 }),
    caller: { campaigns: { regenerateCreativeImage: async (args: any) => {
      calls.push(args); return { ok: true, imageUrl: "https://example.com/image.jpg" };
    } } },
  };
  return { deps, calls };
}
const args = { campaignId: 797, creativeIndex: 0, format: "feed" };

test("prepares missing image through existing router without publishing", async () => {
  const { deps, calls } = fixture();
  const result = await generateChatImage(1, args, deps);
  assert.equal(result.ok, true);
  assert.equal(result.published, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].campaignId, 797);
});

test("protects ownership, indices and real photos", async () => {
  for (const creative of [{ usesRealPhoto: true }, { feedImageUrl: "original" }, { imageUrl: "original" }]) {
    const { deps, calls } = fixture(creative);
    assert.equal((await generateChatImage(1, args, deps)).ok, false);
    assert.equal(calls.length, 0);
  }
  const { deps, calls } = fixture();
  assert.equal((await generateChatImage(2, args, deps)).ok, false);
  assert.equal((await generateChatImage(1, { ...args, creativeIndex: 9 }, deps)).ok, false);
  assert.equal((await generateChatImage(1, { ...args, format: "wrong" }, deps)).ok, false);
  assert.equal(calls.length, 0);
});

test("does not report success without image", async () => {
  const { deps } = fixture();
  deps.caller.campaigns.regenerateCreativeImage = async () => ({ ok: false, imageUrl: "" });
  assert.equal((await generateChatImage(1, args, deps)).ok, false);
});
