/**
 * tiktokDiagnostico.ts — permissoes, conexao e Pixel do TikTok Ads, com o motivo exato de cada falha.
 *
 * Caso real (25/11, campanha 828): "TikTok [pixel/list/] 40001: advertiser does not grant you
 * /pixel/list/:GET permission". Na Marketing API, o que o token pode fazer vem das permissoes
 * (Scope of permission) marcadas no APLICATIVO no portal de desenvolvedor do TikTok for Business
 * (My Apps), no momento em que o anunciante AUTORIZA. Nao ha parametro de escopo na URL de
 * autorizacao (business-api.tiktok.com/portal/auth?app_id&redirect_uri&state). Entao:
 *  - permissao nova no app (ex.: Measurement, para Pixel) pode precisar de aprovacao do TikTok;
 *  - o token antigo NAO ganha a permissao sozinho: o anunciante precisa autorizar de novo.
 * O MecProAI nunca contorna permissao: diz qual falta, onde marcar e oferece a reconexao.
 *
 * Os grupos de permissao por endpoint abaixo seguem os nomes do portal (Ads Management, Measurement,
 * Creative Management, Reporting, Ad Account Management). O texto da permissao vem da propria
 * mensagem do TikTok ("/pixel/list/:GET") e e mostrado como chegou.
 */
import type { ClienteTikTok } from "./tiktokPublicar";
import { EVENTOS_WEB, interpretarPixels, type PixelTikTok } from "./tiktokObjetivos";

export type TipoProblemaTikTok =
  | "permissao_api" | "token_invalido" | "conta_nao_autorizada" | "limite"
  | "pixel_inexistente" | "pixel_sem_evento" | "pixel_ambiguo" | "evento_sem_atividade" | "outro";

export interface ProblemaTikTok {
  tipo: TipoProblemaTikTok;
  /** Endpoint e metodo negados, como o TikTok escreveu (ex.: "/pixel/list/:GET"). */
  endpoint?: string;
  /** Grupo de permissao do app que libera o endpoint. */
  permissao?: string;
  mensagem: string;
  instrucoes: string[];
  /** A causa e de autorizacao: nunca sugerir trocar vendas por trafego. */
  deAutorizacao: boolean;
}

const URL_RECONEXAO = "https://www.mecproai.com/settings/tiktok";
const PORTAL_APPS = "https://business-api.tiktok.com/portal/apps";

/** Grupo de permissao do app do TikTok que libera cada familia de endpoint. */
export function permissaoDoEndpoint(endpoint: string): string {
  const e = endpoint.toLowerCase();
  if (/pixel|offline|event/.test(e)) return "Measurement (Pixel e eventos)";
  if (/^\/?file\//.test(e)) return "Creative Management";
  if (/report/.test(e)) return "Reporting";
  if (/advertiser\/info|advertiser\/balance/.test(e)) return "Ad Account Management";
  if (/^\/?(campaign|adgroup|ad|identity)\//.test(e)) return "Ads Management";
  return "a permissao correspondente no app";
}

const reconectar = (motivo: string) => `Reconecte a conta em MecProAI > Integracoes > TikTok Ads (${URL_RECONEXAO}) e, na tela do TikTok, ${motivo}.`;

/** Classifica um erro da API (ErroTikTok ou Error) num problema com instrucoes. */
export function classificarErroTikTok(erro: unknown): ProblemaTikTok {
  const msg = String((erro as any)?.mensagemOriginal || (erro as any)?.message || erro || "");
  const code = Number((erro as any)?.code ?? (msg.match(/\]\s*(\d{5})/)?.[1] ?? NaN));
  const caminho = (erro as any)?.path ? `/${String((erro as any).path).replace(/^\/+/, "")}` : "";
  const negado = msg.match(/does not grant you\s+(\/\S+?)\s+permission/i)?.[1] || caminho;
  // Conta antes do 40001: "No permission to operate advertiser" tambem vem com 40001 (Goldfish r2).
  if (/advertiser.*(not exist|does not exist|no permission|not authori[sz]ed|not belong|invalid)|no permission to operate|advertiser_id.*invalid/i.test(msg)) {
    return {
      tipo: "conta_nao_autorizada", deAutorizacao: true,
      mensagem: "A conta de anuncios usada nao esta autorizada para o app do MecProAI (ou nao pertence a este token).",
      instrucoes: [reconectar("marque a conta de anuncios correta"), "Confira em Integracoes qual Advertiser ID esta selecionado."],
    };
  }
  // 40001 e o codigo de "Permission error" do TikTok, qualquer que seja o texto (Goldfish 25/11).
  if (code === 40001 || /lacks the required scope|no permission to (call|access) (this )?api|does not grant you|permission error/i.test(msg)) {
    const endpoint = negado || "";
    const permissao = permissaoDoEndpoint(endpoint.replace(/:.*$/, ""));
    return {
      tipo: "permissao_api", endpoint, permissao, deAutorizacao: true,
      mensagem: `O app do MecProAI nao tem a permissao do TikTok para ${endpoint || "esta chamada"} (grupo ${permissao}).`,
      instrucoes: [
        `No portal de desenvolvedor do TikTok for Business (${PORTAL_APPS}), abra o app do MecProAI > Scope of permission e marque "${permissao}". Se o TikTok pedir revisao, a liberacao depende da aprovacao dele.`,
        reconectar("aprove todas as permissoes pedidas. O token atual nao ganha a permissao nova sozinho; so uma nova autorizacao gera um token com ela"),
        "Nao e problema da campanha nem do objetivo: vendas continuam vendas.",
      ],
    };
  }
  if (code === 40100 || /too many requests|too frequent|rate limit|\bqps\b/i.test(msg)) {
    return { tipo: "limite", deAutorizacao: false, mensagem: "O TikTok limitou as chamadas por excesso de requisicoes agora.", instrucoes: ["Espere um minuto e tente de novo. Nao e preciso reconectar."] };
  }
  if ([40104, 40105].includes(code) || /access[_ ]?token.*(invalid|expired|not exist|is null|empty|revoked)|token (has )?(expired|invalid)/i.test(msg)) {
    return {
      tipo: "token_invalido", deAutorizacao: true,
      mensagem: "O token do TikTok Ads esta invalido, expirado ou foi revogado.",
      instrucoes: [reconectar("autorize a conta de anuncios de novo"), "Se a autorizacao foi removida no Business Center (Apps), autorize o MecProAI de novo por la."],
    };
  }
  return { tipo: "outro", deAutorizacao: false, mensagem: msg.slice(0, 600) || "Erro desconhecido do TikTok.", instrucoes: [] };
}

// ── Pixel e eventos ──────────────────────────────────────────────────────────

export interface PixelDiagnosticado extends PixelTikTok {
  temEvento: boolean;
  /** Disparos do evento nos ultimos 30 dias (null = API nao informou). */
  disparos30d: number | null;
}

export interface ResultadoPixel {
  ok: boolean;
  pixels: PixelDiagnosticado[];
  escolhido?: PixelDiagnosticado;
  problema?: ProblemaTikTok;
  avisos: string[];
}

const hoje = (d = new Date()) => d.toISOString().slice(0, 10);

/** Soma tolerante de disparos de um evento na resposta de pixel/event/stats/. */
export function disparosDoEvento(d: any, nomes: string[]): number | null {
  const linhas: any[] = Array.isArray(d) ? d : d?.stats || d?.list || d?.pixel_event_stats || d?.events || [];
  if (!linhas.length) return null;
  let total = 0, achou = false;
  const varrer = (o: any) => {
    if (!o || typeof o !== "object") return;
    const nome = String(o.event_type || o.event || o.event_name || o.name || o.external_action || "").toUpperCase().replace(/[\s-]+/g, "_");
    const n = Number(o.count ?? o.event_count ?? o.total ?? o.received ?? o.value);
    if (nome && nomes.includes(nome) && Number.isFinite(n)) { total += n; achou = true; }
    for (const v of Object.values(o)) if (v && typeof v === "object") varrer(v);
  };
  linhas.forEach(varrer);
  return achou ? total : null;
}

/**
 * Lista os Pixels, escolhe o certo para o evento e confere atividade. Ordem de escolha: o Pixel pedido
 * (ou salvo no projeto); senao o unico com o evento; varios com o evento e nenhum escolhido = ambiguo.
 */
export async function diagnosticarPixels(c: ClienteTikTok, adv: string, evento: string, pixelIdPedido?: string, agora = new Date(), opcoes: { pedidoEhSalvo?: boolean } = {}): Promise<ResultadoPixel> {
  const avisos: string[] = [];
  let brutos: PixelTikTok[];
  try {
    brutos = interpretarPixels(await c.get("pixel/list/", { advertiser_id: adv, page_size: 20 }));
  } catch (e) {
    return { ok: false, pixels: [], avisos, problema: classificarErroTikTok(e) };
  }
  const nomes = EVENTOS_WEB[evento]?.nomesNoPixel || [evento];
  const rotulo = EVENTOS_WEB[evento]?.rotulo || evento;
  let pixels: PixelDiagnosticado[] = brutos.map((p) => ({ ...p, temEvento: p.eventos.some((x) => nomes.includes(x)), disparos30d: null }));
  if (pixels.length) {
    try {
      const inicio = new Date(agora.getTime() - 30 * 86400000);
      const stats = await c.get("pixel/event/stats/", { advertiser_id: adv, pixel_ids: pixels.map((p) => p.pixelId), date_range: { start_date: hoje(inicio), end_date: hoje(agora) } });
      pixels = pixels.map((p) => {
        const doPixel = Array.isArray(stats?.list) ? stats.list.filter((x: any) => String(x?.pixel_id ?? p.pixelId) === p.pixelId) : stats;
        return { ...p, disparos30d: disparosDoEvento(doPixel, nomes) };
      });
    } catch (e) {
      const prob = classificarErroTikTok(e);
      avisos.push(prob.tipo === "permissao_api" ? `Sem permissao para ler a atividade dos eventos (${prob.endpoint}); a atividade nao foi conferida.` : "Nao consegui ler a atividade dos eventos agora.");
    }
  }
  if (!pixels.length) {
    return { ok: false, pixels, avisos, problema: {
      tipo: "pixel_inexistente", deAutorizacao: false,
      mensagem: "A conta de anuncios do TikTok nao tem nenhum Pixel.",
      instrucoes: ["No TikTok Ads Manager: Ferramentas > Eventos > Web > Criar Pixel.", `Instale no site e envie o evento ${rotulo}. Para compra confirmada fora do site (Asaas, Pix, boleto), use a Events API pelo servidor com event_id = id do pagamento.`],
    } };
  }
  let escolhido: PixelDiagnosticado | undefined;
  if (pixelIdPedido && opcoes.pedidoEhSalvo && !pixels.some((p) => p.pixelId === String(pixelIdPedido))) {
    // Pixel salvo no projeto que nao existe mais nesta conta (conta trocada): escolhe de novo e avisa.
    avisos.push(`O Pixel ${pixelIdPedido} salvo no projeto nao existe nesta conta de anuncios; escolhi de novo pela conta atual.`);
    pixelIdPedido = undefined;
  }
  if (pixelIdPedido) {
    escolhido = pixels.find((p) => p.pixelId === String(pixelIdPedido));
    if (!escolhido) return { ok: false, pixels, avisos, problema: {
      tipo: "pixel_inexistente", deAutorizacao: false,
      mensagem: `O Pixel ${pixelIdPedido} nao existe nesta conta de anuncios.`,
      instrucoes: [`Escolha um dos Pixels da conta: ${pixels.map((p) => `${p.nome} (${p.pixelId})`).join(", ")}.`],
    } };
  } else {
    const comEvento = pixels.filter((p) => p.temEvento);
    if (comEvento.length === 1) escolhido = comEvento[0];
    else if (comEvento.length > 1) return { ok: false, pixels, avisos, problema: {
      tipo: "pixel_ambiguo", deAutorizacao: false,
      mensagem: `Ha ${comEvento.length} Pixels com o evento ${rotulo}. Escolha qual e o do site desta campanha.`,
      instrucoes: [`Pixels: ${comEvento.map((p) => `${p.nome} (${p.pixelId})`).join(", ")}. Diga qual usar; ele fica salvo para este projeto.`],
    } };
    else if (pixels.length === 1) escolhido = pixels[0];
    else if (pixels.some((p) => !p.eventos.length)) return { ok: false, pixels, avisos, problema: {
      tipo: "pixel_ambiguo", deAutorizacao: false,
      mensagem: `A conta tem ${pixels.length} Pixels e a API nao informou os eventos de todos. Escolha qual e o do site desta campanha.`,
      instrucoes: [`Pixels: ${pixels.map((p) => `${p.nome} (${p.pixelId})`).join(", ")}. Diga qual usar; ele fica salvo para este projeto.`],
    } };
    if (!escolhido) return { ok: false, pixels, avisos, problema: {
      tipo: "pixel_sem_evento", deAutorizacao: false,
      mensagem: `Nenhum Pixel da conta tem o evento ${rotulo} configurado.`,
      instrucoes: [`Configure o evento ${rotulo} no Pixel do site (Gerenciador de Eventos) e confirme que ele dispara.`],
    } };
  }
  if (escolhido.eventos.length && !escolhido.temEvento) {
    return { ok: false, pixels, escolhido, avisos, problema: {
      tipo: "pixel_sem_evento", deAutorizacao: false,
      mensagem: `O Pixel ${escolhido.nome} nao tem o evento ${rotulo}. Eventos encontrados: ${escolhido.eventos.join(", ")}.`,
      instrucoes: [`No Gerenciador de Eventos, adicione ${rotulo} a este Pixel (nome atual do TikTok: Purchase; o antigo CompletePayment continua valendo).`, "Para compra que confirma fora do site, envie pelo servidor (Events API) com o mesmo event_id do navegador para nao duplicar."],
    } };
  }
  if (!escolhido.eventos.length) avisos.push(`A API nao listou os eventos do Pixel ${escolhido.nome}; confirme no Gerenciador de Eventos que ${rotulo} dispara.`);
  if (escolhido.disparos30d === 0 || escolhido.ativo === false) {
    const motivo = escolhido.disparos30d === 0 ? `O evento ${rotulo} do Pixel ${escolhido.nome} nao registrou disparos nos ultimos 30 dias.` : `O Pixel ${escolhido.nome} esta marcado como sem atividade recente pelo TikTok.`;
    avisos.push(`${motivo} A otimizacao para vendas fica sem dados; confira a instalacao antes de ativar a campanha.`);
    return { ok: true, pixels, escolhido, avisos, problema: {
      tipo: "evento_sem_atividade", deAutorizacao: false,
      mensagem: motivo,
      instrucoes: ["Faca uma compra de teste e veja o evento chegar no Gerenciador de Eventos (aba Testar eventos).", "Sem disparos, o TikTok nao tem como aprender quem compra: a campanha pode gastar sem converter."],
    } };
  }
  return { ok: true, pixels, escolhido, avisos };
}

// ── Diagnostico completo da conexao ──────────────────────────────────────────

export interface Capacidade { nome: string; endpoint: string; ok: boolean; problema?: ProblemaTikTok }

export interface DiagnosticoTikTok {
  advertiserId: string;
  contaAutorizada: boolean | null;
  contasAutorizadas: string[];
  capacidades: Capacidade[];
  pixel: ResultadoPixel | null;
  problemas: ProblemaTikTok[];
  pronto: { trafego: boolean; vendas: boolean };
  urlReconexao: string;
}

/**
 * Testa, so com leituras, cada capacidade que a publicacao usa. Nao cria nada.
 * `app` (app_id e secret do servidor) permite conferir a lista de contas autorizadas
 * (oauth2/advertiser/get); sem ele, essa etapa fica como "nao conferida".
 */
export async function diagnosticarTikTok(c: ClienteTikTok, adv: string, opcoes: { app?: { appId: string; secret: string }; evento?: string; pixelId?: string; pixelSalvo?: boolean } = {}): Promise<DiagnosticoTikTok> {
  const problemas: ProblemaTikTok[] = [];
  let contaAutorizada: boolean | null = null;
  let contasAutorizadas: string[] = [];
  if (opcoes.app?.appId && opcoes.app.secret) {
    try {
      const d: any = await c.get("oauth2/advertiser/get/", { app_id: opcoes.app.appId, secret: opcoes.app.secret });
      contasAutorizadas = (d?.list || []).map((x: any) => String(x?.advertiser_id)).filter(Boolean);
      contaAutorizada = contasAutorizadas.includes(adv);
      if (!contaAutorizada) problemas.push({
        tipo: "conta_nao_autorizada", deAutorizacao: true,
        mensagem: `A conta ${adv} nao esta entre as autorizadas para o app do MecProAI (${contasAutorizadas.join(", ") || "nenhuma"}).`,
        instrucoes: [reconectar(`marque a conta de anuncios ${adv}`), "Ou escolha em Integracoes uma das contas autorizadas."],
      });
    } catch (e) { problemas.push(classificarErroTikTok(e)); }
  }
  const testes: Array<[string, string, Record<string, unknown>]> = [
    ["Conta de anuncios", "advertiser/info/", { advertiser_ids: [adv], fields: ["name", "currency", "status"] }],
    ["Campanhas e anuncios", "campaign/get/", { advertiser_id: adv, page_size: 1 }],
    ["Identidade (conta que assina o anuncio)", "identity/get/", { advertiser_id: adv, identity_type: "TT_USER", page_size: 1 }],
    ["Biblioteca de videos", "file/video/ad/search/", { advertiser_id: adv, page_size: 1 }],
  ];
  const capacidades: Capacidade[] = [];
  for (const [nome, endpoint, params] of testes) {
    try { await c.get(endpoint, params); capacidades.push({ nome, endpoint, ok: true }); }
    catch (e) { const p = classificarErroTikTok(e); capacidades.push({ nome, endpoint, ok: false, problema: p }); problemas.push(p); }
  }
  const evento = opcoes.evento || "SHOPPING";
  const pixel = await diagnosticarPixels(c, adv, evento, opcoes.pixelId, new Date(), { pedidoEhSalvo: opcoes.pixelSalvo !== false && !!opcoes.pixelId });
  const leituraFalhou = !!pixel.problema && (pixel.problema.deAutorizacao || ["limite", "outro"].includes(pixel.problema.tipo));
  capacidades.push({ nome: "Pixel e eventos", endpoint: "pixel/list/", ok: !leituraFalhou, ...(leituraFalhou ? { problema: pixel.problema } : {}) });
  if (pixel.problema) problemas.push(pixel.problema);
  const base = capacidades.slice(0, 4).every((x) => x.ok) && contaAutorizada !== false;
  return {
    advertiserId: adv, contaAutorizada, contasAutorizadas, capacidades, pixel,
    problemas: problemas.filter((p, i) => problemas.findIndex((q) => q.tipo === p.tipo && q.endpoint === p.endpoint) === i),
    pronto: { trafego: base, vendas: base && pixel.ok },
    urlReconexao: URL_RECONEXAO,
  };
}

export function resumoDoDiagnostico(d: DiagnosticoTikTok): string {
  const l: string[] = [`Conta de anuncios ${d.advertiserId}: ${d.contaAutorizada === null ? "autorizacao do app nao conferida" : d.contaAutorizada ? "autorizada para o MecProAI" : "NAO autorizada para o MecProAI"}.`];
  for (const c of d.capacidades) l.push(`${c.ok ? "OK" : "FALHA"} ${c.nome}${c.problema ? `: ${c.problema.mensagem}` : ""}`);
  if (d.pixel?.escolhido) l.push(`Pixel: ${d.pixel.escolhido.nome} (${d.pixel.escolhido.pixelId}), evento de compra ${d.pixel.escolhido.temEvento ? "configurado" : "nao confirmado"}${d.pixel.escolhido.disparos30d !== null ? `, ${d.pixel.escolhido.disparos30d} disparos em 30 dias` : ""}.`);
  else if (d.pixel?.pixels.length) l.push(`Pixels na conta: ${d.pixel.pixels.map((p) => `${p.nome} (${p.pixelId})${p.temEvento ? " com compra" : ""}`).join(", ")}.`);
  l.push(`Pronto para trafego: ${d.pronto.trafego ? "sim" : "nao"} | Pronto para vendas: ${d.pronto.vendas ? "sim" : "nao"}.`);
  for (const p of d.problemas) l.push(`\n${p.mensagem}\n${p.instrucoes.map((i) => `- ${i}`).join("\n")}`);
  return l.join("\n");
}
