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
import { textoMinimo } from "./tiktokOrcamentoMinimo";
import { normalizarObjetivo } from "./tiktokObjetivos";
import type { ResultadoValidacaoTikTok } from "./tiktokValidacao";

export const DESCRICAO_PUBLICAR_TIKTOK =
  "Publica no TikTok Ads (conta conectada em Integracoes) a campanha de um rascunho do MecProAI com o MESMO objetivo do rascunho " +
  "(vendas e leads com Pixel, trafego, reconhecimento); antes, faz a validacao tecnica (videos, destino, Pixel, orcamento minimo) e corrige o que e tecnico. " +
  "com um anuncio de video para cada video enviado nesta conversa. Tudo nasce PAUSADO (nada e gasto ate o usuario ativar). " +
  "Chame primeiro com confirmado=false: devolve a previa (conta, orcamento diario, texto, destino, videos e avisos). " +
  "Mostre a previa e so chame com confirmado=true depois que o usuario confirmar EXPLICITAMENTE nesta mesma troca. " +
  "Use esta ferramenta para TikTok; publicar_campanha e so para a Meta. Nunca diga que publicar no TikTok e manual. " +
  "Vendas sem Pixel: explique e so publique como trafego se o usuario autorizar (autorizarTrafego=true).";

export const PARAMETROS_PUBLICAR_TIKTOK = {
  type: "object",
  properties: {
    campaignId: { type: "number", description: "ID do rascunho no MecProAI." },
    confirmado: { type: "boolean", description: "false para ver a previa; true SO depois da confirmacao explicita do usuario." },
    dailyBudgetReais: { type: "number", description: "Orcamento diario em reais do grupo de anuncios. Padrao: o diario do rascunho." },
    landingPageUrl: { type: "string", description: "Pagina de destino https. Padrao: o site do perfil do cliente." },
    adText: { type: "string", description: "Texto do anuncio (ate 100 caracteres). Padrao: o titulo do primeiro criativo." },
    pixelId: { type: "string", description: "Pixel do TikTok a usar em vendas/leads. Padrao: o Pixel ativo da conta." },
    autorizarTrafego: { type: "boolean", description: "true SO se o usuario autorizou explicitamente publicar como trafego quando vendas nao for possivel." },
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
  /** Validacao tecnica previa (tiktokValidacao.validarPublicacaoTikTok); nada e criado. */
  validar(token: string, entrada: EntradaTikTok & { autorizarTrafego?: boolean }): Promise<ResultadoValidacaoTikTok>;
  /** Decisao de cada chamada (para o log). */
  log?(dados: Record<string, unknown>): void;
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

/**
 * Achado real 24/11 (sessao 28, campanha 828): a previa propunha o minimo (R$ 126), o usuario
 * respondeu "sim" tres vezes e o modelo (Groq) chamava de novo sem confirmado=true e sem o valor,
 * repetindo a previa. A decisao sai do modelo: a previa fica registrada aqui e a fala do usuario,
 * lida pelo servidor, confirma e escolhe o valor.
 */
export interface ContextoDaFala { ultimaDoUsuario?: string; ultimaDoAssistente?: string }
interface Proposta { minimo: number | null; em: number; campaignId: number; sessionId?: number }
const propostas = new Map<string, Proposta>();
const VALIDADE_PROPOSTA_MS = 30 * 60 * 1000;
export function limparPropostasTikTok(): void { propostas.clear(); }

/**
 * Achado real 24/11 (sessao 28, 15h): mesmo com a leitura da fala dentro da ferramenta, o "sim"
 * voltou a repetir a previa, porque o modelo nem sempre chama a ferramenta. A rota do chat consulta
 * isto ANTES da IA: havendo previa do TikTok pendente nesta conversa, o "sim" (ou um valor) vai
 * direto para a publicacao, sem modelo no meio.
 */
export function previaPendenteDoTikTok(userId: number, sessionId: number | undefined, agora = Date.now()): { campaignId: number } | null {
  let melhor: Proposta | null = null;
  for (const [chave, p] of propostas) {
    if (!chave.startsWith(`${userId}:`) || agora - p.em >= VALIDADE_PROPOSTA_MS) continue;
    if (sessionId && p.sessionId && p.sessionId !== sessionId) continue;
    if (!melhor || p.em > melhor.em) melhor = p;
  }
  return melhor ? { campaignId: melhor.campaignId } : null;
}

/** Resultado da ferramenta em texto para o usuario (rota local, sem modelo). */
export function textoDoResultadoTikTok(r: Record<string, any>): string {
  if (r.publicada || r.jaPublicada) {
    const linhas = [
      r.jaPublicada ? "Essa campanha ja estava publicada no TikTok; nada novo foi criado." : "Publicada no TikTok Ads, PAUSADA (nada e gasto ate voce ativar).",
      r.tiktokCampaignId ? `Campanha: ${r.tiktokCampaignId}${r.grupo ? ` | Grupo: ${r.grupo}` : ""}${Array.isArray(r.anuncios) ? ` | Anuncios: ${r.anuncios.length}` : ""}` : "",
      Array.isArray(r.avisos) && r.avisos.length ? `Avisos: ${r.avisos.join(" | ")}` : "",
      r.proximoPasso || "",
    ];
    return linhas.filter(Boolean).join("\n");
  }
  const linhas = [
    r.erro ? `Nao publiquei: ${r.erro}` : "",
    Array.isArray(r.problemas) && r.problemas.length ? `Falta resolver: ${r.problemas.join(" | ")}` : "",
    r.perguntaParaOUsuario || "",
  ];
  return linhas.filter(Boolean).join("\n") || "Nao consegui publicar no TikTok agora. Tente de novo.";
}

/** "sim", "pode", "ok, publica", "sim, no tiktok"... (curta e sem negacao) */
export function ehConfirmacao(texto?: string): boolean {
  const t = String(texto || "").trim().toLowerCase();
  if (!t || t.length > 60 || /\b(n[aã]o|nao quero|espera|cancel|pare)\b/.test(t)) return false;
  return /^(sim|s|ok|okay|pode|pode sim|pode publicar|confirmo|confirmar|confirmado|isso|manda|manda ver|publica|publique|bora|claro|positivo|de acordo|fechado|beleza|perfeito|vai|segue)\b/.test(t);
}

/** Valor diario dito pelo usuario: "340", "R$ 340,00", "valor 340 por dia", "150 reais". */
export function valorDiarioDaFala(texto?: string): number | null {
  const t = String(texto || "");
  // So valor marcado como dinheiro ("R$", "reais", "por dia") ou a mensagem inteira sendo o numero:
  // "campanha 828" nao vira R$ 828/dia.
  const m = t.match(/^\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*$/i)
    || t.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:reais|\/\s*dia|por dia|ao dia|diari)/i)
    || t.match(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const v = Number(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : ""));
  return v > 0 && v < 100000 ? v : null;
}

export const ultimaFoiPreviaDoTikTok = (texto?: string) => /tik ?tok/i.test(String(texto || "")) && /(publi|confirm|sim)/i.test(String(texto || ""));

/** "autorizo trafego", "pode publicar como trafego", "sim, como trafego". */
export function autorizouTrafego(texto?: string): boolean {
  const t = String(texto || "").toLowerCase();
  return /tr[aá]fego/.test(t) && /(autoriz|pode|ok|sim|aceito|libero|confirmo|publica)/.test(t) && !/\b(n[aã]o)\b/.test(t);
}

export async function publicarNoTikTokDoChat(userId: number, sessionId: number | undefined, args: Record<string, unknown>, deps: DepsTikTokChat, fala: ContextoDaFala = {}): Promise<Record<string, unknown>> {
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
  const objetivo = normalizarObjetivo(campanha.objective);
  if (!objetivo) return { erro: `O objetivo "${campanha.objective}" do rascunho ainda nao tem equivalente no TikTok pelo MecProAI (vendas, conversoes, leads no site, trafego e reconhecimento sao suportados). Nada foi criado.` };
  const entrada: EntradaTikTok = {
    advertiserId: String(integracao.accountId),
    // O numero do rascunho no nome evita colisao com campanha criada a mao ou com outro rascunho.
    campaignName: `${textoAte(String(campanha.name || "Campanha MecProAI"), 100)} · #${campaignId}`,
    dailyBudgetReais: Number(args.dailyBudgetReais) > 0 ? Number(args.dailyBudgetReais) : Number(campanha.suggestedBudgetDaily) || 0,
    landingPageUrl: String(args.landingPageUrl || perfil?.websiteUrl || ""),
    adText: String(args.adText || lista[0]?.headline || lista[0]?.hook || ""),
    callToAction: objetivo === "sales" ? "SHOP_NOW" : "LEARN_MORE",
    displayName: textoAte(String(perfil?.companyName || projeto.name || "Anunciante"), 40),
    videos: videos.slice(0, 5).map((v) => ({ videoUrl: v.url, nome: v.fileName })),
    objetivo,
    ...(args.pixelId ? { pixelId: String(args.pixelId) } : {}),
  };

  const avisos: string[] = [];
  // A fala do usuario manda: valor dito por ele > valor do modelo > minimo proposto (no "sim") > rascunho.
  const chaveProposta = `${userId}:${campaignId}`;
  const proposta = propostas.get(chaveProposta);
  const propostaValida = !!proposta && Date.now() - proposta.em < VALIDADE_PROPOSTA_MS && ultimaFoiPreviaDoTikTok(fala.ultimaDoAssistente);
  const valorDoUsuario = propostaValida ? valorDiarioDaFala(fala.ultimaDoUsuario) : null;
  const trafegoAutorizado = args.autorizarTrafego === true || (propostaValida && autorizouTrafego(fala.ultimaDoUsuario));
  const disseSim = propostaValida && (ehConfirmacao(fala.ultimaDoUsuario) || autorizouTrafego(fala.ultimaDoUsuario));
  if (valorDoUsuario) entrada.dailyBudgetReais = valorDoUsuario;
  else if (disseSim && proposta!.minimo && !(entrada.dailyBudgetReais >= proposta!.minimo)) {
    entrada.dailyBudgetReais = proposta!.minimo;
    avisos.push(`Usei o minimo proposto na previa: ${proposta!.minimo}/dia.`);
  }
  // "sim" (ou um valor) em resposta a previa e a confirmacao, mesmo que o modelo nao marque confirmado.
  const confirmado = args.confirmado === true || ((disseSim || !!valorDoUsuario) && propostaValida);

  // Validacao tecnica ANTES de pedir confirmacao (pedido de Michel, 25/11). Nada e criado aqui.
  const v = await deps.validar(String(integracao.accessToken), { ...entrada, autorizarTrafego: trafegoAutorizado });
  avisos.push(...v.avisos);
  const min = v.minimo;
  const abaixoDoMinimo = !!min && !(v.entrada.dailyBudgetReais >= min.minimo);
  const semPixel = v.bloqueios.some((b) => /Pixel/i.test(b));
  const moeda = min?.moeda === "BRL" || !min ? "R$ " : "";
  const perguntaParaOUsuario = abaixoDoMinimo
    ? `O TikTok aceita no minimo ${moeda}${min!.minimo} por dia. Publico pausada com ${moeda}${min!.minimo}/dia? Responda sim ou diga outro valor diario (a partir de ${min!.minimo}).`
    : semPixel
      ? "Para otimizar vendas, o TikTok precisa do Pixel com o evento de compra (Purchase) configurado. Quer que eu publique como TRAFEGO (otimiza cliques, nao vendas)? Responda \"autorizo trafego\", ou configure o Pixel e me avise."
      : v.bloqueios.length
        ? `Antes de publicar, preciso que isto seja resolvido: ${v.bloqueios.join(" ")}`
        : "Validacao tecnica concluida. Posso publicar no TikTok? Ela nasce pausada. Responda sim para publicar.";

  const previa = {
    conta: v.entrada.advertiserId,
    campanha: v.entrada.campaignName,
    objetivo: v.objetivo.rotulo,
    ...(v.pixel ? { pixel: `${v.pixel.nome} (${v.pixel.id}), evento ${v.pixel.evento}` } : {}),
    orcamentoDiario: `R$ ${v.entrada.dailyBudgetReais}`,
    minimoDiario: min ? textoMinimo(min) : "nao confirmado",
    destino: v.entrada.landingPageUrl,
    texto: v.entrada.adText,
    autor: v.entrada.displayName,
    videos: v.videos.map((x) => `${x.nome}${x.resolucao ? ` -> ${x.proporcao} ${x.resolucao}` : ""}`),
    ajustesAutomaticos: v.correcoes,
    status: "nasce PAUSADA",
  };
  const problemas = [...deps.conferir(v.entrada).filter((p) => !/https/.test(p)), ...v.bloqueios];

  const registrarProposta = () => propostas.set(chaveProposta, { minimo: abaixoDoMinimo ? min!.minimo : null, em: Date.now(), campaignId, sessionId });
  deps.log?.({ campaignId, propostaValida, disseSim, valorDoUsuario, trafegoAutorizado, confirmado, orcamento: v.entrada.dailyBudgetReais, minimo: min?.minimo ?? null, objetivo: v.objetivo.objectiveType, bloqueios: v.bloqueios.length });
  if (!confirmado) {
    registrarProposta();
    return {
      previa, avisos, problemas, perguntaParaOUsuario,
      instrucao: "Mostre a previa, os ajustes automaticos e os avisos, e termine com a perguntaParaOUsuario, sem mudar valores. Nunca ofereca publicar abaixo do minimo nem trocar vendas por trafego sem o usuario autorizar. Na resposta do usuario chame de novo esta ferramenta (o MecProAI le o sim, o valor ou a autorizacao dita por ele).",
    };
  }
  if (problemas.length) {
    registrarProposta();
    return { erro: "Nada foi criado no TikTok. A validacao tecnica encontrou o que impede publicar.", problemas, previa, perguntaParaOUsuario };
  }
  propostas.delete(chaveProposta);

  const reserva = await deps.reservar(userId, `chat_tiktok:${campaignId}:${v.entrada.advertiserId}:${v.objetivo.objectiveType}`);
  if (reserva.kind === "cached_result") return { jaPublicada: true, ...reserva.result, aviso: "Esta campanha ja foi publicada no TikTok; nada novo foi criado." };
  if (reserva.kind === "duplicate_in_progress") return { erro: "Ja existe uma publicacao desta campanha no TikTok em andamento. Aguarde." };

  let etapa = "inicio";
  try {
    const r = await deps.publicar(String(integracao.accessToken), v.entrada, (m) => { etapa = m; });
    await deps.salvarIds(campaignId, r).catch(() => {});
    const resultado = {
      publicada: true, status: "PAUSADA", objetivo: v.objetivo.rotulo, tiktokCampaignId: r.campaignId, grupo: r.adGroupId,
      anuncios: r.ads.map((a) => a.adId), avisos: [...avisos, ...v.correcoes, ...r.avisos],
      proximoPasso: "Revisar no TikTok Ads Manager e ativar quando quiser. Nada e gasto enquanto estiver pausada.",
    };
    await deps.concluir(reserva.recordId, resultado);
    return resultado;
  } catch (e: any) {
    // Erro ORIGINAL da API, inteiro, no registro da tentativa e no log (antes era cortado em 400).
    const original = e?.paraRegistro ? e.paraRegistro() : { message: String(e?.message || e) };
    deps.log?.({ campaignId, etapa, erroOriginal: original });
    await deps.falhar(reserva.recordId, JSON.stringify({ etapa, ...original }).slice(0, 8000));
    const motivo = String(e?.message || e).slice(0, 1500);
    return { erro: `O TikTok recusou na etapa "${etapa}": ${motivo}`, erroOriginal: original, previa, avisos, observacao: "Se a campanha chegou a ser criada, ela esta pausada; repetir a publicacao reaproveita o que ja existe, sem duplicar.",
      instrucao: "Explique o erro em uma frase e ofereca tentar de novo (ou ajustar o que o erro pede, como orcamento). Nao sugira publicar manualmente no Ads Manager. Nunca crie um rascunho novo para contornar erro de publicacao: repita a publicacao deste mesmo rascunho." };
  }
}

export const DESCRICAO_CONSULTAR_TIKTOK =
  "Mostra a situacao de uma campanha do MecProAI no TikTok Ads (campanha, grupo e anuncios): status, revisao ou recusa, orcamento, objetivo e Pixel. Somente leitura.";
export const PARAMETROS_CONSULTAR_TIKTOK = {
  type: "object",
  properties: { campaignId: { type: "number", description: "ID do rascunho no MecProAI ja publicado no TikTok." } },
  required: ["campaignId"],
} as const;

export interface DepsConsultaTikTok {
  campanha(id: number): Promise<any | null>;
  projeto(id: number): Promise<any | null>;
  integracao(userId: number): Promise<any | null>;
  consultar(token: string, advertiserId: string, tiktokCampaignId: string): Promise<{ texto: string; dados: unknown }>;
}

export async function consultarNoTikTokDoChat(userId: number, args: Record<string, unknown>, deps: DepsConsultaTikTok): Promise<Record<string, unknown>> {
  const campaignId = Number(args.campaignId);
  const campanha = Number.isFinite(campaignId) ? await deps.campanha(campaignId) : null;
  const projeto = campanha ? await deps.projeto(campanha.projectId) : null;
  if (!campanha || !projeto || projeto.userId !== userId) return { erro: `Rascunho ${args.campaignId} nao encontrado nesta conta.` };
  if (!campanha.tiktokCampaignId) return { erro: `A campanha ${campaignId} ainda nao foi publicada no TikTok.` };
  const integracao = await deps.integracao(userId);
  if (!integracao?.isActive || !integracao.accessToken || !integracao.accountId) return { erro: "O TikTok Ads nao esta conectado." };
  try {
    const r = await deps.consultar(String(integracao.accessToken), String(integracao.accountId), String(campanha.tiktokCampaignId));
    return { situacao: r.texto, dados: r.dados };
  } catch (e: any) {
    return { erro: `Nao consegui consultar o TikTok: ${String(e?.message || e).slice(0, 600)}` };
  }
}
