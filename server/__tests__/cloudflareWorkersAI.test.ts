import test from "node:test";
import assert from "node:assert/strict";
import { chamarCloudflareWorkersAI, cloudflareWorkersAIConfigurado, normalizarMensagensCloudflare, MODELO_CLOUDFLARE } from "../ai-providers/cloudflareWorkersAI";
import { redactProviderSecrets } from "../providerSafety";

const CONTA = "conta-de-teste-1234567890";
const TOKEN = "token-de-teste-abcdefghijklmnop";

function comCredenciais<T>(fn: () => T): T {
  const contaAntes = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tokenAntes = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = CONTA;
  process.env.CLOUDFLARE_API_TOKEN = TOKEN;
  try {
    return fn();
  } finally {
    if (contaAntes === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = contaAntes;
    if (tokenAntes === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = tokenAntes;
  }
}

function respostaOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const escolhaValida = { choices: [{ message: { role: "assistant", content: "ok" } }] };

// Este e o teste que existe por causa do bug do OpenRouter, onde o path final
// montado pelo SDK estava errado e a verificacao anterior so olhou a
// propriedade baseURL. Aqui a URL REAL da requisicao e capturada e comparada
// com o path da documentacao oficial da Cloudflare.
test("monta exatamente o path OpenAI-compatible documentado pela Cloudflare", async () => {
  await comCredenciais(async () => {
    let urlChamada = "";
    await chamarCloudflareWorkersAI({
      messages: [{ role: "user", content: "oi" }],
      fetchImpl: (async (url: any) => {
        urlChamada = String(url);
        return respostaOk(escolhaValida);
      }) as any,
    });
    assert.equal(urlChamada, `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/v1/chat/completions`);
    assert.ok(!urlChamada.includes("/ai/run/"), "nao pode usar o envelope /ai/run/ no caminho OpenAI");
    assert.ok(!urlChamada.includes("gateway.ai.cloudflare.com"), "endpoint do AI Gateway esta deprecated pra chamada de modelo unico");
  });
});

test("envia o modelo Qwen com function calling e sem chamadas paralelas", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    const ferramentas = [{ type: "function", function: { name: "consultar_workspace", parameters: {} } }];
    await chamarCloudflareWorkersAI({
      messages: [{ role: "user", content: "oi" }],
      tools: ferramentas,
      fetchImpl: (async (_url: any, init: any) => {
        corpo = JSON.parse(init.body);
        return respostaOk(escolhaValida);
      }) as any,
    });
    assert.equal(corpo.model, MODELO_CLOUDFLARE);
    assert.equal(corpo.model, "@cf/qwen/qwen3-30b-a3b-fp8");
    assert.equal(corpo.tool_choice, "auto");
    assert.equal(corpo.parallel_tool_calls, false);
    // O loop de ferramentas compartilhado processa msg.tool_calls?.[0], uma por
    // passo: chamadas paralelas deixariam tool_calls sem resposta no historico.
    assert.deepEqual(corpo.tools, ferramentas);
  });
});

test("pede rejectIfBusy pra falhar rapido em vez de entrar na fila de capacidade", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    await chamarCloudflareWorkersAI({
      messages: [{ role: "user", content: "oi" }],
      fetchImpl: (async (_url: any, init: any) => {
        corpo = JSON.parse(init.body);
        return respostaOk(escolhaValida);
      }) as any,
    });
    assert.equal(corpo.options?.rejectIfBusy, true);
  });
});

test("nao manda tools quando a lista esta vazia", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    await chamarCloudflareWorkersAI({
      messages: [{ role: "user", content: "oi" }],
      tools: [],
      fetchImpl: (async (_url: any, init: any) => {
        corpo = JSON.parse(init.body);
        return respostaOk(escolhaValida);
      }) as any,
    });
    assert.equal("tools" in corpo, false);
    assert.equal("tool_choice" in corpo, false);
  });
});

// Regressao direta do GitHub Models: o corpo "OK\r\n" virou
// "Unexpected token 'O' ... is not valid JSON" e escondeu que o servico tinha
// sido aposentado. O corpo cru precisa chegar na mensagem de erro.
test("corpo nao-JSON aparece na mensagem em vez de estourar no JSON.parse", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      chamarCloudflareWorkersAI({
        messages: [{ role: "user", content: "oi" }],
        fetchImpl: (async () => new Response("OK\r\n", { status: 200 })) as any,
      }),
      (erro: any) => {
        assert.match(erro.message, /resposta nao-JSON/);
        assert.match(erro.message, /OK/);
        assert.doesNotMatch(erro.message, /Unexpected token/);
        return true;
      },
    );
  });
});

test("le o envelope de erro proprio da Cloudflare", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      chamarCloudflareWorkersAI({
        messages: [{ role: "user", content: "oi" }],
        fetchImpl: (async () => respostaOk({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403)) as any,
      }),
      (erro: any) => {
        assert.match(erro.message, /10000: Authentication error/);
        assert.equal(erro.status, 403);
        return true;
      },
    );
  });
});

test("le tambem o formato de erro estilo OpenAI", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      chamarCloudflareWorkersAI({
        messages: [{ role: "user", content: "oi" }],
        fetchImpl: (async () => respostaOk({ error: { message: "model not found" } }, 404)) as any,
      }),
      (erro: any) => {
        assert.match(erro.message, /model not found/);
        return true;
      },
    );
  });
});

// docs/ai-architecture-audit.md, item 2: "Resposta HTTP valida nao equivale a
// campanha valida". 200 com choices vazio precisa virar falha, pra cadeia
// seguir pro proximo provedor em vez de quebrar dentro do loop de ferramentas.
test("200 sem choices utilizavel e tratado como falha", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      chamarCloudflareWorkersAI({
        messages: [{ role: "user", content: "oi" }],
        fetchImpl: (async () => respostaOk({ choices: [] })) as any,
      }),
      /sem choices\[0\]\.message/,
    );
  });
});

test("desativa quando falta metade das credenciais", () => {
  const contaAntes = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tokenAntes = process.env.CLOUDFLARE_API_TOKEN;
  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = CONTA;
    delete process.env.CLOUDFLARE_API_TOKEN;
    assert.equal(cloudflareWorkersAIConfigurado(), false);

    process.env.CLOUDFLARE_API_TOKEN = TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    assert.equal(cloudflareWorkersAIConfigurado(), false);

    process.env.CLOUDFLARE_ACCOUNT_ID = "   ";
    assert.equal(cloudflareWorkersAIConfigurado(), false, "espaco em branco nao conta como configurado");

    process.env.CLOUDFLARE_ACCOUNT_ID = CONTA;
    assert.equal(cloudflareWorkersAIConfigurado(), true);
  } finally {
    if (contaAntes === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = contaAntes;
    if (tokenAntes === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = tokenAntes;
  }
});

// docs/provider-credential-safety.md exige que o logger redija credenciais de
// provedor. O token da Cloudflare nao tem prefixo reconhecivel, entao o
// mecanismo e comparar com o valor real da variavel de ambiente.
test("o token da Cloudflare e redigido nos logs", () => {
  comCredenciais(() => {
    const redigido = redactProviderSecrets(`falhou com Bearer ${TOKEN} na conta ${CONTA}`);
    assert.ok(!redigido.includes(TOKEN), "o token nao pode sobrar no texto");
    assert.ok(!redigido.includes(CONTA), "o account id nao pode sobrar no texto");
    assert.match(redigido, /\[REDACTED\]/);
  });
});

// Regressao do log de producao de 28/09: HTTP 400 "5006: AiError: Bad input:
// oneOf at '/' not met ... Type mismatch of '/messages/3/content', 'string'
// not in 'null' ... required properties at '/messages/3' are 'role,content'".
// O loop de ferramentas empurra a mensagem do assistente de volta no historico
// (server/chat.ts:1188) e, numa chamada de ferramenta pura, ela vem com
// content null. Groq e OpenRouter aceitam; a Cloudflare rejeita a requisicao
// inteira.
test("mensagem de tool_call com content null vira string vazia sem perder tool_calls", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    const toolCalls = [{ id: "call_1", type: "function", function: { name: "consultar_workspace", arguments: "{}" } }];
    await chamarCloudflareWorkersAI({
      messages: [
        { role: "system", content: "politica" },
        { role: "user", content: "cria a campanha" },
        { role: "assistant", content: null, tool_calls: toolCalls },
        { role: "tool", tool_call_id: "call_1", content: "{\"ok\":true}" },
      ],
      fetchImpl: (async (_url: any, init: any) => {
        corpo = JSON.parse(init.body);
        return respostaOk(escolhaValida);
      }) as any,
    });

    assert.equal(corpo.messages[2].content, "", "content null precisa virar string vazia");
    assert.deepEqual(corpo.messages[2].tool_calls, toolCalls, "tool_calls nao pode ser descartado");
    assert.equal(corpo.messages[3].tool_call_id, "call_1", "tool_call_id liga o resultado a chamada");
  });
});

// A invariante que o schema da Cloudflare exige, valendo pra qualquer
// historico: content presente e string em TODA mensagem enviada.
test("toda mensagem enviada tem content string, nunca null nem ausente", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    await chamarCloudflareWorkersAI({
      messages: [
        { role: "system", content: "ok" },
        { role: "assistant", content: null, tool_calls: [{ id: "a", type: "function", function: { name: "f", arguments: "{}" } }] },
        { role: "assistant" },
        { role: "user", content: [{ type: "text", text: "primeira" }, { type: "text", text: "segunda" }] },
      ],
      fetchImpl: (async (_url: any, init: any) => {
        corpo = JSON.parse(init.body);
        return respostaOk(escolhaValida);
      }) as any,
    });

    for (const [i, m] of corpo.messages.entries()) {
      assert.equal(typeof m.content, "string", `mensagem ${i} precisa ter content string`);
      assert.ok("content" in m, `mensagem ${i} precisa ter a propriedade content`);
    }
    assert.equal(corpo.messages[2].content, "", "content ausente vira string vazia");
    assert.equal(corpo.messages[3].content, "primeira\nsegunda", "content em partes e achatado em texto");
  });
});

test("normalizarMensagensCloudflare nao inventa campos opcionais", () => {
  const [simples] = normalizarMensagensCloudflare([{ role: "user", content: "oi" }]);
  assert.deepEqual(simples, { role: "user", content: "oi" });
  assert.equal("tool_calls" in simples, false);
  assert.equal("tool_call_id" in simples, false);
});
