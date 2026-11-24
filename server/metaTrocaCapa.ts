/**
 * metaTrocaCapa.ts — troca a capa (miniatura) de um anuncio de VIDEO ja publicado na Meta.
 *
 * A Meta nao deixa editar um criativo publicado. O caminho suportado e: ler o
 * object_story_spec do criativo atual, criar um criativo igual com a nova
 * image_url no video_data e apontar o anuncio existente para ele. O anuncio,
 * o conjunto, o orcamento, o publico e o status continuam os mesmos.
 *
 * Achado real (Shadia 820-822, 24/11): as capas finais chegaram depois da
 * publicacao, e o MecProAI so sabia publicar de novo — o que a trava de
 * duplicidade (corretamente) bloqueia.
 */
type FetchLike = (url: string, init?: any) => Promise<Response>;
const GRAPH = "https://graph.facebook.com/v19.0";

/** Mesmo spec com a nova capa. So vale para criativo de video (video_data). */
export function specComNovaCapa(spec: any, capaUrl: string): any {
  if (!/^https:\/\/\S+$/i.test(String(capaUrl || ""))) throw new Error("A capa precisa ser uma URL https publica.");
  const video = spec?.video_data;
  if (!video?.video_id) throw new Error("Este anuncio nao e de video (sem video_data.video_id); a troca de capa vale so para video.");
  const novo = JSON.parse(JSON.stringify(spec));
  delete novo.video_data.image_hash;
  novo.video_data.image_url = capaUrl;
  return novo;
}

async function graph(doFetch: FetchLike, path: string, token: string, body?: Record<string, unknown>) {
  const url = body ? `${GRAPH}/${path}` : `${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await doFetch(url, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, access_token: token }), signal: AbortSignal.timeout(20000) }
    : { signal: AbortSignal.timeout(15000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(`Meta: ${data?.error?.error_user_msg || data?.error?.message || `HTTP ${res.status}`}`);
  return data;
}

export interface ResultadoTrocaDeCapa { adId: string; creativeAnterior: string; creativeNovo: string }

export async function trocarCapaDoAnuncio(args: { token: string; adId: string; capaUrl: string; doFetch?: FetchLike }): Promise<ResultadoTrocaDeCapa> {
  const doFetch = args.doFetch ?? (fetch as FetchLike);
  const ad = await graph(doFetch, `${args.adId}?fields=account_id,creative{id,name,object_story_spec}`, args.token);
  const atual = ad?.creative;
  if (!atual?.id || !atual?.object_story_spec) throw new Error("Nao consegui ler o criativo atual deste anuncio na Meta.");
  const conta = String(ad.account_id || "").replace(/^act_/, "");
  if (!conta) throw new Error("A Meta nao informou a conta de anuncios deste anuncio.");
  const spec = specComNovaCapa(atual.object_story_spec, args.capaUrl);
  const criado = await graph(doFetch, `act_${conta}/adcreatives`, args.token, {
    name: `${String(atual.name || "Criativo").slice(0, 80)} (capa nova)`,
    object_story_spec: spec,
  });
  if (!criado?.id) throw new Error("A Meta nao devolveu o id do criativo novo.");
  await graph(doFetch, args.adId, args.token, { creative: { creative_id: criado.id } });
  return { adId: args.adId, creativeAnterior: String(atual.id), creativeNovo: String(criado.id) };
}
