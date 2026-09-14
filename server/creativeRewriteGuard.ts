import { z } from "zod";
import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";

const rewriteSchema = z.object({
  headline: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(30),
  copy: z.string().trim().min(1).max(500),
  hook: z.string().trim().min(1).max(200),
  cta: z.string().trim().min(1).max(80),
}).strict();

export function acceptCreativeRewrite(original: any, response: unknown, facts: CampaignFacts) {
  const parsed = rewriteSchema.safeParse(response);
  if (!parsed.success) throw new Error("rewrite_invalid_schema");
  const texts = Object.values(parsed.data).join(" ");
  if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(texts)) {
    throw new Error("rewrite_placeholder");
  }
  // Update only text aliases of the old copy, never IDs, ordering or media.
  const candidate = structuredClone(original);
  const pairs = Object.entries(parsed.data).map(([key, value]) => [original[key], value]);
  function sync(node: any) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "object") sync(node[key]);
      else if (["text", "headline", "copy", "bodyText", "description", "shortDescription", "hook", "cta"].includes(key)) {
        const pair = pairs.find(([old]) => typeof old === "string" && old && node[key] === old);
        if (pair) node[key] = pair[1];
      }
    }
  }
  sync(candidate);
  Object.assign(candidate, parsed.data, { bodyText: parsed.data.copy, shortDescription: parsed.data.description });
  const audit = validateCampaignFactIntegrity([candidate], facts);
  if (audit.status !== "passed") throw new Error(`rewrite_fact_conflict:${audit.conflicts.map(c => c.reason).join(",")}`);
  return candidate;
}
