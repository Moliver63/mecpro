/**
 * tiktokValidacao.ts — validacao tecnica ANTES de qualquer criacao no TikTok Ads.
 *
 * Pedido de Michel (25/11): validacao previa especifica do TikTok; corrigir sozinho o que e tecnico
 * e nao muda a estrategia; pedir confirmacao so depois dela. Aqui nada e criado: le a conta
 * (moeda, identidades, Pixel), confere orcamento, destino, texto e cada video, e devolve:
 *  - bloqueios: o que impede publicar (e o motivo exato);
 *  - correcoes: o que o MecProAI ajusta sozinho (proporcao, codec, https, UTMs...);
 *  - avisos: o que nao impede, mas o usuario deve saber;
 *  - entrada: a entrada ja corrigida, pronta para o publicador.
 * Usada pela previa do chat (publicar_no_tiktok) e pela ferramenta MCP validate_tiktok_campaign.
 */
import { listarIdentidadesAutorizadas, type ClienteTikTok, type EntradaTikTok } from "./tiktokPublicar";
import { minimoDiarioTikTok, textoMinimo, type MinimoTikTok } from "./tiktokOrcamentoMinimo";
import { configDoObjetivo, EVENTOS_WEB, validarPixel, type ConfigObjetivoTikTok, type ObjetivoMecPro } from "./tiktokObjetivos";
import { normalizarUrlDeDestino, paginaResponde, urlPublicaSegura } from "./tiktokUrl";
import { depsVideoPadrao, prepararVideo, type DepsVideo, type VideoPreparado } from "./tiktokVideo";

export interface ResultadoValidacaoTikTok {
  ok: boolean;
  bloqueios: string[];
  correcoes: string[];
  avisos: string[];
  objetivo: ConfigObjetivoTikTok;
  minimo: MinimoTikTok | null;
  pixel?: { id: string; nome: string; evento: string };
  entrada: EntradaTikTok;
  videos: Array<Pick<VideoPreparado, "nome" | "origem" | "urlFinal" | "capaUrl"> & { proporcao?: string; resolucao?: string; duracaoS?: number; codec?: string | null }>;
}

export interface DepsValidacao {
  minimo(c: ClienteTikTok, adv: string): Promise<MinimoTikTok | null>;
  urlSegura(url: string): Promise<boolean>;
  pagina(url: string): Promise<{ ok: boolean; status?: number; erro?: string }>;
  video: DepsVideo;
}
export const depsValidacaoPadrao: DepsValidacao = { minimo: (c, adv) => minimoDiarioTikTok(c, adv), urlSegura: (u) => urlPublicaSegura(u), pagina: (u) => paginaResponde(u), video: depsVideoPadrao };

/** Legenda do TikTok nao aceita link clicavel, @ nem hashtag (especificacao de In-Feed). */
export function limparTextoDoAnuncio(texto: string): { texto: string; correcoes: string[] } {
  const correcoes: string[] = [];
  let t = String(texto || "").replace(/\s+/g, " ").trim();
  const semLinks = t.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/\s+/g, " ").trim();
  if (semLinks !== t) { correcoes.push("Tirei o link do texto do anuncio (o TikTok nao aceita link na legenda; o destino vai no botao)."); t = semLinks; }
  const semTags = t.replace(/(^|\s)[#@](\p{L}[\p{L}\p{N}_.]*)/gu, "$1$2").trim();
  if (semTags !== t) { correcoes.push("Tirei # e @ do texto do anuncio (o TikTok nao aceita hashtag nem mencao na legenda)."); t = semTags; }
  if (t.length > 100) {
    const corte = t.slice(0, 101).replace(/\s+\S*$/, "").trim();
    correcoes.push(`Texto com ${t.length} caracteres encurtado para ${corte.length} (limite do TikTok: 100), sem cortar palavra.`);
    t = corte;
  }
  return { texto: t, correcoes };
}

export async function validarPublicacaoTikTok(
  c: ClienteTikTok,
  bruta: EntradaTikTok & { autorizarTrafego?: boolean },
  deps: DepsValidacao = depsValidacaoPadrao,
): Promise<ResultadoValidacaoTikTok> {
  const bloqueios: string[] = [], correcoes: string[] = [], avisos: string[] = [];
  const adv = bruta.advertiserId;
  const entrada: EntradaTikTok = { ...bruta, videos: [...(bruta.videos || [])] };

  // Objetivo: o do rascunho. Vendas so viram trafego com autorizacao explicita.
  const pedido: ObjetivoMecPro = bruta.objetivo || "traffic";
  let objetivo = configDoObjetivo(pedido, bruta.optimizationEvent);
  let pixel: ResultadoValidacaoTikTok["pixel"];
  if (objetivo.precisaPixel) {
    const vp = await validarPixel(c, adv, objetivo.optimizationEvent!, bruta.pixelId);
    avisos.push(...vp.avisos);
    if (vp.ok) {
      pixel = { id: vp.pixel!.pixelId, nome: vp.pixel!.nome, evento: EVENTOS_WEB[objetivo.optimizationEvent!]?.rotulo || objetivo.optimizationEvent! };
      entrada.pixelId = vp.pixel!.pixelId;
    } else if (bruta.autorizarTrafego) {
      avisos.push(`${vp.bloqueio} Com a sua autorizacao, publico como TRAFEGO (otimiza cliques, nao vendas).`);
      objetivo = configDoObjetivo("traffic");
      entrada.objetivo = "traffic";
    } else {
      bloqueios.push(`${objetivo.rotulo} precisa de Pixel com o evento de compra configurado: ${vp.bloqueio} Nao troco vendas por trafego sem a sua autorizacao.`);
    }
  }

  // Orcamento minimo na moeda da conta.
  const minimo = await deps.minimo(c, adv).catch(() => null);
  if (minimo && !(bruta.dailyBudgetReais >= minimo.minimo)) bloqueios.push(`Orcamento de ${bruta.dailyBudgetReais}/dia abaixo do minimo aceito pelo TikTok: ${textoMinimo(minimo)}.`);
  if (!minimo) avisos.push("Nao consegui confirmar o minimo diario do TikTok agora (mais de US$ 20/dia por grupo).");

  // Identidade (conta de TikTok autorizada que assina o anuncio).
  const idents = await listarIdentidadesAutorizadas(c, adv, bruta.displayName || "", avisos).catch(() => []);
  if (!idents.length) bloqueios.push("Nenhuma conta de TikTok autorizada na conta de anuncios. No Ads Manager: Ativos > Identidades > autorizar uma conta, e tente de novo.");

  // Destino unico para todos os anuncios.
  const destino = normalizarUrlDeDestino(bruta.landingPageUrl);
  correcoes.push(...destino.correcoes);
  bloqueios.push(...destino.problemas);
  if (destino.url) entrada.landingPageUrl = destino.url;
  if (destino.url && !destino.problemas.length) {
    const resp = await deps.pagina(destino.url);
    if (!resp.ok) {
      if (resp.status && resp.status >= 400) bloqueios.push(`A pagina de destino respondeu HTTP ${resp.status}. Corrija o endereco antes de publicar.`);
      else avisos.push(`Nao consegui abrir a pagina de destino agora (${resp.erro || "sem resposta"}). O TikTok revisa o link na aprovacao.`);
    }
  }

  // Texto do anuncio.
  const texto = limparTextoDoAnuncio(bruta.adText);
  correcoes.push(...texto.correcoes);
  entrada.adText = texto.texto;
  if (texto.texto.length < 3) bloqueios.push("Texto do anuncio ausente.");

  // Videos: proporcao, resolucao, duracao, codec, tamanho (so planeja; nada sobe aqui).
  const videos: ResultadoValidacaoTikTok["videos"] = [];
  if (!entrada.videos.length && !entrada.imagens?.length) bloqueios.push("Nenhum video ou imagem para o anuncio. Envie os videos no chat.");
  if (entrada.videos.length > 5) { avisos.push(`${entrada.videos.length} videos: o grupo aceita 5; entram os 5 primeiros.`); entrada.videos = entrada.videos.slice(0, 5); }
  const preparados: VideoPreparado[] = [];
  for (const v of entrada.videos) {
    if (!v.videoUrl) { videos.push({ nome: v.nomeNaBiblioteca || v.videoId || "video", origem: v.videoId || "" }); continue; }
    if (!(await deps.urlSegura(v.videoUrl))) { bloqueios.push(`O video ${v.nome || v.videoUrl} precisa estar em um endereco https publico.`); continue; }
    const p = await prepararVideo({ url: v.videoUrl, nome: v.nome }, { enquadramento: bruta.enquadramento, executar: false }, deps.video);
    bloqueios.push(...p.problemas.map((x) => `"${p.nome}": ${x}`));
    correcoes.push(...p.correcoes.map((x) => `"${p.nome}": ${x}`));
    avisos.push(...p.avisos.map((x) => `"${p.nome}": ${x}`));
    preparados.push(p);
    videos.push({
      nome: p.nome, origem: p.origem, urlFinal: p.urlFinal, capaUrl: p.capaUrl,
      ...(p.sonda ? { proporcao: p.plano?.proporcao, resolucao: `${p.plano?.largura}x${p.plano?.altura}`, duracaoS: p.sonda.duracaoS, codec: p.sonda.codecVideo } : {}),
    });
  }

  // Mesmo plano na previa e na publicacao (Goldfish 25/11): o publicador usa estes preparados.
  if (preparados.length) entrada.videosPreparados = preparados;
  return { ok: bloqueios.length === 0, bloqueios, correcoes, avisos, objetivo, minimo, ...(pixel ? { pixel } : {}), entrada, videos };
}

/** Texto curto da validacao para o chat e o MCP (sem jargao de API). */
export function resumoDaValidacao(v: ResultadoValidacaoTikTok): string {
  const linhas = [
    `Objetivo no TikTok: ${v.objetivo.rotulo}${v.pixel ? ` | Pixel ${v.pixel.nome} (${v.pixel.id}), evento ${v.pixel.evento}` : ""}`,
    `Orcamento: ${v.entrada.dailyBudgetReais}/dia${v.minimo ? ` (minimo ${v.minimo.minimo})` : ""} | Destino: ${v.entrada.landingPageUrl}`,
    `Texto: ${v.entrada.adText}`,
    ...v.videos.map((x, i) => `Video ${i + 1}: ${x.nome}${x.resolucao ? ` -> ${x.proporcao} ${x.resolucao}` : ""}`),
  ];
  if (v.correcoes.length) linhas.push(`Ajustes automaticos: ${v.correcoes.join(" | ")}`);
  if (v.avisos.length) linhas.push(`Avisos: ${v.avisos.join(" | ")}`);
  if (v.bloqueios.length) linhas.push(`Impede publicar: ${v.bloqueios.join(" | ")}`);
  return linhas.join("\n");
}
