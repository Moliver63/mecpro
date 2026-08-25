import { isAbsenceAnswer } from "./pendencyQuestions";

export type CampaignReadinessStatus = "ready" | "needs_info" | "blocked";

export interface CampaignBriefingInput {
  objective?: string | null;
  platform?: string | null;
  budget?: number | null;
  duration?: number | null;
  extraContext?: string | null;
  creativeMode?: string | null;
  uploadedImages?: unknown[] | null;
  realPhotosBase64?: unknown[] | null;
  locationMode?: string | null;
  regions?: string[] | null;
  countries?: string[] | null;
  geoCity?: string | null;
  leadForm?: unknown;
}

export interface CampaignBriefingIssue {
  field: string;
  severity: "required" | "recommended";
  question: string;
  reason: string;
}

export interface CampaignBriefingReadiness {
  status: CampaignReadinessStatus;
  score: number;
  issues: CampaignBriefingIssue[];
  requiredMissing: CampaignBriefingIssue[];
  recommendedMissing: CampaignBriefingIssue[];
  questions: string[];
  summary: string;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  leads: "Leads",
  sales: "Vendas",
  traffic: "Trafego",
  engagement: "Engajamento",
  branding: "Reconhecimento",
  awareness: "Reconhecimento",
};

function text(value: unknown): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  return isAbsenceAnswer(raw) ? "" : raw;
}

function hasAny(profile: any, fields: string[]): boolean {
  return fields.some((field) => !!text(profile?.[field]));
}

function hasUsableSocialLinks(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    return Object.values(parsed).some((entry) => !!text(entry));
  } catch {
    return raw.length > 4;
  }
}

function hasCampaignDestination(profile: any): boolean {
  return hasAny(profile, ["websiteUrl", "whatsapp", "phone"]) || hasUsableSocialLinks(profile?.socialLinks);
}

function addIssue(
  issues: CampaignBriefingIssue[],
  field: string,
  severity: "required" | "recommended",
  question: string,
  reason: string,
) {
  if (!issues.some((issue) => issue.field === field && issue.severity === severity)) {
    issues.push({ field, severity, question, reason });
  }
}

export function normalizeCampaignObjective(objective: unknown): string {
  const value = text(objective).toLowerCase();
  if (value === "outcome_leads") return "leads";
  if (value === "outcome_sales") return "sales";
  if (value === "outcome_traffic") return "traffic";
  if (value === "outcome_engagement") return "engagement";
  if (value === "outcome_awareness") return "branding";
  if (value === "awareness" || value === "reconhecimento") return "branding";
  if (value === "vendas") return "sales";
  if (value === "trafego" || value === "tráfego") return "traffic";
  if (value === "engajamento") return "engagement";
  if (value === "lead" || value === "leads") return "leads";
  return value || "leads";
}

export function evaluateCampaignBriefingReadiness(
  input: CampaignBriefingInput,
  clientProfile: any,
): CampaignBriefingReadiness {
  const objective = normalizeCampaignObjective(input.objective || clientProfile?.campaignObjective);
  const platform = text(input.platform) || "meta";
  const budget = Number(input.budget ?? clientProfile?.monthlyBudget ?? 0);
  const duration = Number(input.duration ?? 0);
  const dailyBudget = duration > 0 ? budget / duration : 0;
  const issues: CampaignBriefingIssue[] = [];

  if (!OBJECTIVE_LABELS[objective]) {
    addIssue(issues, "objective", "required", "Qual objetivo da campanha: Leads, Vendas, Trafego, Engajamento ou Reconhecimento?", "Objetivo indefinido muda toda a estrutura da campanha e o evento de otimizacao.");
  }

  if (!budget || budget <= 0) {
    addIssue(issues, "budget", "required", "Qual sera o orcamento total ou diario para esta campanha?", "Sem orcamento nao da para dividir verba por conjunto nem estimar volume minimo.");
  } else if (dailyBudget > 0 && platform.includes("meta") && dailyBudget < 5.11) {
    addIssue(issues, "budget", "required", "Podemos ajustar o orcamento para pelo menos R$ 5,11 por dia na Meta?", "A Meta exige um minimo diario pratico; abaixo disso a campanha tende a falhar ou nao entregar.");
  } else if (dailyBudget > 0 && dailyBudget < 20) {
    addIssue(issues, "budget", "recommended", "O orcamento diario esta baixo. Quer manter assim para teste ou aumentar para ganhar volume?", "Orcamento muito baixo limita aprendizado e leitura de performance.");
  }

  if (!duration || duration <= 0) {
    addIssue(issues, "duration", "required", "Por quantos dias a campanha deve rodar?", "A duracao define orcamento diario, aprendizado e calendario de otimizacao.");
  } else if (duration < 7) {
    addIssue(issues, "duration", "recommended", "A campanha pode rodar por pelo menos 7 dias?", "Periodos muito curtos reduzem aprendizado e estabilidade de entrega.");
  }

  if (!hasAny(clientProfile, ["companyName", "niche"])) {
    addIssue(issues, "business", "required", "Qual e o nome do negocio e em qual nicho ele atua?", "Sem negocio e nicho a copy fica generica e perde contexto competitivo.");
  }

  if (!hasAny(clientProfile, ["productName", "productService"])) {
    addIssue(issues, "offer", "required", "Qual produto, servico ou oferta exatamente sera anunciado?", "A campanha precisa de uma oferta clara para gerar criativos e chamadas consistentes.");
  }

  if (!hasAny(clientProfile, ["targetAudience", "idealCustomerProfile"])) {
    addIssue(issues, "audience", "required", "Quem e o publico principal da campanha?", "Publico vago prejudica segmentacao, angulo de copy e qualificacao do lead.");
  }

  if (!hasAny(clientProfile, ["uniqueValueProposition", "productDifferentials"])) {
    addIssue(issues, "differential", "recommended", "Qual diferencial real deve aparecer na copy?", "Diferencial fraco deixa os cards parecidos com anuncios comuns do mercado.");
  }

  if (!hasAny(clientProfile, ["mainPain", "desiredTransformation"])) {
    addIssue(issues, "pain", "recommended", "Qual dor ou desejo principal do publico essa campanha precisa ativar?", "Dor e transformacao ajudam a IA a escrever cards mais persuasivos.");
  }

  if (!hasAny(clientProfile, ["mainObjections"])) {
    addIssue(issues, "objections", "recommended", "Quais objeções o anuncio precisa quebrar?", "Objeções guiam provas, garantias, preco e argumentos dos cards.");
  }

  if (objective === "leads") {
    if (!hasCampaignDestination(clientProfile) && !input.leadForm) {
      addIssue(issues, "lead_destination", "required", "O lead deve ir para WhatsApp, formulario instantaneo, Instagram ou landing page?", "Campanha de leads precisa de destino e forma de contato.");
    }
    addIssue(issues, "lead_qualification", "recommended", "Qual pergunta qualifica um lead bom para esta campanha?", "Sem criterio de qualificacao, o volume pode subir com baixa qualidade.");
  }

  if (objective === "sales") {
    if (!hasAny(clientProfile, ["productPrice", "priceRange"])) {
      addIssue(issues, "price", "recommended", "Qual preco, faixa de preco ou condicao comercial pode aparecer?", "Preco ou faixa ajuda a filtrar curiosos e melhorar intencao.");
    }
    if (!hasCampaignDestination(clientProfile)) {
      addIssue(issues, "sales_destination", "required", "Onde a venda deve acontecer: site, checkout, WhatsApp ou direct?", "Campanha de vendas precisa de caminho de compra.");
    }
  }

  if (objective === "traffic" && !hasAny(clientProfile, ["websiteUrl"])) {
    addIssue(issues, "traffic_url", "required", "Qual URL da pagina que deve receber o trafego?", "Campanha de trafego sem URL nao tem destino principal.");
  }

  if (objective === "engagement" && !hasUsableSocialLinks(clientProfile?.socialLinks)) {
    addIssue(issues, "engagement_channel", "required", "Qual perfil, pagina ou post deve receber o engajamento?", "Engajamento precisa de canal claro para otimizar a entrega.");
  }

  const photoCount = (input.uploadedImages?.length || 0) + (input.realPhotosBase64?.length || 0);
  if ((input.creativeMode === "upload" || photoCount > 0) && photoCount > 1) {
    addIssue(issues, "featured_photo", "recommended", "Qual foto deve ser a capa/destaque do carrossel?", "A primeira imagem define a parada de rolagem e o contexto visual do anuncio.");
    addIssue(issues, "photo_order", "recommended", "Quer uma ordem especifica das fotos ou posso organizar por impacto visual?", "A ordem dos cards muda a narrativa do carrossel.");
  }

  if (["brasil", "raio", "cidade"].includes(String(input.locationMode || "")) && input.locationMode === "raio" && !text(input.geoCity)) {
    addIssue(issues, "location", "required", "Qual cidade deve ser usada como centro do raio da campanha?", "Raio sem cidade nao define geografia.");
  }

  const requiredMissing = issues.filter((issue) => issue.severity === "required");
  const recommendedMissing = issues.filter((issue) => issue.severity === "recommended");
  const score = Math.max(0, Math.min(100, 100 - requiredMissing.length * 18 - recommendedMissing.length * 7));
  const status: CampaignReadinessStatus = requiredMissing.length ? "blocked" : recommendedMissing.length ? "needs_info" : "ready";
  const objectiveLabel = OBJECTIVE_LABELS[objective] || objective || "campanha";

  return {
    status,
    score,
    issues,
    requiredMissing,
    recommendedMissing,
    questions: issues.map((issue) => issue.question),
    summary: status === "ready"
      ? `Briefing pronto para ${objectiveLabel}.`
      : status === "blocked"
        ? `Faltam ${requiredMissing.length} informacoes obrigatorias antes de gerar uma campanha de ${objectiveLabel}.`
        : `Briefing utilizavel para ${objectiveLabel}, mas ${recommendedMissing.length} resposta(s) melhorariam performance.`,
  };
}
