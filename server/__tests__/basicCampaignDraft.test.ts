import test from "node:test";
import assert from "node:assert/strict";
import { basicDraftData, saveBasicCampaignDraft, assertCampaignEnriched } from "../basicCampaignDraft";

const briefing = { projectId: 7, projectName: "Loja", objective: "leads", platform: "meta", productService: "Doces", budget: 1500, durationDays: 30, featuredPhotoIndex: 1 };
const photos = [{ url: "https://media.example/a.jpg", fileName: "a.jpg" }, { url: "https://media.example/b.jpg", fileName: "b.jpg" }];

test("basic draft preserves photos/order/cover, exact offer and publication lock", () => {
  const data = basicDraftData(briefing, { id: 7, name: "Loja" }, photos);
  assert.equal(data.status, "pending_enrichment");
  const creatives = JSON.parse(data.creatives!);
  assert.deepEqual(creatives.map((c: any) => c.feedImageUrl), photos.map(p => p.url));
  assert.deepEqual(creatives.map((c: any) => c.isFeaturedPhoto), [false, true]);
  assert.ok(creatives.every((c: any) => c.needsReview && c.copy === "Doces"));
  assert.equal(JSON.parse(data.aiResponse!).publicationBlocked, true);
  assert.throws(() => basicDraftData({ ...briefing, featuredPhotoIndex: undefined }, { id: 7, name: "Loja" }, photos), /Capa/);
  assert.throws(() => basicDraftData({ ...briefing, budget: NaN }, { id: 7, name: "Loja" }, []), /orcamento/);
});

test("same request is idempotent even after chat newCampaign flag changes", async () => {
  let creates = 0;
  const cache = new Map<string, any>();
  let pendingKey = "";
  const store = {
    async getChatSessionById() { return { userId: 8 }; },
    async getProjectsByUserId() { return [{ id: 7, name: "Loja" }]; },
    async getPendingChatPhotos() { return photos; },
    async checkPlanLimit() { return { allowed: true }; },
    async reserveMcpIdempotencyKey(_user: number, _tool: string, key: string) { pendingKey = key; return cache.has(key) ? { kind: "cached_result" as const, result: cache.get(key) } : { kind: "proceed" as const, recordId: 1 }; },
    async completeMcpIdempotencyKey(_id: number, result: unknown) { cache.set(pendingKey, result); },
    async createCampaign() { creates++; return { id: 99 }; },
  };
  const a = await saveBasicCampaignDraft(8, 1, { ...briefing, newCampaign: true }, store);
  const b = await saveBasicCampaignDraft(8, 1, { ...briefing, newCampaign: false }, store);
  assert.equal(a.id, b.id);
  assert.equal(creates, 1);
  await assert.rejects(saveBasicCampaignDraft(9, 1, briefing, store), /Conversa/);
  await assert.rejects(saveBasicCampaignDraft(8, 1, { ...briefing, projectId: 9 }, store));
  await assert.rejects(saveBasicCampaignDraft(8, 1, briefing, store, 3), /Nem todas as fotos/);
  assert.equal(creates, 1);
});

test("publication guard blocks all basic markers and foreign campaigns", async () => {
  let campaign: any = { projectId: 7, status: "draft" };
  const store = { async getCampaignById() { return campaign; }, async getProjectsByUserId() { return [{ id: 7 }]; } };
  await assertCampaignEnriched(8, 1, store);
  for (const extra of [{ status: "pending_enrichment" }, { aiResponse: JSON.stringify({ generationMode: "basic_draft" }) }, { aiResponse: JSON.stringify({ publicationBlocked: true }) }]) {
    campaign = { projectId: 7, status: "draft", ...extra };
    await assert.rejects(assertCampaignEnriched(8, 1, store), /bloqueada/);
  }
  campaign = { projectId: 9 };
  await assert.rejects(assertCampaignEnriched(8, 1, store), /nao encontrada/);
});
