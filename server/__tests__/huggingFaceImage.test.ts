import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  gerarImagemHuggingFace, motivoPorStatus, _resetarPausaHuggingFace, HF_IMAGE_PROVIDER_PADRAO,
} from "../ai-providers/huggingFaceImage";
import { redactProviderSecrets } from "../providerSafety";

// Sequencia real do cliente @huggingface/inference 4.13.32 com fal-ai, lida no
// codigo do pacote em 19/10:
//   1. GET  huggingface.co/api/models/<modelo>?expand[]=inferenceProviderMapping
//   2. POST router.huggingface.co/fal-ai/<providerId>?_subdomain=queue
//   3. (status != COMPLETED) GET .../status   — usa o fetch GLOBAL
//   4. GET resultado {images:[{url}]}        — usa o fetch GLOBAL
//   5. download da imagem                     — feito por nos (outputType "url")
// Por isso o mock substitui o fetch global E e passado como opts.fetch.

const TOKEN = "hf_tokenDeTesteNaoReal123456";
const IMG = "https://v3.fal.media/files/teste.png";
const fetchOriginal = globalThis.fetch;

type Cenario = { postStatus?: number; postBody?: unknown; imagemBytes?: number; imagemUrl?: string };

function montarFetch(c: Cenario = {}) {
  const chamadas: Array<{ metodo: string; url: string; body?: any; auth?: string }> = [];
  const f: any = async (url: any, init: any = {}) => {
    const u = String(url);
    const headers = init.headers || {};
    chamadas.push({
      metodo: init.method || "GET", url: u,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.Authorization || headers.authorization,
    });
    if (u.includes("/api/models/")) {
      return Response.json({ inferenceProviderMapping: {
        "fal-ai": { providerId: "fal-ai/flux/schnell", status: "live", task: "text-to-image" },
      } });
    }
    if (u.includes("router.huggingface.co") && (init.method === "POST")) {
      if (c.postStatus && c.postStatus !== 200) {
        return Response.json(c.postBody ?? { error: "falha simulada" }, { status: c.postStatus });
      }
      return Response.json({
        request_id: "req1", status: "COMPLETED",
        response_url: "https://queue.fal.run/fal-ai/flux/requests/req1",
      });
    }
    if (u.includes("router.huggingface.co")) {
      return Response.json({ images: [{ url: c.imagemUrl ?? IMG, content_type: "image/png" }] });
    }
    if (u === (c.imagemUrl ?? IMG)) {
      return new Response(Buffer.alloc(c.imagemBytes ?? 20_000, 7), { headers: { "content-type": "image/png" } });
    }
    return new Response("nao esperado", { status: 599 });
  };
  globalThis.fetch = f;
  return { f, chamadas };
}

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  _resetarPausaHuggingFace();
});

test("gera imagem pelo fal-ai: payload com prompt e dimensoes do formato, token no POST", async () => {
  const { f, chamadas } = montarFetch();
  const r = await gerarImagemHuggingFace("mulher a janela, luz da manha", "stories", { apiKey: TOKEN, fetch: f });
  assert.equal(r.motivo, undefined);
  assert.equal(r.buffer?.length, 20_000);

  const post = chamadas.find((c) => c.metodo === "POST");
  assert.ok(post, "precisa chamar o provedor");
  assert.match(post.url, /^https:\/\/router\.huggingface\.co\/fal-ai\/fal-ai\/flux\/schnell/);
  assert.equal(post.body.prompt, "mulher a janela, luz da manha");
  assert.equal(post.body.width, 768);   // stories ~9:16
  assert.equal(post.body.height, 1344);
  assert.equal(post.auth, `Bearer ${TOKEN}`);
  assert.ok(chamadas.some((c) => c.url === IMG), "o download da imagem e nosso");
});

test("provedor padrao e fal-ai, nunca auto (auto ignora status 'error' do mapeamento)", () => {
  assert.equal(HF_IMAGE_PROVIDER_PADRAO, "fal-ai");
});

test("sem chave: nao faz nenhuma chamada de rede", async () => {
  const { f, chamadas } = montarFetch();
  const r = await gerarImagemHuggingFace("x", "feed", { apiKey: "", fetch: f });
  assert.equal(r.motivo, "sem_chave");
  assert.equal(chamadas.length, 0);
});

test("402 vira sem_credito e pausa 15 min sem chamar a rede; depois tenta de novo", async () => {
  let agora = 1_000_000;
  const relogio = () => agora;
  const { f, chamadas } = montarFetch({ postStatus: 402, postBody: { error: "You have exceeded your monthly included credits" } });

  const r1 = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f, agora: relogio });
  assert.equal(r1.motivo, "sem_credito");

  const antes = chamadas.length;
  agora += 14 * 60_000;
  const r2 = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f, agora: relogio });
  assert.equal(r2.motivo, "pausado_sem_credito");
  assert.equal(chamadas.length, antes, "pausado nao chama a rede");

  agora += 2 * 60_000; // passou dos 15 min: o caso do Michel colocando credito no mesmo dia
  const r3 = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f, agora: relogio });
  assert.equal(r3.motivo, "sem_credito");
  assert.ok(chamadas.length > antes, "voltou a tentar");
});

test("401/403 viram token_sem_permissao e nao pausam", async () => {
  const { f } = montarFetch({ postStatus: 401 });
  const r = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f });
  assert.equal(r.motivo, "token_sem_permissao");
  const r2 = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f });
  assert.equal(r2.motivo, "token_sem_permissao", "nao entrou em pausa de credito");
});

test("imagem pequena demais e descartada como imagem_vazia", async () => {
  const { f } = montarFetch({ imagemBytes: 500 });
  const r = await gerarImagemHuggingFace("x", "square", { apiKey: TOKEN, fetch: f });
  assert.equal(r.buffer, null);
  assert.equal(r.motivo, "imagem_vazia");
});

test("o detalhe do erro nunca carrega o token", async () => {
  const { f } = montarFetch({ postStatus: 500, postBody: { error: `falhou com ${TOKEN}` } });
  const r = await gerarImagemHuggingFace("x", "feed", { apiKey: TOKEN, fetch: f });
  assert.equal(r.motivo, "provedor_fora");
  assert.doesNotMatch(redactProviderSecrets(r.detalhe || ""), /hf_tokenDeTeste/);
});

test("redactProviderSecrets cobre token hf_", () => {
  assert.equal(redactProviderSecrets(`Bearer ${TOKEN}`), "Bearer [REDACTED]");
});

test("motivoPorStatus classifica as familias", () => {
  assert.equal(motivoPorStatus(402), "sem_credito");
  assert.equal(motivoPorStatus(403), "token_sem_permissao");
  assert.equal(motivoPorStatus(404), "modelo_ou_provedor_indisponivel");
  assert.equal(motivoPorStatus(429), "limite_de_taxa");
  assert.equal(motivoPorStatus(503), "provedor_fora");
  assert.equal(motivoPorStatus(undefined), "excecao");
});
