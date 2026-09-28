// Provedor Cloudflare Workers AI (transporte puro, sem dependencia do chat.ts).
//
// Achado real (pedido de Michel, 28/09): "solucao gratuita para gerar varias
// campanhas" / "encontre uma ia gratuita para servir de motor". Pesquisa das
// opcoes citadas por ele:
//   - Qwen (qwen.ai): tier gratuito de API DESCONTINUADO em 15/04/2026.
//   - Kimi/Moonshot: nunca teve tier gratuito; exige deposito minimo de US$1.
// A Cloudflare serve o MESMO modelo Qwen3 no free tier (10.000 neurons/dia,
// permanente, sem cartao) e esta conta JA tem CLOUDFLARE_ACCOUNT_ID e
// CLOUDFLARE_API_TOKEN configurados e comprovadamente funcionando: os logs de
// producao do Render mostram "[image-generation] Cloudflare FLUX gerou imagem"
// em 23 e 24/09, chamando /ai/run/ com essas mesmas credenciais. A permissao
// do token e por CONTA (Account > Workers AI), nao por modelo, entao o mesmo
// token que roda o FLUX roda os modelos de texto. Nenhuma credencial nova.
//
// IMPORTANTE — o path foi verificado na documentacao oficial da Cloudflare
// antes de escrever este arquivo, nao por memoria nem por blog de terceiro.
// Foi exatamente esse passo que faltou no bug do OpenRouter (o SDK do Groq
// montava "/openai/v1/chat/completions" e o 404 persistiu por tres rodadas
// porque a verificacao anterior so olhou a PROPRIEDADE baseURL do client, e
// nunca o path final de uma chamada real — ver comentario em
// chamarOpenRouterComRetry). O endpoint OpenAI-compativel do Workers AI e:
//   https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions
// Nao e "/ai/v1/completions", nao e "/ai/run/v1/...", e nao e o endpoint do
// AI Gateway (gateway.ai.cloudflare.com/.../compat/chat/completions, que a
// propria doc marca como DEPRECATED para chamada de modelo unico).

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts";

// qwen3-30b-a3b-fp8: MoE de 30B com 3B ativos. Escolhido sobre llama-3.3-70b
// e gpt-oss-120b por custo em neurons, que e o que limita o free tier:
//   qwen3-30b-a3b-fp8   4.625 in / 30.475 out  por M tokens  -> ~165 chamadas/dia
//   gpt-oss-120b       31.818 in / 68.182 out                -> ~50 chamadas/dia
//   llama-3.3-70b-fast 26.668 in / 204.805 out               -> ~26 chamadas/dia
// (conta para ~3k tokens de entrada + 1,5k de saida por chamada.)
// Doc oficial confirma: Cloudflare-hosted, function calling SIM, reasoning,
// batch, contexto de 32.768 tokens. Function calling e obrigatorio aqui — o
// chat tem 8 ferramentas registradas; um modelo sem tool calling nao serve
// como fallback, so responderia texto e quebraria o fluxo de campanha.
export const MODELO_CLOUDFLARE = process.env.CLOUDFLARE_CHAT_MODEL ?? "@cf/qwen/qwen3-30b-a3b-fp8";

// Timeout menor que o do OpenRouter (20s) de proposito: este provedor roda em
// SEGUNDO lugar na cadeia, nao em ultimo. Se ele travar, ainda existem
// DeepSeek, Groq e OpenRouter depois — gastar 20s aqui empurraria o pior caso
// da requisicao inteira pra perto de um minuto, que foi exatamente a
// reclamacao registrada em docs/chat-latency.md.
const TIMEOUT_MS = 15000;

export function cloudflareWorkersAIConfigurado(): boolean {
  return !!String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim()
    && !!String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
}

export type CloudflareChatParams = {
  messages: unknown[];
  tools?: unknown[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Chama o endpoint OpenAI-compativel do Workers AI e devolve a resposta no
 * formato OpenAI (choices[0].message), o mesmo que Groq e OpenRouter ja
 * retornam — por isso o loop de ferramentas compartilhado
 * (tentarComOpenAICompativel) funciona sem adaptacao.
 */
export async function chamarCloudflareWorkersAI(params: CloudflareChatParams): Promise<any> {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN nao configurado.");
  }

  const doFetch = params.fetchImpl ?? fetch;
  const url = `${CF_BASE}/${accountId}/ai/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: params.model ?? MODELO_CLOUDFLARE,
    messages: params.messages,
    temperature: 0.3,
    max_tokens: params.maxTokens ?? 2048,
    // Doc oficial: "For synchronous Chat Completions, set options.rejectIfBusy
    // in the top-level request body. This makes the request fail instead of
    // waiting in a capacity queue." Numa cadeia de fallback isso e o que a
    // gente quer: falhar rapido e passar pro proximo provedor e melhor do que
    // ficar preso numa fila de capacidade segurando a resposta do usuario.
    options: { rejectIfBusy: true },
  };

  if (params.tools && params.tools.length) {
    body.tools = params.tools;
    body.tool_choice = "auto";
    // Mesma decisao do OpenRouter e do Groq: o loop de ferramentas processa
    // uma chamada por passo (msg.tool_calls?.[0]), entao permitir chamadas
    // paralelas geraria tool_calls sem resposta correspondente no historico.
    body.parallel_tool_calls = false;
  }

  const res = await doFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(params.timeoutMs ?? TIMEOUT_MS),
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    // Nao repetir o erro do GitHub Models, onde um corpo "OK\r\n" virou
    // 'Unexpected token O ... is not valid JSON' e escondeu que o servico
    // tinha sido aposentado. Aqui o corpo cru entra na mensagem (truncado),
    // pra que a causa apareca no log em vez do erro do JSON.parse.
    const erro: any = new Error(`Cloudflare Workers AI HTTP ${res.status}: resposta nao-JSON: ${raw.slice(0, 200)}`);
    erro.status = res.status;
    throw erro;
  }

  if (!res.ok || data?.success === false || data?.error) {
    // A API da Cloudflare responde erro em dois formatos: o envelope proprio
    // ({success:false, errors:[{code,message}]}) e o formato OpenAI
    // ({error:{message}}). O endpoint /ai/v1/ pode devolver qualquer um dos
    // dois dependendo de onde a requisicao falha (borda da conta vs. modelo).
    const doEnvelope = Array.isArray(data?.errors) && data.errors.length
      ? data.errors.map((e: any) => `${e?.code ?? "?"}: ${e?.message ?? ""}`).join("; ")
      : "";
    const doOpenAI = typeof data?.error === "string" ? data.error : data?.error?.message;
    const erro: any = new Error(`Cloudflare Workers AI HTTP ${res.status}: ${doEnvelope || doOpenAI || "erro desconhecido"}`);
    erro.status = res.status;
    throw erro;
  }

  if (!Array.isArray(data?.choices) || !data.choices.length || !data.choices[0]?.message) {
    // Resposta HTTP valida nao equivale a resposta utilizavel — risco ja
    // registrado em docs/ai-architecture-audit.md (item 2: "Resposta HTTP
    // valida nao equivale a campanha valida"). Falhar aqui deixa a cadeia
    // seguir pro proximo provedor em vez de estourar dentro do loop de
    // ferramentas com um erro sem contexto.
    throw new Error("Cloudflare Workers AI: resposta sem choices[0].message");
  }

  return data;
}
