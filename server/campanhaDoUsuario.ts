import { TRPCError } from "@trpc/server";

/**
 * Carrega a campanha so se ela pertence ao usuario logado (dono do projeto).
 *
 * Achado de 20/11/2026: updateCreativeImage, setFeaturedPhoto e
 * enhanceCreativeImage gravavam midia no criativo de qualquer campanha cujo id
 * fosse informado, sem conferir o dono. A mesma checagem ja existia em outros
 * procedimentos do campaignsRouter; aqui ela vira uma funcao so.
 *
 * Campanha de outra conta responde FORBIDDEN com a mesma mensagem usada no
 * resto do router, sem dizer se a campanha existe.
 */
export type FonteDeCampanhas = {
  getCampaignById(id: number): Promise<any>;
  getProjectById(id: number): Promise<any>;
};

export async function carregarCampanhaDoUsuario(
  fonte: FonteDeCampanhas,
  campaignId: number,
  userId: number | undefined | null,
): Promise<any> {
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const campaign = await fonte.getCampaignById(campaignId);
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });
  const projeto = await fonte.getProjectById(campaign.projectId);
  if (!projeto || projeto.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Campanha indisponivel para esta conta." });
  }
  return campaign;
}
