/**
 * autonomousAgent.ts
 *
 * Agente Autônomo MECPro — cérebro independente para monitorar,
 * avaliar e otimizar campanhas sem depender exclusivamente do Gemini.
 *
 * Modos de operação (AUTONOMOUS_AGENT_MODE):
 *   observe  → analisa e registra, mas não executa ações nas APIs (padrão)
 *   semi     → analisa, executa ações e notifica o usuário por email
 *   active   → totalmente autônomo, executa ações sem aprovação
 *
 * LLM principal: Claude API (ANTHROPIC_API_KEY)
 * Fallback:      Gemini (gemini())
 */

import log from "./_core/logger";
import * as db from "./db";
import {
  calculateScore,
  buildAutoRecommendation,
  type CampaignContext,
  type CampaignMetrics,
  type ScoreBreakdown,
} from "./campaignIntelligenceEngine";
import { gemini, fetchMetaInsightsBenchmarks } from "./ai";
import { ENV } from "./_core/env";

// ─── Config ──────────────────────────────────────────────────────────────────

const MODE = (process.env.AUTONOMOUS_AGENT_MODE || "observe") as
  "observe" | "semi" | "active";

const SCORE_PAUSE_THRESHOLD  = Number(process.env.AGENT_PAUSE_THRESHOLD  || 35);
const SCORE_SCALE_THRESHOLD  = Number(process.env.AGENT_SCALE_THRESHOLD  || 78);
const BUDGET_SCALE_MULTIPLIER = Number(process.env.AGENT_SCALE_MULTIPLIER || 1.3);
const MAX_CAMPAIGNS_PER_RUN   = Number(process.env.AGENT_MAX_CAMPAIGNS    || 20);

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AgentAction =
  | "pause_campaign"
  | "adjust_budget"
  | "suggest_creative"
  | "scale_budget"
  | "no_action";

interface AgentDecision {
  campaignId:    number;
  projectId:     number;
  userId:        number;
  platform:      string;
  action:        AgentAction;
  reason:        string;
  details:       string;
  score:         number;
  metrics:       CampaignMetrics | null;
  scoreBreakdown: ScoreBreakdown | null;
  llmUsed:       "claude" | "gemini" | "deterministic";
  executedAt:    Date;
  executed:      boolean;
  error?:        string;
}

// ─── LLM: Claude como principal ──────────────────────────────────────────────

async function askClaude(prompt: string, systemPrompt?: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-5",
        max_tokens: 1024,
        system:     systemPrompt || AGENT_SYSTEM_PROMPT,
        messages:   [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;
    const data: any = await res.json();
    return data.content?.[0]?.text || null;
  } catch {
    return null;
  }
}

async function askLLM(prompt: string): Promise<{ text: string; llm: "claude" | "gemini" }> {
  // Tenta Claude primeiro
  const claudeResp = await askClaude(prompt);
  if (claudeResp) return { text: claudeResp, llm: "claude" };

  // Fallback para Gemini
  log.info("agent", "Claude indisponível — usando Gemini como fallback");
  const geminiResp = await gemini(prompt, { temperature: 0.3 });
  return { text: geminiResp, llm: "gemini" };
}

const AGENT_SYSTEM_PROMPT = `Você é o MECPro Autonomous Agent, um especialista em otimização de campanhas de marketing digital para o mercado brasileiro.
Sua função é analisar métricas de campanhas e recomendar ações precisas e acionáveis.
Sempre responda em JSON válido sem markdown. Seja direto, objetivo e baseado em dados.`;

// ─── Coleta de métricas reais ─────────────────────────────────────────────────

async function fetchCampaignMetrics(
  campaign: any,
  userId: number,
): Promise<CampaignMetrics | null> {

  if (campaign.platform === "meta" || campaign.platform === "both") {
    try {
      const integration = await db.getApiIntegration(userId, "meta");
      const token     = (integration as any)?.accessToken;
      const accountId = (integration as any)?.adAccountId;

      if (!token || !accountId) return null;

      // Busca insights reais do Meta Ads da campanha específica
      if (campaign.metaCampaignId) {
        const fields = "impressions,clicks,spend,cpc,cpm,ctr,actions,reach";
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${campaign.metaCampaignId}/insights?fields=${fields}&date_preset=last_30d&access_token=${token}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const data: any = await res.json();
        const m = data?.data?.[0];

        if (m) {
          const leads = m.actions?.find((a: any) => a.action_type === "lead")?.value || 0;
          const conversions = m.actions?.find((a: any) =>
            ["purchase", "complete_registration"].includes(a.action_type)
          )?.value || 0;

          return {
            impressions: Number(m.impressions || 0),
            clicks:      Number(m.clicks      || 0),
            ctr:         Number(m.ctr         || 0),
            cpc:         Number(m.cpc         || 0),
            cpm:         Number(m.cpm         || 0),
            spend:       Number(m.spend       || 0),
            leads:       Number(leads),
            conversions: Number(conversions),
            reach:       Number(m.reach       || 0),
          };
        }
      }

      // Fallback: métricas gerais da conta
      const benchmarks = await fetchMetaInsightsBenchmarks(token, accountId);
      if (benchmarks) {
        return {
          impressions: benchmarks.impressions || 0,
          clicks:      benchmarks.clicks      || 0,
          ctr:         benchmarks.ctr         || 0,
          cpc:         benchmarks.cpc         || 0,
          cpm:         benchmarks.cpm         || 0,
          spend:       benchmarks.spend       || 0,
          leads:       benchmarks.leads       || 0,
        };
      }
    } catch (e: any) {
      log.warn("agent", "Erro ao buscar métricas Meta", { message: e.message });
    }
  }

  return null;
}

// ─── Motor de decisão determinístico ─────────────────────────────────────────
// Roda sem LLM — usa regras puras baseadas no score e métricas

function deterministicDecision(
  score: ScoreBreakdown,
  metrics: CampaignMetrics,
  campaign: any,
): { action: AgentAction; reason: string } {

  // Campanha péssima: pausa imediata
  if (score.total < SCORE_PAUSE_THRESHOLD && metrics.spend > 50) {
    return {
      action: "pause_campaign",
      reason: `Score ${score.total}/100 abaixo do limite de ${SCORE_PAUSE_THRESHOLD}. Gasto R$${metrics.spend.toFixed(2)} sem resultado satisfatório. ${score.keyInsights.join(" | ")}`,
    };
  }

  // Excelente performance com orçamento disponível: escalar
  const budgetTotal = campaign.suggestedBudgetMonthly || campaign.suggestedBudgetDaily * 30 || 999999;
  if (score.total >= SCORE_SCALE_THRESHOLD && metrics.spend < budgetTotal * 0.7) {
    return {
      action: "scale_budget",
      reason: `Score excelente ${score.total}/100 com orçamento subutilizado (${Math.round((metrics.spend / budgetTotal) * 100)}% usado). Potencial de escala detectado.`,
    };
  }

  // CTR baixo: sugerir criativo
  if (score.ctr < 3 && metrics.impressions > 5000) {
    return {
      action: "suggest_creative",
      reason: `CTR de ${metrics.ctr.toFixed(2)}% está abaixo do benchmark após ${metrics.impressions.toLocaleString("pt-BR")} impressões. Criativo precisa ser renovado.`,
    };
  }

  // CPC alto: ajustar orçamento/lance
  if (score.cpc < 3 && metrics.spend > 30) {
    return {
      action: "adjust_budget",
      reason: `CPC R$${metrics.cpc.toFixed(2)} acima do benchmark. Ajuste de lance ou segmentação pode melhorar eficiência.`,
    };
  }

  return {
    action: "no_action",
    reason: `Score ${score.total}/100 dentro dos parâmetros aceitáveis. Monitoramento contínuo.`,
  };
}

// ─── Ação: Pausar campanha na Meta ───────────────────────────────────────────

async function executePauseCampaign(campaign: any, userId: number): Promise<boolean> {
  if (!campaign.metaCampaignId) {
    log.warn("agent", "Pausar: sem metaCampaignId", { campaignId: campaign.id });
    return false;
  }
  try {
    const integration = await db.getApiIntegration(userId, "meta");
    const token = (integration as any)?.accessToken;
    if (!token) return false;

    const res = await fetch(`https://graph.facebook.com/v19.0/${campaign.metaCampaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED", access_token: token }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (data.error) {
      log.warn("agent", "Erro ao pausar campanha Meta", { error: data.error.message });
      return false;
    }
    log.info("agent", "✅ Campanha pausada via Meta API", { metaId: campaign.metaCampaignId });
    return true;
  } catch (e: any) {
    log.warn("agent", "Exceção ao pausar", { message: e.message });
    return false;
  }
}

// ─── Ação: Ajustar orçamento na Meta ─────────────────────────────────────────

async function executeAdjustBudget(
  campaign: any,
  userId: number,
  newDailyBudgetBRL: number,
): Promise<boolean> {
  if (!campaign.metaAdSetId) {
    log.warn("agent", "AjustarOrçamento: sem metaAdSetId", { campaignId: campaign.id });
    return false;
  }
  try {
    const integration = await db.getApiIntegration(userId, "meta");
    const token = (integration as any)?.accessToken;
    if (!token) return false;

    const dailyBudgetCents = Math.round(newDailyBudgetBRL * 100);
    const res = await fetch(`https://graph.facebook.com/v19.0/${campaign.metaAdSetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_budget: dailyBudgetCents, access_token: token }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (data.error) {
      log.warn("agent", "Erro ao ajustar orçamento Meta", { error: data.error.message });
      return false;
    }
    log.info("agent", "✅ Orçamento ajustado via Meta API", {
      metaAdSetId: campaign.metaAdSetId,
      newBudgetBRL: newDailyBudgetBRL,
    });
    return true;
  } catch (e: any) {
    log.warn("agent", "Exceção ao ajustar orçamento", { message: e.message });
    return false;
  }
}

// ─── Análise de campanha individual ──────────────────────────────────────────

async function analyzeCampaign(
  campaign: any,
  userId: number,
): Promise<AgentDecision> {
  const base: Omit<AgentDecision, "action" | "reason" | "details" | "score" | "scoreBreakdown" | "llmUsed" | "executed"> = {
    campaignId:  campaign.id,
    projectId:   campaign.projectId,
    userId,
    platform:    campaign.platform,
    metrics:     null,
    executedAt:  new Date(),
  };

  // 1. Coletar métricas reais
  const metrics = await fetchCampaignMetrics(campaign, userId);
  if (!metrics || metrics.impressions < 100) {
    log.info("agent", "Dados insuficientes — pulando campanha", {
      campaignId: campaign.id,
      impressions: metrics?.impressions || 0,
    });
    return {
      ...base,
      metrics,
      scoreBreakdown: null,
      action:   "no_action",
      reason:   "Dados insuficientes para análise (menos de 100 impressões).",
      details:  "",
      score:    0,
      llmUsed:  "deterministic",
      executed: false,
    };
  }

  // 2. Calcular score
  const clientProfile = await db.getClientProfile(campaign.projectId).catch(() => null) as any;
  const context: CampaignContext = {
    campaignId:   campaign.id,
    userId,
    projectId:    campaign.projectId,
    name:         campaign.name,
    platform:     campaign.platform,
    objective:    campaign.objective,
    niche:        clientProfile?.niche || "geral",
    budgetTotal:  campaign.suggestedBudgetMonthly || (campaign.suggestedBudgetDaily || 0) * 30,
    durationDays: campaign.durationDays,
    creatives:    (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })(),
    adSets:       (() => { try { return JSON.parse(campaign.adSets    || "[]"); } catch { return []; } })(),
  };

  const scoreBreakdown = calculateScore(context, metrics);

  // 3. Decisão determinística (sem LLM)
  const { action, reason } = deterministicDecision(scoreBreakdown, metrics, campaign);

  // 4. Se ação relevante, enriquecer com LLM
  let details  = reason;
  let llmUsed: "claude" | "gemini" | "deterministic" = "deterministic";

  if (action !== "no_action") {
    const prompt = `Campanha: "${campaign.name}" | Plataforma: ${campaign.platform} | Objetivo: ${campaign.objective} | Nicho: ${context.niche}

Score: ${scoreBreakdown.total}/100
Métricas: CTR ${metrics.ctr.toFixed(2)}% | CPC R$${metrics.cpc.toFixed(2)} | CPM R$${metrics.cpm.toFixed(2)} | Gasto R$${metrics.spend.toFixed(2)} | Impressões ${metrics.impressions.toLocaleString("pt-BR")}
Insights: ${scoreBreakdown.keyInsights.join(" | ")}
Ação sugerida: ${action}
Motivo: ${reason}

Forneça recomendações específicas e acionáveis para ${action === "pause_campaign" ? "pausar e reestruturar" : action === "scale_budget" ? "escalar com segurança" : action === "suggest_creative" ? "criar novos criativos" : "ajustar o orçamento"} esta campanha. Responda em JSON: {"details": "explicação detalhada", "steps": ["passo 1", "passo 2", "passo 3"]}`;

    try {
      const { text, llm } = await askLLM(prompt);
      llmUsed = llm;
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.details) {
        details = `${parsed.details} | Próximos passos: ${(parsed.steps || []).join("; ")}`;
      }
    } catch {
      // Mantém details determinístico se LLM falhar
    }
  }

  return {
    ...base,
    metrics,
    scoreBreakdown,
    action,
    reason,
    details,
    score:    scoreBreakdown.total,
    llmUsed,
    executed: false,
  };
}

// ─── Executar ação ─────────────────────────────────────────────────────────────

async function executeDecision(
  decision: AgentDecision,
  campaign: any,
): Promise<boolean> {
  if (MODE === "observe") {
    log.info("agent", `[OBSERVE] Ação não executada: ${decision.action}`, {
      campaignId: decision.campaignId,
      reason:     decision.reason.slice(0, 100),
    });
    return false;
  }

  log.info("agent", `[${MODE.toUpperCase()}] Executando: ${decision.action}`, {
    campaignId: decision.campaignId,
  });

  switch (decision.action) {
    case "pause_campaign":
      return executePauseCampaign(campaign, decision.userId);

    case "scale_budget": {
      const currentDaily = campaign.suggestedBudgetDaily || 50;
      const newDaily = Math.round(currentDaily * BUDGET_SCALE_MULTIPLIER);
      return executeAdjustBudget(campaign, decision.userId, newDaily);
    }

    case "adjust_budget": {
      // Reduz 20% quando CPC alto
      const currentDaily = campaign.suggestedBudgetDaily || 50;
      const newDaily = Math.round(currentDaily * 0.8);
      return executeAdjustBudget(campaign, decision.userId, newDaily);
    }

    case "suggest_creative":
    case "no_action":
    default:
      return false;
  }
}

// ─── Log estruturado da decisão ───────────────────────────────────────────────

function logDecision(decision: AgentDecision) {
  const emoji: Record<AgentAction, string> = {
    pause_campaign:  "⏸️",
    adjust_budget:   "💰",
    suggest_creative: "🎨",
    scale_budget:    "📈",
    no_action:       "✅",
  };

  log.info("agent", `${emoji[decision.action]} Decisão: ${decision.action}`, {
    campaignId: decision.campaignId,
    platform:   decision.platform,
    score:      decision.score,
    llm:        decision.llmUsed,
    executed:   decision.executed,
    reason:     decision.reason.slice(0, 150),
    metrics:    decision.metrics ? {
      ctr:   decision.metrics.ctr.toFixed(2) + "%",
      cpc:   "R$" + decision.metrics.cpc.toFixed(2),
      spend: "R$" + decision.metrics.spend.toFixed(2),
    } : null,
  });
}

// ─── Ponto de entrada principal ───────────────────────────────────────────────

export async function runAutonomousAgent(
  campaignId?: number,
  projectId?:  number,
  userId?:     number,
): Promise<AgentDecision[]> {
  log.info("agent", `🤖 MECPro Autonomous Agent iniciado`, {
    mode:          MODE,
    llmPrincipal:  process.env.ANTHROPIC_API_KEY ? "Claude" : "Gemini",
    campaignId,
    projectId,
  });

  const decisions: AgentDecision[] = [];

  try {
    // Busca campanhas a analisar
    let campaignsToAnalyze: any[] = [];

    if (campaignId) {
      // Campanha específica
      const c = await db.getCampaignById(campaignId);
      if (c) campaignsToAnalyze = [c];
    } else if (projectId) {
      // Todas do projeto
      campaignsToAnalyze = await db.getCampaignsByProjectId(projectId) as any[];
    } else {
      log.warn("agent", "Nenhum campaignId ou projectId fornecido — abortando");
      return [];
    }

    // Filtra apenas campanhas publicadas (têm dados reais nas APIs)
    const published = campaignsToAnalyze
      .filter((c: any) => c.publishStatus === "success" || c.metaCampaignId)
      .slice(0, MAX_CAMPAIGNS_PER_RUN);

    log.info("agent", `Analisando ${published.length} campanha(s) publicada(s)`);

    // Resolve userId a partir do projeto se não fornecido
    const resolvedUserId = userId || (() => {
      // Tenta pegar do primeiro projeto
      return null;
    })();

    for (const campaign of published) {
      // Descobre userId via projeto
      const project = await db.getProjectById(campaign.projectId).catch(() => null) as any;
      const uid = resolvedUserId || project?.userId;
      if (!uid) {
        log.warn("agent", "userId não encontrado para campanha", { campaignId: campaign.id });
        continue;
      }

      try {
        const decision = await analyzeCampaign(campaign, uid);

        // Executa a ação se modo permite
        if (decision.action !== "no_action") {
          decision.executed = await executeDecision(decision, campaign);
        }

        logDecision(decision);
        decisions.push(decision);

        // Pequena pausa entre campanhas para não sobrecarregar APIs
        await new Promise(r => setTimeout(r, 500));

      } catch (err: any) {
        log.warn("agent", "Erro ao analisar campanha", {
          campaignId: campaign.id,
          error: err?.message?.slice(0, 100),
        });
      }
    }

  } catch (err: any) {
    log.warn("agent", "Erro geral no agente", { error: err?.message });
  }

  const summary = {
    total:     decisions.length,
    paused:    decisions.filter(d => d.action === "pause_campaign").length,
    scaled:    decisions.filter(d => d.action === "scale_budget").length,
    adjusted:  decisions.filter(d => d.action === "adjust_budget").length,
    creatives: decisions.filter(d => d.action === "suggest_creative").length,
    executed:  decisions.filter(d => d.executed).length,
  };

  log.info("agent", "🤖 Agente concluído", summary);
  return decisions;
}

// ─── Execução para campanha única (helper para o router) ─────────────────────

export async function runAgentForCampaign(
  campaignId: number,
  userId: number,
): Promise<AgentDecision | null> {
  const results = await runAutonomousAgent(campaignId, undefined, userId);
  return results[0] || null;
}

// ─── Execução para projeto completo ──────────────────────────────────────────

export async function runAgentForProject(
  projectId: number,
  userId: number,
): Promise<AgentDecision[]> {
  return runAutonomousAgent(undefined, projectId, userId);
}
