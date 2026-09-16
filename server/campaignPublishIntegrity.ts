import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";
import { assertObjectiveUnchanged } from "./campaignRuleRetrieval";

export function assertCampaignPublishIntegrity(campaign: any, overrides: unknown = {}) {
  let response: any;
  let creatives: unknown;
  try {
    response = JSON.parse(campaign.aiResponse || "{}");
    creatives = JSON.parse(campaign.creatives || "[]");
  } catch { throw new Error("CAMPAIGN_INTEGRITY: dados invalidos; regenere o rascunho."); }
  const facts = response.campaignFacts as CampaignFacts;
  if (!facts?.intent?.segment || !facts.intent.objective || !facts.realEstate
      || !Array.isArray(facts.verifiedFacts) || !Array.isArray(facts.forbiddenClaims)
      || typeof facts.confirmedClaimsRaw !== "string" || typeof facts.socialProofRaw !== "string"
      || !Array.isArray(creatives) || !creatives.length) {
    throw new Error("CAMPAIGN_INTEGRITY: campanha sem briefing validado completo. Regenere para validar segmento, objetivo e textos antes de publicar.");
  }
  assertObjectiveUnchanged(facts.intent.objective, campaign.objective);
  if (creatives.some((creative: any) => creative?.needsReview === true)) {
    throw new Error("CAMPAIGN_INTEGRITY: criativos ainda precisam de revisao antes de publicar.");
  }
  const result = validateCampaignFactIntegrity([...creatives, overrides], facts);
  if (result.status === "failed") {
    throw new Error(`CAMPAIGN_INTEGRITY: ${result.conflicts.slice(0, 5).map(c => `${c.field}: ${c.reason}`).join("; ")}`);
  }
  return result;
}
