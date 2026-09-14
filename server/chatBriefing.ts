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
  if (/FACT_CONFLICT/i.test(error)) return "O gerador produziu informacoes nao confirmadas e o Fact Guard bloqueou esta tentativa. Nenhuma campanha foi salva por esta tentativa. O briefing foi mantido; nao e necessario trocar de projeto nem aceitar os trechos inventados.";
  return error;
}

export function isLastCampaignLinkRequest(text: string): boolean {
  return /\blink\b/i.test(text) && /mostr|manda|envia|qual|cad[eê]|ver/i.test(text) && !/gerar|criar|nova|\d/.test(text.toLowerCase());
}
