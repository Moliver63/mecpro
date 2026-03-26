/**
 * campaignIntelligenceEngine.ts
 * Motor de inteligência de campanhas do MECProAI.
 *
 * CAMADAS:
 *   Camada 1 — Score ponderado e ranking
 *   Camada 2 — Aprendizado estatístico (correlações, clusters, padrões por nicho)
 *   Camada 3 — Dataset ML (features normalizadas, preparado para treino futuro)
 *
 * Não tem dependência externa além do que já existe no projeto.
 * Usa gemini() para explicação qualitativa dos padrões.
 */

import { log } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignMetrics {
  impressions:  number;
  clicks:       number;
  ctr:          number;   // %
  cpc:          number;   // R$
  cpm:          number;   // R$
  spend:        number;   // R$
  roas?:        number;
  conversions?: number;
  leads?:       number;
  reach?:       number;
  frequency?:   number;
}

export interface CampaignContext {
  campaignId:   number;
  userId:       number;
  projectId:    number;
  name:         string;
  platform:     string;
  objective:    string;
  niche?:       string;
  segment?:     string;
  budgetTotal?: number;
  durationDays?: number;
  creatives?:   any[];
  adSets?:      any[];
  aiResponse?:  string;
}

export interface ScoreBreakdown {
  total:       number;   // 0–100
  ctr:         number;   // 0–10
  cpc:         number;   // 0–10
  cpm:         number;   // 0–10
  roas:        number;   // 0–10
  conversion:  number;   // 0–10
  creative:    number;   // 0–10
  consistency: number;   // 0–10
  scalability: number;   // 0–10
  explanation: string;
}

export interface WinnerParameters {
  // Criativo
  adFormat:        string;
  headlinePattern: string;
  copyStructure:   string;
  ctaType:         string;
  mainPromise:     string;
  triggerTypes:    string[];
  mediaTypes:      string[];
  numVariations:   number;
  // Público
  ageMin:          number;
  ageMax:          number;
  genders:         string[];
  audienceSize:    string;
  // Veiculação
  placements:      string[];
  biddingStrategy: string;
  budgetRange:     string;
  durationRange:   string;
  // Contexto
  whyItWon:        string;
  keyFactors:      string[];
  recommendations: string[];
}

export interface LearningUpdate {
  platform:    string;
  objective:   string;
  niche:       string;
  newScore:    number;
  newMetrics:  CampaignMetrics;
  newPattern:  WinnerParameters;
}

// ─────────────────────────────────────────────────────────────────────────────
// PESOS PADRÃO DO MOTOR (configuráveis via admin no futuro)
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_WEIGHTS = {
  ctr:         0.25,   // Taxa de clique — mais impactante
  cpc:         0.20,   // Custo por clique — eficiência
  roas:        0.18,   // Retorno sobre ad spend
  conversion:  0.15,   // Taxa de conversão
  cpm:         0.10,   // Custo por mil — alcance eficiente
  creative:    0.07,   // Qualidade do criativo (inferida)
  consistency: 0.03,   // Consistência de performance
  scalability: 0.02,   // Potencial de escala
};

// Benchmarks de mercado (BR, 2024) — base para normalização
export const BENCHMARKS = {
  meta: {
    leads:      { ctr: 1.5, cpc: 3.0, cpm: 12.0, convRate: 4.0 },
    traffic:    { ctr: 1.2, cpc: 2.5, cpm: 10.0, convRate: 2.0 },
    sales:      { ctr: 0.9, cpc: 4.0, cpm: 14.0, convRate: 3.5 },
    engagement: { ctr: 2.5, cpc: 1.5, cpm: 8.0,  convRate: 1.0 },
    branding:   { ctr: 0.5, cpc: 5.0, cpm: 6.0,  convRate: 0.5 },
  },
  google: {
    leads:      { ctr: 4.0, cpc: 5.0, cpm: 20.0, convRate: 6.0 },
    traffic:    { ctr: 3.5, cpc: 3.0, cpm: 15.0, convRate: 3.0 },
    sales:      { ctr: 2.5, cpc: 6.0, cpm: 25.0, convRate: 5.0 },
    engagement: { ctr: 2.0, cpc: 2.0, cpm: 10.0, convRate: 2.0 },
    branding:   { ctr: 0.8, cpc: 8.0, cpm: 8.0,  convRate: 1.0 },
  },
  tiktok: {
    leads:      { ctr: 1.8, cpc: 2.0, cpm: 8.0,  convRate: 3.0 },
    traffic:    { ctr: 2.0, cpc: 1.5, cpm: 6.0,  convRate: 2.5 },
    sales:      { ctr: 1.5, cpc: 2.5, cpm: 10.0, convRate: 2.0 },
    engagement: { ctr: 3.0, cpc: 0.8, cpm: 4.0,  convRate: 1.0 },
    branding:   { ctr: 1.0, cpc: 3.0, cpm: 5.0,  convRate: 0.5 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 1: SCORE PONDERADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza uma métrica em relação ao benchmark do mercado.
 * Para CTR/ROAS: maior = melhor → score alto
 * Para CPC/CPM:  menor = melhor → score alto quando abaixo do benchmark
 */
function normalizeBenchmark(
  value: number,
  benchmark: number,
  higherIsBetter: boolean,
  floor = 0
): number {
  if (value <= 0) return floor;
  if (higherIsBetter) {
    // Score 10 = 2x benchmark; score 5 = benchmark; score 0 = zero
    const ratio = value / benchmark;
    return Math.min(10, Math.max(0, ratio * 5));
  } else {
    // Score 10 = 0 custo; score 5 = benchmark; score 0 = 3x benchmark
    const ratio = benchmark / value;
    return Math.min(10, Math.max(0, ratio * 5));
  }
}

/**
 * Avalia a qualidade do criativo com base nos dados disponíveis.
 * Heurística: diversidade de formatos, presença de hook, presença de CTA forte.
 */
function evaluateCreativeQuality(context: CampaignContext): number {
  let score = 5; // neutro
  try {
    const creatives = context.creatives ?? [];
    if (creatives.length === 0) return 4;
    if (creatives.length >= 3) score += 1;
    if (creatives.length >= 5) score += 1;

    const aiResp = context.aiResponse ? JSON.parse(context.aiResponse) : {};
    const hooks = aiResp?.hooks ?? [];
    if (hooks.length > 0) score += 1;

    const cr = creatives[0] ?? {};
    if (cr.hook && cr.hook.length > 10)     score += 0.5;
    if (cr.copy && cr.copy.length > 30)     score += 0.5;
    if (cr.headline && cr.headline.length > 5) score += 0.5;
    if (cr.cta && cr.cta !== "LEARN_MORE")  score += 0.5;

    return Math.min(10, Math.max(0, score));
  } catch {
    return 5;
  }
}

/**
 * Score de consistência: baseado na relação CTR/CPC.
 * Campanhas com CTR alto E CPC baixo têm consistência alta.
 */
function evaluateConsistency(m: CampaignMetrics, benchmark: { ctr: number; cpc: number }): number {
  if (m.impressions < 100) return 3; // dados insuficientes
  const ctrRatio = m.ctr / benchmark.ctr;
  const cpcRatio = benchmark.cpc / (m.cpc || 99);
  return Math.min(10, ((ctrRatio + cpcRatio) / 2) * 5);
}

/**
 * Score de escalabilidade: baseado no CPM e frequência.
 * CPM baixo + frequência controlada = maior potencial de escala.
 */
function evaluateScalability(m: CampaignMetrics, benchmark: { cpm: number }): number {
  if (m.impressions < 500) return 3;
  const cpmScore = normalizeBenchmark(m.cpm, benchmark.cpm, false);
  const freqScore = m.frequency && m.frequency < 3 ? 8 : m.frequency && m.frequency < 5 ? 5 : 3;
  return Math.min(10, (cpmScore + freqScore) / 2);
}

export function calculateScore(
  context: CampaignContext,
  metrics: CampaignMetrics,
  weights = DEFAULT_WEIGHTS
): ScoreBreakdown {
  const platform  = (context.platform  || "meta").toLowerCase() as keyof typeof BENCHMARKS;
  const objective = (context.objective || "traffic").toLowerCase() as keyof (typeof BENCHMARKS)["meta"];

  const bPlatform = BENCHMARKS[platform] ?? BENCHMARKS.meta;
  const bench     = (bPlatform as any)[objective] ?? bPlatform.traffic;

  // Sub-scores (0–10)
  const sCtr  = normalizeBenchmark(metrics.ctr, bench.ctr, true);
  const sCpc  = normalizeBenchmark(metrics.cpc, bench.cpc, false);
  const sCpm  = normalizeBenchmark(metrics.cpm, bench.cpm, false);
  const sRoas = metrics.roas ? normalizeBenchmark(metrics.roas, 3.0, true) : 5;
  const sConv = metrics.conversions && metrics.impressions > 0
    ? normalizeBenchmark((metrics.conversions / metrics.impressions) * 100, bench.convRate, true)
    : metrics.leads && metrics.impressions > 0
      ? normalizeBenchmark((metrics.leads / metrics.impressions) * 100, bench.convRate * 0.5, true)
      : 4;
  const sCreative    = evaluateCreativeQuality(context);
  const sConsistency = evaluateConsistency(metrics, bench);
  const sScalability = evaluateScalability(metrics, bench);

  const total = Math.round(
    sCtr         * weights.ctr         * 100 +
    sCpc         * weights.cpc         * 100 +
    sCpm         * weights.cpm         * 100 +
    sRoas        * weights.roas        * 100 +
    sConv        * weights.conversion  * 100 +
    sCreative    * weights.creative    * 100 +
    sConsistency * weights.consistency * 100 +
    sScalability * weights.scalability * 100
  );

  // Explicação automática
  const factors = [
    { label: "CTR",         score: sCtr,         bench: bench.ctr,   actual: metrics.ctr,   unit: "%" },
    { label: "CPC",         score: sCpc,         bench: bench.cpc,   actual: metrics.cpc,   unit: "R$", lower: true },
    { label: "CPM",         score: sCpm,         bench: bench.cpm,   actual: metrics.cpm,   unit: "R$", lower: true },
    { label: "ROAS",        score: sRoas,        bench: 3.0,         actual: metrics.roas ?? 0, unit: "x" },
    { label: "Conversão",   score: sConv,        bench: bench.convRate, actual: (metrics.conversions ?? metrics.leads ?? 0), unit: "" },
  ].sort((a, b) => b.score - a.score);

  const topFactor = factors[0];
  const explanation =
    `Score ${total}/100. Fator decisivo: ${topFactor.label} ` +
    `(${topFactor.score.toFixed(1)}/10). ` +
    (topFactor.actual > 0
      ? `Valor real ${topFactor.actual.toFixed(2)}${topFactor.unit} vs benchmark ${topFactor.bench}${topFactor.unit}.`
      : "Dados insuficientes para esta métrica.") +
    ` Pesos: CTR ${(weights.ctr*100).toFixed(0)}%, CPC ${(weights.cpc*100).toFixed(0)}%, ROAS ${(weights.roas*100).toFixed(0)}%.`;

  return {
    total: Math.min(100, Math.max(0, total)),
    ctr: +sCtr.toFixed(2),
    cpc: +sCpc.toFixed(2),
    cpm: +sCpm.toFixed(2),
    roas: +sRoas.toFixed(2),
    conversion: +sConv.toFixed(2),
    creative: +sCreative.toFixed(2),
    consistency: +sConsistency.toFixed(2),
    scalability: +sScalability.toFixed(2),
    explanation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE PARÂMETROS VENCEDORES
// ─────────────────────────────────────────────────────────────────────────────

function detectBudgetRange(budget?: number): string {
  if (!budget || budget === 0) return "unknown";
  if (budget < 100)  return "low";
  if (budget < 500)  return "mid";
  if (budget < 2000) return "high";
  return "premium";
}

function detectDurationRange(days?: number): string {
  if (!days || days === 0) return "unknown";
  if (days < 7)  return "short";
  if (days < 30) return "mid";
  return "long";
}

function detectTriggers(text: string): string[] {
  const triggers: string[] = [];
  const t = text.toLowerCase();
  if (t.includes("grátis") || t.includes("gratis") || t.includes("free")) triggers.push("gratuidade");
  if (t.includes("urgente") || t.includes("agora") || t.includes("hoje") || t.includes("último")) triggers.push("urgência");
  if (t.includes("resultado") || t.includes("comprovado") || t.includes("testado")) triggers.push("prova_resultado");
  if (t.includes("depoimento") || t.includes("cliente") || t.includes("avaliação")) triggers.push("prova_social");
  if (t.includes("exclusivo") || t.includes("limitado") || t.includes("apenas")) triggers.push("escassez");
  if (t.includes("garantia") || t.includes("risco zero") || t.includes("devolvemos")) triggers.push("garantia");
  if (t.includes("desconto") || t.includes("promoção") || t.includes("%") || t.includes("off")) triggers.push("desconto");
  if (t.includes("especialista") || t.includes("autoridade") || t.includes("anos de")) triggers.push("autoridade");
  return triggers.length > 0 ? triggers : ["informacional"];
}

function detectCopyStructure(creatives: any[]): string {
  if (!creatives || creatives.length === 0) return "unknown";
  const cr = creatives[0];
  const hasHook = !!(cr?.hook && cr.hook.length > 5);
  const hasBenefit = !!(cr?.copy && cr.copy.length > 20);
  const hasCta = !!(cr?.cta);
  if (hasHook && hasBenefit && hasCta) return "hook_benefit_cta";
  if (hasHook && hasCta)  return "hook_cta";
  if (hasBenefit && hasCta) return "benefit_cta";
  return "basic";
}

function detectAdFormat(creatives: any[], aiResp: any): string {
  const types = (creatives ?? []).map((c: any) => (c?.format || c?.type || "").toLowerCase());
  if (types.includes("video")) return "video";
  if (types.includes("carousel") || types.includes("carrossel")) return "carousel";
  if (types.includes("reel") || types.includes("reels")) return "reels";
  if (types.includes("story") || types.includes("stories")) return "story";
  if ((aiResp?.campaignType || "").toLowerCase().includes("display")) return "display";
  if (types.includes("image") || types.length > 0) return "image";
  return "image";
}

export function extractWinnerParameters(
  context: CampaignContext,
  score: ScoreBreakdown,
  metrics: CampaignMetrics
): Omit<WinnerParameters, "whyItWon" | "recommendations"> {
  let creatives: any[] = [];
  let aiResp: any = {};
  let adSets: any[] = [];
  try { creatives = context.creatives ?? []; } catch {}
  try { aiResp = context.aiResponse ? JSON.parse(context.aiResponse) : {}; } catch {}
  try { adSets = context.adSets ?? []; } catch {}

  const cr = creatives[0] ?? {};
  const firstAdSet = adSets[0] ?? {};
  const targeting = firstAdSet?.targeting ?? {};

  const allText = [cr.hook, cr.copy, cr.headline, cr.cta, aiResp?.strategy].filter(Boolean).join(" ");
  const triggers = detectTriggers(allText);

  // CTA
  const ctaRaw = (cr?.cta || aiResp?.cta || "LEARN_MORE").toUpperCase().replace(/[^A-Z_]/g, "_");

  // Headline pattern detection
  let headlinePattern = "direto";
  const hl = (cr?.headline || "").toLowerCase();
  if (hl.includes("como") || hl.includes("passo")) headlinePattern = "tutorial";
  else if (hl.includes("?")) headlinePattern = "pergunta";
  else if (hl.includes("!")) headlinePattern = "exclamação";
  else if (hl.includes("%") || hl.includes("grátis")) headlinePattern = "oferta";
  else if (hl.includes("você")) headlinePattern = "personalizado";

  // Faixa etária
  const ageMin = targeting?.age_min ?? firstAdSet?.age_min ?? 18;
  const ageMax = targeting?.age_max ?? firstAdSet?.age_max ?? 65;

  // Placements
  const placements: string[] = [];
  if (targeting?.facebook_positions) placements.push(...(targeting.facebook_positions).map((p: string) => `fb_${p}`));
  if (targeting?.instagram_positions) placements.push(...(targeting.instagram_positions).map((p: string) => `ig_${p}`));
  if (placements.length === 0) placements.push("auto");

  // Audience size
  const audienceSize = targeting?.custom_audiences?.length > 0 ? "custom"
    : targeting?.flexible_spec?.length > 0 ? "interest-based"
    : "broad";

  return {
    adFormat:        detectAdFormat(creatives, aiResp),
    headlinePattern,
    copyStructure:   detectCopyStructure(creatives),
    ctaType:         ctaRaw,
    mainPromise:     cr?.headline?.slice(0, 80) || aiResp?.campaignName?.slice(0, 80) || context.name.slice(0, 80),
    triggerTypes:    triggers,
    mediaTypes:      creatives.length > 0 ? [detectAdFormat(creatives, aiResp)] : ["image"],
    numVariations:   creatives.length || 1,
    ageMin:          Number(ageMin),
    ageMax:          Number(ageMax),
    genders:         targeting?.genders ?? ["all"],
    audienceSize,
    placements,
    biddingStrategy: firstAdSet?.bid_strategy ?? aiResp?.biddingStrategy ?? "LOWEST_COST_WITHOUT_CAP",
    budgetRange:     detectBudgetRange(context.budgetTotal),
    durationRange:   detectDurationRange(context.durationDays),
    keyFactors:      score.explanation.split(". ").filter(Boolean),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 2: APRENDIZADO ESTATÍSTICO
// Detecta correlações e atualiza a learning_base
// ─────────────────────────────────────────────────────────────────────────────

export function detectCorrelations(patterns: WinnerParameters[]): Array<{ feature: string; impact: number }> {
  if (patterns.length < 3) return [];

  const features: Record<string, { count: number; totalScore: number }> = {};

  for (const p of patterns) {
    const featureList = [
      `format:${p.adFormat}`,
      `cta:${p.ctaType}`,
      `structure:${p.copyStructure}`,
      `budget:${p.budgetRange}`,
      `duration:${p.durationRange}`,
      `audience:${p.audienceSize}`,
      ...p.triggerTypes.map(t => `trigger:${t}`),
      ...p.placements.slice(0, 2).map(pl => `placement:${pl}`),
    ];
    for (const f of featureList) {
      if (!features[f]) features[f] = { count: 0, totalScore: 0 };
      features[f].count++;
      features[f].totalScore += 80; // peso fixo — refinar com score real em v2
    }
  }

  return Object.entries(features)
    .map(([feature, data]) => ({
      feature,
      impact: +(data.count / patterns.length).toFixed(2), // frequência relativa 0–1
    }))
    .filter(c => c.impact >= 0.3)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20);
}

export function clusterCampaigns(
  campaigns: Array<{ context: CampaignContext; score: ScoreBreakdown; params: WinnerParameters }>
): Array<{ clusterId: string; count: number; avgScore: number; label: string }> {
  const buckets: Record<string, number[]> = {};

  for (const c of campaigns) {
    const key = `${c.context.platform}_${c.context.objective}_${c.params.adFormat}_${c.params.budgetRange}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(c.score.total);
  }

  return Object.entries(buckets)
    .map(([clusterId, scores]) => ({
      clusterId,
      count: scores.length,
      avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
      label: clusterId.replace(/_/g, " "),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

export function computeLearningUpdate(
  existing: any,
  newScore: number,
  newMetrics: CampaignMetrics,
  newPattern: WinnerParameters
): Partial<any> {
  const n = (existing?.sample_count ?? 0) + 1;
  const avg = (v: number, old: number) => +((old * (n - 1) + v) / n).toFixed(4);

  // Frequência de valores categóricos
  function updateTopList(existing: string, newVal: string): string {
    try {
      const list: Record<string, number> = JSON.parse(existing || "{}");
      list[newVal] = (list[newVal] || 0) + 1;
      return JSON.stringify(
        Object.fromEntries(Object.entries(list).sort((a, b) => b[1] - a[1]).slice(0, 5))
      );
    } catch {
      return JSON.stringify({ [newVal]: 1 });
    }
  }

  return {
    sample_count:    n,
    avg_score:       avg(newScore, existing?.avg_score ?? 0),
    best_score:      Math.max(existing?.best_score ?? 0, newScore),
    avg_ctr:         avg(newMetrics.ctr,  existing?.avg_ctr  ?? 0),
    avg_cpc:         avg(newMetrics.cpc,  existing?.avg_cpc  ?? 0),
    avg_cpm:         avg(newMetrics.cpm,  existing?.avg_cpm  ?? 0),
    avg_roas:        avg(newMetrics.roas ?? 0, existing?.avg_roas ?? 0),
    top_ad_formats:  updateTopList(existing?.top_ad_formats, newPattern.adFormat),
    top_cta_types:   updateTopList(existing?.top_cta_types, newPattern.ctaType),
    top_placements:  updateTopList(existing?.top_placements, (newPattern.placements[0] || "auto")),
    top_triggers:    updateTopList(existing?.top_triggers, (newPattern.triggerTypes[0] || "informacional")),
    top_budget_ranges: updateTopList(existing?.top_budget_ranges, newPattern.budgetRange),
    top_durations:   updateTopList(existing?.top_durations, newPattern.durationRange),
    version:         (existing?.version ?? 1) + 1,
    last_updated:    new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 3: FEATURES PARA ML
// ─────────────────────────────────────────────────────────────────────────────

export function buildMLFeatures(
  context: CampaignContext,
  params: WinnerParameters,
  score: ScoreBreakdown
): Record<string, any> {
  const allText = [params.mainPromise, params.headlinePattern, params.copyStructure].join(" ").toLowerCase();

  return {
    feature_platform:      context.platform,
    feature_objective:     context.objective,
    feature_niche:         context.niche || "geral",
    feature_ad_format:     params.adFormat,
    feature_age_range:     `${params.ageMin}-${params.ageMax}`,
    feature_budget_range:  params.budgetRange,
    feature_duration:      params.durationRange,
    feature_placement:     params.placements[0] || "auto",
    feature_bid_strategy:  params.biddingStrategy,
    feature_copy_length:   Math.min(1, (params.mainPromise?.length || 0) / 200),
    feature_num_creatives: Math.min(1, (params.numVariations || 1) / 10),
    feature_has_video:     params.adFormat === "video" || params.adFormat === "reels" ? 1 : 0,
    feature_has_carousel:  params.adFormat === "carousel" ? 1 : 0,
    feature_used_emoji:    /[^\x00-\x7F]/.test(allText) ? 1 : 0,
    feature_used_urgency:  params.triggerTypes.includes("urgência") ? 1 : 0,
    feature_used_social_proof: params.triggerTypes.includes("prova_social") ? 1 : 0,
    label_score:           score.total,
    label_ctr:             score.ctr,
    label_cpc:             score.cpc,
    label_roas:            score.roas,
    label_is_winner:       score.total >= 70 ? 1 : 0,
    split_group:           Math.random() < 0.8 ? "train" : "test",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE EXPLICAÇÃO VIA IA (Gemini)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateWinnerExplanation(
  winnerContext: CampaignContext,
  winnerScore: ScoreBreakdown,
  winnerParams: WinnerParameters,
  allScores: Array<{ name: string; score: number }>,
  learningData?: any
): Promise<{ whyItWon: string; recommendations: string[] }> {
  try {
    const { gemini } = await import("./ai");

    const prompt = `Você é um especialista em marketing digital e performance de campanhas.

CAMPANHA VENCEDORA: "${winnerContext.name}"
Score: ${winnerScore.total}/100
Plataforma: ${winnerContext.platform} | Objetivo: ${winnerContext.objective} | Nicho: ${winnerContext.niche || "não informado"}

SUB-SCORES:
- CTR: ${winnerScore.ctr}/10
- CPC: ${winnerScore.cpc}/10
- CPM: ${winnerScore.cpm}/10
- ROAS: ${winnerScore.roas}/10
- Conversão: ${winnerScore.conversion}/10
- Criativo: ${winnerScore.creative}/10

PARÂMETROS VENCEDORES:
- Formato: ${winnerParams.adFormat}
- Estrutura de copy: ${winnerParams.copyStructure}
- CTA: ${winnerParams.ctaType}
- Gatilhos usados: ${winnerParams.triggerTypes.join(", ")}
- Faixa etária: ${winnerParams.ageMin}-${winnerParams.ageMax}
- Orçamento: ${winnerParams.budgetRange}
- Duração: ${winnerParams.durationRange}
- Posicionamentos: ${winnerParams.placements.join(", ")}

RANKING GERAL (top 5):
${allScores.slice(0, 5).map((s, i) => `${i+1}. ${s.name}: ${s.score}/100`).join("\n")}

${learningData ? `BASE DE APRENDIZADO ATUAL (nicho/plataforma):
- Amostras: ${learningData.sample_count}
- Score médio anterior: ${learningData.avg_score?.toFixed(1)}
- CTR médio: ${learningData.avg_ctr?.toFixed(2)}%` : ""}

Responda APENAS com JSON válido sem markdown:
{
  "whyItWon": "Explicação objetiva em 3-4 frases de por que esta campanha venceu",
  "recommendations": ["recomendação 1 acionável", "recomendação 2", "recomendação 3", "recomendação 4", "recomendação 5"]
}`;

    const raw = await gemini(prompt, { temperature: 0.3 });
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      whyItWon:        parsed.whyItWon || winnerScore.explanation,
      recommendations: parsed.recommendations || [],
    };
  } catch (e: any) {
    log.warn("intelligence", "Gemini explanation failed, using fallback", { error: e.message });
    return {
      whyItWon: winnerScore.explanation,
      recommendations: [
        `Replicar o formato ${winnerParams.adFormat} em próximas campanhas`,
        `Manter estrutura de copy: ${winnerParams.copyStructure}`,
        `Usar gatilho de ${winnerParams.triggerTypes[0] || "urgência"}`,
        `Faixa etária ${winnerParams.ageMin}-${winnerParams.ageMax} demonstrou melhor performance`,
        `Orçamento ${winnerParams.budgetRange} foi eficiente para este objetivo`,
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE TEMPLATE RECOMENDADO
// O MECProAI usa isso para pré-preencher o gerador de campanhas
// ─────────────────────────────────────────────────────────────────────────────

export function buildRecommendedTemplate(
  learningEntry: any,
  platform: string,
  objective: string,
  niche: string
): Record<string, any> {
  const topFormat  = getTopKey(learningEntry?.top_ad_formats);
  const topCta     = getTopKey(learningEntry?.top_cta_types);
  const topTrigger = getTopKey(learningEntry?.top_triggers);
  const topBudget  = getTopKey(learningEntry?.top_budget_ranges);
  const topDuration = getTopKey(learningEntry?.top_durations);
  const topPlacement = getTopKey(learningEntry?.top_placements);

  return {
    platform,
    objective,
    niche,
    recommendedFormat:     topFormat || "video",
    recommendedCta:        topCta || "LEARN_MORE",
    recommendedTrigger:    topTrigger || "urgência",
    recommendedBudgetRange: topBudget || "mid",
    recommendedDuration:   topDuration || "mid",
    recommendedPlacement:  topPlacement || "auto",
    avgScoreContext:       learningEntry?.avg_score || 0,
    bestScoreContext:      learningEntry?.best_score || 0,
    sampleCount:           learningEntry?.sample_count || 0,
    confidenceLabel:
      (learningEntry?.sample_count || 0) >= 10 ? "alta" :
      (learningEntry?.sample_count || 0) >= 5  ? "média" : "baixa",
    generatedAt: new Date().toISOString(),
  };
}

function getTopKey(jsonStr?: string): string | null {
  try {
    const obj = JSON.parse(jsonStr || "{}");
    const sorted = Object.entries(obj).sort((a, b) => (b[1] as number) - (a[1] as number));
    return sorted[0]?.[0] ?? null;
  } catch { return null; }
}
