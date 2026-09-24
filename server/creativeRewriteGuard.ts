import { z } from "zod";
import { validateCampaignFactIntegrity, type CampaignFacts } from "./campaignFactGuard";

// Achado real (log de produção, 19/09, e novamente 23/09 com campo
// diferente): campos que a estrutura do criativo realmente tem — "pain"
// (dor que o criativo endereça) e "solution" (solução que o produto
// oferece) — checados pelo Fact Guard igual qualquer outro campo de
// texto, mas NUNCA faziam parte do que o modelo era autorizado a
// reescrever aqui (só headline/description/copy/hook/cta). Resultado
// real: violação detectada em "pain"/"solution" → sistema pede pro
// modelo "remova essa alegação" → modelo não tem como, porque o campo
// nem está na lista do que ele pode editar → campanha falha sempre, em
// TODAS as tentativas, sem chance real de sucesso. Limites (160 pra
// pain, 220 pra solution) já eram usados em outros lugares do código
// pra esses mesmos campos (server/ai.ts).
export const CREATIVE_TEXT_LIMITS = { headline: 40, description: 30, copy: 500, hook: 200, cta: 80, pain: 160, solution: 220 } as const;
export type CreativeTextField = keyof typeof CREATIVE_TEXT_LIMITS;
const rewriteSchema = z.object({
  headline: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.headline),
  description: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.description),
  copy: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.copy),
  hook: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.hook),
  cta: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.cta),
  pain: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.pain).optional(),
  solution: z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS.solution).optional(),
}).strict();

export const CREATIVE_REWRITE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(Object.entries(CREATIVE_TEXT_LIMITS)
    .map(([key, limit]) => [key, { type: "STRING", description: `Texto nao vazio, no maximo ${limit} caracteres.` }])),
  required: ["headline", "description", "copy", "hook", "cta", "pain", "solution"],
};

export function parseCreativeRewrite(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); }
  catch { throw new Error("rewrite_invalid_json: retorne JSON completo com aspas duplas e sete campos; nao corte strings."); }
}

export function creativeRewriteFeedback(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const detail = /^rewrite_(invalid_schema|invalid_json|fact_conflict|placeholder)/.test(message)
    ? message.slice(0, 700) : "Resposta incompleta ou indisponivel; devolva novamente o objeto completo.";
  return `ERRO DA TENTATIVA ANTERIOR (validacao, nao fatos da oferta): ${detail}\nCorrija o erro sem acrescentar fatos e preserve os sete campos.\n`;
}

export function acceptCreativeRewrite(original: any, response: unknown, facts: CampaignFacts, auditSegment?: (candidate: any) => string[]) {
  const parsed = rewriteSchema.safeParse(response);
  if (!parsed.success) {
    // Achado real (log de producao, 21/09): "rewrite_invalid_schema"
    // acontecia com frequencia (3 de 8 tentativas de melhoria num unico
    // log real) sem NENHUM detalhe de qual campo falhou — o erro do Zod
    // (que diria exatamente "cta: no maximo 80 caracteres" ou "campo
    // extra nao permitido: reasoning") era descartado por completo antes
    // de chegar no log. Inclui os detalhes reais no throw — quem chama
    // ja loga e.message, entao isso vira diagnostico automatico sem
    // precisar mudar mais nada la.
    const detalhes = parsed.error.issues.map(i => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");
    throw new Error(`rewrite_invalid_schema: ${detalhes}`);
  }
  const texts = Object.values(parsed.data).join(" ");
  if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(texts)) {
    throw new Error("rewrite_placeholder");
  }
  // Update only text aliases of the old copy, never IDs, ordering or media.
  const candidate = applyTextPatch(original, parsed.data);
  if (auditSegment) candidate.segmentAlignmentIssues = auditSegment(candidate);
  const audit = validateCampaignFactIntegrity([candidate], facts);
  if (audit.status !== "passed") throw new Error(`rewrite_fact_conflict:${audit.conflicts.map(c => c.reason).join(",")}`);
  return candidate;
}

export function duplicateCreativeFields(creatives: any[], index: number): CreativeTextField[] {
  const normalized = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return (["headline", "description"] as CreativeTextField[]).filter(field => {
    const text = normalized(creatives[index]?.[field]);
    return !!text && creatives.slice(0, index).some(c => normalized(c[field]) === text);
  });
}

export function creativeTextIssues(creative: any): string[] {
  const texts = Object.fromEntries(Object.keys(CREATIVE_TEXT_LIMITS).filter(k => creative[k] !== undefined).map(k => [k, creative[k]]));
  const result = rewriteSchema.safeParse(texts);
  return result.success ? [] : result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
}

function applyTextPatch(original: any, patch: Record<string, string>) {
  const candidate = structuredClone(original);
  const pairs = Object.entries(patch).map(([key, value]) => [original[key], value]);
  function sync(node: any) {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "object") sync(node[key]);
      else if (["text", "headline", "copy", "bodyText", "description", "shortDescription", "hook", "cta", "pain", "solution"].includes(key)) {
        const pair = pairs.find(([old]) => typeof old === "string" && old && node[key] === old);
        if (pair) node[key] = pair[1];
      }
    }
  }
  // Do not infer aliases between distinct primary fields that happen to match.
  for (const value of Object.values(candidate)) if (value && typeof value === "object") sync(value);
  Object.assign(candidate, patch);
  if (patch.copy !== undefined) candidate.bodyText = patch.copy;
  if (patch.description !== undefined) candidate.shortDescription = patch.description;
  return candidate;
}

/** Accept independent valid fields without discarding them because a sibling failed.
 * The caller must still audit the complete campaign before saving/publication. */
export function repairCreativeFields(original: any, response: unknown, facts: CampaignFacts,
  fields: CreativeTextField[] = Object.keys(CREATIVE_TEXT_LIMITS) as CreativeTextField[]) {
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("rewrite_invalid_schema: objeto de textos esperado");
  const input = response as Record<string, unknown>;
  if (Object.keys(input).some(key => !(key in CREATIVE_TEXT_LIMITS))) throw new Error("rewrite_invalid_schema: campo nao autorizado");
  const patch: Record<string, string> = {};
  const rejected: CreativeTextField[] = [];
  const issues: string[] = [];
  for (const field of fields) {
    const result = z.string().trim().min(1).max(CREATIVE_TEXT_LIMITS[field]).safeParse(input[field]);
    let reason = result.success ? "" : `use de 1 a ${CREATIVE_TEXT_LIMITS[field]} caracteres`;
    if (result.success) {
      if (/\[[^\]]+\]|\{[^}]+\}|EMPRESA_AQUI|PRODUTO_AQUI|\bXXX+\b/i.test(result.data)) reason = "remova placeholders";
      const audit = validateCampaignFactIntegrity([{ [field]: result.data }], facts);
      if (audit.status !== "passed") reason = audit.conflicts.map(c => `${c.reason}: ${c.value}`).join("; ");
    }
    if (reason) { rejected.push(field); issues.push(`${field}: ${reason}`); }
    else if (result.success) patch[field] = result.data;
  }
  return { candidate: applyTextPatch(original, patch), rejected, issues, accepted: Object.keys(patch) };
}
