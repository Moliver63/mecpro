/**
 * tiktokObjetivos.ts — objetivo do MecProAI -> configuracao da Marketing API v1.3, e validacao do Pixel.
 *
 * Fonte: API for Business v1.3 (SDK oficial tiktok/tiktok-business-api-sdk, campos de campaign/create,
 * adgroup/create e ad/create) e a ajuda de objetivos. Regras usadas aqui:
 *  - vendas/conversoes no site: objective_type WEB_CONVERSIONS, promotion_type WEBSITE,
 *    optimization_goal CONVERT, billing_event OCPM, pixel_id + optimization_event (obrigatorio
 *    quando ha pixel_id). Compra = SHOPPING (evento de Pixel CompletePayment/Purchase).
 *  - leads no site: WEB_CONVERSIONS + evento FORM (SubmitForm). Formulario instantaneo do TikTok
 *    (promotion_type LEAD_GENERATION) precisa de page_id e ainda nao e suportado: bloqueia.
 *  - trafego: TRAFFIC, optimization_goal CLICK, billing_event CPC.
 *  - reconhecimento: REACH, optimization_goal REACH, billing_event CPM.
 *
 * Regra de produto (pedido de Michel, 25/11): NUNCA trocar vendas por trafego sem autorizacao.
 * Sem Pixel valido, a publicacao de vendas e bloqueada; trafego so com autorizarTrafego=true.
 */
import type { ClienteTikTok } from "./tiktokPublicar";

export type ObjetivoMecPro = "sales" | "conversions" | "leads" | "traffic" | "awareness";

export interface ConfigObjetivoTikTok {
  objetivo: ObjetivoMecPro;
  objectiveType: "WEB_CONVERSIONS" | "TRAFFIC" | "REACH";
  optimizationGoal: "CONVERT" | "CLICK" | "REACH";
  billingEvent: "OCPM" | "CPC" | "CPM";
  /** Evento de otimizacao do Pixel (so em WEB_CONVERSIONS). */
  optimizationEvent?: string;
  precisaPixel: boolean;
  rotulo: string;
}

/** Eventos de otimizacao web e os nomes de evento de Pixel que os disparam. */
export const EVENTOS_WEB: Record<string, { rotulo: string; nomesNoPixel: string[] }> = {
  SHOPPING: { rotulo: "Compra (Purchase / CompletePayment)", nomesNoPixel: ["SHOPPING", "COMPLETE_PAYMENT", "COMPLETEPAYMENT", "PURCHASE"] },
  ON_WEB_ORDER: { rotulo: "Pedido feito (PlaceAnOrder)", nomesNoPixel: ["ON_WEB_ORDER", "PLACE_AN_ORDER", "PLACEANORDER"] },
  INITIATE_ORDER: { rotulo: "Inicio de checkout (InitiateCheckout)", nomesNoPixel: ["INITIATE_ORDER", "INITIATE_CHECKOUT", "INITIATECHECKOUT"] },
  ON_WEB_CART: { rotulo: "Adicionar ao carrinho (AddToCart)", nomesNoPixel: ["ON_WEB_CART", "ADD_TO_CART", "ADDTOCART"] },
  FORM: { rotulo: "Envio de formulario (SubmitForm / Lead)", nomesNoPixel: ["FORM", "SUBMIT_FORM", "SUBMITFORM", "LEAD"] },
  ON_WEB_REGISTER: { rotulo: "Cadastro (CompleteRegistration)", nomesNoPixel: ["ON_WEB_REGISTER", "COMPLETE_REGISTRATION", "COMPLETEREGISTRATION"] },
  CONSULT: { rotulo: "Contato (Contact)", nomesNoPixel: ["CONSULT", "CONTACT"] },
};

export function normalizarObjetivo(bruto: unknown): ObjetivoMecPro | null {
  const k = String(bruto || "").trim().toLowerCase().replace(/^outcome_/, "");
  if (["sales", "vendas", "purchase", "compras", "web_conversions"].includes(k)) return "sales";
  if (["conversions", "conversao", "conversoes", "conversion"].includes(k)) return "conversions";
  if (["leads", "lead", "lead_generation", "cadastros"].includes(k)) return "leads";
  if (["traffic", "trafego", "tráfego", "clicks", "link_clicks"].includes(k)) return "traffic";
  if (["awareness", "branding", "reach", "alcance", "reconhecimento"].includes(k)) return "awareness";
  return null;
}

export function configDoObjetivo(objetivo: ObjetivoMecPro, eventoPedido?: string): ConfigObjetivoTikTok {
  switch (objetivo) {
    case "sales":
      return { objetivo, objectiveType: "WEB_CONVERSIONS", optimizationGoal: "CONVERT", billingEvent: "OCPM", optimizationEvent: eventoPedido || "SHOPPING", precisaPixel: true, rotulo: "Vendas no site (conversao)" };
    case "conversions":
      return { objetivo, objectiveType: "WEB_CONVERSIONS", optimizationGoal: "CONVERT", billingEvent: "OCPM", optimizationEvent: eventoPedido || "SHOPPING", precisaPixel: true, rotulo: "Conversoes no site" };
    case "leads":
      return { objetivo, objectiveType: "WEB_CONVERSIONS", optimizationGoal: "CONVERT", billingEvent: "OCPM", optimizationEvent: eventoPedido || "FORM", precisaPixel: true, rotulo: "Leads no site (formulario)" };
    case "traffic":
      return { objetivo, objectiveType: "TRAFFIC", optimizationGoal: "CLICK", billingEvent: "CPC", precisaPixel: false, rotulo: "Trafego para o site" };
    case "awareness":
      return { objetivo, objectiveType: "REACH", optimizationGoal: "REACH", billingEvent: "CPM", precisaPixel: false, rotulo: "Reconhecimento (alcance)" };
  }
}

export interface PixelTikTok { pixelId: string; /** Codigo alfanumerico (pixel_code): e o que o site e a Events API usam. */ codigo?: string; nome: string; ativo: boolean | null; eventos: string[] }

/** Le pixel/list/ de forma tolerante (pixels ou list; eventos com event_type, optimization_event ou nome). */
export function interpretarPixels(d: any): PixelTikTok[] {
  const lista: any[] = Array.isArray(d) ? d : d?.pixels || d?.list || [];
  return lista.filter((p) => p?.pixel_id).map((p) => {
    const evs: any[] = Array.isArray(p.events) ? p.events : Array.isArray(p.event_list) ? p.event_list : [];
    const eventos = [...new Set(evs.flatMap((e) => [e?.event_type, e?.optimization_event, e?.external_action, e?.event_code, e?.name, e?.event_name])
      .filter(Boolean).map((x) => String(x).toUpperCase().replace(/[\s-]+/g, "_")))];
    const status = String(p.activity_status || p.pixel_status || p.status || "");
    return {
      pixelId: String(p.pixel_id), ...(p.pixel_code ? { codigo: String(p.pixel_code) } : {}), nome: String(p.pixel_name || p.name || p.pixel_code || p.pixel_id),
      ativo: status ? /active|ativo|normal/i.test(status) && !/inactive|no_?recent|not_?active/i.test(status) : null,
      eventos,
    };
  });
}

export interface ValidacaoPixel { ok: boolean; pixel?: PixelTikTok; bloqueio?: string; avisos: string[] }

/** Pixel escolhido (ou o unico/primeiro ativo) tem o evento de otimizacao configurado? */
export async function validarPixel(c: ClienteTikTok, adv: string, evento: string, pixelIdPedido?: string): Promise<ValidacaoPixel> {
  const avisos: string[] = [];
  let pixels: PixelTikTok[];
  try {
    pixels = interpretarPixels(await c.get("pixel/list/", { advertiser_id: adv, page_size: 20 }));
  } catch (e: any) {
    return { ok: false, avisos, bloqueio: `Nao consegui ler os Pixels da conta do TikTok (${String(e?.message || e).slice(0, 200)}).` };
  }
  if (!pixels.length) return { ok: false, avisos, bloqueio: "A conta de anuncios do TikTok nao tem Pixel. Crie em Ativos > Eventos > Web, instale no site e configure o evento de compra." };
  const pixel = pixelIdPedido ? pixels.find((p) => p.pixelId === String(pixelIdPedido)) : (pixels.find((p) => p.ativo) || pixels[0]);
  if (!pixel) return { ok: false, avisos, bloqueio: `O Pixel ${pixelIdPedido} nao esta nesta conta de anuncios. Disponiveis: ${pixels.map((p) => `${p.nome} (${p.pixelId})`).join(", ")}.` };
  if (!pixelIdPedido && pixels.length > 1) avisos.push(`A conta tem ${pixels.length} Pixels; usei ${pixel.nome} (${pixel.pixelId}). Informe pixelId para escolher outro.`);
  if (pixel.ativo === false) avisos.push(`O Pixel ${pixel.nome} esta sem atividade recente: confira se ele esta instalado no site.`);
  const nomes = EVENTOS_WEB[evento]?.nomesNoPixel || [evento];
  if (pixel.eventos.length && !pixel.eventos.some((e) => nomes.includes(e))) {
    return { ok: false, pixel, avisos, bloqueio: `O Pixel ${pixel.nome} nao tem o evento "${EVENTOS_WEB[evento]?.rotulo || evento}" configurado. Eventos encontrados: ${pixel.eventos.join(", ")}.` };
  }
  if (!pixel.eventos.length) avisos.push(`Nao consegui confirmar pela API os eventos do Pixel ${pixel.nome}; confira no Gerenciador de Eventos que "${EVENTOS_WEB[evento]?.rotulo || evento}" esta disparando.`);
  return { ok: true, pixel, avisos };
}
