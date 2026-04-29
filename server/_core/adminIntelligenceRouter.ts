/**
 * adminIntelligenceRouter.ts
 *
 * COMO INTEGRAR:
 * 1. Importe e adicione ao appRouter no router.ts:
 *    import { adminIntelligenceRouter } from "./adminIntelligenceRouter";
 *    // No export do appRouter:
 *    intelligence: adminIntelligenceRouter,
 *
 * 2. Execute o MIGRATION_SQL do adminIntelligenceSchema.ts para criar as tabelas.
 *
 * 3. Importe as funções do engine:
 *    import { calculateScore, extractWinnerParameters, ... } from "../campaignIntelligenceEngine";
 *
 * Todos os endpoints são protegidos por adminProcedure.
 * Rotas: trpc.intelligence.*
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { log } from "../logger";
import {
  calculateScore,
  extractWinnerParameters,
  generateWinnerExplanation,
  computeLearningUpdate,
  buildMLFeatures,
  detectCorrelations,
  buildRecommendedTemplate,
  DEFAULT_WEIGHTS,
  type CampaignContext,
  type CampaignMetrics,
} from "../campaignIntelligenceEngine";

// clusterCampaigns: função stub até ser implementada
function clusterCampaigns(campaigns: any[]): any[] {
  return campaigns.map((c, i) => ({ ...c, clusterId: i % 3 }));
}

// Re-usa as abstrações já existentes no projeto
import { initTRPC, type inferRouterContext } from "@trpc/server";
import * as db from "../db";
import { getPool } from "../db";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });
const router = t.router;

// Guard: só admin/superadmin
const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "superadmin"].includes((ctx.user as any).role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Admin" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: carrega campanha + contexto completo do banco
// ─────────────────────────────────────────────────────────────────────────────
async function loadCampaignContext(campaignId: number): Promise<{
  context: CampaignContext;
  metrics: CampaignMetrics;
  raw: any;
}> {
  const campaign: any = await db.getCampaignById(campaignId);
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: `Campanha ${campaignId} não encontrada` });

  let creatives: any[] = [];
  let adSets: any[] = [];
  let aiResp: any = {};
  try { creatives = JSON.parse(campaign.creatives || "[]"); } catch {}
  try { adSets    = JSON.parse(campaign.adSets    || "[]"); } catch {}
  try { aiResp    = JSON.parse(campaign.aiResponse || "{}"); } catch {}

  // Métricas: busca do publishedMeta se disponível, senão estimativa do aiResponse
  const metrics: CampaignMetrics = {
    impressions:  Number(aiResp?.impressions  || campaign.metricImpressions  || 0),
    clicks:       Number(aiResp?.clicks       || campaign.metricClicks       || 0),
    ctr:          Number(aiResp?.ctr          || campaign.metricCtr          || 0),
    cpc:          Number(aiResp?.cpc          || campaign.metricCpc          || 0),
    cpm:          Number(aiResp?.cpm          || campaign.metricCpm          || 0),
    spend:        Number(aiResp?.spend        || campaign.suggestedBudgetMonthly || 0),
    roas:         Number(aiResp?.roas         || 0),
    conversions:  Number(aiResp?.conversions  || 0),
    leads:        Number(aiResp?.leads        || 0),
    reach:        Number(aiResp?.reach        || 0),
    frequency:    Number(aiResp?.frequency    || 1),
  };

  // Nicho: tenta pegar do clientProfile do projeto
  let niche = "geral";
  try {
    const profile: any = await db.getClientProfileByProjectId(campaign.projectId);
    niche = profile?.niche || "geral";
  } catch {}

  const context: CampaignContext = {
    campaignId: campaign.id,
    userId:     campaign.userId || 0,
    projectId:  campaign.projectId,
    name:       campaign.name,
    platform:   campaign.platform || "meta",
    objective:  campaign.objective || "traffic",
    niche,
    budgetTotal:  Number(campaign.suggestedBudgetMonthly || 0),
    durationDays: Number(campaign.durationDays || 30),
    creatives,
    adSets,
    aiResponse: campaign.aiResponse,
  };

  return { context, metrics, raw: campaign };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────
export const adminIntelligenceRouter = router({

  // ── 1. LISTAR TODAS AS CAMPANHAS DA PLATAFORMA (admin view) ─────────────
  listAllCampaigns: adminProcedure
    .input(z.object({
      page:      z.number().default(1),
      limit:     z.number().default(50),
      userId:    z.number().optional(),
      platform:  z.string().optional(),
      objective: z.string().optional(),
      niche:     z.string().optional(),
      status:    z.string().optional(),
      dateFrom:  z.string().optional(),
      dateTo:    z.string().optional(),
      hasScore:  z.boolean().optional(),
      sortBy:    z.enum(["created", "score", "spend", "name"]).default("created"),
    }))
    .query(async ({ input, ctx }) => {
      // Busca todos os usuários e seus projetos
      const users: any[] = await db.getAllUsers();
      const projects: any[] = await db.getAllProjects();

      const allCampaigns: any[] = [];

      for (const project of projects) {
        try {
          const campaigns: any[] = await db.getCampaignsByProjectId(project.id);
          const user = users.find((u: any) => u.id === project.userId);
          const profile: any = await db.getClientProfileByProjectId(project.id).catch(() => null);

          for (const c of campaigns) {
            // Filtros
            if (input.userId && project.userId !== input.userId) continue;
            if (input.platform && c.platform !== input.platform) continue;
            if (input.objective && c.objective !== input.objective) continue;
            if (input.status && c.publishStatus !== input.status) continue;
            if (input.niche && profile?.niche !== input.niche) continue;

            let aiResp: any = {};
            try { aiResp = JSON.parse(c.aiResponse || "{}"); } catch {}

            allCampaigns.push({
              ...c,
              userName:    user?.name    || user?.email || `User #${project.userId}`,
              userEmail:   user?.email   || "",
              userPlan:    user?.plan    || "free",
              projectName: project.name,
              userId:      project.userId,
              niche:       profile?.niche || "geral",
              companyName: profile?.companyName || project.name,
              // Campos de score se existirem
              scoreTotal:  c.scoreTotal  || 0,
              isWinner:    c.isWinner    || 0,
            });
          }
        } catch {}
      }

      // Sort
      allCampaigns.sort((a, b) => {
        if (input.sortBy === "score")   return (b.scoreTotal || 0) - (a.scoreTotal || 0);
        if (input.sortBy === "spend")   return (b.suggestedBudgetMonthly || 0) - (a.suggestedBudgetMonthly || 0);
        if (input.sortBy === "name")    return a.name.localeCompare(b.name);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      const total = allCampaigns.length;
      const offset = (input.page - 1) * input.limit;
      const paginated = allCampaigns.slice(offset, offset + input.limit);

      // Estatísticas gerais
      const stats = {
        total,
        byPlatform:  countBy(allCampaigns, "platform"),
        byObjective: countBy(allCampaigns, "objective"),
        byNiche:     countBy(allCampaigns, "niche"),
        withScore:   allCampaigns.filter(c => c.scoreTotal > 0).length,
        winners:     allCampaigns.filter(c => c.isWinner).length,
        avgScore:    allCampaigns.length > 0
          ? +(allCampaigns.reduce((a, c) => a + (c.scoreTotal || 0), 0) / allCampaigns.length).toFixed(1)
          : 0,
      };

      return { campaigns: paginated, total, stats, page: input.page, totalPages: Math.ceil(total / input.limit) };
    }),

  // ── 2. CALCULAR SCORE DE UMA CAMPANHA ───────────────────────────────────
  calculateCampaignScore: adminProcedure
    .input(z.object({
      campaignId: z.number(),
      weights:    z.record(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { context, metrics, raw } = await loadCampaignContext(input.campaignId);
      const weights = input.weights ? { ...DEFAULT_WEIGHTS, ...input.weights } : DEFAULT_WEIGHTS;
      const score = calculateScore(context, metrics, weights);

      // Persiste no banco (tabela campaign_scores)
      const pool = await getPool();
      if (pool!) {
        try {
          await pool!.query(`
            INSERT INTO campaign_scores (
              campaign_id, user_id, project_id, score_total,
              score_ctr, score_cpc, score_cpm, score_roas, score_conversion,
              score_creative, score_consistency, score_scalability,
              platform, objective, niche, budget_total, duration_days,
              metric_impressions, metric_clicks, metric_ctr, metric_cpc,
              metric_cpm, metric_spend, metric_roas, metric_conversions,
              weights_used, engine_version
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`, [
              context.campaignId, context.userId, context.projectId, score.total,
              score.ctr, score.cpc, score.cpm, score.roas, score.conversion,
              score.creative, score.consistency, score.scalability,
              context.platform, context.objective, context.niche,
              context.budgetTotal, context.durationDays,
              metrics.impressions, metrics.clicks, metrics.ctr, metrics.cpc,
              metrics.cpm, metrics.spend, metrics.roas ?? 0, metrics.conversions ?? 0,
              JSON.stringify(weights), "1.0",
            ]
          );
        } catch (e: any) {
          log.warn("intelligence", "Score persist failed", { error: e.message });
        }
      }

      // Log de auditoria
      await logAction(ctx.user.id, "calculate_score", "campaign", input.campaignId, { score: score.total }, "success");

      return { score, context, metrics };
    }),

  // ── 3. CALCULAR SCORE EM LOTE (todas as campanhas) ──────────────────────
  calculateBatchScores: adminProcedure
    .input(z.object({
      limit:   z.number().default(100),
      niche:   z.string().optional(),
      platform: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const projects: any[] = await db.getAllProjects();
      const results: Array<{ campaignId: number; name: string; score: number; platform: string; objective: string }> = [];
      let processed = 0;

      for (const project of projects) {
        if (processed >= input.limit) break;
        const campaigns: any[] = await db.getCampaignsByProjectId(project.id).catch(() => []);

        for (const c of campaigns) {
          if (processed >= input.limit) break;
          if (input.platform && c.platform !== input.platform) continue;

          try {
            const { context, metrics } = await loadCampaignContext(c.id);
            if (input.niche && context.niche !== input.niche) continue;

            const score = calculateScore(context, metrics);
            results.push({ campaignId: c.id, name: c.name, score: score.total, platform: context.platform, objective: context.objective });
            processed++;
          } catch {}
        }
      }

      // Calcula ranking
      results.sort((a, b) => b.score - a.score);
      results.forEach((r, i) => (r as any).rank = i + 1);

      await logAction(ctx.user.id, "calculate_batch_scores", "campaign", 0, { count: processed }, "success");
      return { results, processed };
    }),

  // ── 4. ANÁLISE COMPARATIVA (compara N campanhas) ─────────────────────────
  compareCampaigns: adminProcedure
    .input(z.object({
      campaignIds: z.array(z.number()).min(2).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const results: any[] = [];

      for (const id of input.campaignIds) {
        try {
          const { context, metrics } = await loadCampaignContext(id);
          const score = calculateScore(context, metrics);
          const params = extractWinnerParameters(context, score, metrics);
          results.push({ id, context, metrics, score, params });
        } catch (e: any) {
          log.warn("intelligence", `Compare: failed campaign ${id}`, { error: e.message });
        }
      }

      if (results.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Precisa de pelo menos 2 campanhas com dados válidos" });

      // Ordena por score
      results.sort((a, b) => b.score.total - a.score.total);
      const winner = results[0];
      const loser  = results[results.length - 1];

      // Gera explicação da campanha vencedora
      const explanation = await generateWinnerExplanation(
        winner.context,
        winner.score,
        winner.params as any,
        results.map(r => ({ name: r.context.name, score: r.score.total }))
      );

      // Análise de diferença
      const comparison = results.map(r => ({
        campaignId:  r.id,
        name:        r.context.name,
        platform:    r.context.platform,
        objective:   r.context.objective,
        niche:       r.context.niche,
        score:       r.score,
        metrics:     r.metrics,
        params:      r.params,
        rank:        results.indexOf(r) + 1,
        isWinner:    r.id === winner.id,
        gapToWinner: +(winner.score.total - r.score.total).toFixed(1),
      }));

      await logAction(ctx.user.id, "compare_campaigns", "campaign", winner.id, { count: results.length }, "success");

      return { comparison, winner: { ...winner, ...explanation }, loser };
    }),

  // ── 5. EXTRAIR E SALVAR PADRÃO VENCEDOR ──────────────────────────────────
  extractAndSavePattern: adminProcedure
    .input(z.object({
      campaignId:  z.number(),
      approveNow:  z.boolean().default(false),
      overrideNiche: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { context, metrics } = await loadCampaignContext(input.campaignId);
      if (input.overrideNiche) context.niche = input.overrideNiche;

      const score = calculateScore(context, metrics);

      if (score.total < 50) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Score insuficiente (${score.total}/100) para extrair padrão vencedor. Mínimo: 50.`
        });
      }

      const params = extractWinnerParameters(context, score, metrics);

      // Busca learning base atual para este segmento
      const pool = await getPool();
      let learningEntry: any = null;
      try {
        const rows: any[] = (await pool!.query(
          `SELECT * FROM learning_base WHERE platform=$1 AND objective=$2 AND niche=$3 LIMIT 1`,
          [context.platform, context.objective, context.niche || "geral"]
        )).rows;
        learningEntry = rows[0] || null;
      } catch {}

      const explanation = await generateWinnerExplanation(
        context, score, params as any,
        [{ name: context.name, score: score.total }],
        learningEntry
      );

      const fullParams = { ...params, ...explanation };

      // Persiste em winner_patterns
      let patternId = 0;
      if (pool!) {
        try {
          const result: any = await pool!.query(`
            INSERT INTO winner_patterns (
              campaign_id, score_id, user_id, project_id,
              platform, objective, niche,
              ad_format, headline_pattern, copy_structure, cta_type, main_promise,
              trigger_types, media_types, num_variations,
              age_min, age_max, genders, placements,
              bidding_strategy, budget_range, duration_range,
              pattern_score, confidence_level,
              why_it_won, key_factors, recommendations,
              approved_by_admin, approved_at
            ) VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`, [
              context.campaignId, context.userId, context.projectId,
              context.platform, context.objective, context.niche || "geral",
              params.adFormat, params.headlinePattern, params.copyStructure,
              params.ctaType, params.mainPromise,
              JSON.stringify(params.triggerTypes), JSON.stringify(params.mediaTypes), params.numVariations,
              params.ageMin, params.ageMax, JSON.stringify(params.genders), JSON.stringify(params.placements),
              params.biddingStrategy, params.budgetRange, params.durationRange,
              score.total, 0.5,
              explanation.whyItWon, JSON.stringify(params.keyFactors), JSON.stringify(explanation.recommendations),
              input.approveNow ? 1 : 0, input.approveNow ? Math.floor(Date.now() / 1000) : null,
            ]
          );
          patternId = result?.lastInsertRowid || 0;
        } catch (e: any) {
          log.error("intelligence", "Save pattern failed", { error: e.message });
        }
      }

      await logAction(ctx.user.id, "extract_pattern", "pattern", patternId, { campaignId: input.campaignId, score: score.total }, "success");

      return { patternId, score, params: fullParams, approved: input.approveNow };
    }),

  // ── 6. ATUALIZAR BASE DE APRENDIZADO (Learning Base) ─────────────────────
  updateLearningBase: adminProcedure
    .input(z.object({
      campaignId: z.number(),
      forceUpdate: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const { context, metrics } = await loadCampaignContext(input.campaignId);
      const score  = calculateScore(context, metrics);
      const params = extractWinnerParameters(context, score, metrics);
      const mlFeatures = buildMLFeatures(context, params as any, score);

      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });

      // Busca entrada existente
      const rows: any[] = (await pool!.query(
        `SELECT * FROM learning_base WHERE platform=$1 AND objective=$2 AND niche=$3 LIMIT 1`,
        [context.platform, context.objective, context.niche || "geral"]
      )).rows;
      const existing = rows[0] || null;

      const update = computeLearningUpdate(existing, score.total, metrics, params as any);
      const template = buildRecommendedTemplate(
        { ...(existing || {}), ...update },
        context.platform, context.objective, context.niche || "geral"
      );

      if (existing) {
        await pool!.query(`
          UPDATE learning_base SET
            sample_count=$1, avg_score=$2, best_score=$3, avg_ctr=$4, avg_cpc=$5, avg_cpm=$6, avg_roas=$7,
            top_ad_formats=$8, top_cta_types=$9, top_placements=$10, top_triggers=$11,
            top_budget_ranges=$12, top_durations=$13,
            recommended_template=$14, version=version+1, last_updated=EXTRACT(EPOCH FROM NOW())::int
          WHERE platform=$15 AND objective=$16 AND niche=$17`,
          [
            update.sample_count, update.avg_score, update.best_score,
            update.avg_ctr, update.avg_cpc, update.avg_cpm, update.avg_roas,
            update.top_ad_formats, update.top_cta_types, update.top_placements, update.top_triggers,
            update.top_budget_ranges, update.top_durations,
            JSON.stringify(template),
            context.platform, context.objective, context.niche || "geral",
          ]
        );
      } else {
        await pool!.query(`
          INSERT INTO learning_base (
            platform, objective, niche,
            sample_count, avg_score, best_score, avg_ctr, avg_cpc, avg_cpm, avg_roas,
            top_ad_formats, top_cta_types, top_placements, top_triggers,
            top_budget_ranges, top_durations, recommended_template
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            context.platform, context.objective, context.niche || "geral",
            1, score.total, score.total,
            metrics.ctr, metrics.cpc, metrics.cpm, metrics.roas ?? 0,
            update.top_ad_formats, update.top_cta_types, update.top_placements, update.top_triggers,
            update.top_budget_ranges, update.top_durations, JSON.stringify(template),
          ]
        );
      }

      // Adiciona ao dataset ML
      try {
        await pool!.query(`
          INSERT INTO ml_dataset (
            campaign_id, score_id,
            feature_platform, feature_objective, feature_niche,
            feature_ad_format, feature_age_range, feature_budget_range,
            feature_duration, feature_placement, feature_bid_strategy,
            feature_copy_length, feature_num_creatives,
            feature_has_video, feature_has_carousel,
            feature_used_emoji, feature_used_urgency, feature_used_social_proof,
            label_score, label_ctr, label_cpc, label_roas, label_is_winner, split_group
          ) VALUES ($1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            context.campaignId, context.platform, context.objective, context.niche || "geral",
            mlFeatures.feature_ad_format, mlFeatures.feature_age_range, mlFeatures.feature_budget_range,
            mlFeatures.feature_duration, mlFeatures.feature_placement, mlFeatures.feature_bid_strategy,
            mlFeatures.feature_copy_length, mlFeatures.feature_num_creatives,
            mlFeatures.feature_has_video, mlFeatures.feature_has_carousel,
            mlFeatures.feature_used_emoji, mlFeatures.feature_used_urgency, mlFeatures.feature_used_social_proof,
            mlFeatures.label_score, mlFeatures.label_ctr, mlFeatures.label_cpc,
            mlFeatures.label_roas, mlFeatures.label_is_winner, mlFeatures.split_group,
          ]
        );
      } catch {}

      await logAction(ctx.user.id, "update_learning", "learning_base", 0, { platform: context.platform, niche: context.niche }, "success");

      return { updated: true, platform: context.platform, objective: context.objective, niche: context.niche, score: score.total, template };
    }),

  // ── 7. CONSULTAR PADRÕES VENCEDORES ──────────────────────────────────────
  getWinnerPatterns: adminProcedure
    .input(z.object({
      platform:  z.string().optional(),
      objective: z.string().optional(),
      niche:     z.string().optional(),
      approvedOnly: z.boolean().default(false),
      limit:     z.number().default(20),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return { patterns: [] };

      let query = `SELECT * FROM winner_patterns WHERE status='active'`;
      const params: any[] = [];
      if (input.platform)  { query += ` AND platform=$1`;  params.push(input.platform); }
      if (input.objective) { query += ` AND objective=$1`; params.push(input.objective); }
      if (input.niche)     { query += ` AND niche=$1`;     params.push(input.niche); }
      if (input.approvedOnly) { query += ` AND approved_by_admin=1`; }
      query += ` ORDER BY pattern_score DESC LIMIT $1`;
      params.push(input.limit);

      try {
        const patterns: any[] = (await pool!.query(query, params)).rows;
        return { patterns: patterns.map(p => ({
          ...p,
          trigger_types:   safeJsonParse(p.trigger_types, []),
          key_factors:     safeJsonParse(p.key_factors, []),
          recommendations: safeJsonParse(p.recommendations, []),
          placements:      safeJsonParse(p.placements, []),
        }))};
      } catch {
        return { patterns: [] };
      }
    }),

  // ── 8. CONSULTAR BASE DE APRENDIZADO ─────────────────────────────────────
  getLearningBase: adminProcedure
    .input(z.object({
      platform:  z.string().optional(),
      objective: z.string().optional(),
      niche:     z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return { entries: [] };

      let query = `SELECT * FROM learning_base`;
      const params: any[] = [];
      const where: string[] = [];
      if (input.platform)  where.push(`platform=$1`),  params.push(input.platform);
      if (input.objective) where.push(`objective=$1`), params.push(input.objective);
      if (input.niche)     where.push(`niche=$1`),     params.push(input.niche);
      if (where.length) query += ` WHERE ${where.join(" AND ")}`;
      query += ` ORDER BY avg_score DESC`;

      try {
        const entries: any[] = await (await pool!.query(query, params)).rows;
        return { entries: entries.map(e => ({
          ...e,
          topAdFormats:     safeJsonParse(e.top_ad_formats, {}),
          topCtaTypes:      safeJsonParse(e.top_cta_types, {}),
          topPlacements:    safeJsonParse(e.top_placements, {}),
          topTriggers:      safeJsonParse(e.top_triggers, {}),
          topBudgetRanges:  safeJsonParse(e.top_budget_ranges, {}),
          topDurations:     safeJsonParse(e.top_durations, {}),
          recommendedTemplate: safeJsonParse(e.recommended_template, {}),
          correlations:     safeJsonParse(e.correlations, []),
        }))};
      } catch {
        return { entries: [] };
      }
    }),

  // ── 9. RANKING GLOBAL DE CAMPANHAS ───────────────────────────────────────
  getGlobalRanking: adminProcedure
    .input(z.object({
      limit:     z.number().default(30),
      platform:  z.string().optional(),
      niche:     z.string().optional(),
      objective: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return { ranking: [] };

      let query = `
        SELECT cs.*, c.name as campaign_name, c.platform, c.objective
        FROM campaign_scores cs
        JOIN campaigns c ON c.id = cs.campaign_id
        WHERE 1=1`;
      const params: any[] = [];
      if (input.platform)  { query += ` AND cs.platform=$1`;  params.push(input.platform); }
      if (input.niche)     { query += ` AND cs.niche=$1`;     params.push(input.niche); }
      if (input.objective) { query += ` AND cs.objective=$1`; params.push(input.objective); }
      query += ` ORDER BY cs.score_total DESC LIMIT $1`;
      params.push(input.limit);

      try {
        const rows: any[] = await (await pool!.query(query, params)).rows;
        return { ranking: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
      } catch {
        return { ranking: [] };
      }
    }),

  // ── 10. APROVAR PADRÃO VENCEDOR ───────────────────────────────────────────
  approvePattern: adminProcedure
    .input(z.object({ patternId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await pool!.query(
        `UPDATE winner_patterns SET approved_by_admin = 1, approved_at = NOW() WHERE id = $1`,
        [input.patternId]
      );
      await logAction(ctx.user.id, "approve_pattern", "pattern", input.patternId, {}, "success");
      return { approved: true };
    }),

  // ── 11. ESTATÍSTICAS DO PAINEL ADMIN ─────────────────────────────────────
  getDashboardStats: adminProcedure
    .query(async () => {
      const pool = await getPool();
      const users: any[] = await db.getAllUsers();
      const projects: any[] = await db.getAllProjects();

      let totalCampaigns = 0;
      for (const p of projects) {
        const camps = await db.getCampaignsByProjectId(p.id).catch(() => []);
        totalCampaigns += camps.length;
      }

      let scoreStats = { totalScored: 0, avgScore: 0, winners: 0, topScore: 0 };
      let patternStats = { total: 0, approved: 0 };
      let learningStats = { total: 0, niches: 0, platforms: 0 };
      let mlStats = { totalSamples: 0, trainSamples: 0 };

      if (pool!) {
        try {
          const sc: any = (await pool!.query(`SELECT COUNT(*) as n, AVG(score_total) as avg, MAX(score_total) as top, SUM(is_winner) as w FROM campaign_scores`)).rows[0];
          scoreStats = { totalScored: sc?.n || 0, avgScore: +(sc?.avg || 0).toFixed(1), winners: sc?.w || 0, topScore: +(sc?.top || 0).toFixed(1) };

          const pt: any = (await pool!.query(`SELECT COUNT(*) as n, SUM(approved_by_admin) as ap FROM winner_patterns WHERE status='active'`)).rows[0];
          patternStats = { total: pt?.n || 0, approved: pt?.ap || 0 };

          const lb: any = (await pool!.query(`SELECT COUNT(*) as n, COUNT(DISTINCT niche) as ni, COUNT(DISTINCT platform) as pl FROM learning_base`)).rows[0];
          learningStats = { total: lb?.n || 0, niches: lb?.ni || 0, platforms: lb?.pl || 0 };

          const ml: any = (await pool!.query(`SELECT COUNT(*) as n, SUM(CASE WHEN split_group='train' THEN 1 ELSE 0 END) as tr FROM ml_dataset`)).rows[0];
          mlStats = { totalSamples: ml?.n || 0, trainSamples: ml?.tr || 0 };
        } catch {}
      }

      return {
        users: users.length,
        projects: projects.length,
        campaigns: totalCampaigns,
        scoreStats,
        patternStats,
        learningStats,
        mlStats,
        mlReadiness: mlStats.totalSamples >= 100 ? "ready" : mlStats.totalSamples >= 30 ? "preparing" : "collecting",
      };
    }),

  // ── 12. EXPORTAR DATASET ML ───────────────────────────────────────────────
  exportMLDataset: adminProcedure
    .input(z.object({ splitGroup: z.enum(["all", "train", "test"]).default("all") }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return { dataset: [], count: 0 };
      const where = input.splitGroup !== "all" ? `WHERE split_group='${input.splitGroup}'` : "";
      try {
        const rows: any[] = (await pool!.query(`SELECT * FROM ml_dataset ${where} ORDER BY created_at DESC LIMIT 1000`)).rows;
        return { dataset: rows, count: rows.length };
      } catch { return { dataset: [], count: 0 }; }
    }),

  // ── 13. BUSCAR RECOMENDAÇÃO DA LEARNING BASE (usado no gerador) ───────────
  // Este endpoint é usado pelo gerador de campanhas para sugerir parâmetros
  getRecommendation: t.procedure.use(({ ctx, next }) => next({ ctx }))  // público para usuários autenticados
    .input(z.object({
      platform:  z.string(),
      objective: z.string(),
      niche:     z.string().default("geral"),
    }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return null;
      try {
        // Tenta nicho específico, senão fallback para geral
        let rows: any[] = (await pool!.query(
          `SELECT * FROM learning_base WHERE platform=$1 AND objective=$2 AND niche=$3 LIMIT 1`,
          [input.platform, input.objective, input.niche]
        )).rows;
        if (rows.length === 0) {
          rows = (await pool!.query(
            `SELECT * FROM learning_base WHERE platform=$1 AND objective=$2 AND niche='geral' LIMIT 1`,
            [input.platform, input.objective]
          )).rows;
        }
        if (rows.length === 0) return null;
        const entry = rows[0];
        return buildRecommendedTemplate(entry, input.platform, input.objective, input.niche);
      } catch { return null; }
    }),

  // ── 14. LOG DE AUDITORIA ─────────────────────────────────────────────────
  getIntelligenceLog: adminProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const pool = await getPool();
      if (!pool) return { logs: [] };
      try {
        const logs: any[] = (await pool!.query(
          `SELECT * FROM intelligence_log ORDER BY created_at DESC LIMIT $1`,
          [input.limit]
        )).rows;
        return { logs };
      } catch { return { logs: [] }; }
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

async function logAction(
  adminId: number, action: string, entityType: string,
  entityId: number, payload: any, result: string
) {
  try {
    const pool = await getPool();
    if (pool!) {
      await pool!.query(
        `INSERT INTO intelligence_log (admin_id, action, entity_type, entity_id, payload, result) VALUES ($1,$2,$3,$4,$5,$6)`,
        [adminId, action, entityType, entityId, JSON.stringify(payload), result]
      );
    }
  } catch {}
}

function countBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const v = item[key] || "unknown";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function safeJsonParse(s: any, fallback: any) {
  try { return JSON.parse(s || "null") ?? fallback; } catch { return fallback; }
}
