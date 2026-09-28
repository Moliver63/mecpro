import test from "node:test";
import assert from "node:assert/strict";
import { submeterLote, consultarLote } from "../ai-providers/cloudflareBatch";

const CONTA = "conta-de-teste-1234567890";
const TOKEN = "token-de-teste-abcdefghijklmnop";
const MODELO = "@cf/qwen/qwen3-30b-a3b-fp8";

async function comCredenciais<T>(fn: () => Promise<T> | T): Promise<T> {
  const c = process.env.CLOUDFLARE_ACCOUNT_ID;
  const t = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = CONTA;
  process.env.CLOUDFLARE_API_TOKEN = TOKEN;
  try {
    return await fn();
  } finally {
    if (c === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = c;
    if (t === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = t;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const itens = [
  { messages: [{ role: "user", content: "campanha do imovel A" }], external_reference: "imovel-1901" },
  { messages: [{ role: "user", content: "campanha do imovel B" }], external_reference: "imovel-1902" },
];

// O parametro queueRequest vai na QUERY STRING. No corpo ele e ignorado e a
// requisicao vira sincrona sem avisar — falha silenciosa, dificil de notar em
// producao. Este teste trava isso.
test("queueRequest=true vai na query string, na mesma URL para submeter e consultar", async () => {
  await comCredenciais(async () => {
    const urls: string[] = [];
    const captura = (async (url: any) => {
      urls.push(String(url));
      return json({ success: true, result: { status: "queued", request_id: "abc-123" } });
    }) as any;

    await submeterLote(MODELO, itens, captura);
    const esperada = `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/run/${MODELO}?queueRequest=true`;
    assert.equal(urls[0], esperada);

    const capturaConsulta = (async (url: any) => {
      urls.push(String(url));
      return json({ success: true, result: { responses: [] } });
    }) as any;
    await consultarLote(MODELO, "abc-123", capturaConsulta);
    assert.equal(urls[1], esperada, "consultar usa exatamente a mesma URL");
  });
});

test("submeter manda os itens sob a chave requests e devolve o request_id", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    const r = await submeterLote(MODELO, itens, (async (_u: any, init: any) => {
      corpo = JSON.parse(init.body);
      return json({ success: true, result: { status: "queued", request_id: "768f15b7", model: MODELO } });
    }) as any);

    assert.deepEqual(corpo, { requests: itens });
    assert.equal("request_id" in corpo, false, "submissao nao pode mandar request_id junto");
    assert.equal(r.requestId, "768f15b7");
    assert.equal(r.status, "queued");
  });
});

test("consultar manda apenas request_id, sem requests", async () => {
  await comCredenciais(async () => {
    let corpo: any = null;
    await consultarLote(MODELO, "768f15b7", (async (_u: any, init: any) => {
      corpo = JSON.parse(init.body);
      return json({ success: true, result: { responses: [] } });
    }) as any);
    assert.deepEqual(corpo, { request_id: "768f15b7" });
  });
});

test("queued e running viram estado pendente, sem erro", async () => {
  await comCredenciais(async () => {
    for (const status of ["queued", "running"]) {
      const r = await consultarLote(MODELO, "x", (async () => json({ success: true, result: { status } })) as any);
      assert.equal(r.estado, "pendente");
      assert.equal((r as any).status, status);
    }
  });
});

test("resultado pronto preserva external_reference de cada item", async () => {
  await comCredenciais(async () => {
    const r = await consultarLote(MODELO, "x", (async () => json({
      success: true,
      result: {
        responses: [
          { id: 0, success: true, external_reference: "imovel-1901", result: { response: "copy A" } },
          { id: 1, success: false, external_reference: "imovel-1902", error: { message: "modelo recusou" } },
        ],
        usage: { total_tokens: 4200 },
      },
    })) as any);

    assert.equal(r.estado, "pronto");
    const pronto = r as Extract<typeof r, { estado: "pronto" }>;
    assert.equal(pronto.respostas[0].externalReference, "imovel-1901");
    assert.equal(pronto.respostas[0].success, true);
    assert.equal(pronto.respostas[1].externalReference, "imovel-1902");
    assert.equal(pronto.respostas[1].success, false);
    assert.match(String(pronto.respostas[1].erro), /modelo recusou/);
    assert.equal(pronto.usage?.total_tokens, 4200);
  });
});

// Sem isso, um item que falhou dentro de um lote bem-sucedido passaria como
// se tivesse dado certo, e uma campanha vazia seria salva.
test("item com success false nao e confundido com sucesso", async () => {
  await comCredenciais(async () => {
    const r = await consultarLote(MODELO, "x", (async () => json({
      success: true,
      result: { responses: [{ id: 0, success: false, error: "capacidade" }] },
    })) as any);
    const pronto = r as Extract<typeof r, { estado: "pronto" }>;
    assert.equal(pronto.respostas[0].success, false);
    assert.ok(pronto.respostas[0].erro);
  });
});

// Mesma regra do provider sincrono: HTTP 200 nao equivale a resultado
// utilizavel (docs/ai-architecture-audit.md, item 2).
test("200 sem responses e sem status pendente vira erro", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      consultarLote(MODELO, "x", (async () => json({ success: true, result: {} })) as any),
      /sem result\.responses/,
    );
  });
});

test("lote vazio falha antes de gastar a chamada", async () => {
  await comCredenciais(async () => {
    let chamou = false;
    await assert.rejects(
      submeterLote(MODELO, [], (async () => { chamou = true; return json({}); }) as any),
      /Lote vazio/,
    );
    assert.equal(chamou, false, "nao pode chegar a fazer a requisicao");
  });
});

// Limite documentado: payload total abaixo de 10 MB. Checar localmente evita
// uma viagem que a Cloudflare recusaria de qualquer jeito.
test("payload acima de 10 MB e barrado localmente", async () => {
  await comCredenciais(async () => {
    let chamou = false;
    const gigante = [{ messages: [{ role: "user", content: "x".repeat(11 * 1024 * 1024) }] }];
    await assert.rejects(
      submeterLote(MODELO, gigante, (async () => { chamou = true; return json({}); }) as any),
      /excede o limite de 10 MB/,
    );
    assert.equal(chamou, false);
  });
});

test("envelope de erro da Cloudflare aparece na mensagem", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      submeterLote(MODELO, itens, (async () => json({ success: false, errors: [{ code: 5006, message: "Bad input" }] }, 400)) as any),
      (erro: any) => {
        assert.match(erro.message, /5006: Bad input/);
        assert.equal(erro.status, 400);
        return true;
      },
    );
  });
});

// Regressao do GitHub Models: corpo "OK\r\n" virou "Unexpected token 'O'" e
// escondeu que o servico tinha sido desligado.
test("corpo nao-JSON entra na mensagem em vez de estourar no parse", async () => {
  await comCredenciais(async () => {
    await assert.rejects(
      submeterLote(MODELO, itens, (async () => new Response("OK\r\n", { status: 200 })) as any),
      (erro: any) => {
        assert.match(erro.message, /resposta nao-JSON/);
        assert.doesNotMatch(erro.message, /Unexpected token/);
        return true;
      },
    );
  });
});

test("sem credencial nao tenta a chamada", async () => {
  const c = process.env.CLOUDFLARE_ACCOUNT_ID;
  const t = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  try {
    let chamou = false;
    await assert.rejects(
      submeterLote(MODELO, itens, (async () => { chamou = true; return json({}); }) as any),
      /nao configurado/,
    );
    assert.equal(chamou, false);
  } finally {
    if (c !== undefined) process.env.CLOUDFLARE_ACCOUNT_ID = c;
    if (t !== undefined) process.env.CLOUDFLARE_API_TOKEN = t;
  }
});
