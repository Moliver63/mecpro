// Transporte da API assincrona (batch) do Workers AI.
//
// Serve pra submeter N inferencias independentes numa fila e buscar os
// resultados depois, em vez de segurar N conexoes HTTP abertas. A doc diz que
// costuma completar em ~5 minutos, dependendo do trafego.
//
// IMPORTANTE — o batch NAO aumenta a cota gratuita. A pagina de precos
// (atualizada em 17/09/2026) e explicita: "Our free allocation allows anyone
// to use a total of 10,000 Neurons per day at no charge. All limits reset
// daily at 00:00 UTC. If you exceed any one of the above limits, further
// operations will fail with an error." Nao ha desconto documentado pra
// requisicao enfileirada: mesmo modelo, mesmos tokens, mesmo custo. O ganho e
// throughput e resiliencia a erro de capacidade, nao volume gratuito.
//
// Endpoint verificado na documentacao oficial antes de escrever este arquivo
// (/workers-ai/features/batch-api/rest-api/), mesma disciplina que faltou no
// bug do OpenRouter: o parametro `queueRequest=true` vai na QUERY STRING, nao
// no corpo, e a MESMA URL serve pra submeter e pra consultar — o que muda e o
// corpo (`requests` pra submeter, `request_id` pra consultar).
//
// NAO usar isto pra gerar campanha inteira ainda. Uma campanha em
// server/ai.ts:generateCampaign nao e uma chamada de modelo: sao varias,
// intercaladas com Fact Guard, reparo e fallback entre provedores. Enfileirar
// prompt cru aqui e montar campanha com o resultado criaria um segundo
// gerador que pula a validacao. A costura em generateCampaign vem primeiro
// (ver docs/ai-architecture-audit.md, item 2 do plano).

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts";
const TIMEOUT_MS = 20000;

export type ItemDeLote = {
  /** Corpo da inferencia, no mesmo formato que o modelo aceita em chamada unica. */
  messages: unknown[];
  /** Marca que volta junto com o resultado, pra correlacionar com o seu registro. */
  external_reference?: string;
  [extra: string]: unknown;
};

export type LoteSubmetido = {
  status: string;
  requestId: string;
  model?: string;
};

export type RespostaDeItem = {
  id: number;
  success: boolean;
  externalReference?: string;
  result?: unknown;
  erro?: string;
};

export type LoteConsultado =
  | { estado: "pendente"; status: string }
  | { estado: "pronto"; respostas: RespostaDeItem[]; usage?: Record<string, unknown> };

function credenciais(): { accountId: string; apiToken: string } {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN nao configurado.");
  }
  return { accountId, apiToken };
}

async function chamar(
  modelo: string,
  corpo: Record<string, unknown>,
  fetchImpl?: typeof fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<any> {
  const { accountId, apiToken } = credenciais();
  const doFetch = fetchImpl ?? fetch;
  // queueRequest na query string, conforme a doc. No corpo ele e ignorado e a
  // requisicao vira sincrona silenciosamente — falha dificil de perceber.
  const url = `${CF_BASE}/${accountId}/ai/run/${modelo}?queueRequest=true`;

  const res = await doFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(corpo),
  });

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    const erro: any = new Error(`Cloudflare batch HTTP ${res.status}: resposta nao-JSON: ${raw.slice(0, 200)}`);
    erro.status = res.status;
    throw erro;
  }

  if (!res.ok || data?.success === false) {
    const detalhe = Array.isArray(data?.errors) && data.errors.length
      ? data.errors.map((e: any) => `${e?.code ?? "?"}: ${e?.message ?? ""}`).join("; ")
      : data?.error?.message || "erro desconhecido";
    const erro: any = new Error(`Cloudflare batch HTTP ${res.status}: ${detalhe}`);
    erro.status = res.status;
    throw erro;
  }

  return data;
}

/**
 * Enfileira um lote. Devolve o request_id usado depois pra buscar o resultado.
 * O payload total precisa ficar abaixo de 10 MB (limite documentado).
 */
export async function submeterLote(
  modelo: string,
  itens: ItemDeLote[],
  fetchImpl?: typeof fetch,
): Promise<LoteSubmetido> {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Lote vazio: nada a submeter.");
  }

  const corpo = { requests: itens };
  // Checagem local antes de gastar a viagem: o limite e do payload inteiro.
  const bytes = Buffer.byteLength(JSON.stringify(corpo), "utf8");
  if (bytes > 10 * 1024 * 1024) {
    throw new Error(`Lote de ${bytes} bytes excede o limite de 10 MB da API de batch. Divida em lotes menores.`);
  }

  const data = await chamar(modelo, corpo, fetchImpl);
  const requestId = data?.result?.request_id;
  if (typeof requestId !== "string" || !requestId) {
    throw new Error("Cloudflare batch: resposta sem result.request_id");
  }
  return { status: String(data?.result?.status ?? "queued"), requestId, model: data?.result?.model };
}

/**
 * Consulta um lote pelo request_id. Enquanto estiver `queued` ou `running`,
 * devolve estado "pendente" — quem chama decide quando tentar de novo.
 */
export async function consultarLote(
  modelo: string,
  requestId: string,
  fetchImpl?: typeof fetch,
): Promise<LoteConsultado> {
  if (!requestId) throw new Error("request_id ausente.");

  const data = await chamar(modelo, { request_id: requestId }, fetchImpl);
  const resultado = data?.result ?? {};

  const status = typeof resultado.status === "string" ? resultado.status : "";
  if (status === "queued" || status === "running") {
    return { estado: "pendente", status };
  }

  const respostas = resultado.responses;
  if (!Array.isArray(respostas)) {
    // Sem responses e sem status pendente conhecido: nao inventar sucesso.
    // Mesma regra do provider sincrono — resposta HTTP valida nao equivale a
    // resultado utilizavel (docs/ai-architecture-audit.md, item 2).
    throw new Error(`Cloudflare batch: resposta sem result.responses (status: ${status || "ausente"})`);
  }

  return {
    estado: "pronto",
    respostas: respostas.map((r: any, indice: number) => ({
      id: typeof r?.id === "number" ? r.id : indice,
      success: r?.success !== false,
      externalReference: typeof r?.external_reference === "string" ? r.external_reference : undefined,
      result: r?.result,
      erro: r?.success === false ? String(r?.error?.message ?? r?.error ?? "falha sem detalhe") : undefined,
    })),
    usage: resultado.usage,
  };
}
