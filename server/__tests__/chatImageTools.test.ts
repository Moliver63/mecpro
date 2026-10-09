import test from "node:test";
import assert from "node:assert/strict";
import { generateChatImage } from "../chatImageTools";
import { imageBrief, imageFingerprint, canonicalStockQuery, visualDecision,
  resumoDeTarefasDeImagem, MAX_TENTATIVAS_VALIDACAO, rotuloProvedorDeImagem } from "../imageWorkflowPolicy";
import { processCampaignImageJob } from "../campaignImageJobs";

function fixture(creatives: any[] = [{ headline: "Planejamento financeiro" }]) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const jobs = new Map();
  const campaign = { id: 797, projectId: 3, objective: "leads", creatives: JSON.stringify(creatives),
    aiResponse: JSON.stringify({ campaignFacts: { intent: { segment: "financeiro" }, verifiedFacts: ["Curso de planejamento financeiro"] } }) };
  const pool = { query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT")) jobs.set(params[4], { id: jobs.size + 1, status: "queued" });
    return { rows: [...jobs.values()], rowCount: 1 };
  } };
  const db = { getCampaignById: async () => campaign, getProjectById: async () => ({ userId: 1 }), getPool: async () => pool };
  return { campaign, calls, jobs, db };
}
test("queues missing cards, preserves real media and explains broken attachments", async () => {
  const f = fixture([{}, {}, { imageUrl: "original" }, { usesRealPhoto: true }]);
  const r: any = await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(r.ok, true); assert.equal(r.published, false);
  assert.equal(f.jobs.size, 2); assert.equal(r.blocked.length, 1);
  await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(f.jobs.size, 2);
});
// Achado real (campanha 797 — "Shadia Hasan — Leads", lida no banco em
// 05/10): as dez tarefas foram enfileiradas com format "feed", mas quatro
// criativos sao `vertical_9_16` (Stories) e tres sao `quadrado_1_1`. O card
// de Stories recebia imagem 4:5 gravada em `storyImageUrl` — a explicacao
// mecanica do "Story e Square identicos": nao era cache, era a MESMA
// proporcao pedida pros tres.
test("formato da tarefa sai da orientation de cada criativo, nao do default", async () => {
  const f = fixture([
    { headline: "A", orientation: "feed_4_5" },
    { headline: "B", orientation: "vertical_9_16" },
    { headline: "C", orientation: "quadrado_1_1" },
    { headline: "D", orientation: "horizontal_16_9" },
    { headline: "E" },
  ]);
  const r: any = await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(r.ok, true);
  const formatos = f.calls.filter(c => c.sql.startsWith("INSERT")).map(c => ({ index: c.params[2], format: c.params[3] }));
  assert.deepEqual(formatos, [
    { index: 0, format: "feed" },
    { index: 1, format: "stories" },
    { index: 2, format: "square" },
    // Lacuna conhecida e deliberada: a fila so tem tres formatos, entao
    // 16:9 cai em feed. Virar um quarto formato e mudanca de schema.
    { index: 3, format: "feed" },
    // Sem orientation: feed, como antes.
    { index: 4, format: "feed" },
  ]);
});

test("formato pedido explicitamente ganha da orientation", async () => {
  const f = fixture([{ headline: "A", orientation: "vertical_9_16" }]);
  await generateChatImage(1, { campaignId: 797, format: "square" }, f.db);
  const insert = f.calls.find(c => c.sql.startsWith("INSERT"));
  assert.equal(insert.params[3], "square", "um criativo guarda as tres proporcoes; pedir uma delas e intencao legitima");
});

// A metade que protege: a checagem de "ja tem imagem" tem que olhar o campo
// do formato DERIVADO. Olhando o feed, um card de Stories que ja tinha
// storyImageUrl seria reenfileirado e sobrescrito.
test("nao reenfileira card que ja tem imagem no formato derivado", async () => {
  const f = fixture([
    { headline: "A", orientation: "vertical_9_16", storyImageUrl: "https://res.cloudinary.com/x/ja-existe.jpg" },
    { headline: "B", orientation: "quadrado_1_1", squareImageUrl: "https://res.cloudinary.com/x/ja-existe.jpg" },
  ]);
  const r: any = await generateChatImage(1, { campaignId: 797 }, f.db);
  assert.equal(r.ok, true);
  assert.equal(f.jobs.size, 0, "as duas imagens ja existem no formato certo; nada a gerar");
});

// Incidente real (Michel, 05/10): o chat respondeu "status: queued (...) nao
// ha acao manual disponivel para acelerar. Aguarde 10-15 minutos para a
// validacao automatica." As tres afirmacoes estavam erradas — as tarefas
// estavam em pending_validation, revalidate existe no schema da propria
// ferramenta, e as tentativas tinham acabado: esperar nunca produziria nada.
//
// A parte que nao era desobediencia: nada na resposta dizia que a fila havia
// desistido. O teto de tentativas e regra do SELECT do worker, invisivel pra
// quem le as linhas.
test("estado diz quando a fila desistiu, em vez de deixar o assistente supor", () => {
  const dezParadas = Array.from({ length: 10 }, (_, i) =>
    ({ creative_index: i, status: "pending_validation", attempts: MAX_TENTATIVAS_VALIDACAO, reason: "visual_validator_unavailable" }));
  const e = resumoDeTarefasDeImagem(dezParadas);
  assert.equal(e.total, 10);
  assert.equal(e.filaVaiAgir, false, "attempts no teto: o SELECT do worker nao pega mais");
  assert.equal(e.paradasSemTentativa, 10);
  assert.equal(e.aprovadas, 0);
  assert.match(e.destravar, /revalidate/, "tem que apontar a acao que destrava");
  assert.match(e.destravar, /Esperar nao resolve/);
  assert.doesNotMatch(e.resumo, /queued/, "nenhuma esta em queued; o resumo nao pode sugerir isso");

  // Uma tentativa abaixo do teto: a fila AINDA vai pegar, e aqui esperar
  // e a resposta certa. O resumo nao pode mandar revalidar por reflexo.
  const aindaNaFila = resumoDeTarefasDeImagem([
    { creative_index: 0, status: "pending_validation", attempts: MAX_TENTATIVAS_VALIDACAO - 1 },
  ]);
  assert.equal(aindaNaFila.filaVaiAgir, true);
  assert.equal(aindaNaFila.destravar, null);

  // queued sempre e pego, independente de attempts.
  assert.equal(resumoDeTarefasDeImagem([{ status: "queued", attempts: 99 }]).filaVaiAgir, true);

  // Estados terminais nao sao "aguardando": approved, rejected, failed,
  // needs_review e cancelled nunca voltam pra fila sozinhos.
  for (const status of ["approved", "rejected", "failed", "needs_review", "cancelled"]) {
    assert.equal(resumoDeTarefasDeImagem([{ status, attempts: 0 }]).filaVaiAgir, false, `${status} nao aguarda fila`);
  }
  assert.equal(resumoDeTarefasDeImagem([]).filaVaiAgir, false);
  assert.match(resumoDeTarefasDeImagem([]).resumo, /Nenhuma tarefa/);
});

test("ownership and inputs fail before reservation", async () => {
  const f = fixture();
  for (const args of [{ campaignId: 0 }, { campaignId: 797, creativeIndex: 5 }, { campaignId: 797, format: "bad" }]) {
    assert.equal((await generateChatImage(1, args, f.db)).ok, false);
  }
  assert.equal((await generateChatImage(2, { campaignId: 797 }, f.db)).ok, false);
  assert.equal(f.jobs.size, 0);
});
test("missing facts actionable; status and revalidation never generate", async () => {
  const f = fixture(); f.campaign.aiResponse = "{}";
  assert.match((await generateChatImage(1, { campaignId: 797 }, f.db) as any).erro, /Faltam fatos/);
  await generateChatImage(1, { campaignId: 797, action: "status" }, f.db);
  await generateChatImage(1, { campaignId: 797, action: "revalidate" }, f.db);
  assert.equal(f.jobs.size, 0);
  assert.ok(f.calls.some(c => c.sql.includes("candidate_url IS NOT NULL")));
});
test("stable snapshot survives jsonb ordering and changes with facts", () => {
  assert.equal(imageFingerprint({ a: 1, b: 2 }), imageFingerprint({ b: 2, a: 1 }));
  assert.notEqual(imageFingerprint({ area: 50 }), imageFingerprint({ area: 190 }));
});
test("financial segment cannot inherit ocean from marketing or city", () => {
  assert.match(canonicalStockQuery("financeiro", "marketing Balneario Camboriu"), /financial/);
  assert.doesNotMatch(canonicalStockQuery("financeiro", "praia apartamento"), /apartment|ocean/);
  assert.equal(canonicalStockQuery("imoveis_locacao", "sala comercial Rua 902"), "commercial space interior");
});
test("unavailable validation has no fabricated score", () => {
  assert.equal(visualDecision(null).score, null);
  assert.equal(visualDecision({ quality: 0.99 }).status, "pending_validation");
  const v = { matchesBrief: true, safe: true, hasText: false, quality: 0.9, evidence: "Documents and calculator", issues: [] };
  assert.equal(visualDecision(v).status, "approved");
  assert.equal(visualDecision({ ...v, matchesBrief: false }).status, "rejected");
  assert.equal(visualDecision({ ...v, hasText: true }).status, "rejected");
});
function workerFixture(candidate: string | null, status: "approved" | "pending_validation" | "rejected") {
  const f = fixture(); const calls: Array<{ sql: string; params: any[] }> = [];
  const job: any = { id: 1, user_id: 1, campaign_id: 797, creative_index: 0, format: "feed", candidate_url: candidate,
    brief: imageBrief(f.campaign, JSON.parse(f.campaign.creatives)[0]), provider: "pixabay" };
  let generated = 0;
  const connection = { release() {}, query: async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    if (sql.startsWith("SELECT *")) return { rows: [job] };
    return { rows: [], rowCount: 1 };
  } };
  return { f, job, calls, generated: () => generated,
    deps: { db: { ...f.db, getPool: async () => ({ connect: async () => connection }) },
      generate: async () => { generated++; return { url: "https://res.cloudinary.com/test/image.jpg", provider: "cloudflare" }; },
      validate: async () => ({ status, reason: "test", score: status === "pending_validation" ? null : 0.9 }) } };
}
test("pending candidate persisted; retry reuses it without generation", async () => {
  const f = workerFixture(null, "pending_validation"); await processCampaignImageJob(f.deps);
  assert.equal(f.generated(), 1);
  assert.ok(f.calls.some(c => c.sql.includes("SET candidate_url=")));
  assert.ok(f.calls.some(c => c.params[1] === "pending_validation" && c.params[3] === null));
  assert.ok(!f.calls.some(c => c.sql.startsWith("UPDATE campaigns")));
  const retry = workerFixture("https://res.cloudinary.com/test/image.jpg", "pending_validation"); await processCampaignImageJob(retry.deps);
  assert.equal(retry.generated(), 0);
});
test("only approved images update creatives using compare-and-swap", async () => {
  const f = workerFixture("https://res.cloudinary.com/test/image.jpg", "approved"); await processCampaignImageJob(f.deps);
  const update = f.calls.find(c => c.sql.startsWith("UPDATE campaigns"));
  assert.ok(update); assert.match(update.sql, /IS NOT DISTINCT FROM/);
  assert.equal(JSON.parse(update.params[1])[0].feedImageUrl, f.job.candidate_url);
  const rejected = workerFixture(f.job.candidate_url, "rejected"); await processCampaignImageJob(rejected.deps);
  assert.ok(!rejected.calls.some(c => c.sql.startsWith("UPDATE campaigns")));
});
test("changed brief cancels without provider call", async () => {
  const f = workerFixture(null, "approved"); f.f.campaign.objective = "sales";
  await processCampaignImageJob(f.deps);
  assert.equal(f.generated(), 0);
  assert.ok(f.calls.some(c => c.params[2] === "brief_changed"));
});

// Achado real (boots de 06 a 09/10): o boot anunciava
// "IMAGE_PROVIDER (efetivo): huggingface ✅", e enganava duas vezes — HF nao
// gera imagem em caminho nenhum (HF_MODELS vazio no codigo) e a fila de
// imagens de campanha nem consulta IMAGE_PROVIDER.
test("boot nao anuncia provedor de imagem que nao gera imagem", () => {
  // O ambiente real do Michel: IMAGE_PROVIDER=huggingface com chave HF.
  const real = rotuloProvedorDeImagem({
    IMAGE_PROVIDER: "huggingface", HUGGINGFACE_API_KEY: "hf_x",
    CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_API_TOKEN: "tok", PIXABAY_API_KEY: "pix",
  });
  assert.doesNotMatch(real.caminhoLegado, /✅/, "nao pode dar check num provedor desabilitado");
  assert.match(real.caminhoLegado, /desabilitado no codigo/);
  // E diz o que DE FATO gera imagem de campanha.
  assert.match(real.filaDeCampanha, /Cloudflare FLUX ✅/);
  assert.match(real.filaDeCampanha, /Pixabay ✅/);

  // Auto-deteccao por chave HF cai na mesma ressalva.
  assert.match(rotuloProvedorDeImagem({ HUGGINGFACE_API_KEY: "hf_x" }).caminhoLegado, /desabilitado no codigo/);
});

test("boot avisa quando a fila de imagem nao tem gerador", () => {
  const semNada = rotuloProvedorDeImagem({});
  assert.match(semNada.filaDeCampanha, /❌ sem gerador/);
  assert.match(semNada.filaDeCampanha, /PIXABAY_API_KEY tambem ausente/);
  assert.equal(semNada.caminhoLegado, "mock → SVG inline");

  // Token pela metade nao conta como configurado.
  assert.match(rotuloProvedorDeImagem({ CLOUDFLARE_ACCOUNT_ID: "acc" }).filaDeCampanha, /❌ sem gerador/);
  // So o fallback: precisa ficar explicito que nao ha geracao por IA.
  const soPixabay = rotuloProvedorDeImagem({ PIXABAY_API_KEY: "pix" });
  assert.match(soPixabay.filaDeCampanha, /so o fallback Pixabay responde/);
});

test("provedores que nao sao huggingface passam sem a ressalva", () => {
  assert.equal(rotuloProvedorDeImagem({ IMAGE_PROVIDER: "heygen" }).caminhoLegado, "heygen");
  assert.equal(rotuloProvedorDeImagem({ IMAGE_PROVIDER: "genspark" }).caminhoLegado, "genspark");
  assert.equal(rotuloProvedorDeImagem({ HEYGEN_API_KEY: "k" }).caminhoLegado, "heygen (auto-detectado)");
  // Maiuscula e espaco no env nao mudam a leitura.
  assert.equal(rotuloProvedorDeImagem({ IMAGE_PROVIDER: "  HeyGen " }).caminhoLegado, "heygen");
});
