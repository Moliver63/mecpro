/**
 * chatTikTok.ts — publicar no TikTok Ads a partir do chat do MecProAI.
 *
 * Achado real (24/11, chat sessao 28): o MCP ja publicava no TikTok
 * (publish_tiktok_campaign, 03/11), mas o chat so tinha publicar_campanha da
 * Meta e respondeu "a publicacao real e feita manualmente no TikTok Ads
 * Manager". Aqui o chat ganha o mesmo caminho do MCP (tiktokPublicar.ts), com
 * o mesmo cuidado da Meta: primeiro a previa, e so publica com confirmado=true
 * depois do usuario confirmar na mesma troca. Nasce PAUSADA.
 */
import type { EntradaTikTok, ResultadoTikTok } from "./tiktokPublicar";
import { textoMinimo, type MinimoTikTok } from "./tiktokOrcamentoMinimo";

export const DESCRICAO_PUBLICAR_TIKTOK =
  "Publica no TikTok Ads (conta conectada em Integracoes) uma campanha de TRAFEGO a partir de um rascunho do MecProAI, " +
  "com um anuncio de video para cada video enviado nesta conversa. Tudo nasce PAUSADO (nada e gasto ate o usuario ativar). " +
  "Chame primeiro com confirmado=false: devolve a previa (conta, orcamento diario, texto, destino, videos e avisos). " +
  "Mostre a previa e so chame com confirmado=true depois que o usuario confirmar EXPLICITAMENTE nesta mesma troca. " +
  "Use esta ferramenta para TikTok; publicar_campanha e so para a Meta. Nunca diga que publicar no TikTok e manual.";

export const PARAMETROS_PUBLICAR_TIKTOK = {
  type: "object",
  properties: {
    campaignId: { type: "number", description: "ID do rascunho no MecProAI." },
    confirmado: { type: "boolean", description: "false para ver a previa; true SO depois da confirmacao explicita do usuario." },
    dailyBudgetReais: { type: "number", description: "Orcamento diario em reais do grupo de anuncios. Padrao: o diario do rascunho." },
    landingPageUrl: { type: "string", description: "Pagina de destino https. Padrao: o site do perfil do cliente." },
    adText: { type: "string", description: "Texto do anuncio (ate 100 caracteres). Padrao: o titulo do primeiro criativo." },
  },
  required: ["campaignId", "confirmado"],
} as const;

export interface DepsTikTokChat {
  campanha(id: number): Promise<any | null>;
  projeto(id: number): Promise<any | null>;
  perfil(projectId: number): Promise<any | null>;
  integracao(userId: number): Promise<any | null>;
  videosDaSessao(sessionId: number): Promise<Array<{ url: string; fileName?: string }>>;
  reservar(userId: number, chave: string): Promise<{ kind: "proceed"; recordId: number } | { kind: "cached_result"; result: any } | { kind: "duplicate_in_progress" }>;
  concluir(recordId: number, payload: any): Promise<void>;
  falhar(recordId: number, motivo: string): Promise<void>;
  publicar(token: string, entrada: EntradaTikTok, etapa: (m: string) => void): Promise<ResultadoTikTok>;
  conferir(entrada: Partial<EntradaTikTok>): string[];
  salvarIds(campaignId: number, r: ResultadoTikTok): Promise<void>;
  /** Minimo diario aceito pelo TikTok na moeda da conta; null quando nao da para saber. */
  minimo(token: string, advertiserId: string): Promise<MinimoTikTok | null>;
}

/** URL do Cloudinary pedindo H.264 (iPhone grava HEVC; o TikTok pede MP4 H.264). */
export function urlH264(url: string): string {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url) || /\/upload\/[^/]*vc_h264/.test(url)) return url;
  return url.replace("/video/upload/", "/video/upload/vc_h264,f_mp4/");
}

/** Corta no limite sem quebrar palavra. */
export function textoAte(texto: string, max: number): string {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (corte.length >= max / 2 ? corte : t.slice(0, max)).trim();
}

function criativos(c: any): any[] {
  try { return typeof c?.creatives === "string" ? JSON.parse(c.creatives || "[]") : (c?.creatives || []); } catch { return []; }
}

export async function publicarNoTikTokDoChat(userId: number, sessionId: number | undefined, args: Record<string, unknown>, deps: DepsTikTokChat): Promise<Record<string, unknown>> {
  const campaignId = Number(args.campaignId);
  const campanha = Number.isFinite(campaignId) ? await deps.campanha(campaignId) : null;
  const projeto = campanha ? await deps.projeto(campanha.projectId) : null;
  if (!campanha || !projeto || projeto.userId !== userId) return { erro: `Rascunho ${args.campaignId} nao encontrado nesta conta.` };

  const integracao = await deps.integracao(userId);
  if (!integracao?.isActive || !integracao.accessToken || !integracao.accountId) {
    return { erro: "O TikTok Ads nao esta conectado. Conecte em Integracoes > TikTok Ads e tente de novo." };
  }

  const perfil = await deps.perfil(campanha.projectId);
  const videos = sessionId ? await deps.videosDaSessao(sessionId) : [];
  const lista = criativos(campanha);
  const entrada: EntradaTikTok = {
    advertiserId: String(integracao.accountId),
    campaignName: textoAte(String(campanha.name || "Campanha MecProAI"), 110),
    dailyBudgetReais: Number(args.dailyBudgetReais) > 0 ? Number(args.dailyBudgetReais) : Number(campanha.suggestedBudgetDaily) || 0,
    landingPageUrl: String(args.landingPageUrl || perfil?.websiteUrl || "").trim().replace(/^(?!https?:\/\/)/i, "https://"),
    adText: textoAte(String(args.adText || lista[0]?.headline || lista[0]?.hook || ""), 100),
    callToAction: "LEARN_MORE",
    displayName: textoAte(String(perfil?.companyName || projeto.name || "Anunciante"), 40),
    videos: videos.slice(0, 5).map((v) => ({ videoUrl: urlH264(v.url), nome: v.fileName })),
  };

  const avisos: string[] = [];
  const min = await deps.minimo(String(integracao.accessToken), entrada.advertiserId).catch(() => null);
  const abaixoDoMinimo = !!min && !(entrada.dailyBudgetReais >= min.minimo);
  if (abaixoDoMinimo) {
    avisos.push(`Orcamento de ${entrada.dailyBudgetReais}/dia abaixo do minimo aceito pelo TikTok: ${textoMinimo(min!)}. Pergunte ao usuario qual valor diario usar, a partir de ${min!.minimo}, e chame de novo com dailyBudgetReais.`);
  } else if (!min) {
    avisos.push("Nao consegui confirmar o minimo diario do TikTok agora (mais de US$ 20/dia por grupo); se o TikTok recusar o orcamento, aumente o diario.");
  }
  if (String(campanha.objective || "").toLowerCase() !== "traffic") {
    avisos.push(`No TikTok o MecProAI publica como TRAFEGO para a pagina de destino. O objetivo "${campanha.objective}" do rascunho (ex.: vendas com pixel do TikTok) ainda nao e suportado.`);
  }
  if (videos.length > 5) avisos.push(`Ha ${videos.length} videos na conversa; o TikTok aceita 5 por grupo, entram os 5 primeiros.`);
  if (!videos.length) avisos.push("Nenhum video desta conversa: envie os videos no chat antes de publicar.");

  const previa = {
    conta: entrada.advertiserId,
    campanha: entrada.campaignName,
    orcamentoDiario: `R$ ${entrada.dailyBudgetReais}`,
    destino: entrada.landingPageUrl,
    texto: entrada.adText,
    autor: entrada.displayName,
    videos: entrada.videos.map((v) => v.nome || v.videoUrl),
    minimoDiario: min ? textoMinimo(min) : "nao confirmado",
    status: "nasce PAUSADA",
  };
  const problemas = deps.conferir(entrada);
  if (abaixoDoMinimo) problemas.push(`Orcamento diario abaixo do minimo do TikTok (${min!.minimo}/dia).`);

  if (args.confirmado !== true) {
    return {
      previa, avisos, problemas,
      instrucao: "Mostre a previa e os avisos ao usuario e pergunte se pode publicar (pausada) no TikTok. So chame de novo com confirmado=true depois de um sim explicito.",
    };
  }
  if (problemas.length) return { erro: "Nada foi criado no TikTok. Corrija antes de publicar.", problemas, previa };

  const reserva = await deps.reservar(userId, `chat_tiktok:${campaignId}:${entrada.advertiserId}`);
  if (reserva.kind === "cached_result") return { jaPublicada: true, ...reserva.result, aviso: "Esta campanha ja foi publicada no TikTok; nada novo foi criado." };
  if (reserva.kind === "duplicate_in_progress") return { erro: "Ja existe uma publicacao desta campanha no TikTok em andamento. Aguarde." };

  let etapa = "inicio";
  try {
    const r = await deps.publicar(String(integracao.accessToken), entrada, (m) => { etapa = m; });
    await deps.salvarIds(campaignId, r).catch(() => {});
    const resultado = {
      publicada: true, status: "PAUSADA", tiktokCampaignId: r.campaignId, grupo: r.adGroupId,
      anuncios: r.ads.map((a) => a.adId), avisos: [...avisos, ...r.avisos],
      proximoPasso: "Revisar no TikTok Ads Manager e ativar quando quiser. Nada e gasto enquanto estiver pausada.",
    };
    await deps.concluir(reserva.recordId, resultado);
    return resultado;
  } catch (e: any) {
    const motivo = String(e?.message || e).slice(0, 400);
    await deps.falhar(reserva.recordId, motivo);
    return { erro: `O TikTok recusou na etapa "${etapa}": ${motivo}`, previa, avisos, observacao: "Se a campanha chegou a ser criada, ela esta pausada; repetir a publicacao reaproveita o que ja existe, sem duplicar.",
      instrucao: "Explique o erro em uma frase e ofereca tentar de novo (ou ajustar o que o erro pede, como orcamento). Nao sugira publicar manualmente no Ads Manager." };
  }
}
