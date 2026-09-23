import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export const adsTurn = new AsyncLocalStorage<{ message: string }>();
export const adsReadTools = [
  { name: "consultar_metricas_campanha", description: "Consulta metricas salvas, nao ao vivo. Ausencia de dados nao significa zero resultados.", parameters: { type: "object", properties: { campaignId: { type: "integer" }, days: { type: "integer", minimum: 1, maximum: 90 } }, required: ["campaignId"] } },
  { name: "consultar_relatorio_anuncios", description: "Consulta relatorio Meta, Google e TikTok. Informe periodo e plataformas desejadas. Falhas ou dados ausentes nao sao resultados zero.", parameters: { type: "object", properties: { platforms: { type: "array", items: { type: "string", enum: ["meta", "google", "tiktok"] } }, period: { type: "string", enum: ["7d", "30d", "90d"] } } } },
];

async function bounded<T>(work: Promise<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Tempo de consulta excedido; nenhum resultado foi confirmado.")), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

function compact(value: any, depth = 0): any {
  if (value instanceof Date) return value.toISOString();
  if (depth > 7) return "[detalhes omitidos]";
  if (Array.isArray(value)) return { totalItems: value.length, items: value.slice(0, 8).map(v => compact(v, depth + 1)) };
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([k, v]) => [k, compact(v, depth + 1)]));
  return typeof value === "string" ? value.slice(0, 600) : value;
}

export async function queryChatAds(name: string, args: Record<string, any>, userId: number, injected?: any) {
  const db = injected ?? await import("./db");
  try {
    if (name === "consultar_metricas_campanha") {
      const days = args.days ?? 30;
      if (!Number.isInteger(args.campaignId) || args.campaignId < 1 || !Number.isInteger(days) || days < 1 || days > 90) return { erro: "Campanha ou periodo invalido." };
      const campaign = await db.getCampaignById(args.campaignId);
      const project = campaign && await db.getProjectById(campaign.projectId);
      if (!project || project.userId !== userId) return { erro: "Campanha indisponivel para esta conta." };
      const metrics = await bounded(db.getCampaignMetricsDaily(args.campaignId, days)) as any[];
      const report = compact(metrics);
      if (JSON.stringify(report).length > 18000) return { erro: "Metricas muito extensas. Reduza o periodo." };
      return { source: "stored_daily_metrics", live: false, campaignId: args.campaignId, days, status: metrics.length ? "available" : "no_data", metrics: report, note: "Amostra de ate 8 registros, nao total do periodo. Dados salvos podem estar desatualizados. Nao interprete ausencia como zero." };
    }
    if (name !== "consultar_relatorio_anuncios") return { erro: "Consulta desconhecida." };
    const platforms = args.platforms ?? ["meta", "google", "tiktok"];
    const period = args.period ?? "30d";
    if (!Array.isArray(platforms) || !platforms.length || platforms.length > 3 || platforms.some(p => !["meta", "google", "tiktok"].includes(p)) || !["7d", "30d", "90d"].includes(period)) return { erro: "Plataformas ou periodo invalido." };
    const user = await db.getUserById(userId);
    if (!user) return { erro: "Usuario indisponivel." };
    const caller = injected?.caller ?? (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
    const result = await bounded(caller.unified.getFullReport({ platforms, period }));
    const report = compact(result);
    if (JSON.stringify(report).length > 18000) return { erro: "Relatorio muito extenso. Consulte uma plataforma por vez." };
    return { source: "platform_apis", period, report, note: "Resumo limitado a 8 itens por lista. Preserve avisos de falha e configuracao de cada plataforma; nao trate dados ausentes como zero." };
  } catch { return { erro: "Consulta indisponivel ou excedeu o tempo. Nenhuma metrica foi confirmada; tente novamente." }; }
}

export async function publishChatAds(userId: number, options: any, injected?: any) {
  const db = injected ?? await import("./db");
  try {
    if (!Number.isInteger(options.campaignId) || options.campaignId < 1 || !/^\d+$/.test(options.pageId)) return { ok: false, erro: "Campanha ou pagina invalida." };
    if ((options.destination ?? "website") !== "website" || typeof options.linkUrl !== "string" || !/^https:\/\//i.test(options.linkUrl)) return { ok: false, erro: "No chat, confirme um destino HTTPS explicito. Para formulario instantaneo, use a tela de publicacao." };
    const campaign = await db.getCampaignById(options.campaignId);
    const project = campaign && await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) return { ok: false, erro: "Campanha indisponivel para esta conta." };
    const snapshot = JSON.stringify({ userId, options, campaign });
    const token = createHash("sha256").update(snapshot).digest("hex").slice(0, 16);
    const confirmation = `CONFIRMAR PUBLICACAO ${token}`;
    if (adsTurn.getStore()?.message.trim() !== confirmation) return {
      ok: false, confirmationRequired: true, campaignId: campaign.id, name: campaign.name,
      pageId: options.pageId, adSets: campaign.adSets, destination: options.linkUrl ?? "automatico",
      erro: `Mostre os conjuntos e orcamentos ao usuario. Para publicar pausada, ele deve enviar exatamente: ${confirmation}. Se alterar a campanha ou destino, solicite nova confirmacao.`,
    };
    // One reservation per campaign, including partial/uncertain outcomes. Never reopen after a timeout.
    const reserved = await db.reserveMcpIdempotencyKey(userId, "chat_meta_publish", String(campaign.id));
    if (reserved.kind === "cached_result") return reserved.result;
    if (reserved.kind !== "proceed") return { ok: false, erro: "Publicacao ja solicitada. Verifique o resultado na Meta antes de tentar novamente." };
    const publish = injected?.publish ?? (await import("./campaignPublish")).publicarCampanhaNaMeta;
    const work = publish(userId, options).then(async (result: any) => {
      await db.completeMcpIdempotencyKey(reserved.recordId, result);
      return result;
    });
    return await bounded(work, 45000);
  } catch { return { ok: false, erro: "Nao foi possivel confirmar a publicacao. Confira a campanha na Meta; nao repita a publicacao." }; }
}
