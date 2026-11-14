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
  // Imóveis
  "última unidade",
  "ultima unidade",
  "disponível agora",
  "disponivel agora",
  "agende agora",
  "agende já",
  "visita agora",
  "última oportunidade",
  "ultima oportunidade",
  "condição especial",
  "condicao especial",
  "oportunidade única",
  "oportunidade unica",
  // Serviços
  "fale agora",
  "consulta gratuita",
  "avaliação gratuita",
  "avaliacao gratuita",
  "sem compromisso",
  "resposta imediata",
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

// Achado real (relato de Michel): o validador acusou "cura" num anúncio
// que só tinha "procura" — "cura" é substring literal de "procura", e a
// checagem original usava String.includes(), que casa QUALQUER substring,
// sem olhar se é a palavra inteira. O mesmo texto ("O que você procura...")
// é gerado de verdade por buildRealEstateCarouselAngles (carouselCopy.ts),
// então isso penalizava campanhas reais sem nenhum termo de risco de
// verdade. Corrigido: cada termo vira uma regex com \b nas duas pontas —
// "cura" some de "procura"/"escura"/"obscuro" mas continua pegando "cura"
// como palavra isolada.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function containsTerm(normalizedText: string, term: string): boolean {
  const escaped = escapeRegExp(normalize(term));
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
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
    // Sem "prazo" aqui: pedir prazo empurrava o modelo a inventar ou a
    // transformar prazo de acesso em promessa de resultado (campanha 811).
    recommendations.push("Inclua números, benefício concreto ou prova específica que estejam confirmados no briefing.");
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

// ── Urgencia so conta quando a oferta tem condicao real ──────────────────────
// Achado real (campanhas 806, 810 e 811, projeto 49): a oferta (aula R$ 19,90,
// sem prazo) nunca passava de 75 porque a urgencia valia 20% da nota e a
// unica forma de subir era inventar prazo ou escassez, que o Fact Guard e o
// prompt proibem. A urgencia ficava sempre na base 25, e a recomendacao
// "adicione urgencia" empurrava o modelo para distorcer fato (ex.: "acesso
// por 7 dias" virou "transforme-se em 7 dias").
// Quando a geracao sabe que o cliente NAO informou condicao de urgencia,
// grava `urgencyApplicable: false` no criativo; o flag vai junto no JSON e
// toda repontuacao depois (edicao na tela, chat, MCP) usa o mesmo criterio.
// Ver docs/specs/2026-11-14-urgencia-e-resultado-com-prazo.md.
// So condicao que ACABA conta. Palavra solta nao: "sem prazo de validade",
// "lote de 360m2", "lancamento" (imovel na planta), "bonus de material",
// "inscricoes abertas", "desconto a vista" e "atendimento 24/7" disparavam a
// primeira versao (revisao Goldfish, 14/11).
const URGENCIA_CONFIRMADA = [
  /\bate o dia\b/, /\bate dia\b/, /\bvalid[oa]s? (somente |so )?ate\b/, /\bso ate\b/, /\bsomente ate\b/,
  /\bpor tempo limitado\b/, /\bultimas? vagas\b/, /\bvagas limitadas\b/, /\bultimas? unidades\b/,
  /\b(promocao|desconto|oferta|condicao especial|inscricoes|matriculas|vendas)\b[^.]{0,40}\b(ate|encerra|termina|acaba)\b/,
  /\b(encerra|termina|acaba)(m)? (em|na|no|no dia|dia|amanha|hoje|domingo|segunda|sexta|sabado)\b/,
  /\bblack friday\b/, /\bcupom\b/, /\bpre[- ]?venda\b/, /\bfeirao\b/,
  /\b(1|2|3|primeiro|segundo|terceiro|ultimo|virada de) ?o? lote\b/, /\blote (1|2|3|promocional)\b/,
  // data dd/mm (nao "24/7", que e horario de atendimento)
  /(?<![\d/])(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/\d{2,4})?(?![\d/])/,
];
const NAO_E_URGENCIA = /\b24\/7\b/g;

export function ofertaTemUrgenciaConfirmada(textoConfirmado: string): boolean {
  const n = normalize(String(textoConfirmado || "")).replace(NAO_E_URGENCIA, " ");
  return URGENCIA_CONFIRMADA.some(re => re.test(n));
}

/**
 * Grava o flag em cada criativo da geracao. Sem fatos da campanha, REMOVE
 * qualquer `urgencyApplicable` que tenha vindo no JSON do modelo: so a
 * geracao com fatos decide isso (revisao Goldfish: flag forjavel).
 */
export function aplicarFlagDeUrgencia(creatives: any[], confirmedClaimsRaw: string | undefined): any[] {
  const aplicavel = confirmedClaimsRaw === undefined ? undefined : ofertaTemUrgenciaConfirmada(confirmedClaimsRaw);
  return (Array.isArray(creatives) ? creatives : []).map(cr => {
    if (!cr || typeof cr !== "object") return cr;
    const { urgencyApplicable: _ignorado, ...resto } = cr;
    return aplicavel === undefined ? resto : { ...resto, urgencyApplicable: aplicavel };
  });
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
  // Detecta placeholders em múltiplos formatos
  const hasPlaceholder = (
    /\[.*?\]/.test(combined) ||           // [marca], [produto]
    /\{.*?\}/.test(combined) ||           // {empresa}, {nome}
    /placeholder/i.test(combined) ||
    /\(nome do\s/i.test(combined) ||      // (nome do produto)
    /EMPRESA_AQUI|PRODUTO_AQUI|MARCA_AQUI/i.test(combined) ||
    /\bXXX\b/.test(combined) ||
    /\bNOME_DA_EMPRESA\b/i.test(combined)
  );
  if (hasPlaceholder) clarity -= 30;
  if (/\b(clique aqui|saiba mais apenas|solucao completa|melhor do mercado)\b/i.test(normalized)) clarity -= 12;

  let urgency = 25; // base 25: copy sem urgência explícita ainda é funcional
  const urgencyHits = URGENCY_TERMS.filter((term) => containsTerm(normalized, term)).length;
  urgency += urgencyHits * 15; // cada termo de urgência vale mais
  if (/\bhoje\b.*\bdesconto\b/i.test(normalized)) urgency += 10;
  if (/\bagend[ea]\b|\bcontat[eo]\b|\bwhatsapp\b/i.test(normalized)) urgency += 8; // CTA de ação direta
  if (urgencyHits === 0) urgency += 0; // sem bônus para copy sem urgência

  let specificity = 20;
  specificity += SPECIFICITY_PATTERNS.filter((pattern) => pattern.test(combined)).length * 18;
  if ((creative?.pain || "").trim()) specificity += 8;
  if ((creative?.solution || "").trim()) specificity += 10;
  if (/\b(para|em|com)\b/i.test(copy) && copy.split(/\s+/).length >= 10) specificity += 10;
  // Localização específica = credibilidade real
  if (/balne[aá]rio|cambori[uú]|florian[oó]polis|s[aã]o paulo|brasil/i.test(normalized)) specificity += 10;
  // Anos de mercado, número de clientes
  if (/\d+\s*anos\s*(de\s*)?(mercado|experi[eê]ncia|atuac)/i.test(normalized)) specificity += 8;
  // Nome de personas reais (Carlos, Ana, Ricardo)
  if (/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/.test(combined)) specificity += 6;

  let complianceRisk: ComplianceRisk = "Baixo";
  let compliancePenalty = 0;
  if (HIGH_RISK_TERMS.some((term) => containsTerm(normalized, term))) {
    complianceRisk = "Alto";
    compliancePenalty = 18;
  } else if (
    MEDIUM_RISK_TERMS.some((term) => containsTerm(normalized, term)) ||
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

  // Sem condicao real de urgencia informada: a urgencia nunca fica abaixo de
  // 60 (piso neutro), mas mantem o valor calculado quando ele e maior.
  // Revisao Goldfish rodada 2 (14/11): com valor fixo 60, promocao real que o
  // detector nao reconhece ("50% de desconto so hoje") caia de 100 para 60 e o
  // card legitimo perdia nota. Tirar a urgencia da conta (rodada 1) afrouxava
  // o portao demais. So `false` explicito vale; criativo antigo sem o flag
  // continua como antes.
  const urgenciaConta = creative?.urgencyApplicable !== false;
  const URGENCIA_PISO_SEM_CONDICAO = 60;
  const urgenciaNaNota = urgenciaConta ? urgency : Math.max(urgency, URGENCIA_PISO_SEM_CONDICAO);
  const finalScore = clamp(
    hookStrength * 0.3 + clarity * 0.3 + urgenciaNaNota * 0.2 + specificity * 0.2 - compliancePenalty,
  );

  const recommendations = buildRecommendations({
    hookStrength,
    clarity,
    // nao aplicavel: nao gera recomendacao de "adicione urgencia"
    urgency: urgenciaConta ? urgency : 100,
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
