import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignFacts, validateCampaignFactIntegrity, formatCampaignFactsForPrompt } from "../campaignFactGuard";
import { assertObjectiveUnchanged, retrieveCampaignRules } from "../campaignRuleRetrieval";
import { assertCampaignPublishIntegrity } from "../campaignPublishIntegrity";
import { SEGMENT_CONFIG } from "../../shared/segmentConfig";

const facts = buildCampaignFacts({ input: { objective: "leads", extraContext: "Sala comercial para locacao" }, clientProfile: {}, segment: "imoveis_locacao" });
test("commercial campaign rejects residential copies and unsupported availability", () => {
  for (const copy of ["Seu novo lar", "Prontas para morar", "Para sua familia", "Disponibilidade imediata", "Tranquilidade garantida", "Sem burocracia"]) {
    assert.equal(validateCampaignFactIntegrity([{ copy }], facts).status, "failed", copy);
  }
  assert.equal(validateCampaignFactIntegrity([{ copy: "Sala comercial para locacao. Agende uma visita." }], facts).status, "passed");
});
test("retrieval covers all configured segments without borrowing example copy", () => {
  for (const segment of Object.keys(SEGMENT_CONFIG)) {
    const rule = retrieveCampaignRules(segment, "leads");
    assert.equal(rule.source, `shared/segmentConfig:${segment}`);
    assert.equal("headlines" in rule, false);
    const f = buildCampaignFacts({ input: { objective: "leads" }, clientProfile: {}, segment });
    assert.equal(validateCampaignFactIntegrity([{ objective: "sales" }], f).status, "failed");
    assert.equal(validateCampaignFactIntegrity([{ segmentAlignment: "unrelated" }], f).status, "failed");
  }
  assert.equal(retrieveCampaignRules("unknown", "leads").source, "campaign-rules:universal");
  assert.match(formatCampaignFactsForPrompt(facts), /REGRAS RECUPERADAS/);
});
test("objective aliases preserve intent but technical fallback must not change it", () => {
  assert.doesNotThrow(() => assertObjectiveUnchanged("branding", "OUTCOME_AWARENESS"));
  assert.doesNotThrow(() => assertObjectiveUnchanged("leads", "OUTCOME_LEADS"));
  assert.throws(() => assertObjectiveUnchanged("sales", "OUTCOME_TRAFFIC"));
});
test("publication rechecks edited copies and requires an authoritative snapshot", () => {
  const campaign = { objective: "leads", aiResponse: JSON.stringify({ campaignFacts: facts }), creatives: JSON.stringify([{ copy: "Sala comercial para locacao." }]) };
  assert.doesNotThrow(() => assertCampaignPublishIntegrity(campaign));
  assert.throws(() => assertCampaignPublishIntegrity(campaign, { headline: "Seu novo lar" }));
  assert.throws(() => assertCampaignPublishIntegrity({ ...campaign, aiResponse: "{}" }));
  assert.throws(() => assertCampaignPublishIntegrity({ ...campaign, objective: "sales" }));
  assert.throws(() => assertCampaignPublishIntegrity({ ...campaign, creatives: JSON.stringify([{ copy: "Sala comercial", needsReview: true }]) }));
});

test("cross-segment audit failures and nested objectives cannot pass the fact gate", () => {
  assert.equal(validateCampaignFactIntegrity([{ segmentAlignmentIssues: ["foreign topic"] }], facts).status, "failed");
  assert.equal(validateCampaignFactIntegrity([{ adSets: [{ objective: "sales" }] }], facts).status, "failed");
});
