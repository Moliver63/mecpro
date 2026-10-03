import test from "node:test";
import assert from "node:assert/strict";
import { generateChatImage } from "../chatImageTools";
import { imageBrief, imageFingerprint, canonicalStockQuery, visualDecision } from "../imageWorkflowPolicy";
import { processCampaignImageJob } from "../campaignImageJobs";

function fixture(creatives: any[] = [{ headline: "Planejamento financeiro" }]) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const jobs = new Map();
  const campaign = { id: 797, projectId: 3, objective: "leads", creatives: JSON.stringify(creatives),
    aiResponse: JSON.stringify({ campaignFacts: { intent: { segment: "financeiro" }, verifiedFacts: ["Curso de planejamento financeiro"] } }) };
  const pool = { query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT")) jobs.set(params[4], { id: jobs.size + 1, status: "queued" });
    return { rows: [...jobs.values()], rowCount: 1 };
  } };
  const db = { getCampaignById: async () => campaign, getProjectById: async () => ({ userId: 1 }), getPool: async () => pool };
  return { campaign, calls, jobs, db };
}
test("queues missing cards, preserves real media and explains broken attachments", async () => {
  const f = fixture([{}, {}, { imageUrl: "original" }, { usesRealPhoto: true }]);
  const r: any = await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(r.ok, true); assert.equal(r.published, false);
  assert.equal(f.jobs.size, 2); assert.equal(r.blocked.length, 1);
  await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(f.jobs.size, 2);
});
test("ownership and inputs fail before reservation", async () => {
  const f = fixture();
  for (const args of [{ campaignId: 0 }, { campaignId: 797, creativeIndex: 5 }, { campaignId: 797, format: "bad" }]) {
    assert.equal((await generateChatImage(1, args, f.db)).ok, false);
  }
  assert.equal((await generateChatImage(2, { campaignId: 797 }, f.db)).ok, false);
  assert.equal(f.jobs.size, 0);
});
test("missing facts actionable; status and revalidation never generate", async () => {
  const f = fixture(); f.campaign.aiResponse = "{}";
  assert.match((await generateChatImage(1, { campaignId: 797 }, f.db) as any).erro, /Faltam fatos/);
  await generateChatImage(1, { campaignId: 797, action: "status" }, f.db);
  await generateChatImage(1, { campaignId: 797, action: "revalidate" }, f.db);
  assert.equal(f.jobs.size, 0);
  assert.ok(f.calls.some(c => c.sql.includes("candidate_url IS NOT NULL")));
});
test("stable snapshot survives jsonb ordering and changes with facts", () => {
  assert.equal(imageFingerprint({ a: 1, b: 2 }), imageFingerprint({ b: 2, a: 1 }));
  assert.notEqual(imageFingerprint({ area: 50 }), imageFingerprint({ area: 190 }));
});
test("financial segment cannot inherit ocean from marketing or city", () => {
  assert.match(canonicalStockQuery("financeiro", "marketing Balneario Camboriu"), /financial/);
  assert.doesNotMatch(canonicalStockQuery("financeiro", "praia apartamento"), /apartment|ocean/);
  assert.equal(canonicalStockQuery("imoveis_locacao", "sala comercial Rua 902"), "commercial space interior");
});
test("unavailable validation has no fabricated score", () => {
  assert.equal(visualDecision(null).score, null);
  assert.equal(visualDecision({ quality: 0.99 }).status, "pending_validation");
  const v = { matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "Documents and calculator", issues: [] };
  assert.equal(visualDecision(v).status, "approved");
  assert.equal(visualDecision({ ...v, matchesBrief: false }).status, "rejected");
  assert.equal(visualDecision({ ...v, hasText: true }).status, "rejected");
});
function workerFixture(candidate: string | null, status: "approved" | "pending_validation" | "rejected") {
  const f = fixture(); const calls: Array<{ sql: string; params: any[] }> = [];
  const job: any = { id: 1, user_id: 1, campaign_id: 797, creative_index: 0, format: "feed", candidate_url: candidate,
    brief: imageBrief(f.campaign, JSON.parse(f.campaign.creatives)[0]), provider: "pixabay" };
  let generated = 0;
  const connection = { release() {}, query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    if (sql.startsWith("SELECT *")) return { rows: [job] };
    return { rows: [], rowCount: 1 };
  } };
  return { f, job, calls, generated: () => generated,
    deps: { db: { ...f.db, getPool: async () => ({ connect: async () => connection }) },
      generate: async () => { generated++; return { url: "https://res.cloudinary.com/test/image.jpg", provider: "cloudflare" }; },
      validate: async () => ({ status, reason: "test", score: status === "pending_validation" ? null : 0.9 }) } };
}
test("pending candidate persisted; retry reuses it without generation", async () => {
  const f = workerFixture(null, "pending_validation"); await processCampaignImageJob(f.deps);
  assert.equal(f.generated(), 1);
  assert.ok(f.calls.some(c => c.sql.includes("SET candidate_url=")));
  assert.ok(f.calls.some(c => c.params[1] === "pending_validation" && c.params[3] === null));
  assert.ok(!f.calls.some(c => c.sql.startsWith("UPDATE campaigns")));
  const retry = workerFixture("https://res.cloudinary.com/test/image.jpg", "pending_validation"); await processCampaignImageJob(retry.deps);
  assert.equal(retry.generated(), 0);
});
test("only approved images update creatives using compare-and-swap", async () => {
  const f = workerFixture("https://res.cloudinary.com/test/image.jpg", "approved"); await processCampaignImageJob(f.deps);
  const update = f.calls.find(c => c.sql.startsWith("UPDATE campaigns"));
  assert.ok(update); assert.match(update.sql, /IS NOT DISTINCT FROM/);
  assert.equal(JSON.parse(update.params[1])[0].feedImageUrl, f.job.candidate_url);
  const rejected = workerFixture(f.job.candidate_url, "rejected"); await processCampaignImageJob(rejected.deps);
  assert.ok(!rejected.calls.some(c => c.sql.startsWith("UPDATE campaigns")));
});
test("changed brief cancels without provider call", async () => {
  const f = workerFixture(null, "approved"); f.f.campaign.objective = "sales";
  await processCampaignImageJob(f.deps);
  assert.equal(f.generated(), 0);
  assert.ok(f.calls.some(c => c.params[2] === "brief_changed"));
});
