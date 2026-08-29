import {
  type CampaignBriefingInput,
  type CampaignBriefingIssue,
  type CampaignBriefingReadiness,
  evaluateCampaignBriefingReadiness,
  normalizeCampaignObjective,
} from "./campaignBriefingReadiness";

export type CampaignQualityGateStage = "generate" | "media" | "publish" | "optimize";
export type CampaignQualityGateStatus = "passed" | "needs_info" | "blocked";

export interface CampaignQualityGateInput extends CampaignBriefingInput {
  action?: CampaignQualityGateStage | null;
  mediaFormat?: string | null;
  destinationUrl?: string | null;
  whatsapp?: string | null;
  hasLeadForm?: boolean | null;
  hasImages?: boolean | null;
  hasVideos?: boolean | null;
  creativesCount?: number | null;
  factValidationStatus?: "passed" | "failed" | null;
  metaPublishConfirmed?: boolean | null;
}

export interface CampaignQualityGate {
  id: string;
  stage: CampaignQualityGateStage;
  status: CampaignQualityGateStatus;
  title: string;
  reason: string;
  questions: string[];
  blockingIssues: CampaignBriefingIssue[];
  recommendedIssues: CampaignBriefingIssue[];
}

export interface CampaignQualityGateReport {
  status: CampaignQualityGateStatus;
  action: CampaignQualityGateStage;
  score: number;
  readiness: CampaignBriefingReadiness;
  gates: CampaignQualityGate[];
  blockedGates: CampaignQualityGate[];
  questions: string[];
  summary: string;
}

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hasDestination(input: CampaignQualityGateInput, clientProfile: any): boolean {
  const profileWhatsapp = text(clientProfile?.whatsapp || clientProfile?.phone);
  const explicitWhatsapp = text(input.whatsapp);
  const website = text(clientProfile?.websiteUrl || input.destinationUrl);
  if (profileWhatsapp || explicitWhatsapp || website || input.hasLeadForm || input.leadForm) return true;
  try {
    const links = JSON.parse(text(clientProfile?.socialLinks));
    return !!links && typeof links === "object" && Object.values(links).some((entry) => !!text(entry));
  } catch {
    return !!text(clientProfile?.socialLinks);
  }
}

function segmentText(project: any, clientProfile: any, input: CampaignQualityGateInput): string {
  return [
    project?.name,
    project?.niche,
    clientProfile?.companyName,
    clientProfile?.niche,
    clientProfile?.productName,
    clientProfile?.productService,
    input.extraContext,
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function addSyntheticIssue(
  list: CampaignBriefingIssue[],
  field: string,
  severity: "required" | "recommended",
  question: string,
  reason: string,
) {
  if (!list.some((issue) => issue.field === field && issue.severity === severity)) {
    list.push({ field, severity, question, reason });
  }
}

function buildSegmentIssues(input: CampaignQualityGateInput, clientProfile: any, project: any): CampaignBriefingIssue[] {
  const raw = segmentText(project, clientProfile, input);
  const issues: CampaignBriefingIssue[] = [];

  const isRealEstate = /im[oó]ve|imobili|apartamento|cobertura|sala comercial|loca[cç][aã]o|venda|praia|brava/.test(raw);
  const isFood = /doce|brigadeiro|culin[aá]ria|alimenta|confeitaria|bolo|delivery|encomenda|sobremesa/.test(raw);
  const isFitness = /academia|fitness|muscula[cç][aã]o|treino|emagrec|hipertrofia|atividade f[ií]sica/.test(raw);

  if (isRealEstate) {
    const source = [
      clientProfile?.productName,
      clientProfile?.productService,
      clientProfile?.productDifferentials,
      clientProfile?.priceRange,
      clientProfile?.productPrice,
      input.extraContext,
    ].map(text).join(" ");
    if (!/\b(venda|loca[cç][aã]o|aluguel|temporada|lan[cç]amento)\b/i.test(source)) {
      addSyntheticIssue(issues, "real_estate_purpose", "required", "O imovel e para venda, locacao anual, temporada ou lancamento?", "Campanha imobiliaria muda objetivo, copy e qualificacao conforme a finalidade.");
    }
    if (!/\b\d{1,4}(?:[,.]\d+)?\s*m(?:2|²)(?=\s|[.,;:]|$)/i.test(source)) {
      addSyntheticIssue(issues, "real_estate_area", "recommended", "Qual metragem pode aparecer nos criativos?", "Metragem confirmada evita copy generica e impede herdar area de outra campanha.");
    }
    if (!/\bR\$\s*\d/i.test(source)) {
      addSyntheticIssue(issues, "real_estate_price", "recommended", "Qual valor ou condicao comercial pode aparecer?", "Valor confirmado qualifica o lead e reduz curiosos.");
    }
  }

  if (isFood) {
    if (!text(clientProfile?.productDifferentials) && !/sabor|variedade|recheio|linha|cardapio|cardápio/i.test(text(input.extraContext))) {
      addSyntheticIssue(issues, "food_offer_details", "recommended", "Quais sabores, formatos ou diferenciais dos produtos podem aparecer?", "Campanha de alimentacao precisa de apetite visual e oferta concreta.");
    }
    if (!/retirada|entrega|delivery|regi[aã]o|cidade/i.test(text(clientProfile?.productService) + " " + text(input.extraContext))) {
      addSyntheticIssue(issues, "food_delivery_region", "recommended", "Qual regiao de entrega ou retirada deve ser anunciada?", "Regiao evita clique de pessoas que nao conseguem comprar.");
    }
  }

  if (isFitness) {
    if (!/iniciante|emagrec|hipertrofia|sa[uú]de|performance|terceira idade|condicionamento/i.test(text(clientProfile?.targetAudience) + " " + text(input.extraContext))) {
      addSyntheticIssue(issues, "fitness_audience_goal", "recommended", "Qual meta do publico deve guiar os criativos: emagrecimento, hipertrofia, saude ou performance?", "Academia performa melhor quando a promessa conversa com uma meta especifica.");
    }
  }

  return issues;
}

function gateStatus(blocking: CampaignBriefingIssue[], recommended: CampaignBriefingIssue[]): CampaignQualityGateStatus {
  if (blocking.length) return "blocked";
  if (recommended.length) return "needs_info";
  return "passed";
}

function makeGate(
  id: string,
  stage: CampaignQualityGateStage,
  title: string,
  reason: string,
  blockingIssues: CampaignBriefingIssue[],
  recommendedIssues: CampaignBriefingIssue[] = [],
): CampaignQualityGate {
  const status = gateStatus(blockingIssues, recommendedIssues);
  return {
    id,
    stage,
    status,
    title,
    reason,
    questions: [...blockingIssues, ...recommendedIssues].map((issue) => issue.question),
    blockingIssues,
    recommendedIssues,
  };
}

export function evaluateCampaignQualityGates(
  input: CampaignQualityGateInput,
  clientProfile: any,
  project?: any,
): CampaignQualityGateReport {
  const action = input.action || "generate";
  const readiness = evaluateCampaignBriefingReadiness(input, clientProfile);
  const objective = normalizeCampaignObjective(input.objective || clientProfile?.campaignObjective);
  const segmentIssues = buildSegmentIssues(input, clientProfile, project);
  const mediaCount =
    (input.uploadedImages?.length || 0) +
    (input.realPhotosBase64?.length || 0) +
    (input.hasImages ? 1 : 0) +
    (input.hasVideos ? 1 : 0);
  const creativeCount = Number(input.creativesCount || 0);

  const generationRequired = [...readiness.requiredMissing, ...segmentIssues.filter((issue) => issue.severity === "required")];
  const generationRecommended = [...readiness.recommendedMissing, ...segmentIssues.filter((issue) => issue.severity === "recommended")];
  const gates: CampaignQualityGate[] = [
    makeGate(
      "briefing",
      "generate",
      "Briefing minimo",
      "Garante que objetivo, oferta, publico, verba, duracao e destino estejam claros antes de usar IA.",
      generationRequired,
      generationRecommended,
    ),
  ];

  const mediaRequired: CampaignBriefingIssue[] = [];
  const mediaRecommended: CampaignBriefingIssue[] = [];
  const mediaFormat = text(input.mediaFormat).toLowerCase();
  if (["carousel", "carrossel", "mixed"].includes(mediaFormat) && mediaCount < 2) {
    addSyntheticIssue(mediaRequired, "carousel_media", "required", "Envie pelo menos 2 imagens/videos para montar um carrossel.", "Carrossel sem midias suficientes vira criativo desalinhado ou repetido.");
  }
  if (mediaCount > 1 && typeof input.featuredPhotoIndex !== "number" && !(input.photoOrder?.length)) {
    addSyntheticIssue(mediaRecommended, "media_order", "recommended", "Qual midia deve ser a capa ou posso ordenar por impacto visual?", "A primeira midia define a leitura do anuncio.");
  }
  gates.push(makeGate(
    "media",
    "media",
    "Midia e narrativa visual",
    "Confirma quantidade, capa e ordem das midias antes de criar carrossel ou criativos de upload.",
    mediaRequired,
    mediaRecommended,
  ));

  const publishRequired: CampaignBriefingIssue[] = [];
  if (!hasDestination(input, clientProfile)) {
    addSyntheticIssue(publishRequired, "publish_destination", "required", "Qual destino final do anuncio: WhatsApp, formulario, site ou direct?", "Publicacao sem destino desperdiça clique e mascara performance.");
  }
  if (input.factValidationStatus === "failed") {
    addSyntheticIssue(publishRequired, "fact_validation", "required", "Revise os criativos: ha fatos conflitantes com o briefing atual.", "Fact guard falhou e a campanha nao deve ser publicada.");
  }
  if (creativeCount > 0 && creativeCount < 2 && ["carousel", "carrossel"].includes(mediaFormat)) {
    addSyntheticIssue(publishRequired, "carousel_creatives", "required", "O carrossel precisa ter pelo menos 2 criativos validos antes de publicar.", "Meta e performance exigem cards suficientes para carrossel.");
  }
  if (action === "publish" && !input.metaPublishConfirmed) {
    addSyntheticIssue(publishRequired, "publish_confirmation", "required", "Confirma publicar ou republicar esta campanha na Meta?", "Publicacao na Meta tem efeito externo e pode gastar verba real.");
  }
  gates.push(makeGate(
    "publish",
    "publish",
    "Publicacao segura",
    "Impede Meta Ads sem destino, confirmacao explicita e validacao de fatos.",
    publishRequired,
  ));

  const blockedGates = gates.filter((gate) => gate.status === "blocked");
  const needsInfoGates = gates.filter((gate) => gate.status === "needs_info");
  const status: CampaignQualityGateStatus = blockedGates.length ? "blocked" : needsInfoGates.length ? "needs_info" : "passed";
  const questions = gates.flatMap((gate) => gate.questions);
  const score = Math.max(0, Math.min(100, readiness.score - segmentIssues.filter((issue) => issue.severity === "required").length * 12 - segmentIssues.filter((issue) => issue.severity === "recommended").length * 5));
  const label = objective || "campanha";

  return {
    status,
    action,
    score,
    readiness,
    gates,
    blockedGates,
    questions,
    summary: status === "passed"
      ? `Quality gates aprovados para ${label}.`
      : status === "blocked"
        ? `${blockedGates.length} gate(s) bloqueando ${action}.`
        : `${needsInfoGates.length} gate(s) com recomendacoes antes de ${action}.`,
  };
}
