// ─────────────────────────────────────────────────────────────────────────────
// errorTelemetry.ts — Sistema de monitoramento de erros críticos do MECPro
// Fire-and-forget (setImmediate) — nunca bloqueia o fluxo principal
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

type Severity = "critical" | "error" | "warn";
type Area =
  | "campaign_gen"    // Geração de campanha (Módulo 4)
  | "meta_publish"    // Publicação Meta Ads
  | "ai_quota"        // Quota Gemini/Groq esgotada
  | "auth"            // Auth/sessões
  | "db"              // Banco de dados
  | "competitor"      // Análise de concorrentes
  | "image_gen"       // Geração de imagens
  | "video_gen"       // Geração de vídeo
  | "payment"         // Pagamentos Asaas/Stripe
  | "general";        // Geral

interface ErrorContext {
  userId?:     number;
  projectId?:  number;
  campaignId?: number;
  endpoint?:   string;
  model?:      string;
  provider?:   string;
  extra?:      Record<string, any>;
}

// Sugestões automáticas por código de erro
const SUGGESTIONS: Record<string, string> = {
  TIMEOUT:               "Gemini demorou mais que 32s. Verifique se a geração híbrida está ativa e se o Groq está configurado como fallback.",
  META_3858504:          "Meta API deprecou este campo. Verifique server/ai.ts — creative_features_spec ou standard_enhancements.",
  META_TOKEN_EXPIRED:    "Token Meta expirado. Acesse mecproai.com/meta-campaigns e reconecte.",
  META_CODE_10:          "App Meta sem permissão para Ads Library. Solicite aprovação em developers.facebook.com.",
  QUOTA_EXHAUSTED:       "Quota Gemini esgotada. Crie chaves em projetos Google separados (grátis). Keys 2+3 têm prefixo duplicado AIzaSyCv.",
  GROQ_429:              "Groq rate limit. Sistema usa fallback automático. Considere segunda chave Groq.",
  GROQ_413:              "Prompt muito grande para Groq. maxChars do modelo 8b já foi ajustado para 3200.",
  DB_CONNECTION:         "Falha de conexão com o banco. Verifique DATABASE_URL no Render e status do PostgreSQL.",
  JWT_INVALID:           "Token JWT inválido. Pode ser sessão expirada ou JWT_SECRET alterado.",
  POLLINATIONS_TIMEOUT:  "Pollinations.AI demorou mais de 35s. Cloudflare quota esgotada? Verifica quota diária (10k neurons).",
  IMAGE_GEN_FAILED:      "Geração de imagem falhou em todos os providers. Cloudflare quota + Genspark removido. Pollinations é o fallback.",
  CAMPAIGN_PARSE_ERROR:  "Gemini retornou JSON malformado. Groq assumiu como fallback. Verifique se prompt está muito longo.",
  HYBRID_MODE_ACTIVE:    "Motor híbrido local ativado (todos os LLMs falharam). Campanhas têm qualidade reduzida.",
};

function getSuggestion(code: string, message: string): string {
  // Tenta match exato primeiro
  if (SUGGESTIONS[code]) return SUGGESTIONS[code];

  // Tenta match por substring da mensagem
  if (message.includes("timeout") || message.includes("Timeout"))
    return SUGGESTIONS["TIMEOUT"];
  if (message.includes("quota") || message.includes("exhausted"))
    return SUGGESTIONS["QUOTA_EXHAUSTED"];
  if (message.includes("TOKEN") || message.includes("token expired"))
    return SUGGESTIONS["META_TOKEN_EXPIRED"];
  if (message.includes("3858504"))
    return SUGGESTIONS["META_3858504"];
  if (message.includes("429"))
    return SUGGESTIONS["GROQ_429"];
  if (message.includes("parse") || message.includes("JSON"))
    return SUGGESTIONS["CAMPAIGN_PARSE_ERROR"];

  return "Verifique os logs do Render para mais detalhes.";
}

function makeFingerprint(area: string, code: string, message: string): string {
  const raw = `${area}:${code}:${message.slice(0, 100)}`;
  return crypto.createHash("md5").update(raw).digest("hex").slice(0, 20);
}

// ── Função principal — fire-and-forget ───────────────────────────────────────
export function logError(
  severity: Severity,
  area: Area,
  code: string,
  message: string,
  ctx: ErrorContext = {},
  stack?: string
): void {
  setImmediate(async () => {
    try {
      const { getPool } = await import("./db.js");
      const pool = await getPool();
      if (!pool) return;

      const fingerprint = makeFingerprint(area, code, message);
      const suggestion  = getSuggestion(code, message);
      const context     = {
        endpoint:   ctx.endpoint,
        model:      ctx.model,
        provider:   ctx.provider,
        ...(ctx.extra || {}),
      };

      // Upsert: se mesmo fingerprint já existe, incrementa counter
      await pool.query(`
        INSERT INTO system_errors
          (severity, area, code, message, stack, context,
           user_id, project_id, campaign_id,
           fingerprint, suggestion, occurrence_count, last_occurred)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,1,NOW())
        ON CONFLICT (fingerprint)
          DO UPDATE SET
            occurrence_count = system_errors.occurrence_count + 1,
            last_occurred    = NOW(),
            severity         = EXCLUDED.severity,
            message          = EXCLUDED.message,
            context          = EXCLUDED.context,
            resolved         = false
      `, [
        severity, area, code,
        message.slice(0, 499),
        stack?.slice(0, 2000),
        JSON.stringify(context),
        ctx.userId     || null,
        ctx.projectId  || null,
        ctx.campaignId || null,
        fingerprint,
        suggestion,
      ]);
    } catch {
      // Nunca lança erro — é só telemetria
    }
  });
}

// ── Wrappers convenientes ────────────────────────────────────────────────────
export const errorLog = {
  critical: (area: Area, code: string, msg: string, ctx?: ErrorContext, stack?: string) =>
    logError("critical", area, code, msg, ctx, stack),

  error: (area: Area, code: string, msg: string, ctx?: ErrorContext, stack?: string) =>
    logError("error", area, code, msg, ctx, stack),

  warn: (area: Area, code: string, msg: string, ctx?: ErrorContext) =>
    logError("warn", area, code, msg, ctx),
};

// ── Query helpers para o dashboard ──────────────────────────────────────────
export async function getErrorStats(pool: any) {
  const [summary, recent, topErrors] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)                                     AS total,
        COUNT(*) FILTER (WHERE severity='critical')  AS critical,
        COUNT(*) FILTER (WHERE severity='error')     AS errors,
        COUNT(*) FILTER (WHERE severity='warn')      AS warnings,
        COUNT(*) FILTER (WHERE resolved=false)       AS unresolved,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24h') AS last_24h
      FROM system_errors
    `),
    pool.query(`
      SELECT id, severity, area, code, message, occurrence_count,
             last_occurred, resolved, suggestion, context
      FROM system_errors
      WHERE resolved = false
      ORDER BY severity DESC, last_occurred DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT area, COUNT(*) AS count,
             SUM(occurrence_count) AS total_occurrences
      FROM system_errors
      WHERE resolved = false AND created_at > NOW() - INTERVAL '7d'
      GROUP BY area
      ORDER BY count DESC
    `),
  ]);

  return {
    summary:   summary.rows[0],
    recent:    recent.rows,
    topErrors: topErrors.rows,
  };
}
