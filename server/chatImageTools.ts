export const chatImageTool = {
  name: "gerar_imagem_campanha",
  description: "Inicia tarefas persistentes para todas as imagens faltantes da campanha. Omita creativeIndex para todos os cards. Consulte action=status para progresso; revalidate analisa imagens pendentes sem gerar de novo. Preserva fotos reais e capa; nao publica. Nao diga que ja gerou se o estado for queued. Origem pode ser IA ou banco de imagens.",
  parameters: { type: "object", properties: {
    campaignId: { type: "integer", minimum: 1 },
    action: { type: "string", enum: ["start", "status", "revalidate"] },
    creativeIndex: { type: "integer", minimum: 0 },
    format: { type: "string", enum: ["feed", "stories", "square"] },
  }, required: ["campaignId"] },
};

export async function generateChatImage(userId: number, args: any, injected?: any) {
  try {
    return await (await import("./campaignImageJobs")).campaignImageJobs(userId, args, injected);
  } catch { return { ok: false, erro: "Nao consegui consultar a tarefa de imagens. Consulte o status antes de repetir. Nenhuma publicacao foi solicitada." }; }
}
