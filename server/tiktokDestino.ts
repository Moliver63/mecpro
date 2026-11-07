// Extrai a URL de destino de um anuncio TikTok, qualquer que seja o formato da resposta.
// Anuncios comuns trazem `landing_page_url`; Smart+ e carrossel podem trazer a URL em lista
// ou dentro de objetos de criativo. Em vez de depender de um unico campo, varremos o objeto.

const CHAVES_URL = /^(landing_page_url|landing_page_urls|landing_page_url_list|landing_page|website_url|deeplink)$/i;
const MAX_PROFUNDIDADE = 5;

function urlValida(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return /^https?:\/\/\S+$/i.test(t) ? t : "";
}

function dentroDoValor(v: unknown, nivel: number): string {
  const direta = urlValida(v);
  if (direta) return direta;
  if (nivel > MAX_PROFUNDIDADE || v == null || typeof v !== "object") return "";
  if (Array.isArray(v)) {
    for (const item of v) {
      const achou = dentroDoValor(item, nivel + 1);
      if (achou) return achou;
    }
    return "";
  }
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    if (CHAVES_URL.test(chave) || chave.toLowerCase() === "url") {
      const achou = dentroDoValor(valor, nivel + 1);
      if (achou) return achou;
    }
  }
  return "";
}

function varrer(v: unknown, nivel: number): string {
  if (nivel > MAX_PROFUNDIDADE || v == null || typeof v !== "object") return "";
  if (Array.isArray(v)) {
    for (const item of v) {
      const achou = varrer(item, nivel + 1);
      if (achou) return achou;
    }
    return "";
  }
  const obj = v as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(obj)) {
    if (CHAVES_URL.test(chave)) {
      const achou = dentroDoValor(valor, nivel + 1);
      if (achou) return achou;
    }
  }
  for (const valor of Object.values(obj)) {
    const achou = varrer(valor, nivel + 1);
    if (achou) return achou;
  }
  return "";
}

/** Devolve a primeira URL http(s) de destino encontrada nas fontes, ou "" se nenhuma. */
export function extrairUrlDestino(...fontes: unknown[]): string {
  for (const f of fontes) {
    const achou = varrer(f, 0);
    if (achou) return achou;
  }
  return "";
}
