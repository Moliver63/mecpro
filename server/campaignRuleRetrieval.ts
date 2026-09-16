import { SEGMENT_CONFIG } from "../shared/segmentConfig";

// Local retrieval of editorial rules, never of another customer's offers.
export function retrieveCampaignRules(segment: string, objective: string) {
  const config = SEGMENT_CONFIG[segment];
  return {
    version: 1,
    source: config ? `shared/segmentConfig:${segment}` : "campaign-rules:universal",
    segment,
    objective,
    forbidden: config?.copy.forbidden || [],
    compliance: config?.copy.compliance || "Nao invente fatos, garantias ou resultados.",
  };
}

export function canonicalObjective(value: unknown): string {
  const key = String(value || "").trim().toLowerCase().replace(/^outcome_/, "");
  return key === "branding" ? "awareness" : key;
}

export function assertObjectiveUnchanged(expected: unknown, actual: unknown) {
  if (!canonicalObjective(expected) || canonicalObjective(expected) !== canonicalObjective(actual)) {
    throw new Error("CAMPAIGN_OBJECTIVE_CONFLICT: configuracao mudaria o objetivo confirmado. Revise destino/pixel ou escolha explicitamente outro objetivo antes de publicar.");
  }
}
