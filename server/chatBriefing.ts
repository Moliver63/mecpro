import { AsyncLocalStorage } from "node:async_hooks";

export interface ChatBriefingState {
  briefing: Record<string, unknown>;
  lastCampaign?: { id: number; name: string; projectId: number; url: string; photoCount?: number; coverFileName?: string };
}
export const briefingContext = new AsyncLocalStorage<ChatBriefingState>();
const strings = ["projectName", "name", "objective", "platform", "niche", "productService", "targetAudience", "city", "mediaFormat", "whatsapp", "destinationUrl", "confirmedFacts"];
const numbers = ["projectId", "budget", "durationDays", "ageMin", "ageMax", "featuredPhotoIndex"];

export function mergeChatBriefing(previous: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...previous };
  // Retry feedback belongs to this call, never to another campaign's briefing.
  delete next.forbiddenTerms;
  if (Array.isArray(patch.forbiddenTerms)) {
    const terms = patch.forbiddenTerms.filter((value): value is string => typeof value === "string")
      .map(value => value.trim().slice(0, 200)).filter(Boolean);
    if (terms.length) next.forbiddenTerms = [...new Set(terms)].slice(0, 20);
  }
  if (patch.projectName !== undefined && patch.projectName !== previous.projectName) delete next.confirmDistinctProject;
  for (const field of [...strings, ...numbers, "createProject", "newCampaign", "confirmDistinctProject"]) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null) { delete next[field]; continue; }
    if (strings.includes(field) && typeof value === "string" && value.trim()) next[field] = value.trim().slice(0, 4000);
    if (numbers.includes(field) && typeof value === "number" && Number.isFinite(value)) next[field] = value;
    if (["createProject", "newCampaign", "confirmDistinctProject"].includes(field) && typeof value === "boolean") next[field] = value;
  }
  if (patch.createProject === true) delete next.projectId;
  if (typeof patch.projectId === "number") { next.createProject = false; if (!("projectName" in patch)) delete next.projectName; }
  return next;
}

export function campaignResultText(campaign: NonNullable<ChatBriefingState["lastCampaign"]>): string {
  return `Rascunho criado: ${campaign.name} (#${campaign.id}).\n${campaign.url}` +
    (campaign.photoCount !== undefined ? `\nFotos encaminhadas ao gerador: ${campaign.photoCount}.` : "") +
    (campaign.coverFileName ? ` Capa solicitada: ${campaign.coverFileName}.` : "") +
    "\nNada foi publicado na Meta.";
}

export function generationErrorText(error: string): string {
  // Achado real (Michel colou essa mensagem exata, 17/09): "Fact Guard" é
  // nome de módulo interno — um dono de padaria ou corretor de imóveis
  // usando o chat não tem contexto nenhum pro que isso significa. Essa
  // string vira o campo "erro" que o modelo lê e é instruído a "repassar
  // de forma clara" — sem reescrever aqui, existe risco real do modelo
  // simplesmente repetir "Fact Guard" pro cliente final. Reescrito sem
  // jargão interno, e com a próxima ação sugerida (a mesma que a IA já
  // formulava naturalmente antes disso existir como texto fixo — não
  // reescrever isso é regredir a experiência, não só um detalhe de
  // nomenclatura).
  if (/FACT_CONFLICT/i.test(error)) return "A campanha não foi salva porque o texto gerado incluiu alguma informação que você ainda não confirmou (ou que conflita com o que já foi dito). O que já está registrado no briefing continua guardado — não precisa repetir nada. Posso tentar gerar de novo agora, com mais cuidado pra não incluir isso. Tudo bem?";
  return error;
}

export function isLastCampaignLinkRequest(text: string): boolean {
  return /\blink\b/i.test(text) && /mostr|manda|envia|qual|cad[eê]|ver/i.test(text) && !/gerar|criar|nova|\d/.test(text.toLowerCase());
}
