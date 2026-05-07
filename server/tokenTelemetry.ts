// server/tokenTelemetry.ts
// Middleware centralizado de observabilidade de tokens — fire-and-forget
// Não adiciona latência perceptível — INSERT assíncrono desacoplado do request

import { log } from "./logger";

// Preços por 1M tokens (USD) — atualizado mai/2026
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash-lite":  { input: 0.075,  output: 0.30  },
  "gemini-2.5-flash":       { input: 0.15,   output: 0.60  },
  "gemini-2.5-pro":         { input: 1.25,   output: 5.00  },
  "gemini-1.5-flash":       { input: 0.075,  output: 0.30  },
  "llama-3.3-70b-versatile":{ input: 0.059,  output: 0.079 }, // Groq pricing
  "llama-3.1-8b-instant":   { input: 0.005,  output: 0.008 },
};

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const prices = MODEL_PRICES[model] || { input: 0.1, output: 0.3 };
  return (
    (promptTokens    / 1_000_000) * prices.input +
    (completionTokens / 1_000_000) * prices.output
  );
}

export interface TokenLogEntry {
  userId?:          number;
  projectId?:       number;
  campaignId?:      number;
  provider:         "gemini" | "groq" | "cloudflare" | "other";
  model:            string;
  endpoint:         string;
  promptTokens:     number;
  completionTokens: number;
  latencyMs:        number;
  temperature?:     number;
  cacheHit?:        boolean;
  cacheType?:       "ram" | "db" | "none";
  retryCount?:      number;
  status?:          "ok" | "error" | "timeout";
  errorMsg?:        string;
  systemPromptTokens?: number;
  copyEngine?:      string;
}

// Pool lazy-loaded para não criar dependência circular
let _pool: any = null;
async function getPool() {
  if (!_pool) {
    const { getPool: gp } = await import("./db").catch(() => ({ getPool: () => null }));
    _pool = await gp();
  }
  return _pool;
}

// Fire-and-forget — nunca bloqueia o caller
export function logTokens(entry: TokenLogEntry): void {
  const totalTokens = entry.promptTokens + entry.completionTokens;
  const cost = estimateCost(entry.model, entry.promptTokens, entry.completionTokens);

  // Log estruturado no console para debugging imediato
  log.info("tokens", `${entry.provider}/${entry.model} ${entry.endpoint}`, {
    prompt: entry.promptTokens,
    completion: entry.completionTokens,
    total: totalTokens,
    costUSD: cost.toFixed(6),
    latencyMs: entry.latencyMs,
    cache: entry.cacheHit ? (entry.cacheType || "hit") : "miss",
  });

  // INSERT assíncrono — não aguarda, não bloqueia
  setImmediate(async () => {
    try {
      const pool = await getPool();
      if (!pool) return;
      await pool.query(`
        INSERT INTO ai_token_log (
          user_id, project_id, campaign_id,
          provider, model, endpoint,
          prompt_tokens, completion_tokens, total_tokens,
          estimated_cost_usd, latency_ms, temperature,
          cache_hit, cache_type, retry_count,
          status, error_msg, system_prompt_tokens, copy_engine
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      `, [
        entry.userId    || null,
        entry.projectId || null,
        entry.campaignId || null,
        entry.provider,
        entry.model,
        entry.endpoint,
        entry.promptTokens,
        entry.completionTokens,
        totalTokens,
        cost,
        entry.latencyMs,
        entry.temperature ?? null,
        entry.cacheHit ?? false,
        entry.cacheType ?? "none",
        entry.retryCount ?? 0,
        entry.status ?? "ok",
        entry.errorMsg ?? null,
        entry.systemPromptTokens ?? 0,
        entry.copyEngine ?? null,
      ]);
    } catch (e: any) {
      // Silencioso — telemetria nunca deve quebrar o sistema
      log.warn("tokens", "Falha ao salvar token log (não crítico)", {
        error: e.message?.slice(0, 60),
      });
    }
  });
}

// Estimativa de tokens para texto (fallback quando a API não retorna)
export function estimateTokens(text: string): number {
  // ~4 chars por token (estimativa GPT/Gemini)
  return Math.ceil(text.length / 4);
}
