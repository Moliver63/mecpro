import { log } from "./logger";

export type ComplianceRisk = "Baixo" | "Médio" | "Alto";

export interface CreativeScoreResult {
  hookStrength: number;
  clarity: number;
  urgency: number;
  specificity: number;
  complianceRisk: ComplianceRisk;
  finalScore: number;
  recommendations: string[];
}

const HIGH_RISK_TERMS = [
  "garantia de resultado",
  "resultado garantido",
  "100% garantido",
  "cura",
  "milagre",
  "enriqueca rapido",
  "ganhe dinheiro facil",
  "sem esforco",
  "sem esforço",
  "antes e depois",
];

const MEDIUM_RISK_TERMS = [
  "ultimo dia",
  "último dia",
  "imperdivel",
  "imperdível",
  "somente hoje",
  "agora ou nunca",
  "urgente",
  "transformacao imediata",
  "transformação imediata",
];

const URGENCY_TERMS = [
  "hoje",
  "agora",
  "últimas vagas",
  "ultimas vagas",
  "últimas horas",
  "ultimas horas",
  "prazo",
  "encerra",
  "vagas limitadas",
  "desconto",
  "oferta",
  "bonus",
  "bônus",
];

const SPECIFICITY_PATTERNS = [
  /\b\d+%\b/,
  /\b\d+[xX]\b/,
  /\b\d+\s?(dias|horas|minutos|passos|m[oó]dulos|aulas|vagas|anos|meses)\b/i,
  /r\$\s?\d+[\d.,]*/i,
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function buildRecommendations(parts: {
  hookStrength: number;
  clarity: number;
  urgency: number;
  specificity: number;
  complianceRisk: ComplianceRisk;
  finalScore: number;
}): string[] {
  const recommendations: string[] = [];

  if (parts.hookStrength < 60) {
    recommendations.push("Reforce o hook com dor, promessa ou pergunta mais forte nos primeiros 3 segundos.");
  }
  if (parts.clarity < 60) {
    recommendations.push("Deixe a proposta de valor mais direta e remova frases genéricas ou placeholders.");
  }
  if (parts.urgency < 45) {
    recommendations.push("Adicione urgência legítima com prazo, condição limitada ou benefício temporal verificável.");
  }
  if (parts.specificity < 55) {
    recommendations.push("Inclua números, benefício concreto, prazo ou prova específica para aumentar credibilidade.");
  }
  if (parts.complianceRisk === "Alto") {
    recommendations.push("Reduza risco de compliance removendo promessas absolutas, linguagem sensível e urgência exagerada.");
  } else if (parts.complianceRisk === "Médio") {
    recommendations.push("Revise termos de urgência e claims fortes para diminuir risco de reprovação na Meta.");
  }
  if (parts.finalScore < 60 && recommendations.length === 0) {
    recommendations.push("Reescreva headline e copy com foco em clareza, benefício e CTA mais específico.");
  }

  return unique(recommendations);
}

export function scoreCreative(creative: any): CreativeScoreResult {
  const hook = String(creative?.hook || "").trim();
  const headline = String(creative?.headline || creative?.title || "").trim();
  const copy = String(creative?.copy || creative?.description || "").trim();
  const cta = String(creative?.cta || "").trim();
  const combined = [hook, headline, copy, cta].filter(Boolean).join(" ");
  const normalized = normalize(combined);

  let hookStrength = 30;
  if (hook) hookStrength += 20;
  if (hook.length >= 18 && hook.length <= 90) hookStrength += 15;
  if (/[!?]/.test(hook)) hookStrength += 8;
  if (/\b(voce|você|descubra|como|pare|aten[cç][aã]o|novo|segredo|erro)\b/i.test(hook)) hookStrength += 12;
  if (/\d/.test(hook)) hookStrength += 8;
  if (hook.length > 120) hookStrength -= 10;

  let clarity = 35;
  if (headline) clarity += 20;
  if (copy) clarity += 15;
  if (headline.length >= 10 && headline.length <= 55) clarity += 10;
  if (copy.length >= 25 && copy.length <= 140) clarity += 10;
  if (/\[.*?\]/.test(combined) || /placeholder/i.test(combined)) clarity -= 30;
  if (/\b(clique aqui|saiba mais apenas|solucao completa|melhor do mercado)\b/i.test(normalized)) clarity -= 12;

  let urgency = 20;
  const urgencyHits = URGENCY_TERMS.filter((term) => normalized.includes(normalize(term))).length;
  urgency += urgencyHits * 12;
  if (/\bhoje\b.*\bdesconto\b/i.test(normalized)) urgency += 8;
  if (urgencyHits === 0) urgency += 5;

  let specificity = 20;
  specificity += SPECIFICITY_PATTERNS.filter((pattern) => pattern.test(combined)).length * 18;
  if ((creative?.pain || "").trim()) specificity += 8;
  if ((creative?.solution || "").trim()) specificity += 10;
  if (/\b(para|em|com)\b/i.test(copy) && copy.split(/\s+/).length >= 10) specificity += 10;

  let complianceRisk: ComplianceRisk = "Baixo";
  let compliancePenalty = 0;
  if (HIGH_RISK_TERMS.some((term) => normalized.includes(normalize(term)))) {
    complianceRisk = "Alto";
    compliancePenalty = 18;
  } else if (
    MEDIUM_RISK_TERMS.some((term) => normalized.includes(normalize(term))) ||
    /\b[A-ZÁÉÍÓÚÇ]{6,}\b/.test(combined) ||
    /!!!/.test(combined)
  ) {
    complianceRisk = "Médio";
    compliancePenalty = 8;
  }

  hookStrength = clamp(hookStrength);
  clarity = clamp(clarity);
  urgency = clamp(urgency);
  specificity = clamp(specificity);

  const finalScore = clamp(
    hookStrength * 0.3 + clarity * 0.3 + urgency * 0.2 + specificity * 0.2 - compliancePenalty,
  );

  const recommendations = buildRecommendations({
    hookStrength,
    clarity,
    urgency,
    specificity,
    complianceRisk,
    finalScore,
  });

  return {
    hookStrength,
    clarity,
    urgency,
    specificity,
    complianceRisk,
    finalScore,
    recommendations,
  };
}

export function scoreCreativeList(creatives: any[] = []): any[] {
  return creatives.map((creative, index) => ({
    ...creative,
    creativeIndex: creative?.creativeIndex ?? index,
    ...scoreCreative(creative),
  }));
}

export function selectBestCreatives(creatives: any[] = [], limit = 3): any[] {
  try {
    return scoreCreativeList(creatives)
      .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
      .slice(0, Math.max(1, limit));
  } catch (error: any) {
    log.warn("creative-score", "Falha ao selecionar melhores criativos", { error: error?.message });
    return creatives.slice(0, limit);
  }
}
