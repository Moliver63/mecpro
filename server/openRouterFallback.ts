import { log } from "./logger";

/**
 * Ultimo fallback de texto do MecProAI (depois de DeepSeek, Groq, Genspark e Claude).
 * Usa a integracao existente com o OpenRouter e a OPENROUTER_API_KEY.
 *
 * - Modelo gratuito fixo. Nunca troca sozinho para a variante paga: qualquer
 *   falha (429, 5xx, timeout, resposta vazia) devolve null e o chamador segue a
 *   cadeia atual (mock).
 * - Nao usa response_format: a variante gratuita do Nemotron nao força JSON. O JSON
 *   continua sendo exigido pelo prompt e validado pelos chamadores (JSON.parse /
 *   repairJson, Fact Guard e Quality Gate), que tratam resposta invalida como hoje.
 * - Modelos de raciocinio podem devolver o pensamento em <think>...</think> ou deixar
 *   `content` vazio. O bloco de raciocinio e removido; sem conteudo util, devolve null.
 */
export const OPENROUTER_FALLBACK_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

export type OpenRouterFallbackInput = { system: string; user: string; temperature?: number };

export function limparRespostaOpenRouter(data: any): string {
  const bruto = data?.choices?.[0]?.message?.content;
  const texto = Array.isArray(bruto)
    ? bruto.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("")
    : typeof bruto === "string" ? bruto : "";
  const semRaciocinio = texto.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // <think> sem fechamento: a resposta foi cortada no meio do raciocinio, nada aproveitavel.
  if (/<think>/i.test(semRaciocinio)) return "";
  return semRaciocinio.trim();
}

export async function callOpenRouterFallback(
  input: OpenRouterFallbackInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://mecproai.com",
        "X-Title": "MecProAI",
      },
      body: JSON.stringify({
        model: OPENROUTER_FALLBACK_MODEL,
        temperature: input.temperature ?? 0.3,
        max_tokens: 4096,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      log.warn("ai", "OpenRouter fallback recusado", { status: res.status, model: OPENROUTER_FALLBACK_MODEL });
      return null;
    }
    const texto = limparRespostaOpenRouter(await res.json());
    if (!texto) {
      log.warn("ai", "OpenRouter fallback sem conteudo utilizavel", { model: OPENROUTER_FALLBACK_MODEL });
      return null;
    }
    return texto;
  } catch (e: any) {
    log.warn("ai", "OpenRouter fallback falhou", { error: String(e?.message || e).slice(0, 60) });
    return null;
  }
}
