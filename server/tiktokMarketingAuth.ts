/**
 * tiktokMarketingAuth.ts — login do TikTok Ads (Marketing API), igual ao da Meta:
 * o usuario autoriza, o MecProAI recebe o token e as contas de anuncio.
 *
 * Diferente do Login Kit (tiktokOAuth.ts), que so liga o perfil.
 * Fluxo: portal/auth?app_id=... -> redireciona com ?auth_code=... ->
 * POST /open_api/v1.3/oauth2/access_token/ {app_id, secret, auth_code}.
 * O Secret fica so no servidor (TIKTOK_MARKETING_APP_SECRET), nunca no navegador.
 */

export const TIKTOK_MARKETING_AUTH_URL = "https://business-api.tiktok.com/portal/auth";
export const TIKTOK_MARKETING_TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
const VALIDADE_STATE_MS = 30 * 60 * 1000;

export function montarUrlAutorizacaoAds(appId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({ app_id: appId, redirect_uri: redirectUri, state });
  return `${TIKTOK_MARKETING_AUTH_URL}?${p}`;
}

export function criarStateAds(userId: number, agora = Date.now()): string {
  return `mecproads_${userId}_${agora}`;
}

/** O state precisa ser do mesmo usuario e recente (evita reaproveitar link de outra pessoa). */
export function stateAdsValido(state: string, userId: number, agora = Date.now()): boolean {
  const m = /^mecproads_(\d+)_(\d+)$/.exec(String(state ?? ""));
  if (!m) return false;
  if (Number(m[1]) !== userId) return false;
  const idade = agora - Number(m[2]);
  return idade >= 0 && idade <= VALIDADE_STATE_MS;
}

export interface TokenAds {
  accessToken: string;
  refreshToken?: string;
  expiraEm?: Date;
  advertiserIds: string[];
}

/** Le a resposta do TikTok de forma tolerante: refresh_token e expiracao podem nao vir. */
export function lerRespostaTokenAds(corpo: any, agora = Date.now()): TokenAds {
  if (!corpo || typeof corpo !== "object") throw new Error("Resposta vazia do TikTok.");
  if (corpo.code !== undefined && Number(corpo.code) !== 0) {
    throw new Error(`TikTok recusou: ${corpo.message || "erro " + corpo.code}`);
  }
  const d = corpo.data ?? corpo;
  const accessToken = d.access_token;
  if (!accessToken || typeof accessToken !== "string") throw new Error("TikTok nao devolveu o access token.");

  const bruto = d.advertiser_ids ?? d.advertiser_id ?? [];
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  const advertiserIds = Array.from(new Set(lista.map((x: any) => String(x ?? "").trim()).filter((x: string) => /^\d+$/.test(x))));

  const segundos = Number(d.expires_in ?? d.access_token_expires_in);
  const expiraEm = Number.isFinite(segundos) && segundos > 0 ? new Date(agora + segundos * 1000) : undefined;
  const refreshToken = typeof d.refresh_token === "string" && d.refresh_token ? d.refresh_token : undefined;
  return { accessToken, refreshToken, expiraEm, advertiserIds };
}

export async function trocarAuthCode(
  authCode: string,
  cfg: { appId: string; secret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenAds> {
  if (!cfg.appId || !cfg.secret) throw new Error("TikTok Ads nao configurado no servidor (TIKTOK_MARKETING_APP_ID / TIKTOK_MARKETING_APP_SECRET).");
  const res = await fetchImpl(TIKTOK_MARKETING_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: cfg.appId, secret: cfg.secret, auth_code: authCode }),
  });
  let corpo: any;
  try { corpo = await res.json(); } catch { throw new Error(`TikTok respondeu HTTP ${res.status} sem JSON.`); }
  return lerRespostaTokenAds(corpo);
}
