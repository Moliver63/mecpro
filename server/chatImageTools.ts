export const chatImageTool = {
  name: "gerar_imagem_campanha",
  description: "Prepara uma imagem para um criativo existente sem imagem. Consulte a campanha para identificar o indice. Nao exige fotos reais nem publica na Meta. Preserva fotos e capa existentes. O motor pode usar imagem gerada ou banco de imagens; nao afirme origem IA sem comprovacao.",
  parameters: { type: "object", properties: {
    campaignId: { type: "integer", minimum: 1 },
    creativeIndex: { type: "integer", minimum: 0 },
    format: { type: "string", enum: ["feed", "stories", "square"] },
  }, required: ["campaignId", "creativeIndex", "format"] },
};

export async function generateChatImage(userId: number, args: any, injected?: any) {
  if (!Number.isInteger(args?.campaignId) || args.campaignId < 1 || !Number.isInteger(args.creativeIndex) || args.creativeIndex < 0 || !["feed", "stories", "square"].includes(args.format)) return { ok: false, erro: "Escolha a campanha, o criativo e o formato." };
  const db = injected ?? await import("./db");
  try {
    const campaign = await db.getCampaignById(args.campaignId);
    const project = campaign && await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) return { ok: false, erro: "Campanha indisponivel para esta conta." };
    const creatives = JSON.parse(campaign.creatives || "[]");
    const creative = creatives[args.creativeIndex];
    if (!creative) return { ok: false, erro: "Criativo nao encontrado. Consulte a campanha antes de gerar." };
    const field = args.format === "stories" ? "storyImageUrl" : args.format === "square" ? "squareImageUrl" : "feedImageUrl";
    if (creative.usesRealPhoto || creative[field] || creative.imageUrl) return { ok: false, erro: "Este criativo ja possui imagem ou foto real. Use a tela da campanha para substituir; mantive a imagem atual." };
    const user = await db.getUserById(userId);
    if (!user) return { ok: false, erro: "Usuario indisponivel." };
    const caller = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
    const result = await caller.campaigns.regenerateCreativeImage({ campaignId: args.campaignId, creativeIndex: args.creativeIndex, format: args.format, onlyIfMissing: true });
    if (!result?.ok || !result.imageUrl) return { ok: false, erro: "O gerador nao confirmou uma imagem. Nao publique esta tentativa." };
    return { ok: true, campaignId: args.campaignId, creativeIndex: args.creativeIndex, format: args.format, imageUrl: result.imageUrl, published: false, note: "Imagem salva na campanha, sem publicar na Meta. Origem automatica: pode incluir banco de imagens; nao afirmar geracao por IA." };
  } catch { return { ok: false, erro: "Nao consegui confirmar a geracao da imagem. Confira a campanha antes de repetir; nao e necessario enviar dez fotos." }; }
}
