import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";
import { assertObjectiveUnchanged } from "./campaignRuleRetrieval";

/**
 * Versao que nao lanca, pra pre-checagem do chat (`pendenciasLocaisParaPublicar`)
 * recusar ANTES do token de confirmacao com a mesma regra da publicacao real.
 * Achado real (19/10, campanha 799): a pre-checagem nao olhava needsReview nem
 * o snapshot de fatos, entao o chat emitia token pra campanha que
 * `publishToMeta` ia recusar aqui.
 */
export function verificarIntegridadeParaPublicar(campaign: any, overrides: unknown = {}): { ok: boolean; erro?: string } {
  try {
    assertCampaignPublishIntegrity(campaign, overrides);
    return { ok: true };
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : String(error) };
  }
}

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
