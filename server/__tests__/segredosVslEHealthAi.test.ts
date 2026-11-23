import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { segredoVslValido, SEGREDOS_VSL_PUBLICOS } from "../vslSecret";

// Auditoria 23/11, rodada 3: segredo padrao do servico de video, listagem de
// jobs de todos os usuarios e chave publica de /api/health/ai.

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const VSL_TS = ler("../_core/vslRouter.ts");
const VSL_PY = ler("../../vsl/vsl_service.py");
const INDEX = ler("../_core/index.ts");
const AGENTE = ler("../../client/src/pages/AutonomousAgent.tsx");

function trecho(fonte: string, inicio: string, tamanho: number): string {
  const i = fonte.indexOf(inicio);
  assert.ok(i >= 0, `nao achei: ${inicio}`);
  return fonte.slice(i, i + tamanho);
}
function antes(texto: string, primeiro: RegExp, depois: RegExp) {
  const a = texto.search(primeiro), b = texto.search(depois);
  assert.ok(a >= 0, `ausente: ${primeiro}`);
  assert.ok(b >= 0, `ausente: ${depois}`);
  assert.ok(a < b, `${primeiro} tem de vir antes de ${depois}`);
}

test("segredo do VSL: ausente, curto e valores publicos do repositorio sao recusados", () => {
  for (const ruim of [undefined, null, "", "   ", "curto", 12345, ...SEGREDOS_VSL_PUBLICOS, ` ${SEGREDOS_VSL_PUBLICOS[0]} `]) {
    assert.equal(segredoVslValido(ruim as any), null, String(ruim));
  }
  assert.equal(segredoVslValido("k3j9-Xv2q-Lm8r-Pw5z"), "k3j9-Xv2q-Lm8r-Pw5z");
  assert.equal(segredoVslValido("  k3j9-Xv2q-Lm8r-Pw5z  "), "k3j9-Xv2q-Lm8r-Pw5z");
});

test("vslRouter nao tem mais segredo padrao e valida o segredo antes de cada chamada", () => {
  assert.doesNotMatch(VSL_TS, /\|\|\s*"mecpro-vsl-secret"/);
  assert.doesNotMatch(VSL_TS, /VSL_HEADERS/);
  // os argumentos do fetch sao avaliados antes da chamada: sem segredo nao ha rede (teste abaixo)
  assert.match(trecho(VSL_TS, "async function callVslService", 700), /headers: vslHeaders\(\)/);
  assert.match(trecho(VSL_TS, "function vslHeaders", 400), /segredoVslValido\(process\.env\.VSL_SECRET_KEY\)/);
});

test("chamar o servico de video sem segredo proprio falha fechado, antes de qualquer rede", async () => {
  const antigo = process.env.VSL_SECRET_KEY;
  delete process.env.VSL_SECRET_KEY;
  let fetchChamado = 0;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => { fetchChamado++; return new Response("{}"); }) as any;
  try {
    const { vslRouter } = await import("../_core/vslRouter");
    const caller = (vslRouter as any).createCaller({ user: { id: 12, role: "user" }, req: {}, res: {} });
    await assert.rejects(caller.jobStatus({ jobId: "mecpro_12_1795400000000" }), (e: any) => e.code === "PRECONDITION_FAILED");
    process.env.VSL_SECRET_KEY = "mecpro-vsl-secret";
    await assert.rejects(caller.jobStatus({ jobId: "mecpro_12_1795400000000" }), (e: any) => e.code === "PRECONDITION_FAILED");
    assert.equal(fetchChamado, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (antigo === undefined) delete process.env.VSL_SECRET_KEY; else process.env.VSL_SECRET_KEY = antigo;
  }
});

test("servico de video (Python): sem padrao, comparacao em tempo constante, sem listagem global", () => {
  assert.doesNotMatch(VSL_PY, /getenv\("VSL_SECRET_KEY",\s*"/);
  assert.match(VSL_PY, /raise RuntimeError\(\s*"VSL_SECRET_KEY ausente ou inseguro/);
  assert.match(VSL_PY, /hmac\.compare_digest/);
  const jobs = trecho(VSL_PY, '@app.get("/jobs")', 500);
  assert.match(jobs, /def list_jobs\(user_id: int,/);
  assert.match(jobs, /j\.get\("user_id"\) == user_id/);
  assert.doesNotMatch(jobs, /list\(JOBS\.values\(\)\)/);
});

test("servico de video (Python): nomes de job e arquivo sem sair da pasta; job de outro usuario nao e sobrescrito", () => {
  assert.match(trecho(VSL_PY, "def _nome_seguro", 300), /\.\.\" not in valor|"\.\." not in valor/);
  antes(trecho(VSL_PY, '@app.get("/download/', 500), /_nome_seguro\(job_id\)/, /OUTPUT_DIR \/ job_id/);
  antes(trecho(VSL_PY, '@app.delete("/job/', 500), /_nome_seguro\(job_id\)/, /shutil\.rmtree/);
  const gerar = trecho(VSL_PY, "job_id = req.job_id or", 700);
  assert.match(gerar, /_nome_seguro\(job_id\)/);
  assert.match(gerar, /existente\.get\("user_id"\) != req\.user_id/);
});

test("nenhum segredo publico do VSL resta em codigo ou documentacao rastreada", () => {
  const arquivos = ["../../vsl/vsl_modal.py", "../../client/src/components/VSLGeneratorPanel.tsx", "../../vsl/MECProAI_VSL_Colab.ipynb", "../../MECProAI_VSL_Colab.ipynb"];
  for (const f of arquivos) {
    const t = ler(f);
    assert.doesNotMatch(t, /mecpro-vsl-2026|mecpro-vsl-secret/, f);
  }
});

test("/api/health/ai: teste completo so com sessao de admin ou DEBUG_TOKEN explicito", () => {
  const rota = trecho(INDEX, "app.get('/api/health/ai'", 1800);
  assert.doesNotMatch(rota, /process\.env\.DEBUG_TOKEN \|\| 'mecpro-diag-2026'/);
  assert.match(rota, /tokenExplicito !== 'mecpro-diag-2026'/);
  antes(rota, /sessaoDeAdmin\(req\)/, /const TIMEOUT_MS/);
  // sem permissao so volta o resumo simples, sem rodar provedor
  antes(rota, /if \(!completo\)/, /const TIMEOUT_MS/);
});

test("tela do agente nao carrega mais a chave de diagnostico no bundle", () => {
  assert.doesNotMatch(AGENTE, /mecpro-diag-2026/);
  assert.match(AGENTE, /fetch\('\/api\/health\/ai', \{ credentials: 'include' \}\)/);
});
