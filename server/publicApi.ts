/**
 * MECPro Public REST API — v1
 * Autenticação: Bearer token (API Key) via header Authorization
 *
 * Endpoints:
 *   POST /api/v1/competitors/analyze   → Analisa um concorrente
 *   POST /api/v1/insights/generate     → Gera insights de mercado
 *   GET  /api/v1/competitors/list      → Lista concorrentes de um projeto
 *   GET  /api/v1/status                → Status da API e cota restante
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getPool } from "./db";
import { log } from "./logger";
import { analyzeCompetitor } from "./ai";
import db from "./db";

const router = Router();

// ── Limites por plano ────────────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, { daily: number; monthly: number }> = {
  free:    { daily:   5, monthly:   50 },
  basic:   { daily:  20, monthly:  300 },
  premium: { daily: 100, monthly: 2000 },
  vip:     { daily: 500, monthly: 9999 },
};

// ── Middleware de autenticação por API Key ───────────────────────────────────
async function authApiKey(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization || "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!key) {
    return res.status(401).json({ error: "missing_api_key", message: "Informe a API key no header: Authorization: Bearer <key>" });
  }

  const pool = await getPool();
  if (!pool) return res.status(500).json({ error: "db_unavailable" });

  // Busca a key + usuário + plano
  const result = await pool.query(`
    SELECT k.id, k."userId", k.active, k."reqToday", k."reqMonth", k."resetAt", k.name,
           u.plan, u.email, u.name AS username
    FROM api_keys k
    JOIN users u ON u.id = k."userId"
    WHERE k.key = $1
    LIMIT 1
  `, [key]);

  if (!result.rows.length) {
    return res.status(401).json({ error: "invalid_api_key", message: "API key inválida ou inexistente." });
  }

  const apiKey = result.rows[0];

  if (!apiKey.active) {
    return res.status(403).json({ error: "api_key_disabled", message: "Esta API key está desativada." });
  }

  // Reseta contador diário se mudou o dia
  const today = new Date().toISOString().split("T")[0];
  if (apiKey.resetAt !== today) {
    await pool.query(`UPDATE api_keys SET "reqToday" = 0, "resetAt" = $1 WHERE id = $2`, [today, apiKey.id]);
    apiKey.reqToday = 0;
  }

  // Verifica cota
  const plan  = (apiKey.plan || "free").toLowerCase();
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (apiKey.reqToday >= limits.daily) {
    return res.status(429).json({
      error: "rate_limit_daily",
      message: `Limite diário atingido (${limits.daily} req/dia no plano ${plan}). Tente amanhã ou faça upgrade.`,
      limit: limits.daily, used: apiKey.reqToday, resets: "tomorrow 00:00 BRT",
    });
  }
  if (apiKey.reqMonth >= limits.monthly) {
    return res.status(429).json({
      error: "rate_limit_monthly",
      message: `Limite mensal atingido (${limits.monthly} req/mês no plano ${plan}). Faça upgrade para continuar.`,
      limit: limits.monthly, used: apiKey.reqMonth,
    });
  }

  // Incrementa uso + atualiza lastUsedAt
  await pool.query(`
    UPDATE api_keys
    SET "reqToday" = "reqToday" + 1, "reqMonth" = "reqMonth" + 1, "lastUsedAt" = NOW()
    WHERE id = $1
  `, [apiKey.id]);

  // Injeta no request
  (req as any).apiUser = { id: apiKey.userId, plan, email: apiKey.email, username: apiKey.username, keyId: apiKey.id };
  (req as any).apiLimits = { daily: limits.daily, monthly: limits.monthly, usedToday: apiKey.reqToday + 1, usedMonth: apiKey.reqMonth + 1 };

  next();
}

// ── Helper de resposta padrão ─────────────────────────────────────────────────
function apiResponse(res: Response, data: any, req: Request) {
  const limits = (req as any).apiLimits;
  return res.json({
    success: true,
    data,
    meta: {
      api:       "MECPro v1",
      timestamp: new Date().toISOString(),
      quota: limits ? {
        daily_used:    limits.usedToday,
        daily_limit:   limits.daily,
        monthly_used:  limits.usedMonth,
        monthly_limit: limits.monthly,
        remaining_today: Math.max(0, limits.daily - limits.usedToday),
      } : undefined,
    },
  });
}

// ── GET /api/v1/status ────────────────────────────────────────────────────────
router.get("/status", authApiKey, async (req: Request, res: Response) => {
  const user   = (req as any).apiUser;
  const limits = (req as any).apiLimits;
  return apiResponse(res, {
    status:  "operational",
    user:    { id: user.id, email: user.email, plan: user.plan },
    quota: {
      daily_used:       limits.usedToday,
      daily_limit:      limits.daily,
      monthly_used:     limits.usedMonth,
      monthly_limit:    limits.monthly,
      remaining_today:  Math.max(0, limits.daily - limits.usedToday),
    },
    endpoints: [
      "GET  /api/v1/status",
      "GET  /api/v1/competitors/list?projectId=<id>",
      "POST /api/v1/competitors/analyze",
      "POST /api/v1/insights/generate",
    ],
  }, req);
});

// ── GET /api/v1/competitors/list ──────────────────────────────────────────────
router.get("/competitors/list", authApiKey, async (req: Request, res: Response) => {
  const user      = (req as any).apiUser;
  const projectId = parseInt(req.query.projectId as string);

  if (!projectId) {
    return res.status(400).json({ error: "missing_param", message: "Informe ?projectId=<id>" });
  }

  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: "db_unavailable" });

    // Verifica que o projeto pertence ao usuário
    const proj = await pool.query(
      `SELECT id, name, status FROM projects WHERE id = $1 AND "userId" = $2`,
      [projectId, user.id]
    );
    if (!proj.rows.length) {
      return res.status(404).json({ error: "project_not_found", message: "Projeto não encontrado ou sem acesso." });
    }

    const competitors = await pool.query(`
      SELECT
        c.id, c.name, c.website, c.instagram, c."adLibraryUrl",
        c."analysisStatus", c."analysisScore",
        c."createdAt", c."updatedAt",
        COUNT(sa.id) AS ad_count
      FROM competitors c
      LEFT JOIN scraped_ads sa ON sa."competitorId" = c.id
      WHERE c."projectId" = $1
      GROUP BY c.id
      ORDER BY c."createdAt" DESC
    `, [projectId]);

    return apiResponse(res, {
      project: { id: proj.rows[0].id, name: proj.rows[0].name },
      competitors: competitors.rows.map(c => ({
        id:              c.id,
        name:            c.name,
        website:         c.website,
        instagram:       c.instagram,
        analysis_status: c.analysisStatus,
        analysis_score:  c.analysisScore,
        ad_count:        Number(c.ad_count),
        created_at:      c.createdAt,
        updated_at:      c.updatedAt,
      })),
      total: competitors.rows.length,
    }, req);

  } catch (e: any) {
    log.error("public-api", "competitors/list error", { error: e.message });
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// ── POST /api/v1/competitors/analyze ─────────────────────────────────────────
router.post("/competitors/analyze", authApiKey, async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const { competitor_id, project_id, wait = false } = req.body || {};

  if (!competitor_id || !project_id) {
    return res.status(400).json({
      error: "missing_params",
      message: "Informe competitor_id e project_id no body.",
      example: { competitor_id: 42, project_id: 7, wait: false },
    });
  }

  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: "db_unavailable" });

    // Verifica ownership
    const proj = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND "userId" = $2`,
      [project_id, user.id]
    );
    if (!proj.rows.length) {
      return res.status(404).json({ error: "project_not_found", message: "Projeto não encontrado ou sem acesso." });
    }

    const comp = await pool.query(
      `SELECT id, name, website, instagram FROM competitors WHERE id = $1 AND "projectId" = $2`,
      [competitor_id, project_id]
    );
    if (!comp.rows.length) {
      return res.status(404).json({ error: "competitor_not_found", message: "Concorrente não encontrado neste projeto." });
    }

    const competitor = comp.rows[0];

    // FIX: import dinamico
    const { analyzeCompetitor } = await import("./ai");

    if (wait) {
      // Executa sincronamente (pode demorar até 30s)
      log.info("public-api", "analyze competitor sync", { userId: user.id, competitor_id, project_id });
      const result = await analyzeCompetitor(competitor_id, project_id);
      return apiResponse(res, {
        competitor: { id: competitor.id, name: competitor.name },
        analysis: result,
        mode: "sync",
      }, req);
    } else {
      // Dispara em background e retorna imediatamente
      analyzeCompetitor(competitor_id, project_id).catch(e =>
        log.error("public-api", "background analyze failed", { error: e.message })
      );
      return apiResponse(res, {
        competitor: { id: competitor.id, name: competitor.name, website: competitor.website },
        status: "processing",
        message: "Análise iniciada em background. Consulte GET /api/v1/competitors/list em ~30s para ver o resultado.",
        mode: "async",
        check_url: `/api/v1/competitors/list?projectId=${project_id}`,
      }, req);
    }

  } catch (e: any) {
    log.error("public-api", "competitors/analyze error", { error: e.message });
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// ── POST /api/v1/insights/generate ───────────────────────────────────────────
router.post("/insights/generate", authApiKey, async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const {
    project_id,
    type = "full",        // "full" | "swot" | "opportunities" | "threats" | "copy"
    audience,             // opcional: segmento do público-alvo
    context,              // opcional: contexto extra (ex: "lançamento de produto")
  } = req.body || {};

  if (!project_id) {
    return res.status(400).json({
      error: "missing_params",
      message: "Informe project_id no body.",
      example: {
        project_id: 7,
        type: "full",
        audience: "empreendedores 25-45 anos",
        context: "lançamento de produto digital",
      },
    });
  }

  const VALID_TYPES = ["full", "swot", "opportunities", "threats", "copy"];
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: "invalid_type", message: `type deve ser: ${VALID_TYPES.join(" | ")}` });
  }

  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: "db_unavailable" });

    // Verifica ownership
    const proj = await pool.query(
      `SELECT p.id, p.name, cp.* FROM projects p
       LEFT JOIN client_profiles cp ON cp."projectId" = p.id
       WHERE p.id = $1 AND p."userId" = $2`,
      [project_id, user.id]
    );
    if (!proj.rows.length) {
      return res.status(404).json({ error: "project_not_found", message: "Projeto não encontrado ou sem acesso." });
    }

    const project = proj.rows[0];

    // Busca concorrentes + anúncios analisados
    const competitors = await pool.query(`
      SELECT c.id, c.name, c.website, c."analysisScore",
             json_agg(json_build_object(
               'headline', sa.headline, 'copy', sa.copy,
               'platform', sa.platform, 'engagement', sa."engagementScore"
             )) FILTER (WHERE sa.id IS NOT NULL) AS ads
      FROM competitors c
      LEFT JOIN scraped_ads sa ON sa."competitorId" = c.id
      WHERE c."projectId" = $1
      GROUP BY c.id
      ORDER BY c."analysisScore" DESC NULLS LAST
      LIMIT 5
    `, [project_id]);

    const { gemini: generateTextWithAI } = await import("./ai");

    // Monta prompt contextual
    const profileSummary = project.targetAudience
      ? `Público-alvo: ${project.targetAudience}. Produto: ${project.productName || project.name}. Nicho: ${project.niche || "N/A"}.`
      : `Projeto: ${project.name}`;

    const competitorsSummary = competitors.rows.map((c: any) =>
      `- ${c.name} (website: ${c.website || "N/A"}, score: ${c.analysisScore || "?"})`
    ).join("\n");

    const prompts: Record<string, string> = {
      full: `Você é um estrategista de marketing sênior. Analise o seguinte projeto e seus concorrentes e gere um relatório completo de inteligência de mercado em português.

${profileSummary}
${audience ? `Segmento-alvo adicional: ${audience}` : ""}
${context ? `Contexto: ${context}` : ""}

Concorrentes identificados:
${competitorsSummary || "Nenhum concorrente cadastrado ainda."}

Gere um relatório com:
1. **Resumo executivo** (3-4 frases)
2. **Análise SWOT** (Forças, Fraquezas, Oportunidades, Ameaças)
3. **Top 3 oportunidades de mercado** com ações concretas
4. **Top 3 ameaças** e como mitigá-las
5. **Posicionamento recomendado** para se diferenciar dos concorrentes
6. **KPIs sugeridos** para monitorar

Seja específico, prático e orientado a resultados.`,

      swot: `Gere uma análise SWOT detalhada em português para o seguinte projeto de marketing:

${profileSummary}
Concorrentes: ${competitorsSummary || "não identificados"}
${audience ? `Segmento: ${audience}` : ""}

Formato JSON com: { strengths: [], weaknesses: [], opportunities: [], threats: [] }
Cada item deve ter: { point: "...", detail: "...", action: "..." }`,

      opportunities: `Identifique as 5 maiores oportunidades de mercado para:

${profileSummary}
Concorrentes: ${competitorsSummary || "não identificados"}
${context ? `Contexto: ${context}` : ""}

Para cada oportunidade: nome, descrição, como aproveitar, prazo estimado, potencial de impacto (alto/médio/baixo).`,

      threats: `Identifique as 5 principais ameaças competitivas e de mercado para:

${profileSummary}
Concorrentes: ${competitorsSummary || "não identificados"}

Para cada ameaça: descrição, probabilidade (alta/média/baixa), impacto (alto/médio/baixo), estratégia de mitigação.`,

      copy: `Você é um especialista em copywriting. Crie 5 variações de copy de anúncio para:

${profileSummary}
${audience ? `Público: ${audience}` : ""}
${context ? `Contexto: ${context}` : ""}

Para cada variação: headline, body (2-3 linhas), CTA, plataforma recomendada (Meta/Google/TikTok), gatilho emocional usado.`,
    };

    log.info("public-api", "insights/generate", { userId: user.id, project_id, type });

    const raw = await generateTextWithAI(prompts[type], {
      maxOutputTokens: 1500,
      temperature: 0.7,
    });

    // Tenta parse JSON para tipos estruturados
    let parsed: any = null;
    if (type === "swot") {
      try {
        const match = raw.match(/\{[\s\S]+\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {}
    }

    return apiResponse(res, {
      project: { id: project.id, name: project.name },
      insight_type: type,
      audience:     audience || null,
      context:      context || null,
      competitors_analyzed: competitors.rows.length,
      result: parsed || raw,
      format: parsed ? "json" : "markdown",
      generated_at: new Date().toISOString(),
    }, req);

  } catch (e: any) {
    log.error("public-api", "insights/generate error", { error: e.message });
    return res.status(500).json({ error: "internal_error", message: e.message });
  }
});

// ── Gerenciamento de API Keys (autenticado via sessão normal) ─────────────────
// GET /api/v1/keys — lista keys do usuário
router.get("/keys", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "not_authenticated", message: "Faça login no MECPro." });

  const pool = await getPool();
  if (!pool) return res.status(500).json({ error: "db_unavailable" });

  const keys = await pool.query(
    `SELECT id, name, LEFT(key, 8) || '••••••••••••••••••' AS key_preview,
            "reqToday", "reqMonth", "lastUsedAt", active, "createdAt"
     FROM api_keys WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId]
  );

  return res.json({ success: true, data: keys.rows });
});

// POST /api/v1/keys — cria nova key
router.post("/keys", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "not_authenticated" });

  const { name = "Minha API Key" } = req.body || {};

  const pool = await getPool();
  if (!pool) return res.status(500).json({ error: "db_unavailable" });

  // Limite: máx 5 keys por usuário
  const count = await pool.query(`SELECT COUNT(*) FROM api_keys WHERE "userId" = $1 AND active = true`, [userId]);
  if (Number(count.rows[0].count) >= 5) {
    return res.status(400).json({ error: "too_many_keys", message: "Limite de 5 API keys ativas por conta." });
  }

  // Gera key única: mecpro_sk_<32 hex chars>
  const key = `mecpro_sk_${crypto.randomBytes(24).toString("hex")}`;

  const result = await pool.query(
    `INSERT INTO api_keys ("userId", key, name) VALUES ($1, $2, $3) RETURNING id, key, name, "createdAt"`,
    [userId, key, name.slice(0, 60)]
  );

  log.info("public-api", "API key criada", { userId, keyId: result.rows[0].id });

  return res.json({
    success: true,
    data: result.rows[0],
    warning: "Salve esta key agora. Ela não será exibida novamente por completo.",
  });
});

// DELETE /api/v1/keys/:id — revoga key
router.delete("/keys/:id", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id || (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "not_authenticated" });

  const pool = await getPool();
  if (!pool) return res.status(500).json({ error: "db_unavailable" });

  await pool.query(
    `UPDATE api_keys SET active = false WHERE id = $1 AND "userId" = $2`,
    [req.params.id, userId]
  );

  return res.json({ success: true, message: "API key revogada." });
});

export default router;
