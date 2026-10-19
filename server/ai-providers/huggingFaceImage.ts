// Provedor de imagem Hugging Face (transporte puro, sem dependencia de
// imageGeneration.ts, pra ser testavel isolado).
//
// Historico: o gerador HF foi desligado em 28/09 (`HF_MODELS = []`) porque a
// rota antiga `router.huggingface.co/hf-inference/models/<modelo>` deixou de
// servir modelo de imagem — a doc oficial diz que o HF Inference "focuses
// mostly on CPU inference" desde jul/2025. Desde entao o rotulo
// IMAGE_PROVIDER=huggingface gerava, na pratica, pelo Cloudflare FLUX.
//
// Reativado em 19/10 a pedido do Michel, pela rota ATUAL: Inference Providers
// (o HF repassa pra fal-ai, Together, Replicate etc.). A doc oficial NAO
// publica o formato HTTP cru de text-to-image — so os clientes oficiais. Por
// isso a chamada passa pelo `@huggingface/inference`, que monta o formato de
// cada provedor. Montar URL a mao foi exatamente o erro do OpenRouter (404 por
// tres rodadas, ver chamarOpenRouterComRetry em chat.ts).
//
// Conta e token verificados em producao (19/10, Shell do Render):
//   - HUGGINGFACE_API_KEY valida, conta Michelleal123, isPro: false
//   - permissoes scoped: inference.serverless.write, inference.endpoints.infer.write
// Conta gratuita NAO tem credito mensal pra Inference Providers (PRO tem US$2);
// sem credito comprado a chamada volta 402. Por isso 402 tem motivo proprio.

import { InferenceClient } from "@huggingface/inference";
import type { CreativeImageFormat } from "../imageGeneration";

export const HF_IMAGE_MODEL_PADRAO = "black-forest-labs/FLUX.1-schnell";
export const HF_IMAGE_PROVIDER_PADRAO = "fal-ai";

// Dimensoes de GERACAO, multiplos de 16 (exigencia do FLUX), na proporcao de
// cada formato. O tamanho final e o recorte continuam sendo do Cloudinary
// (urlCloudinaryNaProporcao), igual ao caminho do Cloudflare.
const DIMENSOES_DE_GERACAO: Record<CreativeImageFormat, { width: number; height: number }> = {
  feed: { width: 896, height: 1120 },     // 4:5
  stories: { width: 768, height: 1344 },  // ~9:16
  square: { width: 1024, height: 1024 },  // 1:1
};

const TIMEOUT_MS = 60_000;
const TAMANHO_MINIMO_BYTES = 10_000; // mesmo piso do candidato Cloudflare
const PAUSA_SEM_CREDITO_MS = 15 * 60_000;

// Pausa curta propria, e nao markProviderExhausted (24h): o caso esperado e o
// Michel colocar credito no mesmo dia, e 24h travaria o teste ate amanha.
let _pausadoAte = 0;
export function _resetarPausaHuggingFace() { _pausadoAte = 0; }

export type MotivoFalhaHf =
  | "sem_chave"
  | "pausado_sem_credito"
  | "sem_credito"
  | "token_sem_permissao"
  | "modelo_ou_provedor_indisponivel"
  | "limite_de_taxa"
  | "provedor_fora"
  | "timeout"
  | "imagem_vazia"
  | "excecao";

export interface ResultadoHf {
  buffer: Buffer | null;
  motivo?: MotivoFalhaHf;
  detalhe?: string;
}

export function motivoPorStatus(status: number | undefined): MotivoFalhaHf {
  if (status === 402) return "sem_credito";
  if (status === 401 || status === 403) return "token_sem_permissao";
  if (status === 404 || status === 400 || status === 422) return "modelo_ou_provedor_indisponivel";
  if (status === 429) return "limite_de_taxa";
  if (status && status >= 500) return "provedor_fora";
  return "excecao";
}

export async function gerarImagemHuggingFace(
  prompt: string,
  format: CreativeImageFormat,
  opts: {
    apiKey?: string;
    model?: string;
    provider?: string;
    fetch?: typeof fetch;
    agora?: () => number;
  } = {},
): Promise<ResultadoHf> {
  const apiKey = (opts.apiKey ?? process.env.HUGGINGFACE_API_KEY ?? "").trim();
  if (!apiKey) return { buffer: null, motivo: "sem_chave" };

  const agora = opts.agora ?? Date.now;
  if (agora() < _pausadoAte) return { buffer: null, motivo: "pausado_sem_credito" };

  const model = (opts.model ?? process.env.HF_IMAGE_MODEL ?? HF_IMAGE_MODEL_PADRAO).trim() || HF_IMAGE_MODEL_PADRAO;
  // fal-ai e nao "auto", de proposito. Lido no codigo do cliente (4.13.32,
  // resolveProvider): "auto" pega mappings[0] SEM checar status, e consulta o
  // mapeamento SEM o token, entao nem a ordem da conta vale. Em 19/10 o
  // mapeamento do FLUX.1-schnell tinha nscale/fal-ai/wavespeed "live" e
  // together/deepinfra "error": se a ordem mudar, "auto" cairia num provedor
  // quebrado e toda geracao falharia. Trocavel por env sem deploy.
  const provider = (opts.provider ?? process.env.HF_IMAGE_PROVIDER ?? HF_IMAGE_PROVIDER_PADRAO).trim() || HF_IMAGE_PROVIDER_PADRAO;
  const dim = DIMENSOES_DE_GERACAO[format] ?? DIMENSOES_DE_GERACAO.feed;

  const fetchImpl = opts.fetch ?? fetch;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const client = new InferenceClient(apiKey, opts.fetch ? { fetch: opts.fetch } : undefined);
    // outputType "url", e nao "blob": no cliente 4.13.32 o download final da
    // imagem do fal-ai usa o fetch GLOBAL, ignorando o injetado. Pedindo so a
    // URL, o download e nosso — com o mesmo timeout e testavel. Provedor que
    // devolve a imagem embutida chega como data URL, tratado abaixo.
    const imagem = await client.textToImage(
      {
        model,
        provider: provider as any,
        inputs: prompt,
        parameters: { width: dim.width, height: dim.height, num_inference_steps: 4 },
      },
      { outputType: "url", signal },
    );
    let buffer: Buffer;
    if (imagem.startsWith("data:")) {
      buffer = Buffer.from(imagem.slice(imagem.indexOf(",") + 1), "base64");
    } else {
      const resp = await fetchImpl(imagem, { signal });
      if (!resp.ok) {
        return { buffer: null, motivo: "provedor_fora", detalhe: `download da imagem: HTTP ${resp.status}` };
      }
      buffer = Buffer.from(await resp.arrayBuffer());
    }
    if (buffer.length < TAMANHO_MINIMO_BYTES) {
      return { buffer: null, motivo: "imagem_vazia", detalhe: `${buffer.length} bytes` };
    }
    return { buffer };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { buffer: null, motivo: "timeout" };
    }
    const status: number | undefined = err?.httpResponse?.status;
    const motivo = motivoPorStatus(status);
    if (motivo === "sem_credito") _pausadoAte = agora() + PAUSA_SEM_CREDITO_MS;
    // So a mensagem; nunca o objeto de requisicao, que carrega o header com o token.
    const detalhe = `${status ?? "sem_status"}: ${String(err?.message ?? err).slice(0, 200)}`;
    return { buffer: null, motivo, detalhe };
  }
}
