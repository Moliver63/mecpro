/**
 * aiCache.ts — Cache persistente de respostas de IA no banco de dados
 *
 * Persiste entre deploys, reinicializações e instâncias do servidor.
 * Economiza tokens Gemini/Groq reutilizando respostas similares.
 *
 * TTLs por tipo de conteúdo:
 *   copy de campanha    → 7 dias  (muda pouco, muito reutilizável)
 *   análise de mercado  → 3 dias  (muda moderadamente)
 *   insights de concorrente → 1 dia (muda mais rápido)
 *   site scraping       → 4 horas (pode mudar)
 */

import { getPool } from "./db";
import { log } from "./logger";
import crypto from "crypto";

// ── TTLs configuráveis ────────────────────────────────────────────────────────
export const CACHE_TTL = {
  campaign:    7 * 24 * 60 * 60,  // 7 dias em segundos
  market:      3 * 24 * 60 * 60,  // 3 dias
  competitor:  1 * 24 * 60 * 60,  // 1 dia
  scraping:    4 * 60 * 60,        // 4 horas
  seo:         2 * 24 * 60 * 60,  // 2 dias
  default:     1 * 24 * 60 * 60,  // 1 dia
} as const;

export type CacheFn = keyof typeof CACHE_TTL;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza o prompt antes de gerar a chave — remove dados voláteis */
function normalizePrompt(prompt: string): string {
  return prompt
    .replace(/\d{4}-\d{2}-\d{2}/g, "DATE")          // datas
    .replace(/\d{2}\/\d{2}\/\d{4}/g, "DATE")
    .replace(/às \d{2}:\d{2}/g, "TIME")
    .replace(/Token:.+/g, "")                         // tokens
    .replace(/access_token=[^\s&]+/g, "")
    .trim()
    .toLowerCase();
}

/** Gera chave de cache SHA-256 do prompt normalizado + escopo do projeto */
export function buildCacheKey(
  prompt: string,
  fnName: CacheFn | string,
  projectId?: number,   // isola cache por projeto — evita vazar copy entre clientes
  userId?: number,      // segunda camada de isolamento
): string {
  const normalized = normalizePrompt(prompt);
  const scope = [fnName, userId || "", projectId || ""].join(":");
  return crypto.createHash("sha256").update(`${scope}:${normalized}`).digest("hex").slice(0, 32);
}

// ── API principal ─────────────────────────────────────────────────────────────

export interface CacheMeta {
  niche?:     string;
  platform?:  string;
  objective?: string;
  scope?:     string;
  city?:      string;
  projectId?: number;  // isola cache por projeto
  userId?:    number;  // isola cache por usuário
}

/** Busca resposta no cache persistente. Retorna null se não existe ou expirou. */
export async function getCachedResponse(
  cacheKey: string
): Promise<string | null> {
  try {
    const pool = await getPool();
    if (!pool) return null;
    const result = await pool.query(
      `SELECT response, hit_count, tokens_saved FROM ai_cache
       WHERE cache_key = $1 AND expires_at > NOW()
       LIMIT 1`,
      [cacheKey]
    );
    if (!result.rows[0]) return null;

    // Atualiza hit_count e last_hit_at de forma assíncrona (não bloqueia)
    pool.query(
      `UPDATE ai_cache SET hit_count = hit_count + 1, last_hit_at = NOW()
       WHERE cache_key = $1`,
      [cacheKey]
    ).catch(() => {});

    log.info("ai", "Cache DB hit", { key: cacheKey.slice(0, 8), hits: result.rows[0].hit_count + 1 });
    return result.rows[0].response as string;
  } catch {
    return null;
  }
}

/** Salva resposta no cache persistente */
export async function setCachedResponse(
  cacheKey: string,
  response: string,
  fnName: CacheFn | string,
  meta?: CacheMeta,
  estimatedTokens = 0
): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;

    const ttlSeconds = CACHE_TTL[fnName as CacheFn] ?? CACHE_TTL.default;
    const expiresAt  = new Date(Date.now() + ttlSeconds * 1000);

    await pool.query(
      `INSERT INTO ai_cache (cache_key, response, fn_name, niche, platform, objective, scope, city, tokens_saved, expires_at, project_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (cache_key) DO UPDATE SET
         response     = EXCLUDED.response,
         hit_count    = ai_cache.hit_count + 1,
         last_hit_at  = NOW(),
         expires_at   = EXCLUDED.expires_at`,
      [
        cacheKey, response, fnName,
        meta?.niche || null, meta?.platform || null,
        meta?.objective || null, meta?.scope || null,
        meta?.city || null, estimatedTokens, expiresAt,
        meta?.projectId || null, meta?.userId || null,
      ]
    );
  } catch (e: any) {
    // Cache write falhou — não é crítico, continua normalmente
    log.warn("ai", "Cache DB write falhou", { error: e.message?.slice(0, 60) });
  }
}

/** Remove entradas expiradas (chamar periodicamente ou no boot) */
export async function cleanExpiredCache(): Promise<number> {
  try {
    const pool = await getPool();
    if (!pool) return 0;
    const result = await pool.query(`DELETE FROM ai_cache WHERE expires_at < NOW()`);
    const deleted = result.rowCount || 0;
    if (deleted > 0) log.info("ai", "Cache DB limpo", { deleted });
    return deleted;
  } catch { return 0; }
}

/** Invalida o cache de um projeto específico (chamar quando perfil muda) */
export async function invalidateProjectCache(projectId: number): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;
    // Não temos como buscar por projectId no cache_key (é hash)
    // Estratégia: marcar como expirado imediatamente por project_id
    await pool.query(
      `UPDATE ai_cache SET expires_at = NOW() - INTERVAL '1 second'
       WHERE project_id = $1`,
      [projectId]
    );
    log.info("ai", "Cache invalidado para projeto", { projectId });
  } catch {}
}

/** Estatísticas do cache para o painel admin */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalHits: number;
  tokensSaved: number;
  byFunction: Array<{ fn: string; entries: number; hits: number }>;
}> {
  try {
    const pool = await getPool();
    if (!pool) return { totalEntries: 0, totalHits: 0, tokensSaved: 0, byFunction: [] };

    const [totals, byFn] = await Promise.all([
      pool.query(`SELECT COUNT(*) as entries, SUM(hit_count) as hits, SUM(tokens_saved) as tokens
                  FROM ai_cache WHERE expires_at > NOW()`),
      pool.query(`SELECT fn_name as fn, COUNT(*) as entries, SUM(hit_count) as hits
                  FROM ai_cache WHERE expires_at > NOW()
                  GROUP BY fn_name ORDER BY hits DESC LIMIT 10`),
    ]);

    return {
      totalEntries: parseInt(totals.rows[0]?.entries || "0"),
      totalHits:    parseInt(totals.rows[0]?.hits    || "0"),
      tokensSaved:  parseInt(totals.rows[0]?.tokens  || "0"),
      byFunction:   byFn.rows,
    };
  } catch { return { totalEntries: 0, totalHits: 0, tokensSaved: 0, byFunction: [] }; }
}
