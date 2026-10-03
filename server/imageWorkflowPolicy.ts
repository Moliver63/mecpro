import { createHash } from "node:crypto";

export type VisualDecision = { status: "approved" | "rejected" | "pending_validation"; score: number | null; reason: string; evidence?: string; issues?: string[]; model?: string };
export function visualDecision(value: unknown): VisualDecision {
  const v = value as any;
  if (!v || typeof v.matchesBrief !== "boolean" || typeof v.safe !== "boolean" || typeof v.hasText !== "boolean" ||
      typeof v.quality !== "number" || !Number.isFinite(v.quality) || v.quality < 0 || v.quality > 1 ||
      !Array.isArray(v.issues) || !v.issues.every((x: unknown) => typeof x === "string") || typeof v.evidence !== "string" || !v.evidence.trim()) {
    return { status: "pending_validation", score: null, reason: "validator_invalid_response" };
  }
  const approved = v.matchesBrief && v.safe && !v.hasText && v.quality >= 0.72 && !v.issues.length;
  return { status: approved ? "approved" : "rejected", score: v.quality, reason: approved ? "visual_checks_passed" : "visual_mismatch_or_quality", evidence: v.evidence.slice(0, 2000), issues: v.issues.slice(0, 10).map((s: string) => s.slice(0, 300)) };
}

export function imageBrief(campaign: any, creative: any) {
  const facts = JSON.parse(campaign.aiResponse || "{}").campaignFacts;
  if (!facts?.intent?.segment || !Array.isArray(facts.verifiedFacts) || !facts.verifiedFacts.length || !facts.verifiedFacts.every((f: unknown) => typeof f === "string")) {
    throw new Error("missing_confirmed_brief");
  }
  return { version: 1, segment: facts.intent.segment, objective: campaign.objective,
    facts: facts.verifiedFacts, intent: facts.intent,
    card: { headline: creative.headline, description: creative.description, copy: creative.copy, hook: creative.hook, angle: creative.angle } };
}
export function imageFingerprint(value: unknown) {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function imageField(format: string) { return format === "stories" ? "storyImageUrl" : format === "square" ? "squareImageUrl" : "feedImageUrl"; }
export function hasCreativeImage(c: any, format: string) {
  return !!(c[imageField(format)] || c.imageUrl || c.imageHash || c.feedImageHash || c.realPhotoUrl);
}

// Segment is authoritative; persuasive copy and place names cannot select another industry.
export function canonicalStockQuery(segment: string, facts: string, index = 0): string {
  const s = segment.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/imove|imobili/.test(s)) {
    if (/sala comercial|imovel comercial|imóvel comercial|ponto comercial/i.test(facts)) return "commercial space interior";
    if (/terreno/i.test(facts)) return "land plot";
    if (/apartamento/i.test(facts)) return "apartment interior";
    return "real estate building";
  }
  const rules: Array<[RegExp, string]> = [
    [/financ/, "financial planning documents calculator"], [/alimenta|restaur|doce/, "food preparation kitchen"],
    [/fitness|academia|esport/, "fitness exercise gym"], [/saude|estet|psicol/, "health wellness professional"],
    [/educa|infoprod/, "education learning study"], [/moda/, "fashion clothing"], [/automot/, "automotive workshop"],
    [/pet/, "pet care"], [/turis/, "travel tourism"], [/constr/, "construction work"], [/event/, "event planning"],
    [/tecn|marketing|b2b/, "business technology workspace"], [/ecommerce/, "product studio photography"],
    [/servic/, "local business service"],
  ];
  const base = rules.find(([pattern]) => pattern.test(s))?.[1] || `${s.replace(/[^a-z0-9 ]/g, " ")} professional`;
  return `${base} ${["detail", "workspace", "overview"][index % 3]}`.trim();
}
