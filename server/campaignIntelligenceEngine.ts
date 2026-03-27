/**
 * campaignIntelligenceEngine.ts — v2.0
 *
 * UPGRADES v2:
 *   ✅ Score com peso por volume de investimento
 *   ✅ Confiabilidade estatística (não penaliza campanha pequena igual à grande)
 *   ✅ Filtro de "falso vencedor" (mínimo de impressões, gasto, cliques)
 *   ✅ Classificação avançada: tipo de copy, criativo, promessa, público
 *   ✅ Correlação real entre variáveis (qual combinação performa mais)
 *   ✅ Previsão de sucesso (0–100%)
 *   ✅ Recomendação automática por nicho para o CampaignBuilder
 */

import { log } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignMetrics {
  impressions:  number;
  clicks:       number;
  ctr:          number;
  cpc:          number;
  cpm:          number;
  spend:        number;
  roas?:        number;
  conversions?: number;
  leads?:       number;
  reach?:       number;
  frequency?:   number;
}

export interface CampaignContext {
  campaignId:    number;
  userId:        number;
  projectId:     number;
  name:          string;
  platform:      string;
  objective:     string;
  niche?:        string;
  segment?:      string;
  budgetTotal?:  number;
  durationDays?: number;
  creatives?:    any[];
  adSets?:       any[];
  aiResponse?:   string;
}

export interface ScoreBreakdown {
  total:             number;
  ctr:               number;
  cpc:               number;
  cpm:               number;
  roas:              number;
  conversion:        number;
  creative:          number;
  consistency:       number;
  scalability:       number;
  volumeWeight:      number;
  statisticalConf:   number;
  isFalseWinner:     boolean;
  falseWinnerReason?: string;
  explanation:       string;
  keyInsights:       string[];
}

export interface PatternClassification {
  copyType:      string;
  copyLength:    string;
  creativeType:  string;
  creativeStyle: string;
  promiseType:   string;
  audienceType:  string;
  triggers:      string[];
  winningCombo:  string;
}

export interface WinnerParameters {
  adFormat:           string;
  headlinePattern:    string;
  copyStructure:      string;
  ctaType:            string;
  mainPromise:        string;
  triggerTypes:       string[];
  mediaTypes:         string[];
  numVariations:      number;
  ageMin:             number;
  ageMax:             number;
  genders:            string[];
  audienceSize:       string;
  placements:         string[];
  biddingStrategy:    string;
  budgetRange:        string;
  durationRange:      string;
  whyItWon?:          string;
  keyFactors:         string[];
  recommendations?:   string[];
  classification:     PatternClassification;
  successProbability: number;
}

export interface CorrelationResult {
  feature:    string;
  impact:     number;
  direction:  "positive" | "negative";
  confidence: number;
  sampleSize: number;
  insight:    string;
}

export interface AutoRecommendation {
  platform:             string;
  objective:            string;
  niche:                string;
  recommendedFormat:    string;
  recommendedCopyType:  string;
  recommendedCta:       string;
  recommendedTrigger:   string;
  recommendedBudget:    string;
  recommendedDuration:  string;
  recommendedAudience:  string;
  recommendedPlacement: string;
  bestCombination:      string;
  expectedCtr:          number;
  expectedCpc:          number;
  expectedRoas:         number;
  confidence:           "alta" | "média" | "baixa";
  sampleCount:          number;
  alerts:               string[];
  successProbability:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARKS (mercado BR 2024)
// ─────────────────────────────────────────────────────────────────────────────

export const BENCHMARKS: Record<string, Record<string, {
  ctr: number; cpc: number; cpm: number; convRate: number;
  minSpend: number; minImpressions: number; minClicks: number;
}>> = {
  meta: {
    leads:      { ctr: 1.5, cpc: 3.0,  cpm: 12.0, convRate: 4.0, minSpend: 50,  minImpressions: 1000, minClicks: 30 },
    traffic:    { ctr: 1.2, cpc: 2.5,  cpm: 10.0, convRate: 2.0, minSpend: 30,  minImpressions: 800,  minClicks: 20 },
    sales:      { ctr: 0.9, cpc: 4.0,  cpm: 14.0, convRate: 3.5, minSpend: 100, minImpressions: 2000, minClicks: 50 },
    engagement: { ctr: 2.5, cpc: 1.5,  cpm: 8.0,  convRate: 1.0, minSpend: 20,  minImpressions: 500,  minClicks: 10 },
    branding:   { ctr: 0.5, cpc: 5.0,  cpm: 6.0,  convRate: 0.5, minSpend: 200, minImpressions: 5000, minClicks: 20 },
  },
  google: {
    leads:      { ctr: 4.0, cpc: 5.0,  cpm: 20.0, convRate: 6.0, minSpend: 100, minImpressions: 500,  minClicks: 30 },
    traffic:    { ctr: 3.5, cpc: 3.0,  cpm: 15.0, convRate: 3.0, minSpend: 50,  minImpressions: 300,  minClicks: 20 },
    sales:      { ctr: 2.5, cpc: 6.0,  cpm: 25.0, convRate: 5.0, minSpend: 150, minImpressions: 1000, minClicks: 40 },
    engagement: { ctr: 2.0, cpc: 2.0,  cpm: 10.0, convRate: 2.0, minSpend: 30,  minImpressions: 300,  minClicks: 15 },
    branding:   { ctr: 0.8, cpc: 8.0,  cpm: 8.0,  convRate: 1.0, minSpend: 300, minImpressions: 5000, minClicks: 30 },
  },
  tiktok: {
    leads:      { ctr: 1.8, cpc: 2.0,  cpm: 8.0,  convRate: 3.0, minSpend: 50,  minImpressions: 2000, minClicks: 40 },
    traffic:    { ctr: 2.0, cpc: 1.5,  cpm: 6.0,  convRate: 2.5, minSpend: 30,  minImpressions: 1500, minClicks: 30 },
    sales:      { ctr: 1.5, cpc: 2.5,  cpm: 10.0, convRate: 2.0, minSpend: 100, minImpressions: 3000, minClicks: 50 },
    engagement: { ctr: 3.0, cpc: 0.8,  cpm: 4.0,  convRate: 1.0, minSpend: 20,  minImpressions: 1000, minClicks: 30 },
    branding:   { ctr: 1.0, cpc: 3.0,  cpm: 5.0,  convRate: 0.5, minSpend: 200, minImpressions: 8000, minClicks: 50 },
  },
};

export const DEFAULT_WEIGHTS = {
  ctr:         0.22,
  cpc:         0.18,
  roas:        0.16,
  conversion:  0.13,
  cpm:         0.09,
  creative:    0.08,
  consistency: 0.06,
  scalability: 0.05,
  volume:      0.03,
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 1: SCORE INTELIGENTE v2
// ─────────────────────────────────────────────────────────────────────────────

function normalizeBenchmark(value: number, benchmark: number, higherIsBetter: boolean): number {
  if (value <= 0) return 0;
  return higherIsBetter
    ? Math.min(10, Math.max(0, (value / benchmark) * 5))
    : Math.min(10, Math.max(0, (benchmark / value) * 5));
}

function calculateVolumeWeight(spend: number, impressions: number, objective: string): number {
  const spendBench: Record<string, number> = {
    leads: 200, sales: 500, traffic: 100, engagement: 50, branding: 1000,
  };
  const bench     = spendBench[objective] || 200;
  const spendScore = Math.min(10, (spend / bench) * 7);
  const impScore   = Math.min(10, (impressions / 5000) * 8);
  return +((spendScore + impScore) / 2).toFixed(2);
}

function calculateStatisticalConfidence(
  metrics: CampaignMetrics,
  bench: { minSpend: number; minImpressions: number; minClicks: number }
): number {
  const spendConf = Math.min(1, metrics.spend / bench.minSpend);
  const impConf   = Math.min(1, metrics.impressions / bench.minImpressions);
  const clickConf = Math.min(1, metrics.clicks / bench.minClicks);
  return +((spendConf * 0.4 + impConf * 0.35 + clickConf * 0.25)).toFixed(3);
}

function detectFalseWinner(
  metrics: CampaignMetrics,
  bench: { minSpend: number; minImpressions: number; minClicks: number }
): { isFalse: boolean; reason?: string } {
  if (metrics.impressions < bench.minImpressions * 0.3)
    return { isFalse: true, reason: `Impressões insuficientes (${metrics.impressions} < ${Math.round(bench.minImpressions * 0.3)} mín.)` };
  if (metrics.spend < bench.minSpend * 0.2)
    return { isFalse: true, reason: `Gasto insuficiente (R$${metrics.spend.toFixed(2)} < R$${(bench.minSpend * 0.2).toFixed(2)} mín.)` };
  if (metrics.clicks < bench.minClicks * 0.3)
    return { isFalse: true, reason: `Cliques insuficientes (${metrics.clicks} < ${Math.round(bench.minClicks * 0.3)} mín.)` };
  return { isFalse: false };
}

function evaluateCreativeQuality(context: CampaignContext): number {
  let score = 5;
  try {
    const creatives = context.creatives ?? [];
    if (creatives.length === 0) return 4;
    if (creatives.length >= 3) score += 1;
    if (creatives.length >= 5) score += 1;
    const aiResp = context.aiResponse ? JSON.parse(context.aiResponse) : {};
    if ((aiResp?.hooks ?? []).length > 0) score += 1;
    const cr = creatives[0] ?? {};
    if (cr.hook && cr.hook.length > 10)        score += 0.5;
    if (cr.copy && cr.copy.length > 30)        score += 0.5;
    if (cr.headline && cr.headline.length > 5) score += 0.5;
    if (cr.cta && cr.cta !== "LEARN_MORE")     score += 0.5;
    return Math.min(10, Math.max(0, score));
  } catch { return 5; }
}

function evaluateConsistency(m: CampaignMetrics, bench: { ctr: number; cpc: number }): number {
  if (m.impressions < 100) return 3;
  const ctrRatio = m.ctr / bench.ctr;
  const cpcRatio = bench.cpc / (m.cpc || 99);
  return Math.min(10, ((ctrRatio + cpcRatio) / 2) * 5);
}

function evaluateScalability(m: CampaignMetrics, bench: { cpm: number }): number {
  if (m.impressions < 500) return 3;
  const cpmScore  = normalizeBenchmark(m.cpm, bench.cpm, false);
  const freqScore = m.frequency && m.frequency < 3 ? 8 : m.frequency && m.frequency < 5 ? 5 : 3;
  return Math.min(10, (cpmScore + freqScore) / 2);
}

export function calculateScore(
  context: CampaignContext,
  metrics: CampaignMetrics,
  weights = DEFAULT_WEIGHTS
): ScoreBreakdown {
  const platform  = (context.platform  || "meta").toLowerCase();
  const objective = (context.objective || "traffic").toLowerCase();
  const bPlatform = (BENCHMARKS as any)[platform] ?? BENCHMARKS.meta;
  const bench     = bPlatform[objective] ?? bPlatform.traffic;

  const sCtr         = normalizeBenchmark(metrics.ctr, bench.ctr, true);
  const sCpc         = normalizeBenchmark(metrics.cpc, bench.cpc, false);
  const sCpm         = normalizeBenchmark(metrics.cpm, bench.cpm, false);
  const sRoas        = metrics.roas ? normalizeBenchmark(metrics.roas, 3.0, true) : 5;
  const sConv        = metrics.conversions && metrics.impressions > 0
    ? normalizeBenchmark((metrics.conversions / metrics.impressions) * 100, bench.convRate, true)
    : metrics.leads && metrics.impressions > 0
      ? normalizeBenchmark((metrics.leads / metrics.impressions) * 100, bench.convRate * 0.5, true)
      : 4;
  const sCreative    = evaluateCreativeQuality(context);
  const sConsistency = evaluateConsistency(metrics, bench);
  const sScalability = evaluateScalability(metrics, bench);
  const sVolume      = calculateVolumeWeight(metrics.spend, metrics.impressions, objective);
  const statConf     = calculateStatisticalConfidence(metrics, bench);

  const rawScore =
    sCtr         * weights.ctr         * 100 +
    sCpc         * weights.cpc         * 100 +
    sCpm         * weights.cpm         * 100 +
    sRoas        * weights.roas        * 100 +
    sConv        * weights.conversion  * 100 +
    sCreative    * weights.creative    * 100 +
    sConsistency * weights.consistency * 100 +
    sScalability * weights.scalability * 100 +
    sVolume      * (weights.volume || 0.03) * 100;

  // Aplica multiplicador de confiabilidade: score * (0.5 + 0.5 * statConf)
  const confidenceMultiplier = 0.5 + (0.5 * statConf);
  const total = Math.round(Math.min(100, Math.max(0, rawScore * confidenceMultiplier)));

  const { isFalse, reason } = detectFalseWinner(metrics, bench);

  const keyInsights: string[] = [];
  if (sCtr > 7)        keyInsights.push(`CTR excelente (${metrics.ctr.toFixed(2)}% vs bench ${bench.ctr}%)`);
  if (sCtr < 3)        keyInsights.push(`CTR abaixo do benchmark — revisar criativo e público`);
  if (sCpc > 7)        keyInsights.push(`CPC eficiente (R$${metrics.cpc.toFixed(2)} vs bench R$${bench.cpc})`);
  if (sCpc < 3)        keyInsights.push(`CPC alto — ajustar lance ou segmentação`);
  if (sVolume < 4)     keyInsights.push(`Volume baixo — mais dados necessários`);
  if (statConf < 0.5)  keyInsights.push(`Confiabilidade ${(statConf * 100).toFixed(0)}% — aumentar orçamento ou duração`);
  if (sScalability > 7) keyInsights.push(`Alto potencial de escala`);
  if (isFalse)         keyInsights.push(`⚠️ ${reason}`);

  return {
    total,
    ctr:             +sCtr.toFixed(2),
    cpc:             +sCpc.toFixed(2),
    cpm:             +sCpm.toFixed(2),
    roas:            +sRoas.toFixed(2),
    conversion:      +sConv.toFixed(2),
    creative:        +sCreative.toFixed(2),
    consistency:     +sConsistency.toFixed(2),
    scalability:     +sScalability.toFixed(2),
    volumeWeight:    +sVolume.toFixed(2),
    statisticalConf: statConf,
    isFalseWinner:   isFalse,
    falseWinnerReason: reason,
    explanation:
      `Score ${total}/100 (confiança ${(statConf * 100).toFixed(0)}%). ` +
      `CTR ${metrics.ctr.toFixed(2)}% · CPC R$${metrics.cpc.toFixed(2)} · ` +
      `Gasto R$${metrics.spend.toFixed(2)} · ${metrics.impressions.toLocaleString("pt-BR")} impressões.`,
    keyInsights,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 2: CLASSIFICAÇÃO AVANÇADA DE PADRÃO
// ─────────────────────────────────────────────────────────────────────────────

export function classifyPattern(context: CampaignContext): PatternClassification {
  let creatives: any[] = [];
  let adSets:    any[] = [];
  try { creatives = context.creatives ?? []; } catch {}
  try { adSets    = context.adSets    ?? []; } catch {}

  const cr      = creatives[0] ?? {};
  const allText = [cr.hook, cr.copy, cr.headline, cr.cta].filter(Boolean).join(" ").toLowerCase();
  const words   = allText.split(/\s+/).length;

  // Tipo de copy
  let copyType = "curta_direta";
  if (allText.includes("como") || allText.includes("passo")) copyType = "lista_beneficios";
  else if (allText.includes("?"))                             copyType = "pergunta";
  else if (allText.includes("história") || allText.includes("quando eu")) copyType = "storytelling";
  else if (allText.includes("desafio") || allText.includes("você consegue")) copyType = "desafio";
  else if (words > 80)                                        copyType = "longa_emocional";

  // Tamanho copy
  const copyLength = words < 10 ? "micro" : words < 30 ? "curta" : words < 80 ? "media" : "longa";

  // Tipo de criativo
  const fmt = (cr?.format || cr?.type || "").toLowerCase();
  let creativeType = "imagem_produto";
  if (fmt.includes("reel"))           creativeType = "reels";
  else if (fmt.includes("story"))     creativeType = "stories";
  else if (fmt.includes("carousel"))  creativeType = "carrossel";
  else if (fmt.includes("video") && (cr?.duration || 0) < 30) creativeType = "video_curto";
  else if (fmt.includes("video"))     creativeType = "video_longo";
  else if (allText.includes("depoimento") || allText.includes("cliente")) creativeType = "imagem_pessoa";

  // Estilo criativo
  let creativeStyle = "ugc";
  if (allText.includes("depoimento") || allText.includes("avalia")) creativeStyle = "depoimento";
  else if (allText.includes("bastidor"))                              creativeStyle = "bastidores";
  else if (allText.includes("institucional") || allText.includes("empresa")) creativeStyle = "institucional";

  // Promessa
  let promiseType = "ganho";
  if (allText.includes("cansado") || allText.includes("dor") || allText.includes("problema")) promiseType = "dor";
  else if (allText.includes("exclusivo") || allText.includes("vip"))                           promiseType = "exclusividade";
  else if (allText.includes("segredo") || allText.includes("descobrir"))                       promiseType = "curiosidade";
  else if (allText.includes("urgente") || allText.includes("agora") || allText.includes("último")) promiseType = "urgencia";
  else if (allText.includes("depoimento") || allText.includes("resultado") || allText.includes("aprovado")) promiseType = "prova_social";

  // Tipo de público
  const targeting = adSets[0]?.targeting ?? {};
  let audienceType = "broad";
  if (targeting?.custom_audiences?.length > 0)  audienceType = "retargeting";
  else if (targeting?.lookalike_audiences?.length > 0) audienceType = "lookalike";
  else if (targeting?.flexible_spec?.length > 0) audienceType = "interesse";

  // Gatilhos
  const triggers = detectTriggers(allText);

  return {
    copyType, copyLength, creativeType, creativeStyle, promiseType, audienceType, triggers,
    winningCombo: `${creativeType} + ${promiseType} + ${audienceType}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMADA 2: CORRELAÇÃO REAL ENTRE VARIÁVEIS
// ─────────────────────────────────────────────────────────────────────────────

export function detectCorrelations(
  patterns: Array<{ params: WinnerParameters; score: ScoreBreakdown }>
): CorrelationResult[] {
  if (patterns.length < 3) return [];

  const features: Record<string, number[]> = {};

  for (const p of patterns) {
    const feats = [
      `format:${p.params.adFormat}`,
      `cta:${p.params.ctaType}`,
      `budget:${p.params.budgetRange}`,
      `duration:${p.params.durationRange}`,
      `audience:${p.params.audienceSize}`,
      `promise:${p.params.classification?.promiseType || "ganho"}`,
      `copy:${p.params.classification?.copyType || "curta_direta"}`,
      `creative:${p.params.classification?.creativeType || "imagem_produto"}`,
      ...p.params.triggerTypes.map(t => `trigger:${t}`),
    ];
    for (const feat of feats) {
      if (!features[feat]) features[feat] = [];
      features[feat].push(p.score.total);
    }
  }

  const globalAvg = patterns.reduce((a, p) => a + p.score.total, 0) / patterns.length;

  return Object.entries(features)
    .filter(([, scores]) => scores.length >= 2)
    .map(([feature, scores]) => {
      const avg        = scores.reduce((a, b) => a + b, 0) / scores.length;
      const impact     = Math.abs(avg - globalAvg) / 100;
      const confidence = Math.min(1, scores.length / patterns.length);
      const direction  = avg >= globalAvg ? "positive" as const : "negative" as const;
      const name       = feature.split(":")[1];
      return {
        feature, impact: +impact.toFixed(3), direction, confidence: +confidence.toFixed(2),
        sampleSize: scores.length,
        insight: direction === "positive"
          ? `"${name}" → score ${(avg - globalAvg).toFixed(1)} pts acima da média`
          : `"${name}" → score ${(globalAvg - avg).toFixed(1)} pts abaixo da média`,
      };
    })
    .filter(c => c.impact > 0.01)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20);
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMENDAÇÃO AUTOMÁTICA (para o CampaignBuilder)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutoRecommendation(
  learningEntry: any,
  correlations: CorrelationResult[],
  platform: string,
  objective: string,
  niche: string
): AutoRecommendation {
  const getTop = (json: string) => {
    try {
      const obj = JSON.parse(json || "{}");
      return Object.entries(obj).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? null;
    } catch { return null; }
  };

  const topFormat    = getTop(learningEntry?.top_ad_formats)    || "video_curto";
  const topCta       = getTop(learningEntry?.top_cta_types)     || "LEARN_MORE";
  const topTrigger   = getTop(learningEntry?.top_triggers)      || "urgencia";
  const topBudget    = getTop(learningEntry?.top_budget_ranges) || "mid";
  const topDuration  = getTop(learningEntry?.top_durations)     || "mid";
  const topPlacement = getTop(learningEntry?.top_placements)    || "auto";

  const topCorrs    = correlations.filter(c => c.direction === "positive" && c.confidence > 0.5).slice(0, 3);
  const bestCombination = topCorrs.length >= 2
    ? topCorrs.map(c => c.feature.split(":")[1]).join(" + ")
    : `${topFormat} + ${topTrigger}`;

  const sampleCount = learningEntry?.sample_count || 0;
  const alerts: string[] = [];
  if (sampleCount < 5)           alerts.push("⚠️ Base pequena — confiança baixa");
  if (topBudget === "low")       alerts.push("💡 Orçamento baixo tende a gerar dados insuficientes");
  if (topFormat === "video_curto") alerts.push("🎥 Vídeos curtos dominam neste segmento");

  return {
    platform, objective, niche,
    recommendedFormat:    topFormat,
    recommendedCopyType:  getTop(learningEntry?.top_copy_structures) || "curta_direta",
    recommendedCta:       topCta,
    recommendedTrigger:   topTrigger,
    recommendedBudget:    topBudget,
    recommendedDuration:  topDuration,
    recommendedAudience:  "lookalike",
    recommendedPlacement: topPlacement,
    bestCombination,
    expectedCtr:          learningEntry?.avg_ctr  || 1.5,
    expectedCpc:          learningEntry?.avg_cpc  || 3.0,
    expectedRoas:         learningEntry?.avg_roas || 2.0,
    confidence:           sampleCount >= 10 ? "alta" : sampleCount >= 5 ? "média" : "baixa",
    sampleCount,
    alerts,
    successProbability: Math.round(Math.min(90, Math.max(30,
      (learningEntry?.avg_score || 50) * 0.8 + (sampleCount >= 10 ? 10 : sampleCount >= 5 ? 5 : 0)
    ))),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE EXTRAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

function detectTriggers(text: string): string[] {
  const t = text.toLowerCase();
  const triggers: string[] = [];
  if (t.includes("grátis") || t.includes("free"))                            triggers.push("gratuidade");
  if (t.includes("urgente") || t.includes("agora") || t.includes("último"))  triggers.push("urgência");
  if (t.includes("resultado") || t.includes("comprovado"))                   triggers.push("prova_resultado");
  if (t.includes("depoimento") || t.includes("cliente"))                     triggers.push("prova_social");
  if (t.includes("exclusivo") || t.includes("limitado"))                     triggers.push("escassez");
  if (t.includes("garantia") || t.includes("risco zero"))                    triggers.push("garantia");
  if (t.includes("desconto") || t.includes("%") || t.includes("off"))        triggers.push("desconto");
  if (t.includes("especialista") || t.includes("autoridade"))                triggers.push("autoridade");
  return triggers.length > 0 ? triggers : ["informacional"];
}

function detectBudgetRange(budget?: number): string {
  if (!budget) return "unknown";
  if (budget < 100)  return "low";
  if (budget < 500)  return "mid";
  if (budget < 2000) return "high";
  return "premium";
}

function detectDurationRange(days?: number): string {
  if (!days) return "unknown";
  if (days < 7)  return "short";
  if (days < 30) return "mid";
  return "long";
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE PARÂMETROS VENCEDORES
// ─────────────────────────────────────────────────────────────────────────────

export function extractWinnerParameters(
  context: CampaignContext,
  score: ScoreBreakdown,
  metrics: CampaignMetrics
): Omit<WinnerParameters, "whyItWon" | "recommendations"> {
  let creatives: any[] = [];
  let aiResp:    any   = {};
  let adSets:    any[] = [];
  try { creatives = context.creatives ?? []; } catch {}
  try { aiResp    = context.aiResponse ? JSON.parse(context.aiResponse) : {}; } catch {}
  try { adSets    = context.adSets     ?? []; } catch {}

  const cr         = creatives[0] ?? {};
  const firstAdSet = adSets[0]    ?? {};
  const targeting  = firstAdSet?.targeting ?? {};
  const allText    = [cr.hook, cr.copy, cr.headline, cr.cta, aiResp?.strategy].filter(Boolean).join(" ");

  const ctaRaw = (cr?.cta || "LEARN_MORE").toUpperCase().replace(/[^A-Z_]/g, "_");

  let headlinePattern = "direto";
  const hl = (cr?.headline || "").toLowerCase();
  if (hl.includes("como"))       headlinePattern = "tutorial";
  else if (hl.includes("?"))     headlinePattern = "pergunta";
  else if (hl.includes("!"))     headlinePattern = "exclamação";
  else if (hl.includes("%"))     headlinePattern = "oferta";
  else if (hl.includes("você"))  headlinePattern = "personalizado";

  const fmt = (cr?.format || cr?.type || "").toLowerCase();
  let adFormat = "image";
  if (fmt.includes("video"))    adFormat = "video";
  if (fmt.includes("carousel")) adFormat = "carousel";
  if (fmt.includes("reel"))     adFormat = "reels";
  if (fmt.includes("story"))    adFormat = "story";

  const copyText    = [cr.hook, cr.copy].filter(Boolean).join(" ");
  const hasHook     = !!(cr?.hook && cr.hook.length > 5);
  const hasBenefit  = !!(cr?.copy && cr.copy.length > 20);
  const hasCta      = !!(cr?.cta);
  const copyStructure = hasHook && hasBenefit && hasCta ? "hook_benefit_cta"
    : hasHook && hasCta ? "hook_cta" : hasBenefit && hasCta ? "benefit_cta" : "basic";

  const placements: string[] = [];
  if (targeting?.facebook_positions)  placements.push(...targeting.facebook_positions.map((p: string) => `fb_${p}`));
  if (targeting?.instagram_positions) placements.push(...targeting.instagram_positions.map((p: string) => `ig_${p}`));
  if (placements.length === 0) placements.push("auto");

  const audienceSize = targeting?.lookalike_audiences?.length > 0 ? "lookalike"
    : targeting?.flexible_spec?.length > 0 ? "interest-based" : "broad";

  const classification = classifyPattern(context);
  const successProbability = Math.round(Math.min(90, Math.max(30, score.total * 0.85)));

  return {
    adFormat,
    headlinePattern,
    copyStructure,
    ctaType:         ctaRaw,
    mainPromise:     cr?.headline?.slice(0, 80) || context.name.slice(0, 80),
    triggerTypes:    detectTriggers(allText),
    mediaTypes:      [adFormat],
    numVariations:   creatives.length || 1,
    ageMin:          Number(targeting?.age_min ?? 18),
    ageMax:          Number(targeting?.age_max ?? 65),
    genders:         targeting?.genders ?? ["all"],
    audienceSize,
    placements,
    biddingStrategy: firstAdSet?.bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
    budgetRange:     detectBudgetRange(context.budgetTotal),
    durationRange:   detectDurationRange(context.durationDays),
    keyFactors:      score.keyInsights,
    classification,
    successProbability,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEARNING BASE UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export function computeLearningUpdate(
  existing: any,
  newScore: number,
  newMetrics: CampaignMetrics,
  newPattern: WinnerParameters
): Partial<any> {
  const n   = (existing?.sample_count ?? 0) + 1;
  const avg = (v: number, old: number) => +((old * (n - 1) + v) / n).toFixed(4);

  function updateTopList(existing: string, newVal: string): string {
    try {
      const list: Record<string, number> = JSON.parse(existing || "{}");
      list[newVal] = (list[newVal] || 0) + 1;
      return JSON.stringify(Object.fromEntries(Object.entries(list).sort((a, b) => b[1] - a[1]).slice(0, 5)));
    } catch { return JSON.stringify({ [newVal]: 1 }); }
  }

  return {
    sample_count:        n,
    avg_score:           avg(newScore,              existing?.avg_score  ?? 0),
    best_score:          Math.max(existing?.best_score ?? 0, newScore),
    avg_ctr:             avg(newMetrics.ctr,         existing?.avg_ctr   ?? 0),
    avg_cpc:             avg(newMetrics.cpc,         existing?.avg_cpc   ?? 0),
    avg_cpm:             avg(newMetrics.cpm,         existing?.avg_cpm   ?? 0),
    avg_roas:            avg(newMetrics.roas ?? 0,   existing?.avg_roas  ?? 0),
    top_ad_formats:      updateTopList(existing?.top_ad_formats,      newPattern.adFormat),
    top_cta_types:       updateTopList(existing?.top_cta_types,       newPattern.ctaType),
    top_placements:      updateTopList(existing?.top_placements,      newPattern.placements[0] || "auto"),
    top_triggers:        updateTopList(existing?.top_triggers,        newPattern.triggerTypes[0] || "informacional"),
    top_budget_ranges:   updateTopList(existing?.top_budget_ranges,   newPattern.budgetRange),
    top_durations:       updateTopList(existing?.top_durations,       newPattern.durationRange),
    top_copy_structures: updateTopList(existing?.top_copy_structures, newPattern.classification?.copyType || "curta_direta"),
    top_media_types:     updateTopList(existing?.top_media_types,     newPattern.classification?.creativeType || "imagem_produto"),
    version:             (existing?.version ?? 1) + 1,
    last_updated:        new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ML FEATURES
// ─────────────────────────────────────────────────────────────────────────────

export function buildMLFeatures(
  context: CampaignContext,
  params: WinnerParameters,
  score: ScoreBreakdown
): Record<string, any> {
  return {
    feature_platform:           context.platform,
    feature_objective:          context.objective,
    feature_niche:              context.niche || "geral",
    feature_ad_format:          params.adFormat,
    feature_age_range:          `${params.ageMin}-${params.ageMax}`,
    feature_budget_range:       params.budgetRange,
    feature_duration:           params.durationRange,
    feature_placement:          params.placements[0] || "auto",
    feature_bid_strategy:       params.biddingStrategy,
    feature_copy_length:        Math.min(1, (params.mainPromise?.length || 0) / 200),
    feature_num_creatives:      Math.min(1, (params.numVariations || 1) / 10),
    feature_has_video:          ["video","reels"].includes(params.adFormat) ? 1 : 0,
    feature_has_carousel:       params.adFormat === "carousel" ? 1 : 0,
    feature_used_urgency:       params.triggerTypes.includes("urgência") ? 1 : 0,
    feature_used_social_proof:  params.triggerTypes.includes("prova_social") ? 1 : 0,
    feature_copy_type:          params.classification?.copyType    || "curta_direta",
    feature_creative_type:      params.classification?.creativeType || "imagem_produto",
    feature_promise_type:       params.classification?.promiseType  || "ganho",
    feature_audience_type:      params.classification?.audienceType || "broad",
    feature_statistical_conf:   score.statisticalConf,
    feature_volume_weight:      score.volumeWeight,
    feature_is_false_winner:    score.isFalseWinner ? 1 : 0,
    label_score:                score.total,
    label_ctr:                  score.ctr,
    label_cpc:                  score.cpc,
    label_roas:                 score.roas,
    label_is_winner:            score.total >= 70 && !score.isFalseWinner ? 1 : 0,
    label_success_probability:  params.successProbability,
    split_group:                Math.random() < 0.8 ? "train" : "test",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPLICAÇÃO VIA GEMINI
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
    const prompt = `Você é especialista em performance de campanhas digitais no Brasil.

CAMPANHA VENCEDORA: "${winnerContext.name}"
Score: ${winnerScore.total}/100 | Confiança: ${(winnerScore.statisticalConf * 100).toFixed(0)}%
Plataforma: ${winnerContext.platform} | Objetivo: ${winnerContext.objective} | Nicho: ${winnerContext.niche || "geral"}

SUB-SCORES: CTR ${winnerScore.ctr}/10 · CPC ${winnerScore.cpc}/10 · ROAS ${winnerScore.roas}/10 · Volume ${winnerScore.volumeWeight}/10

CLASSIFICAÇÃO:
- Formato: ${winnerParams.classification?.creativeType}
- Copy: ${winnerParams.classification?.copyType}
- Promessa: ${winnerParams.classification?.promiseType}
- Público: ${winnerParams.classification?.audienceType}
- Combinação vencedora: ${winnerParams.classification?.winningCombo}
- Gatilhos: ${winnerParams.triggerTypes.join(", ")}

INSIGHTS: ${winnerScore.keyInsights.join(" | ")}

TOP 5: ${allScores.slice(0,5).map((s,i) => `${i+1}. ${s.name}: ${s.score}`).join(" | ")}

Responda APENAS JSON sem markdown:
{
  "whyItWon": "3-4 frases explicando por que venceu com base nos dados",
  "recommendations": ["ação 1 específica", "ação 2", "ação 3", "ação 4", "ação 5"]
}`;

    const raw    = await gemini(prompt, { temperature: 0.3 });
    const clean  = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { whyItWon: parsed.whyItWon || winnerScore.explanation, recommendations: parsed.recommendations || [] };
  } catch (e: any) {
    log.warn("intelligence", "Gemini explanation failed", { error: e.message });
    return { whyItWon: winnerScore.explanation, recommendations: winnerScore.keyInsights.slice(0, 5) };
  }
}

export function buildRecommendedTemplate(
  learningEntry: any, platform: string, objective: string, niche: string
): Record<string, any> {
  const getTop = (jsonStr?: string): string | null => {
    try {
      const obj = JSON.parse(jsonStr || "{}");
      return Object.entries(obj).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] ?? null;
    } catch { return null; }
  };
  return {
    platform, objective, niche,
    recommendedFormat:    getTop(learningEntry?.top_ad_formats)      || "video",
    recommendedCta:       getTop(learningEntry?.top_cta_types)       || "LEARN_MORE",
    recommendedTrigger:   getTop(learningEntry?.top_triggers)        || "urgência",
    recommendedBudget:    getTop(learningEntry?.top_budget_ranges)   || "mid",
    recommendedDuration:  getTop(learningEntry?.top_durations)       || "mid",
    recommendedPlacement: getTop(learningEntry?.top_placements)      || "auto",
    recommendedCopyType:  getTop(learningEntry?.top_copy_structures) || "curta_direta",
    recommendedCreative:  getTop(learningEntry?.top_media_types)     || "video_curto",
    avgScoreContext:      learningEntry?.avg_score  || 0,
    bestScoreContext:     learningEntry?.best_score || 0,
    sampleCount:          learningEntry?.sample_count || 0,
    confidenceLabel:      (learningEntry?.sample_count || 0) >= 10 ? "alta" : (learningEntry?.sample_count || 0) >= 5 ? "média" : "baixa",
    generatedAt:          new Date().toISOString(),
  };
}
