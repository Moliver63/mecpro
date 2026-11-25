/**
 * tiktokPixelSetup.ts — configuração e diagnóstico do TikTok Pixel + Events API, para qualquer cliente.
 *
 * Duas funções, ambas sem efeito colateral:
 *   - estadoPixelTikTok: lê (somente leitura) o Pixel do projeto, o evento de compra, os eventos recebidos nos
 *     últimos 30 dias e diz o que falta, com a instrução de cada falha.
 *   - gerarGuiaDeInstalacao: texto de instalação personalizado (Pixel do cliente, site, plataforma, gateway),
 *     sem nenhum segredo: o token da Events API fica no servidor do próprio cliente e o MecProAI nunca o guarda.
 *
 * Isolamento: quem chama passa só a integração e o projeto do próprio usuário (a checagem de dono é feita nas
 * entradas: MCP, chat e tRPC). Nada aqui lê dado de outro cliente.
 */
import type { ClienteTikTok } from "./tiktokPublicar";
import { classificarErroTikTok, diagnosticarPixels, type ProblemaTikTok, type PixelDiagnosticado } from "./tiktokDiagnostico";

export type NivelPixel = "ok" | "atencao" | "bloqueado";

export interface EstadoPixelTikTok {
  nivel: NivelPixel;
  conectado: boolean;
  pixelSalvo?: string;
  pixel?: { id: string; codigo?: string; nome: string; temCompra: boolean; disparosCompra30d: number | null };
  pixels: Array<{ id: string; codigo?: string; nome: string; temCompra: boolean; disparos30d: number | null }>;
  /** Eventos que o Pixel recebeu nos últimos 30 dias (navegador + Events API somados; a API do TikTok não separa a origem). */
  eventosRecebidos: Array<{ evento: string; total: number }>;
  problemas: Array<{ tipo: string; mensagem: string; instrucoes: string[] }>;
  avisos: string[];
  /** O que a API não informa, para ninguém concluir mais do que os dados dizem. */
  limites: string[];
}

const EVENTOS_CONHECIDOS = ["PageView", "ViewContent", "InitiateCheckout", "AddToCart", "Purchase", "CompletePayment", "SubmitForm", "Lead"];

/** Soma contagens por nome de evento numa resposta de pixel/event/stats/, tolerante ao formato. */
export function contagemPorEvento(d: any): Array<{ evento: string; total: number }> {
  const totais = new Map<string, number>();
  const varrer = (o: any) => {
    if (!o || typeof o !== "object") return;
    const bruto = String(o.event_type ?? o.event ?? o.event_name ?? o.external_action ?? "");
    const n = Number(o.count ?? o.event_count ?? o.total ?? o.received);
    if (bruto && Number.isFinite(n)) {
      const nome = EVENTOS_CONHECIDOS.find((e) => e.toLowerCase() === bruto.toLowerCase().replace(/[\s_-]+/g, "")) || bruto;
      totais.set(nome, (totais.get(nome) ?? 0) + n);
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") varrer(v);
  };
  varrer(d);
  return [...totais.entries()].map(([evento, total]) => ({ evento, total })).sort((a, b) => b.total - a.total);
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function estadoPixelTikTok(
  c: ClienteTikTok,
  advertiserId: string,
  opcoes: { pixelSalvo?: string; agora?: Date } = {},
): Promise<EstadoPixelTikTok> {
  const agora = opcoes.agora ?? new Date();
  const base: EstadoPixelTikTok = { nivel: "bloqueado", conectado: true, pixelSalvo: opcoes.pixelSalvo, pixels: [], eventosRecebidos: [], problemas: [], avisos: [], limites: [
    "A API do TikTok não separa eventos do navegador e da Events API: a contagem soma os dois.",
    "A aba Test Events do Events Manager não tem API; para validar o servidor use o test_event_code do Pixel.",
  ] };
  const r = await diagnosticarPixels(c, advertiserId, "SHOPPING", opcoes.pixelSalvo, agora, { pedidoEhSalvo: !!opcoes.pixelSalvo });
  base.avisos.push(...r.avisos);
  base.pixels = r.pixels.map((p: PixelDiagnosticado) => ({ id: p.pixelId, codigo: p.codigo, nome: p.nome, temCompra: p.temEvento, disparos30d: p.disparos30d }));
  if (r.escolhido) base.pixel = { id: r.escolhido.pixelId, codigo: r.escolhido.codigo, nome: r.escolhido.nome, temCompra: r.escolhido.temEvento, disparosCompra30d: r.escolhido.disparos30d };
  if (r.problema) base.problemas.push({ tipo: r.problema.tipo, mensagem: r.problema.mensagem, instrucoes: r.problema.instrucoes });

  const alvo = r.escolhido?.pixelId;
  if (alvo) {
    try {
      const stats = await c.get("pixel/event/stats/", { advertiser_id: advertiserId, pixel_ids: [alvo], date_range: { start_date: dia(new Date(agora.getTime() - 30 * 86400000)), end_date: dia(agora) } });
      base.eventosRecebidos = contagemPorEvento(stats);
    } catch (e) {
      const p: ProblemaTikTok = classificarErroTikTok(e);
      base.avisos.push(p.tipo === "permissao_api" ? `Sem permissão para ler os eventos recebidos (${p.endpoint}).` : "Não consegui ler os eventos recebidos agora.");
    }
  }

  const grave = r.problema && (r.problema.deAutorizacao || ["pixel_inexistente", "pixel_ambiguo"].includes(r.problema.tipo));
  if (grave) base.nivel = "bloqueado";
  else if (r.problema || !alvo) base.nivel = "atencao";
  else base.nivel = r.escolhido && r.escolhido.temEvento && (r.escolhido.disparos30d ?? 0) > 0 ? "ok" : "atencao";
  if (base.nivel === "atencao" && !base.problemas.length && alvo) {
    base.problemas.push({ tipo: "evento_sem_atividade", mensagem: "O Pixel não recebeu nenhuma compra nos últimos 30 dias.", instrucoes: ["Instale o Pixel e a Events API no site (guia de instalação) e faça uma compra de teste com test_event_code.", "Enquanto não houver compras registradas, o TikTok não tem o que otimizar numa campanha de vendas."] });
  }
  return base;
}

export function resumoDoEstadoPixel(e: EstadoPixelTikTok): string {
  const rot = { ok: "Tudo certo", atencao: "Atenção", bloqueado: "Bloqueado" }[e.nivel];
  const l: string[] = [`${rot}: TikTok Pixel e Events API`];
  if (e.pixel) l.push(`Pixel: ${e.pixel.nome} (${e.pixel.id})${e.pixelSalvo === e.pixel.id ? ", salvo no projeto" : ""}; evento de compra: ${e.pixel.temCompra ? "configurado" : "não configurado"}${e.pixel.disparosCompra30d !== null ? `, ${e.pixel.disparosCompra30d} compras em 30 dias` : ""}`);
  else if (e.pixels.length) l.push(`Pixels da conta: ${e.pixels.map((p) => `${p.nome} (${p.id})`).join(", ")}`);
  if (e.eventosRecebidos.length) l.push(`Eventos recebidos em 30 dias: ${e.eventosRecebidos.map((x) => `${x.evento} ${x.total}`).join(", ")}`);
  for (const p of e.problemas) { l.push(`- ${p.mensagem}`); for (const i of p.instrucoes) l.push(`    ${i}`); }
  for (const a of e.avisos) l.push(`Aviso: ${a}`);
  return l.join("\n");
}

// ─── Guia de instalação personalizado ────────────────────────────────────────

export type PlataformaSite = "custom" | "wordpress" | "shopify" | "nuvemshop" | "hotmart" | "outra";
export type GatewayPagamento = "asaas" | "stripe" | "mercadopago" | "hotmart" | "outro";

export interface EntradaGuia {
  /** Código do Pixel (pixel_code), não o id numérico. */
  pixelCode: string;
  siteUrl?: string;
  nomeCliente?: string;
  plataforma?: PlataformaSite;
  gateway?: GatewayPagamento;
}

const CODIGO_PIXEL = /^[A-Za-z0-9]{10,30}$/;

/**
 * O site e a Events API usam o CÓDIGO do Pixel (alfanumérico, ex.: C7ABCDE12345...), não o id numérico que a
 * API de anúncios usa. Só dígitos é o id numérico: recusa, para ninguém instalar o código errado.
 */
export function codigoDePixelValido(codigo: string): boolean {
  return CODIGO_PIXEL.test(codigo) && !/^\d+$/.test(codigo);
}

function hostDe(url?: string): string {
  try { return new URL(/^https?:\/\//i.test(url || "") ? url! : `https://${url}`).host; } catch { return "seu-site.com.br"; }
}

const EVENTO_DO_GATEWAY: Record<GatewayPagamento, { confirmacao: string; idDoPagamento: string }> = {
  asaas: { confirmacao: "webhook PAYMENT_CONFIRMED / PAYMENT_RECEIVED", idDoPagamento: "payment.id" },
  stripe: { confirmacao: "webhook checkout.session.completed / payment_intent.succeeded", idDoPagamento: "payment_intent.id" },
  mercadopago: { confirmacao: "webhook de pagamento com status approved", idDoPagamento: "payment.id" },
  hotmart: { confirmacao: "webhook PURCHASE_APPROVED", idDoPagamento: "data.purchase.transaction" },
  outro: { confirmacao: "o webhook que confirma o dinheiro na conta", idDoPagamento: "o id único do pagamento" },
};

const DICA_PLATAFORMA: Record<PlataformaSite, string> = {
  custom: "Cole o código no `<head>` do HTML base (ou no componente raiz da aplicação), antes dos demais scripts.",
  wordpress: "Use um plugin de scripts no cabeçalho (ex.: WPCode) e cole o código em Cabeçalho; ou o plugin oficial TikTok for WordPress.",
  shopify: "Use o canal oficial TikTok for Shopify: ele instala o Pixel e a Events API. Só use o código abaixo se não usar o canal, para não duplicar eventos.",
  nuvemshop: "Em Configurações > Códigos externos, cole o código de cabeçalho. Para a compra, use a integração de conversões da loja, se houver.",
  hotmart: "A Hotmart não permite código na página de pagamento; envie o Purchase pelo servidor (webhook PURCHASE_APPROVED) e instale o Pixel na sua página de vendas.",
  outra: "Cole o código no cabeçalho de todas as páginas públicas, antes de outros scripts.",
};

export function gerarGuiaDeInstalacao(e: EntradaGuia): { ok: boolean; erro?: string; texto?: string; passos?: string[] } {
  if (!codigoDePixelValido(e.pixelCode)) return { ok: false, erro: "Código do Pixel inválido. Use o código alfanumérico do Pixel (Events Manager > Web, ex.: C7ABCDE12345...), não o id numérico." };
  const px = e.pixelCode;
  const host = hostDe(e.siteUrl);
  const gw = EVENTO_DO_GATEWAY[e.gateway || "outro"];
  const plataforma = e.plataforma || "custom";
  const quem = e.nomeCliente ? ` de ${e.nomeCliente}` : "";

  const navegador = `<script>
  // Só carregue DEPOIS do aceite de cookies de análise/publicidade (LGPD).
  function carregarTikTokPixel() {
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
      ttq.load = function (e, n) { var r = "https://analytics.tiktok.com/i18n/pixel/events.js"; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {}; var o = document.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = r + "?sdkid=" + e + "&lib=" + t; var a = document.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a) };
      ttq.load("${px}");
      ttq.page(); // PageView
    }(window, document, "ttq");
  }
</script>`;

  const eventos = `// Página do produto
ttq.track("ViewContent", { content_type: "product", contents: [{ content_id: "ID_DO_PRODUTO", content_name: "NOME", content_type: "product" }], value: 197.00, currency: "BRL" });

// Clique que leva ao pagamento (guarde o event_id se for repetir o evento pelo servidor)
ttq.track("InitiateCheckout", { content_type: "product", contents: [{ content_id: "ID_DO_PRODUTO", content_type: "product" }], value: 197.00, currency: "BRL" }, { event_id: "ic.UUID_UNICO" });

// NÃO dispare Purchase aqui: ele sai só do servidor (próximo bloco), para a compra nunca contar duas vezes.`;

  const servidor = `// Node.js (fetch nativo). Rode SÓ quando ${gw.confirmacao}.
const resp = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Access-Token": process.env.TIKTOK_EVENTS_ACCESS_TOKEN },
  body: JSON.stringify({
    event_source: "web",
    event_source_id: "${px}",
    // test_event_code: "TESTxxxxx", // só para validar: o evento aparece em Test Events e não conta como conversão
    data: [{
      event: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: ${gw.idDoPagamento},          // o MESMO id em qualquer reenvio: o TikTok deduplica por evento + event_id
      user: {
        ttclid, ttp,                          // guardados na visita (só se houve consentimento)
        email: sha256(email.trim().toLowerCase()),
        phone: sha256("+5511999998888"),      // E.164 com "+"
        ip: ipDoComprador, user_agent: uaDoComprador,
      },
      properties: { currency: "BRL", value: 197.00, content_type: "product", order_id: ${gw.idDoPagamento},
        contents: [{ content_id: "ID_DO_PRODUTO", content_type: "product", price: 197.00, quantity: 1 }] },
      page: { url: "https://${host}/pagina-de-compra" },
    }],
  }),
});
const json = await resp.json();
if (json.code !== 0) throw new Error("TikTok recusou: " + json.message); // HTTP 200 com code != 0 também é recusa`;

  const passos = [
    `Crie o Pixel do site${quem} no TikTok (Events Manager > Web) e gere o token da Events API em Configurações do Pixel. O token é secreto: guarde só no servidor do site (variável de ambiente), nunca no navegador e nunca no MecProAI.`,
    `Instale o código do Pixel no site (${host}). ${DICA_PLATAFORMA[plataforma]}`,
    "Dispare ViewContent na página do produto e InitiateCheckout no clique de pagar (código abaixo). Não dispare Purchase no navegador.",
    `Guarde o ttclid (parâmetro da URL do anúncio) e o cookie _ttp quando o visitante chegar, e envie junto ao pedido para o servidor. Só com consentimento.`,
    `No servidor, quando ${gw.confirmacao}, envie o Purchase pela Events API com event_id = ${gw.idDoPagamento}. Marque no banco que já enviou, para o reprocessamento do webhook não repetir.`,
    "Valide com test_event_code: faça uma compra de teste e confira em Events Manager > Test Events. Depois remova o test_event_code.",
    "Volte ao MecProAI, escolha este Pixel no projeto e rode o diagnóstico: ele confirma o evento de compra e a atividade.",
  ];

  const texto = [
    `# Instalação do TikTok Pixel + Events API${quem}`,
    `Site: ${host} | Pixel: ${px} | Pagamento: ${e.gateway || "outro"} | Plataforma: ${plataforma}`,
    "",
    "## Como funciona",
    "- Navegador: PageView, ViewContent e InitiateCheckout.",
    "- Servidor: Purchase, só depois da confirmação do pagamento, com event_id = id do pagamento. É isso que impede compra duplicada e conta quem paga por Pix ou boleto sem voltar ao site.",
    "",
    "## Passos",
    ...passos.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## 1. Pixel no site",
    "```html", navegador, "```",
    "",
    "## 2. Eventos no navegador",
    "```js", eventos, "```",
    "",
    "## 3. Purchase pelo servidor",
    "```js", servidor, "```",
    "",
    "## LGPD",
    "- Carregue o Pixel e guarde ttclid/_ttp só depois do aceite de cookies. Sem aceite, não envie nada ao TikTok.",
    "- E-mail e telefone vão com SHA-256 (minúsculas, sem espaços; telefone em E.164). ttclid, _ttp, IP e user-agent vão sem hash.",
    "- Cite o TikTok como destinatário dos dados na política de privacidade.",
    "",
    "## Cuidados",
    "- Token só em variável de ambiente do servidor. Se vazar, gere outro no Events Manager.",
    "- Nunca reenvie a compra com outro event_id: o TikTok contaria duas vezes.",
    "- Teste sempre com test_event_code antes de valer em produção.",
  ].join("\n");

  return { ok: true, texto, passos };
}
