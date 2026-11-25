/**
 * tiktokUrl.ts — URL de destino unica para todos os anuncios de uma publicacao no TikTok.
 *
 * Na Marketing API v1.3 a URL de destino existe so no ANUNCIO (creatives[].landing_page_url);
 * campanha e grupo de promotion_type WEBSITE nao tem URL. "Unificar" aqui e: uma URL normalizada,
 * calculada uma vez e usada em todos os anuncios (videos e carrossel), com os parametros do
 * cliente preservados e UTMs acrescentadas sem sobrescrever as que ja existem.
 *
 * Achado real 24/11 (campanha 828): o ad/create devolveu "Your click tracking URL doesn't match the
 * one set on the selected app". O MecProAI nunca envia click_tracking_url nem tracking_app_id; essa
 * linha faz parte do pacote de validacoes que o TikTok devolve junto quando o anuncio falha. A
 * mensagem original ficou truncada em 400 caracteres e nao permitiu separar a causa; agora o erro
 * completo e registrado (ver ErroTikTok em tiktokPublicar.ts).
 */

/**
 * Macros do TikTok preenchidas no clique (nome da campanha, do grupo e do anuncio).
 * O ttclid de conversao e acrescentado pelo proprio TikTok quando ha Pixel; nada aqui o remove.
 */
export const UTMS_PADRAO_TIKTOK: Readonly<Record<string, string>> = {
  utm_source: "tiktok",
  utm_medium: "paid_social",
  utm_campaign: "__CAMPAIGN_NAME__",
  utm_term: "__AID_NAME__",
  utm_content: "__CID_NAME__",
};

export interface UrlDeDestino { url: string; problemas: string[]; correcoes: string[] }

/** Normaliza: https, sem espacos, host em minusculas, parametros do cliente preservados, UTMs que faltam. */
export function normalizarUrlDeDestino(bruta: string, utms: Record<string, string> | null = UTMS_PADRAO_TIKTOK): UrlDeDestino {
  const problemas: string[] = [], correcoes: string[] = [];
  let t = String(bruta || "").trim();
  if (!t) return { url: "", problemas: ["Pagina de destino ausente."], correcoes };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) { t = `https://${t}`; correcoes.push("Acrescentei https:// na pagina de destino."); }
  let u: URL;
  try { u = new URL(t); } catch { return { url: "", problemas: [`Pagina de destino invalida: ${bruta}`], correcoes }; }
  if (u.protocol === "http:") { u.protocol = "https:"; correcoes.push("Troquei http por https na pagina de destino (o TikTok exige https)."); }
  if (u.protocol !== "https:") problemas.push("A pagina de destino precisa ser https.");
  if (/^(localhost|127\.|10\.|192\.168\.)/i.test(u.hostname) || !u.hostname.includes(".")) problemas.push("A pagina de destino precisa ser um endereco publico.");
  if (utms) {
    const faltando = Object.entries(utms).filter(([k]) => !u.searchParams.has(k));
    for (const [k, v] of faltando) u.searchParams.set(k, v);
    if (faltando.length) correcoes.push(`Acrescentei ${faltando.map(([k]) => k).join(", ")} para rastrear o TikTok (parametros que ja existiam foram mantidos).`);
  }
  return { url: u.toString(), problemas, correcoes };
}

/** Mesma pagina? (ignora UTMs, barra final e caixa do host) */
export function mesmaPagina(a: string, b: string): boolean {
  const base = (x: string) => {
    try {
      const u = new URL(x);
      for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k) || k === "ttclid") u.searchParams.delete(k);
      return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}?${u.searchParams}`;
    } catch { return x; }
  };
  return base(a) === base(b);
}

/** A pagina responde? (HEAD e, se recusado, GET sem baixar o corpo). Nunca lanca. */
export async function paginaResponde(url: string, doFetch: typeof fetch = fetch): Promise<{ ok: boolean; status?: number; erro?: string }> {
  const tentar = async (method: "HEAD" | "GET") => {
    const r = await doFetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "MecProAI-LinkCheck/1.0" } });
    try { await r.body?.cancel(); } catch { /* corpo descartado */ }
    return r.status;
  };
  try {
    let status = await tentar("HEAD");
    if (status === 405 || status === 403 || status === 501) status = await tentar("GET");
    return { ok: status < 400, status };
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e).slice(0, 160) };
  }
}
