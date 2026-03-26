// ── MECPro Intelligent Matching Engine ───────────────────────────────────────
// Fase 1: Score por regras + pesos
// Fase 2 (futuro): aprendizado com histórico real de performance
//
// Scoring formula:
// match_score = (niche_fit×0.25) + (objective_fit×0.20) + (audience_fit×0.20)
//             + (platform_fit×0.15) + (budget_fit×0.10) + (history_fit×0.10)
// ─────────────────────────────────────────────────────────────────────────────

import * as db from "./db.js";
import { log } from "./logger.js";
import { gemini } from "./ai.js";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface MatchInput {
  projectId:  number;
  objective:  string;   // leads | sales | branding | traffic | engagement
  platform:   string;   // meta | google | both | tiktok
  budget:     number;   // mensal em R$
  duration:   number;   // dias
}

export interface PlatformScore {
  platform:     string;
  score:        number;   // 0–100
  label:        string;
  breakdown:    ScoreBreakdown;
  insights:     string[];
  warnings:     string[];
}

export interface MatchResult {
  recommended:     PlatformScore;   // melhor opção
  alternatives:    PlatformScore[]; // demais ordenadas
  topAngle:        string;          // ângulo criativo recomendado
  topCreativeType: string;          // tipo de criativo
  topCTA:          string;          // CTA mais provável de converter
  audienceSummary: string;          // resumo do público ideal
  budgetTip:       string;          // conselho sobre budget
  confidence:      number;          // 0–100 — confiança geral
  reasoning:       string;          // explicação em linguagem natural
}

interface ScoreBreakdown {
  niche:     number;  // 0–25
  objective: number;  // 0–20
  audience:  number;  // 0–20
  platform:  number;  // 0–15
  budget:    number;  // 0–10
  history:   number;  // 0–10
}

// ── Matrizes de compatibilidade ───────────────────────────────────────────────

// Nicho → plataforma ideal
const NICHE_PLATFORM_FIT: Record<string, Record<string, number>> = {
  imovel:     { meta: 25, google: 22, both: 25, tiktok: 12 },
  educacao:   { meta: 22, google: 20, both: 25, tiktok: 18 },
  saude:      { meta: 23, google: 20, both: 25, tiktok: 15 },
  ecommerce:  { meta: 20, google: 22, both: 25, tiktok: 20 },
  financeiro: { meta: 18, google: 25, both: 25, tiktok: 10 },
  fitness:    { meta: 22, google: 15, both: 20, tiktok: 25 },
  restaurante:{ meta: 20, google: 18, both: 22, tiktok: 22 },
  juridico:   { meta: 15, google: 25, both: 22, tiktok: 8  },
  b2b:        { meta: 15, google: 25, both: 22, tiktok: 8  },
  infoprod:   { meta: 25, google: 15, both: 22, tiktok: 20 },
  beleza:     { meta: 23, google: 15, both: 20, tiktok: 25 },
  pet:        { meta: 22, google: 15, both: 20, tiktok: 20 },
  generico:   { meta: 20, google: 20, both: 22, tiktok: 15 },
};

// Objetivo → plataforma ideal
const OBJECTIVE_PLATFORM_FIT: Record<string, Record<string, number>> = {
  leads:      { meta: 20, google: 18, both: 20, tiktok: 12 },
  sales:      { meta: 18, google: 20, both: 20, tiktok: 15 },
  branding:   { meta: 18, google: 14, both: 18, tiktok: 20 },
  traffic:    { meta: 16, google: 20, both: 20, tiktok: 16 },
  engagement: { meta: 20, google: 10, both: 18, tiktok: 20 },
};

// Budget → plataforma ideal (R$/mês)
function budgetScore(budget: number, platform: string): number {
  if (platform === "google" && budget < 1000) return 5;   // Google precisa de mais budget
  if (platform === "tiktok" && budget < 500)  return 3;
  if (platform === "both"   && budget < 2000) return 6;   // ambos exige mais
  if (budget >= 5000) return 10;
  if (budget >= 2000) return 9;
  if (budget >= 1000) return 8;
  return 7;
}

// ── Detecta nicho normalizado ─────────────────────────────────────────────────
function detectNiche(rawNiche: string): string {
  const n = (rawNiche || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.match(/imov|imobil|aparta|constru|corretor/)) return "imovel";
  if (n.match(/educa|curso|escola|ensino|infoprod|ead/))  return "educacao";
  if (n.match(/saude|medic|clinic|estetica|odonto/))      return "saude";
  if (n.match(/ecomm|loja|varejo|moda|produto/))          return "ecommerce";
  if (n.match(/financ|invest|banco|credit|seguro/))       return "financeiro";
  if (n.match(/fitness|academia|treino|esporte|nutri/))   return "fitness";
  if (n.match(/restaur|aliment|comida|food|bar/))         return "restaurante";
  if (n.match(/advoca|juridic|direito/))                  return "juridico";
  if (n.match(/b2b|saas|software|tech|startup/))         return "b2b";
  if (n.match(/info|digital|marketing|agencia/))          return "infoprod";
  if (n.match(/beleza|cosmet|cabelo|barbearia/))          return "beleza";
  if (n.match(/pet|animal|veterinar/))                    return "pet";
  return "generico";
}

// ── Score de público (baseado nos dados do projeto) ───────────────────────────
function audienceScore(
  niche: string,
  platform: string,
  audience: string,
  budget: number
): number {
  let score = 14; // base

  // Público B2B combina mais com Google
  if (audience?.match(/empresa|b2b|gestor|diretor|ceo|empresari/i)) {
    if (platform === "google" || platform === "both") score += 6;
    else score -= 3;
  }
  // Público jovem combina com TikTok
  if (audience?.match(/jovem|18.*25|25.*35|geração z|gen z/i)) {
    if (platform === "tiktok") score += 6;
  }
  // Público premium combina com Meta e Google
  if (audience?.match(/premium|alto padrão|luxo|executivo|alto rend/i)) {
    if (platform === "meta" || platform === "google" || platform === "both") score += 4;
  }
  // Budget alto = pode atingir público qualificado em qualquer plataforma
  if (budget >= 3000) score = Math.min(score + 2, 20);

  return Math.min(score, 20);
}

// ── Insights e avisos por configuração ───────────────────────────────────────
function generateInsights(
  niche: string, objective: string, platform: string,
  budget: number, score: number, profile: any
): { insights: string[]; warnings: string[] } {
  const insights: string[] = [];
  const warnings: string[] = [];

  // Insights por nicho+plataforma
  if (niche === "imovel") {
    if (platform === "meta" || platform === "both")
      insights.push("Meta Lead Ads é o formato ideal para captação de leads imobiliários");
    if (platform === "google" || platform === "both")
      insights.push("Google Search captura intenção ativa — 'apartamento à venda em X'");
  }
  if (niche === "educacao" && objective === "leads")
    insights.push("Webinars e materiais gratuitos como isca funcionam muito bem neste nicho");
  if (niche === "saude")
    insights.push("Compliance Meta: evite claims de resultado garantido. Use depoimentos com cautela");
  if (niche === "fitness" && platform === "tiktok")
    insights.push("TikTok tem CPM 60% menor que Meta para fitness — ótimo para branding");

  // Insights por objetivo
  if (objective === "leads" && platform === "meta")
    insights.push("Use formulário nativo Meta Lead Ads para reduzir atrito na conversão");
  if (objective === "sales" && platform === "google")
    insights.push("Google Shopping + Search têm melhor ROAS para e-commerce");
  if (objective === "branding" && budget < 1500)
    warnings.push("Budget abaixo de R$1.500/mês limita alcance para campanhas de branding");

  // Avisos de budget
  if (platform === "google" && budget < 1000)
    warnings.push("Google Ads recomenda mínimo R$1.000/mês para ter dados estatísticos");
  if (platform === "both" && budget < 2000)
    warnings.push("Dividir budget abaixo de R$2.000 entre Meta e Google pode diluir resultados");
  if (platform === "tiktok" && budget < 500)
    warnings.push("TikTok Ads requer mínimo de R$300/mês por conjunto de anúncios");

  // Score baixo
  if (score < 60)
    warnings.push("Score de compatibilidade moderado — considere ajustar plataforma ou objetivo");

  return { insights, warnings };
}

// ── Recomendações de criativo por nicho + objetivo ────────────────────────────
function getCreativeRecommendations(niche: string, objective: string): {
  angle: string; creativeType: string; cta: string; audienceSummary: string;
} {
  const map: Record<string, Record<string, { angle: string; creativeType: string; cta: string; audienceSummary: string }>> = {
    imovel: {
      leads:  { angle: "Exclusividade + valorização patrimonial", creativeType: "Vídeo curto + carrossel de imóveis", cta: "Agendar visita", audienceSummary: "Investidores 35–55 anos, renda alta, interessados em imóveis" },
      sales:  { angle: "Prova social + urgência (últimas unidades)", creativeType: "Vídeo tour 3D + depoimentos", cta: "Ver condições", audienceSummary: "Compradores 30–50 anos, financiamento ou à vista" },
      branding:{ angle: "Autoridade e tradição da marca", creativeType: "Vídeo institucional", cta: "Conhecer mais", audienceSummary: "Público amplo 25–60 anos" },
    },
    educacao: {
      leads:  { angle: "Transformação + prova de resultado", creativeType: "VSL curto (60s) + depoimento de aluno", cta: "Quero me inscrever", audienceSummary: "Profissionais 25–45 buscando requalificação" },
      sales:  { angle: "Oferta com urgência + bônus exclusivos", creativeType: "Carrossel com módulos + garantia", cta: "Garantir minha vaga", audienceSummary: "Interessados na área do curso, 20–40 anos" },
    },
    saude: {
      leads:  { angle: "Dor → solução → prova social", creativeType: "Before/after + depoimento (sem claims)", cta: "Agendar consulta", audienceSummary: "Mulheres 28–50 interessadas em saúde e estética" },
    },
    ecommerce: {
      sales:  { angle: "Urgência + desconto + prova social", creativeType: "Carrossel de produtos + reviews", cta: "Comprar agora", audienceSummary: "Compradores online 20–45 anos" },
      traffic:{ angle: "Conteúdo + descoberta de produto", creativeType: "Stories + Reels de uso do produto", cta: "Ver coleção", audienceSummary: "Público frio 18–35 anos" },
    },
    financeiro: {
      leads:  { angle: "Medo de perder + segurança financeira", creativeType: "Vídeo educativo + landing page", cta: "Quero uma análise gratuita", audienceSummary: "Investidores 30–55 anos com renda media-alta" },
    },
  };

  const nicheMap = map[niche];
  if (nicheMap && nicheMap[objective]) return nicheMap[objective];
  if (nicheMap && nicheMap["leads"])   return nicheMap["leads"];

  // fallback genérico
  return {
    angle:          "Proposta de valor clara + prova social",
    creativeType:   "Vídeo curto (15–30s) + imagem estática",
    cta:            "Saiba mais",
    audienceSummary:"Público-alvo alinhado ao nicho e objetivo definidos",
  };
}

// ── Calcula score para uma plataforma ─────────────────────────────────────────
function calcPlatformScore(
  platform: string, niche: string, objective: string,
  budget: number, profile: any, historyCampaigns: any[]
): PlatformScore {

  const nicheFit = NICHE_PLATFORM_FIT[niche]?.[platform] ?? NICHE_PLATFORM_FIT.generico[platform];
  const objFit   = OBJECTIVE_PLATFORM_FIT[objective]?.[platform] ?? 15;
  const audFit   = audienceScore(niche, platform, profile?.targetAudience || "", budget);
  const budFit   = budgetScore(budget, platform);

  // History score: campanhas publicadas com sucesso nessa plataforma
  const successCamps = historyCampaigns.filter(
    (c: any) => c.platform === platform && c.publishStatus === "success"
  );
  const histFit = Math.min(successCamps.length * 3, 10); // até 10pts

  const total = nicheFit + objFit + audFit + budFit + histFit;

  const platformLabels: Record<string, string> = {
    meta: "Meta Ads (Facebook + Instagram)",
    google: "Google Ads (Search + Display)",
    both: "Meta + Google Ads",
    tiktok: "TikTok Ads",
  };

  const { insights, warnings } = generateInsights(niche, objective, platform, budget, total, profile);

  return {
    platform,
    score: Math.min(total, 100),
    label: platformLabels[platform] || platform,
    breakdown: { niche: nicheFit, objective: objFit, audience: audFit, platform: budFit, budget: budFit, history: histFit },
    insights,
    warnings,
  };
}

// ── Função principal ──────────────────────────────────────────────────────────
export async function computeMatchScore(input: MatchInput): Promise<MatchResult> {
  log.info("matching", "computeMatchScore start", { projectId: input.projectId, objective: input.objective });

  const profile  = await db.getClientProfile(input.projectId) as any;
  const campaigns = await db.getCampaignsByProjectId(input.projectId) as any[];

  const niche    = detectNiche(profile?.niche || "");
  const platforms = ["meta", "google", "both", "tiktok"];

  // Calcula score para cada plataforma
  const scores: PlatformScore[] = platforms.map(p =>
    calcPlatformScore(p, niche, input.objective, input.budget, profile, campaigns)
  ).sort((a, b) => b.score - a.score);

  const recommended  = scores[0];
  const alternatives = scores.slice(1);

  const creative = getCreativeRecommendations(niche, input.objective);

  // Tip de budget
  let budgetTip = "";
  if (input.budget < 500)        budgetTip = "Budget abaixo de R$500/mês limita muito o alcance. Recomendamos no mínimo R$800/mês para ter dados estatísticos suficientes.";
  else if (input.budget < 1500)  budgetTip = `Com R$${input.budget}/mês, concentre tudo em ${recommended.platform === "both" ? "Meta Ads" : recommended.label} para maximizar resultados.`;
  else if (input.budget < 5000)  budgetTip = `R$${input.budget}/mês permite testes A/B sólidos. Separe 70% para o criativo principal e 30% para variações.`;
  else                           budgetTip = `Budget robusto. Recomendamos dividir: 40% topo de funil (branding) + 60% fundo de funil (conversão).`;

  // Reasoning em linguagem natural
  const reasoning = [
    `Para um negócio de **${profile?.niche || "seu nicho"}** com objetivo de **${input.objective}**,`,
    `a plataforma **${recommended.label}** obteve score ${recommended.score}/100 de compatibilidade.`,
    recommended.insights[0] ? recommended.insights[0] + "." : "",
    `O ângulo criativo mais indicado é **"${creative.angle}"** com formato **${creative.creativeType}**.`,
    alternatives[0] ? `Como alternativa, **${alternatives[0].label}** também é uma boa opção (score ${alternatives[0].score}).` : "",
  ].filter(Boolean).join(" ");

  const confidence = Math.round(
    (recommended.score * 0.6) + (campaigns.length > 0 ? 15 : 0) + (profile ? 25 : 0)
  );

  // ── Enriquece reasoning com Gemini para nichos genéricos ou score baixo ──
  let finalReasoning = reasoning;
  if (niche === "generico" || recommended.score < 70) {
    try {
      const aiPrompt = `Você é um especialista em marketing digital e mídia paga.

Perfil do cliente:
- Nicho: ${profile?.niche || "não informado"}
- Produto/Serviço: ${profile?.productService || "não informado"}
- Público-alvo: ${profile?.targetAudience || "não informado"}
- Dor principal: ${profile?.mainPain || "não informado"}
- Objetivo: ${input.objective}
- Budget: R$ ${input.budget}/mês
- Plataforma escolhida: ${input.platform}

Score calculado: ${recommended.score}/100 na plataforma ${recommended.label}

Gere uma análise estratégica em 2-3 frases explicando:
1. Por que essa plataforma é (ou não é) ideal para esse perfil
2. Qual o ângulo criativo mais indicado
3. Uma dica prática de otimização

Seja direto, técnico e específico para o nicho. Máximo 120 palavras.`;

      const aiReasoning = await gemini(aiPrompt, { temperature: 0.3 });
      if (aiReasoning && aiReasoning.length > 20) {
        finalReasoning = aiReasoning.replace(/```[^`]*```/g, "").trim();
        log.info("matching", "Reasoning enriquecido com Gemini");
      }
    } catch (e: any) {
      log.warn("matching", "Gemini reasoning falhou — usando reasoning local", { error: e.message });
    }
  }

  log.info("matching", "computeMatchScore done", {
    projectId: input.projectId, topPlatform: recommended.platform, score: recommended.score
  });

  return {
    recommended,
    alternatives,
    topAngle:        creative.angle,
    topCreativeType: creative.creativeType,
    topCTA:          creative.cta,
    audienceSummary: creative.audienceSummary,
    budgetTip,
    confidence:      Math.min(confidence, 100),
    reasoning:       finalReasoning,
  };
}
