/**
 * googleAdsApi.ts — versao da Google Ads API num lugar so.
 *
 * Por que existe: a versao estava escrita em 5 lugares (v17, v19, v19_1, v23 e
 * um segundo "v23" no financialWorker). O Google desliga cada versao cerca de
 * 12 a 15 meses apos o lancamento e passou a lancar versoes todo mes; v19 caiu
 * em 11/02/2026, v20 em junho, v21 em agosto, v22 em 07/10/2026. Chamada para
 * versao desligada falha, e quem le o erro suspeita de token ou de Customer ID,
 * nunca da versao. Uma constante unica troca isso por uma edicao de uma linha.
 *
 * Versoes e datas conferidas em 03/11/2026 (v26 e a atual; v23 segue ate cerca
 * de fev/2027). Sao estimativas do Google e mudam: ao reler isto, confira
 * https://developers.google.com/google-ads/api/docs/sunset-dates
 */

/** Versao usada quando nada em contrario e configurado. */
export const GOOGLE_ADS_API_VERSION_PADRAO = "v25";

/**
 * Menor versao que ainda pode ser usada. Abaixo disto o valor vindo do ambiente
 * e ignorado: uma variavel GOOGLE_ADS_API_VERSION esquecida no Render com "v19"
 * reintroduziria em silencio o defeito que este modulo existe para evitar.
 */
export const GOOGLE_ADS_API_VERSAO_MINIMA = 23;

const FORMATO = /^v(\d+)(?:_(\d+))?$/;

/** Numero principal de "v25" ou "v25_1". NaN quando o formato nao e de versao. */
export function versaoPrincipal(v: string): number {
  const m = FORMATO.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : NaN;
}

/**
 * Escolhe a versao: a do ambiente se for valida e nao estiver defasada; senao a
 * padrao. Devolve tambem o motivo quando descarta, para o chamador registrar.
 */
export function resolverVersao(doAmbiente?: string | null): { versao: string; descartada?: string } {
  const bruto = String(doAmbiente ?? "").trim();
  if (!bruto) return { versao: GOOGLE_ADS_API_VERSION_PADRAO };
  const principal = versaoPrincipal(bruto);
  if (Number.isNaN(principal)) {
    return { versao: GOOGLE_ADS_API_VERSION_PADRAO, descartada: `"${bruto}" nao e uma versao (esperado algo como v25)` };
  }
  if (principal < GOOGLE_ADS_API_VERSAO_MINIMA) {
    return {
      versao: GOOGLE_ADS_API_VERSION_PADRAO,
      descartada: `"${bruto}" ja foi desligada pelo Google (minimo v${GOOGLE_ADS_API_VERSAO_MINIMA})`,
    };
  }
  return { versao: bruto };
}

const escolhida = resolverVersao(process.env.GOOGLE_ADS_API_VERSION);
if (escolhida.descartada) {
  // console direto: este modulo nao pode depender do logger para nao criar ciclo.
  console.warn(`[googleAdsApi] GOOGLE_ADS_API_VERSION ignorada: ${escolhida.descartada}. Usando ${escolhida.versao}.`);
}

/** Versao em uso neste processo. */
export const GOOGLE_ADS_API_VERSION: string = escolhida.versao;

const BASE = "https://googleads.googleapis.com";

/** URL de recurso de um cliente: .../vN/customers/{id}/{path}. */
export function urlDoCliente(customerId: string, path: string, versao: string = GOOGLE_ADS_API_VERSION): string {
  const id = String(customerId ?? "").replace(/\D/g, "");
  return `${BASE}/${versao}/customers/${id}/${path.replace(/^\/+/, "")}`;
}

/**
 * Metodos de cliente com sufixo ":metodo" (generateKeywordIdeas), que na API
 * REST ficam coladas ao id, sem barra: .../customers/{id}:generateKeywordIdeas.
 */
export function urlDoClienteComMetodo(customerId: string, metodo: string, versao: string = GOOGLE_ADS_API_VERSION): string {
  const id = String(customerId ?? "").replace(/\D/g, "");
  return `${BASE}/${versao}/customers/${id}:${metodo.replace(/^:+/, "")}`;
}

/** Endpoint sem cliente: .../vN/customers:listAccessibleCustomers. */
export function urlListarContasAcessiveis(versao: string = GOOGLE_ADS_API_VERSION): string {
  return `${BASE}/${versao}/customers:listAccessibleCustomers`;
}

/**
 * Versao usada so no envio de video. O servico YouTubeVideoUpload e o campo de
 * divulgacao de conteudo gerado por IA (video_content_metadata) estao
 * documentados na v26; os exemplos do Google para estas chamadas sao v26.
 */
export const GOOGLE_ADS_API_VERSION_VIDEO = "v26";

/** Inicio da sessao de upload resumable: .../resumable/upload/vN/customers/{id}/youTubeVideoUploads:create. */
export function urlUploadDeVideo(customerId: string, versao: string = GOOGLE_ADS_API_VERSION_VIDEO): string {
  const id = String(customerId ?? "").replace(/\D/g, "");
  return `${BASE}/resumable/upload/${versao}/customers/${id}/youTubeVideoUploads:create`;
}
