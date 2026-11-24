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

/**
 * Achado real 24/11 (sessao 28, campanha 828): a previa propunha o minimo (R$ 126), o usuario
 * respondeu "sim" tres vezes e o modelo (Groq) chamava de novo sem confirmado=true e sem o valor,
 * repetindo a previa. A decisao sai do modelo: a previa fica registrada aqui e a fala do usuario,
 * lida pelo servidor, confirma e escolhe o valor.
 */
export interface ContextoDaFala { ultimaDoUsuario?: string; ultimaDoAssistente?: string }
interface Proposta { minimo: number | null; em: number }
const propostas = new Map<string, Proposta>();
const VALIDADE_PROPOSTA_MS = 30 * 60 * 1000;
export function limparPropostasTikTok(): void { propostas.clear(); }

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

const ultimaFoiPreviaDoTikTok = (texto?: string) => /tik ?tok/i.test(String(texto || "")) && /(publi|confirm|sim)/i.test(String(texto || ""));

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
  const entrada: EntradaTikTok = {
    advertiserId: String(integracao.accountId),
    // O numero do rascunho no nome evita colisao com campanha criada a mao ou com outro rascunho.
    campaignName: `${textoAte(String(campanha.name || "Campanha MecProAI"), 100)} · #${campaignId}`,
    dailyBudgetReais: Number(args.dailyBudgetReais) > 0 ? Number(args.dailyBudgetReais) : Number(campanha.suggestedBudgetDaily) || 0,
    landingPageUrl: String(args.landingPageUrl || perfil?.websiteUrl || "").trim().replace(/^(?!https?:\/\/)/i, "https://"),
    adText: textoAte(String(args.adText || lista[0]?.headline || lista[0]?.hook || ""), 100),
    callToAction: "LEARN_MORE",
    displayName: textoAte(String(perfil?.companyName || projeto.name || "Anunciante"), 40),
    videos: videos.slice(0, 5).map((v) => ({ videoUrl: urlH264(v.url), nome: v.fileName })),
  };

  const avisos: string[] = [];
  const min = await deps.minimo(String(integracao.accessToken), entrada.advertiserId).catch(() => null);

  // A fala do usuario manda: valor dito por ele > valor do modelo > minimo proposto (no "sim") > rascunho.
  const chaveProposta = `${userId}:${campaignId}`;
  const proposta = propostas.get(chaveProposta);
  const propostaValida = !!proposta && Date.now() - proposta.em < VALIDADE_PROPOSTA_MS && ultimaFoiPreviaDoTikTok(fala.ultimaDoAssistente);
  const valorDoUsuario = propostaValida ? valorDiarioDaFala(fala.ultimaDoUsuario) : null;
  const disseSim = propostaValida && ehConfirmacao(fala.ultimaDoUsuario);
  if (valorDoUsuario) entrada.dailyBudgetReais = valorDoUsuario;
  else if (disseSim && proposta!.minimo && !(entrada.dailyBudgetReais >= proposta!.minimo)) {
    entrada.dailyBudgetReais = proposta!.minimo;
    avisos.push(`Usei o minimo proposto na previa: ${proposta!.minimo}/dia.`);
  }
  // "sim" (ou um valor) em resposta a previa e a confirmacao, mesmo que o modelo nao marque confirmado.
  const confirmado = args.confirmado === true || ((disseSim || !!valorDoUsuario) && propostaValida);

  const abaixoDoMinimo = !!min && !(entrada.dailyBudgetReais >= min.minimo);
  const perguntaParaOUsuario = abaixoDoMinimo
    ? `O TikTok aceita no minimo ${min!.moeda === "BRL" ? "R$ " : ""}${min!.minimo} por dia. Publico pausada com ${min!.moeda === "BRL" ? "R$ " : ""}${min!.minimo}/dia? Responda sim ou diga outro valor diario (a partir de ${min!.minimo}).`
    : "Posso publicar no TikTok? Ela nasce pausada. Responda sim para publicar.";
  if (abaixoDoMinimo) {
    avisos.push(`Orcamento de ${entrada.dailyBudgetReais}/dia abaixo do minimo aceito pelo TikTok: ${textoMinimo(min!)}. Nao e possivel publicar abaixo disso.`);
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

  const registrarProposta = () => propostas.set(chaveProposta, { minimo: abaixoDoMinimo ? min!.minimo : null, em: Date.now() });
  if (!confirmado) {
    registrarProposta();
    return {
      previa, avisos, problemas, perguntaParaOUsuario,
      instrucao: "Mostre a previa e os avisos e termine com a perguntaParaOUsuario, sem mudar o valor. Nunca ofereca publicar abaixo do minimo. Na resposta do usuario chame de novo esta ferramenta (o MecProAI le o sim ou o valor dito por ele).",
    };
  }
  if (problemas.length) {
    registrarProposta();
    return { erro: "Nada foi criado no TikTok. Corrija antes de publicar.", problemas, previa, perguntaParaOUsuario };
  }
  propostas.delete(chaveProposta);

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
      instrucao: "Explique o erro em uma frase e ofereca tentar de novo (ou ajustar o que o erro pede, como orcamento). Nao sugira publicar manualmente no Ads Manager. Nunca crie um rascunho novo para contornar erro de publicacao: repita a publicacao deste mesmo rascunho." };
  }
}
