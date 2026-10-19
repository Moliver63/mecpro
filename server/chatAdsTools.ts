import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { pendenciasLocaisParaPublicar } from "./publishPreflight";
import { resolverPaginaMetaComLista, destinoDaPagina, urlHttps } from "./metaPageResolution";

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

interface OpcoesDePublicacao {
  campaignId: number;
  pageId: string;
  destination: "website" | "lead_form";
  linkUrl?: string;
  leadGenFormId?: string;
  adSetIndexes?: number[];
}

async function callerDoUsuario(db: any, userId: number, injected?: any) {
  if (injected?.caller) return injected.caller;
  const user = await db.getUserById(userId);
  if (!user) throw new Error("Usuario indisponivel.");
  return (await import("./_core/router")).appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
}

async function listarFormularios(db: any, userId: number, pageId: string, injected?: any): Promise<Array<{ id: string; name?: string; status?: string; leads_count?: number }>> {
  if (injected?.listLeadForms) return injected.listLeadForms(pageId);
  const caller = await callerDoUsuario(db, userId, injected);
  return caller.integrations.listLeadForms({ pageId });
}

function resumoFormularios(forms: Array<{ id: string; name?: string; status?: string; leads_count?: number }>) {
  return forms.slice(0, 30).map((f) => ({ leadGenFormId: String(f.id), nome: f.name || null, status: f.status || null, leads: f.leads_count ?? null }));
}

/**
 * Lista os formularios instantaneos da Pagina pra o modelo escolher PELO NOME.
 * Sem isso, `destination: "lead_form"` exigia um ID que o chat nao tinha como
 * descobrir: ou pedia o numero ao usuario, ou inventava.
 */
export async function listarFormulariosChat(userId: number, args: Record<string, any>, injected?: any) {
  const db = injected ?? await import("./db");
  try {
    const pageId = String(args?.pageId ?? "").trim();
    if (pageId && !/^\d+$/.test(pageId)) return { erro: "Pagina invalida." };
    const pagina = await bounded(resolverPaginaMetaComLista(pageId, async () => {
      const listar = injected?.listPages ?? (await import("./campaignPublish")).listarPaginasMetaConectadas;
      return listar(userId);
    }));
    if (!pagina.ok || !pagina.pageId) return { erro: pagina.erro || "Nao foi possivel identificar a Pagina conectada.", ...(pagina.paginas ? { paginas: pagina.paginas } : {}) };
    const forms = await bounded(listarFormularios(db, userId, pagina.pageId, injected));
    const ativos = forms.filter((f) => !f.status || f.status === "ACTIVE");
    return {
      pageId: pagina.pageId, pageName: pagina.pageName,
      formularios: resumoFormularios(ativos),
      ...(forms.length > ativos.length ? { inativosOcultos: forms.length - ativos.length } : {}),
      instruction: ativos.length
        ? "Apresente os formularios pelo NOME e pergunte qual usar; nunca mostre nem peca o numero. Depois chame publicar_campanha com destination=lead_form e o leadGenFormId do escolhido."
        : "Esta Pagina nao tem formulario ativo. Diga isso ao usuario; criar formulario e feito pela tela de publicacao ou pelo Gerenciador da Meta.",
    };
  } catch { return { erro: "Nao consegui consultar os formularios desta Pagina agora. Nada foi alterado." }; }
}

export async function publishChatAds(userId: number, options: any, injected?: any) {
  const db = injected ?? await import("./db");
  try {
    const pageId = String(options?.pageId ?? "").trim();
    if (!Number.isInteger(options?.campaignId) || options.campaignId < 1 || (pageId && !/^\d+$/.test(pageId))) return { ok: false, erro: "Campanha ou pagina invalida." };
    const destination = options.destination ?? "website";
    if (destination !== "website" && destination !== "lead_form") return { ok: false, erro: "Destino invalido. Use website ou lead_form." };
    const leadGenFormId = typeof options.leadGenFormId === "string" ? options.leadGenFormId.trim() : "";
    if (destination === "lead_form" && !/^\d+$/.test(leadGenFormId)) return { ok: false, erro: "Escolha o formulario instantaneo pelo nome com consultar_formularios_meta; nao peca o numero ao usuario." };
    let linkUrl: string | undefined;
    if (destination === "website" && options.linkUrl !== undefined) {
      linkUrl = urlHttps(options.linkUrl);
      if (!linkUrl) return { ok: false, erro: "Informe uma URL HTTPS valida." };
    }
    const campaign = await db.getCampaignById(options.campaignId);
    const project = campaign && await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) return { ok: false, erro: "Campanha indisponivel para esta conta." };
    const pagina = await bounded(resolverPaginaMetaComLista(pageId, async () => {
      const listar = injected?.listPages ?? (await import("./campaignPublish")).listarPaginasMetaConectadas;
      return listar(userId);
    }));
    if (!pagina.ok || !pagina.pageId || !/^\d+$/.test(pagina.pageId)) return {
      ok: false, erro: pagina.erro || "Nao foi possivel identificar a Pagina conectada.",
      ...(pagina.paginas ? { paginas: pagina.paginas } : {}),
    };
    // Pendencia local ANTES do token de confirmacao.
    //
    // Achado real (15/10, campanha 799): o chat mandou o Michel clicar em
    // Publicar numa campanha que o servidor ia recusar por falta de imagem nos
    // criativos. A checagem existia, mas rodava DEPOIS da confirmacao — ele
    // confirmaria pra receber a recusa, gastando a reserva de idempotencia no
    // caminho.
    //
    // Agora a recusa vem antes, com o motivo, e nenhuma reserva e criada.
    const local = pendenciasLocaisParaPublicar(campaign);
    if (!local.ok) return { ok: false, erro: local.erro, ...(local.issues ? { issues: local.issues } : {}) };

    // Destino resolvido ANTES do token, pra confirmacao e execucao apontarem
    // pro mesmo lugar e o usuario ver o destino real antes de confirmar.
    let origemDestino = "informado pelo usuario";
    let nomeFormulario = "";
    if (destination === "website" && !linkUrl) {
      try {
        const resolved = injected?.resolvePageLink
          ? await bounded(injected.resolvePageLink(pagina.pageId))
          : await bounded((async () => (await callerDoUsuario(db, userId, injected)).competitors.resolvePageLink({ pageId: pagina.pageId }))());
        const destino = destinoDaPagina(resolved);
        if (destino) { linkUrl = destino.url; origemDestino = destino.origem; }
      } catch { /* sem destino da Pagina: pede URL manual abaixo */ }
      if (!linkUrl) return { ok: false, erro: "Nao encontrei WhatsApp nem site HTTPS configurado nesta Pagina. Peca ao usuario a URL HTTPS de destino antes de confirmar a publicacao." };
    }
    if (destination === "lead_form") {
      // Formulario conferido ANTES do token. Achado (19/10, revisao do PR #64):
      // o ID so e usado na criacao do anuncio, DEPOIS de campanha e conjunto
      // ja existirem na Meta. ID errado ou de outra Pagina falhava no meio e
      // deixava campanha orfa la. Sem conseguir listar, nao arrisca.
      let forms: Array<{ id: string; name?: string; status?: string }>;
      try { forms = await bounded(listarFormularios(db, userId, pagina.pageId, injected)); }
      catch { return { ok: false, erro: "Nao consegui conferir os formularios desta Pagina na Meta agora. Nada foi publicado; tente de novo em instantes." }; }
      const form = forms.find((f) => String(f.id) === leadGenFormId);
      if (!form) return { ok: false, erro: "Esse formulario nao existe nesta Pagina.", formularios: resumoFormularios(forms) };
      if (form.status && form.status !== "ACTIVE") return { ok: false, erro: `O formulario "${form.name || form.id}" esta ${form.status}, nao ativo. Escolha um ativo.`, formularios: resumoFormularios(forms) };
      nomeFormulario = form.name || form.id;
    }

    // Forma PLANA de proposito: com `strict: false` o TypeScript nao estreita
    // a uniao `{linkUrl} | {leadGenFormId}` (PR #64 deixou 2 erros novos aqui).
    const resolvedOptions: OpcoesDePublicacao = {
      campaignId: options.campaignId,
      pageId: pagina.pageId,
      destination,
      ...(destination === "website" ? { linkUrl } : { leadGenFormId }),
      ...(options.adSetIndexes !== undefined ? { adSetIndexes: options.adSetIndexes } : {}),
    };
    const snapshot = JSON.stringify({ userId, options: resolvedOptions, campaign });
    const token = createHash("sha256").update(snapshot).digest("hex").slice(0, 16);
    const confirmation = `CONFIRMAR PUBLICACAO ${token}`;
    if (adsTurn.getStore()?.message.trim() !== confirmation) return {
      ok: false, confirmationRequired: true, campaignId: campaign.id, name: campaign.name,
      pageId: pagina.pageId, pageName: pagina.pageName, adSets: campaign.adSets, destination: destination === "website" ? `${resolvedOptions.linkUrl} (${origemDestino})` : `Formulario instantaneo "${nomeFormulario}"`,
      erro: `Mostre os conjuntos e orcamentos ao usuario. Esta campanha AINDA NAO foi publicada; publicar vai cria-la na Meta com status PAUSADO, e ela nao comeca a rodar sozinha. Nao diga que a campanha esta pausada: pausado e o resultado da publicacao, nao o estado de agora. Para confirmar, o usuario deve enviar exatamente: ${confirmation}. Se alterar a campanha ou destino, solicite nova confirmacao.`,
    };
    // One reservation per campaign, including partial/uncertain outcomes. Never reopen after a timeout.
    const reserved = await db.reserveMcpIdempotencyKey(userId, "chat_meta_publish", String(campaign.id));
    if (reserved.kind === "cached_result") return reserved.result;
    if (reserved.kind !== "proceed") return { ok: false, erro: "Publicacao ja solicitada. Verifique o resultado na Meta antes de tentar novamente." };
    const publish = injected?.publish ?? (await import("./campaignPublish")).publicarCampanhaNaMeta;
    const work = publish(userId, resolvedOptions).then(async (result: any) => {
      // Falha ANTERIOR a qualquer escrita na Meta pode ser tentada de novo
      // depois de corrigida. Cachear como resultado final trancaria a campanha
      // pra sempre neste caminho: `reserveMcpIdempotencyKey` devolve
      // `cached_result` em toda tentativa seguinte, entao "sem imagem" viraria
      // a resposta eterna mesmo depois de a imagem existir. `failMcpIdempotencyKey`
      // reabre o mesmo registro.
      //
      // Conservador por omissao: sem a marca `antesDeTocarNaMeta`, assume que a
      // Meta pode ter sido tocada e mantem a reserva.
      if (result?.ok === false && result?.antesDeTocarNaMeta === true) {
        await db.failMcpIdempotencyKey(reserved.recordId, String(result.erro || "pendencia local"));
        return result;
      }
      await db.completeMcpIdempotencyKey(reserved.recordId, result);
      return result;
    });
    return await bounded(work, 45000);
  } catch { return { ok: false, erro: "Nao foi possivel confirmar a publicacao. Confira a campanha na Meta; nao repita a publicacao." }; }
}
