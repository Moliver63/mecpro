import { appRouter } from "./_core/router";
import * as db from "./db";
import { auditCarouselCreatives, orderedCreativesForCarousel, getCreativeMedia } from "./carouselAudit";

/**
 * campaignPublish.ts — orquestração de "publicar campanha na Meta de verdade",
 * extraída do que já existia (e continua existindo) na ferramenta MCP
 * publish_campaign (server/mcpServer.ts), pra ser reaproveitada também pela
 * nova ferramenta de chat (publicar_campanha) sem duas implementações
 * divergentes da mesma auditoria/upload/chamada de API.
 *
 * Diferença em relação ao caminho do MCP: sem idempotencyKey explícita (o
 * chat é uma conversa ao vivo, não um agente automatizado repetindo
 * chamadas por timeout) — a proteção contra publicar duas vezes aqui é
 * mais simples: o chamador (chat.ts) já resolve "essa campanha" contra
 * chat_sessions.lastCampaignId e o próprio SYSTEM_PROMPT instrui a nunca
 * chamar isso sem confirmação explícita do usuário na MESMA troca.
 */

interface PublicarCampanhaOptions {
  campaignId: number;
  pageId: string;
  destination?: "website" | "lead_form";
  leadGenFormId?: string;
  linkUrl?: string;
  adSetIndexes?: number[];
}

// Achado real (teste, 13/09): db.ts é importado como módulo ESM
// ("import * as db") — suas exportações são bindings somente-leitura por
// especificação, o que quebra tentativas de mockar (t.mock.method) a
// mesma função em mais de um teste ("Cannot redefine property"). Em vez
// de lutar contra essa mecânica, segue o MESMO padrão já usado com
// sucesso em chatWorkspace.ts: as duas únicas leituras que valem a pena
// testar (buscar campanha, buscar projeto — os caminhos de validação
// ANTES de qualquer chamada de rede) são injetáveis, com a implementação
// real de db.ts como padrão. O resto da função (rede/Meta) não muda.
interface PublicarCampanhaDeps {
  getCampaignById: typeof db.getCampaignById;
  getProjectById: typeof db.getProjectById;
}
const depsPadrao: PublicarCampanhaDeps = { getCampaignById: db.getCampaignById, getProjectById: db.getProjectById };

type PublicarCampanhaResultado =
  | { ok: true; successCount: number; total: number; results: Array<{ adSetName: string; success: boolean; error?: string }>; metaCampaignId?: string; summaryText: string }
  | { ok: false; erro: string; issues?: string[] };

async function criarCallerParaUsuario(userId: number) {
  const user = await db.getUserById(userId);
  if (!user) throw new Error("Usuário não encontrado.");
  return appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
}

/** Lista as Páginas do Facebook que a conta Meta conectada do usuário tem acesso — necessário pra descobrir o pageId antes de publicar. */
export async function listarPaginasMetaConectadas(userId: number): Promise<{ ok: true; pages: Array<{ pageId: string; name: string }> } | { ok: false; erro: string }> {
  const integration: any = await db.getApiIntegration(userId, "meta");
  if (!integration?.accessToken) {
    return { ok: false, erro: "Conta Meta não conectada. Peça pro usuário conectar em Configurações → Meta Ads antes de publicar." };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name&limit=50&access_token=${integration.accessToken}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data: any = await res.json();
    if (data.error) return { ok: false, erro: `Erro ao buscar páginas: ${data.error.message}` };
    return { ok: true, pages: (data.data || []).map((p: any) => ({ pageId: p.id, name: p.name })) };
  } catch (e: any) {
    return { ok: false, erro: `Falha ao consultar a Meta: ${e?.message || "erro desconhecido"}.` };
  }
}

export async function publicarCampanhaNaMeta(userId: number, opts: PublicarCampanhaOptions, deps: PublicarCampanhaDeps = depsPadrao): Promise<PublicarCampanhaResultado> {
  const campaign: any = await deps.getCampaignById(opts.campaignId);
  if (!campaign) return { ok: false, erro: `Campanha ${opts.campaignId} não encontrada.` };

  const project: any = await deps.getProjectById(campaign.projectId);
  if (!project || project.userId !== userId) return { ok: false, erro: "Essa campanha não pertence à sua conta." };

  const adSets: any[] = (() => { try { return JSON.parse(campaign.adSets || "[]"); } catch { return []; } })();
  const creatives: any[] = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();
  if (adSets.length === 0) return { ok: false, erro: "Essa campanha não tem conjuntos de anúncios gerados." };

  let caller;
  try {
    caller = await criarCallerParaUsuario(userId);
  } catch (e: any) {
    return { ok: false, erro: e?.message || "Falha ao autenticar para publicar." };
  }

  // Mesma auditoria de carrossel usada pelo publish_campaign do MCP —
  // bloqueia ANTES de gastar dinheiro se os cards tiverem copy fraca,
  // curta ou repetida.
  const copyAudit = auditCarouselCreatives(creatives);
  if (!copyAudit.ok) {
    return {
      ok: false,
      erro: "Publicação bloqueada pela auditoria de carrossel: há cards com copy fraca, curta ou repetida. Regenere ou atualize os criativos antes de publicar.",
      issues: copyAudit.issues,
    };
  }

  const orderedCreatives = orderedCreativesForCarousel(creatives);
  const uniqueImages = Array.from(new Set(
    orderedCreatives
      .map((c: any) => getCreativeMedia(c))
      .filter((x: any) => x.hash || x.url)
      .map((x: any) => (x.hash ? `hash:${x.hash}` : `url:${x.url}`))
  )).slice(0, 10);

  if (uniqueImages.length === 0) {
    return { ok: false, erro: "Nenhuma imagem encontrada nos criativos — não é possível publicar sem imagem." };
  }

  async function resolveToHash(tagged: string): Promise<string> {
    if (tagged.startsWith("hash:")) return tagged.slice(5);
    const url = tagged.slice(4);
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const uploadResult: any = await caller.integrations.uploadImageToMeta({
      imageBase64: buf.toString("base64"),
      fileName: `campaign-${opts.campaignId}-${Date.now()}.jpg`,
    } as any);
    return uploadResult.hash || uploadResult.imageHash;
  }

  let imageHash: string | undefined;
  let imageHashes: string[] | undefined;
  try {
    if (uniqueImages.length === 1) {
      imageHash = await resolveToHash(uniqueImages[0]);
    } else {
      imageHashes = await Promise.all(uniqueImages.map(resolveToHash));
    }
  } catch (e: any) {
    return { ok: false, erro: `Falha ao enviar imagem(ns) pra Meta: ${e?.message || "erro desconhecido"}.` };
  }

  let linkUrl = opts.linkUrl;
  if (!linkUrl) {
    try {
      const resolved: any = await caller.competitors.resolvePageLink({ pageId: opts.pageId });
      linkUrl = resolved?.whatsappUrl || (resolved?.website ? (resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`) : undefined);
    } catch { /* segue sem link automático */ }
  }

  const indexesToPublish = opts.adSetIndexes?.length ? opts.adSetIndexes : adSets.map((_, i) => i);
  const results: Array<{ adSetName: string; success: boolean; error?: string }> = [];
  let sharedMetaCampaignId: string | undefined;

  for (const idx of indexesToPublish) {
    const adSetName = adSets[idx]?.name || `Conjunto ${idx + 1}`;
    try {
      const result: any = await caller.campaigns.publishToMeta({
        campaignId: opts.campaignId,
        projectId: campaign.projectId,
        pageId: opts.pageId,
        destination: opts.destination || "website",
        leadGenFormId: opts.leadGenFormId,
        linkUrl,
        imageHash,
        imageHashes,
        adSetIndex: idx,
        ...(sharedMetaCampaignId ? { existingMetaCampaignId: sharedMetaCampaignId } : {}),
      } as any);
      if (!sharedMetaCampaignId && result?.campaignId) sharedMetaCampaignId = result.campaignId;
      results.push({ adSetName, success: true });
    } catch (e: any) {
      results.push({ adSetName, success: false, error: e?.message || "Erro desconhecido ao publicar." });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const summary = results.map((r) => (r.success ? `✅ ${r.adSetName}` : `❌ ${r.adSetName}: ${r.error}`)).join("\n");
  const summaryText = `${successCount}/${results.length} conjunto(s) de anúncio publicado(s) na Meta (pausados — ative manualmente depois de revisar).\n\n${summary}`;

  if (successCount !== results.length) {
    await db.updateCampaign(opts.campaignId, {
      publishStatus: successCount === 0 ? "error" : "partial",
      publishError: results.filter((r) => !r.success).map((r) => `${r.adSetName}: ${r.error}`).join("\n") || "Publicação parcial na Meta.",
    } as any).catch(() => {});
  }

  return { ok: true, successCount, total: results.length, results, metaCampaignId: sharedMetaCampaignId, summaryText };
}
