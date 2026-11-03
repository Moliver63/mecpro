/**
 * tiktokOAuth.ts — escopos do login com TikTok (Login Kit).
 *
 * Defeito de origem: o codigo pedia sempre "user.info.profile,user.info.stats,video.list".
 * No app do TikTok em modo Sandbox so existem user.info.basic e user.info.profile
 * (stats e video.list sao do produto Display API, que nao esta no app). Pedir um
 * escopo que o app nao tem faz a autorizacao falhar por inteiro (invalid_scope).
 *
 * Este login NAO da acesso a anuncios. Anuncios usam a Marketing API
 * (business-api.tiktok.com) com Access Token + Advertiser ID, outro app.
 */

/** Escopos que existem no app em Sandbox hoje. */
export const TIKTOK_ESCOPOS_PADRAO = ["user.info.basic", "user.info.profile"] as const;

const FORMATO_ESCOPO = /^[a-z]+(\.[a-z_]+)+$/;

/**
 * Escopos a pedir: TIKTOK_OAUTH_SCOPES (separados por virgula) se valido, senao o padrao.
 * Para ativar perfil completo e videos depois da aprovacao do app em Producao:
 * TIKTOK_OAUTH_SCOPES=user.info.basic,user.info.profile,user.info.stats,video.list
 */
export function escoposTikTok(doAmbiente?: string | null): string {
  const lista = String(doAmbiente ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (lista.length && lista.every((s) => FORMATO_ESCOPO.test(s))) return Array.from(new Set(lista)).join(",");
  return TIKTOK_ESCOPOS_PADRAO.join(",");
}
