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
const rewriteSchema = z.object({
  headline: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(30),
  copy: z.string().trim().min(1).max(500),
  hook: z.string().trim().min(1).max(200),
  cta: z.string().trim().min(1).max(80),
  pain: z.string().trim().min(1).max(160).optional(),
  solution: z.string().trim().min(1).max(220).optional(),
}).strict();

export const CREATIVE_REWRITE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(Object.entries({ headline: 40, description: 30, copy: 500, hook: 200, cta: 80, pain: 160, solution: 220 })
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
  const candidate = structuredClone(original);
  const pairs = Object.entries(parsed.data).map(([key, value]) => [original[key], value]);
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
  sync(candidate);
  Object.assign(candidate, parsed.data, { bodyText: parsed.data.copy, shortDescription: parsed.data.description });
  if (auditSegment) candidate.segmentAlignmentIssues = auditSegment(candidate);
  const audit = validateCampaignFactIntegrity([candidate], facts);
  if (audit.status !== "passed") throw new Error(`rewrite_fact_conflict:${audit.conflicts.map(c => c.reason).join(",")}`);
  return candidate;
}
