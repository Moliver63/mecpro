import type { InsertCampaign } from "../drizzle/schema";
import { selectChatProject } from "./chatWorkspace";
import { chatTaskContext, chatTaskKey, runChatDraftTask, type DraftTaskStore } from "./chatDraftTask";

interface BasicDraftStore extends DraftTaskStore {
  getProjectsByUserId(userId: number): Promise<any[]>;
  getChatSessionById(id: number): Promise<any>;
  getPendingChatPhotos(id: number): Promise<Array<{ url: string; fileName: string }>>;
  checkPlanLimit(userId: number, resource: "campaigns", options: any): Promise<{ allowed: boolean; reason?: string }>;
  createCampaign(input: InsertCampaign): Promise<any>;
}

export function basicDraftData(briefing: Record<string, unknown>, project: { id: number; name: string }, photos: Array<{ url: string; fileName: string }>): InsertCampaign {
  const objective = briefing.objective;
  if (!["leads", "sales", "traffic", "branding", "engagement"].includes(String(objective))) throw new Error("Confirme o objetivo antes de salvar.");
  if (!["meta", "google", "tiktok"].includes(String(briefing.platform))) throw new Error("Confirme a plataforma antes de salvar.");
  if (typeof briefing.productService !== "string" || !briefing.productService.trim()) throw new Error("Informe a oferta antes de salvar.");
  if (typeof briefing.budget !== "number" || !Number.isFinite(briefing.budget) || briefing.budget <= 0 || !Number.isSafeInteger(briefing.durationDays) || Number(briefing.durationDays) < 1 || Number(briefing.durationDays) > 365) throw new Error("Confirme orcamento total e duracao de 1 a 365 dias.");
  if (photos.length > 10) throw new Error("Selecione no maximo 10 fotos.");
  const cover = photos.length === 1 ? 0 : briefing.featuredPhotoIndex;
  if (photos.length > 1 && (!Number.isInteger(cover) || Number(cover) < 0 || Number(cover) >= photos.length)) throw new Error(`Escolha Capa: numero de 1 a ${photos.length} antes de salvar.`);
  if (photos.some(p => !/^https:\/\//i.test(p.url))) throw new Error("Uma foto ainda nao possui URL HTTPS salva.");
  const creatives = photos.map((photo, index) => ({
    headline: "", description: "", copy: briefing.productService, hook: "", cta: "",
    feedImageUrl: photo.url, fileName: photo.fileName, photoOriginalIndex: index,
    isFeaturedPhoto: index === cover, needsReview: true, source: "basic_draft",
  }));
  const confirmedBriefing = Object.fromEntries(["projectId", "projectName", "objective", "platform", "productService", "confirmedFacts", "niche", "city", "targetAudience", "budget", "durationDays", "whatsapp", "destinationUrl", "mediaFormat", "featuredPhotoIndex"].filter(field => briefing[field] != null).map(field => [field, briefing[field]]));
  return {
    projectId: project.id, name: `Rascunho basico - ${project.name}`.slice(0, 255),
    objective: objective as InsertCampaign["objective"], platform: String(briefing.platform), durationDays: Number(briefing.durationDays),
    status: "pending_enrichment", creatives: JSON.stringify(creatives), adSets: "[]",
    strategy: "Aguardando aprimoramento e revisao. Este rascunho nao pode ser publicado.",
    aiResponse: JSON.stringify({ generationMode: "basic_draft", enrichmentStatus: "pending", publicationBlocked: true, confirmedBriefing }),
  };
}

export async function saveBasicCampaignDraft(userId: number, sessionId: number, briefing: Record<string, unknown>, store: BasicDraftStore, expectedPhotoCount = 0) {
  const session = await store.getChatSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error("Conversa nao encontrada na sua conta.");
  if (briefing.createProject === true) throw new Error("Crie primeiro o projeto na tela de projetos e selecione-o aqui.");
  const project = selectChatProject(await store.getProjectsByUserId(userId), briefing);
  if (!project) throw new Error("Selecione um projeto existente.");
  const photos = await store.getPendingChatPhotos(sessionId);
  if (photos.length < expectedPhotoCount) throw new Error("Nem todas as fotos foram confirmadas na sessao. Conclua os anexos antes de salvar.");
  const data = basicDraftData(briefing, project, photos);
  const key = chatTaskKey({ kind: "basic_campaign_v1", userId, sessionId, data });
  return chatTaskContext.run({ key }, () => runChatDraftTask(userId, async () => {
    const limit = await store.checkPlanLimit(userId, "campaigns", { projectId: project.id });
    if (!limit.allowed) throw new Error(limit.reason || "Limite de campanhas atingido.");
    const campaign = await store.createCampaign(data);
    if (!campaign?.id) throw new Error("Nao foi possivel confirmar o salvamento.");
    return { id: campaign.id as number, projectId: project.id, name: String(data.name), url: `/projects/${project.id}/campaign/result/${campaign.id}`, photoCount: photos.length };
  }, 30_000, store));
}

export async function assertCampaignEnriched(userId: number, campaignId: number, store: { getCampaignById(id: number): Promise<any>; getProjectsByUserId(id: number): Promise<any[]> }) {
  const campaign = await store.getCampaignById(campaignId);
  if (!campaign || !(await store.getProjectsByUserId(userId)).some(p => p.id === campaign.projectId)) throw new Error("Campanha nao encontrada na sua conta.");
  let response: any;
  try { response = typeof campaign.aiResponse === "string" ? JSON.parse(campaign.aiResponse) : campaign.aiResponse; } catch { response = null; }
  if (campaign.status === "pending_enrichment" || response?.generationMode === "basic_draft" || response?.publicationBlocked === true) throw new Error("Rascunho basico aguardando aprimoramento e revisao. Publicacao bloqueada.");
}
