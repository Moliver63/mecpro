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
  if (!hostPublico(u.hostname)) problemas.push("A pagina de destino precisa ser um endereco publico.");
  if (utms) {
    const faltando = Object.entries(utms).filter(([k]) => !u.searchParams.has(k));
    for (const [k, v] of faltando) u.searchParams.set(k, v);
    if (faltando.length) correcoes.push(`Acrescentei ${faltando.map(([k]) => k).join(", ")} para rastrear o TikTok (parametros que ja existiam foram mantidos).`);
  }
  return { url: u.toString(), problemas, correcoes };
}

/** IP privado, de loopback, link-local (metadados 169.254.x) ou reservado, v4 e v6. */
export function ipPrivado(ip: string): boolean {
  const v = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (v.includes(":")) {
    // Goldfish 25/11, rodada 2: new URL reescreve [::ffff:169.254.169.254] como [::ffff:a9fe:a9fe], e
    // NAT64/6to4/site-local embutem ou alcancam rede interna. Regra fechada: so e publico o unicast
    // global 2000::/3, fora de 2002::/16 (6to4), 2001:0::/32 (Teredo), 2001:db8::/32 (documentacao).
    const mapeado = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return true;
    const primeiro = parseInt(v.split(":")[0] || "0", 16);
    if (!(primeiro >= 0x2000 && primeiro <= 0x3fff)) return true;
    if (/^2002:|^2001:0*:|^2001:db8:/.test(v)) return true;
    return false;
  }
  const n = v.split(".").map(Number);
  if (n.length !== 4 || n.some((x) => !(x >= 0 && x <= 255))) return false;
  const [a, b] = n;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Nome de host publico (nao localhost, nao IP privado, com dominio). */
export function hostPublico(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return !ipPrivado(h);
  return h.includes(".");
}

/** https e host publico, conferindo tambem o IP resolvido (evita apontar o servidor para a rede interna). */
export async function urlPublicaSegura(url: string, resolver: (host: string) => Promise<string[]> = resolverHost): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || !hostPublico(u.hostname)) return false;
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return true;
  try { const ips = await resolver(u.hostname); return ips.length > 0 && !ips.some(ipPrivado); } catch { return false; }
}

async function resolverHost(host: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  return (await lookup(host, { all: true })).map((r) => r.address);
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
export async function paginaResponde(url: string, doFetch: typeof fetch = fetch, seguro: (u: string) => Promise<boolean> = urlPublicaSegura): Promise<{ ok: boolean; status?: number; erro?: string }> {
  // Revisao Goldfish 25/11 (SSRF): so consulta endereco publico e nao segue redirecionamento
  // (3xx conta como "responde": o TikTok segue o redirecionamento na revisao).
  if (!(await seguro(url))) return { ok: false, erro: "endereco nao publico" };
  const tentar = async (method: "HEAD" | "GET") => {
    const r = await doFetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "MecProAI-LinkCheck/1.0" } });
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

/**
 * Segue redirecionamentos conferindo CADA destino (https publico), ate 5 saltos, sem baixar o corpo.
 * Devolve a URL final segura ou null. Goldfish 25/11, rodada 2: ffprobe e download seguiam 3xx para
 * a rede interna. Risco residual: troca de DNS entre esta checagem e a leitura (documentado).
 */
export async function urlFinalSegura(url: string, doFetch: typeof fetch = fetch, seguro: (u: string) => Promise<boolean> = urlPublicaSegura): Promise<string | null> {
  let atual = url;
  for (let i = 0; i < 6; i++) {
    if (!(await seguro(atual))) return null;
    let r: Response;
    try { r = await doFetch(atual, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) }); }
    catch { return atual; } // sem resposta ao HEAD: quem le depois trata o erro; o destino ja foi conferido
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { atual = new URL(loc, atual).toString(); continue; }
    return atual;
  }
  return null;
}
