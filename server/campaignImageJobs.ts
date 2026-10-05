import { imageBrief, imageFingerprint, hasCreativeImage, imageField, formatoPorOrientacao,
  resumoDeTarefasDeImagem, MAX_TENTATIVAS_VALIDACAO } from "./imageWorkflowPolicy";
import { log } from "./logger";

export const IMAGE_JOB_MIGRATION = `CREATE TABLE IF NOT EXISTS campaign_image_jobs (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creative_index INTEGER NOT NULL, format TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
  brief JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued', candidate_url TEXT, provider TEXT,
  score NUMERIC, reason TEXT, validation JSONB, attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

export async function campaignImageJobs(userId: number, args: any, injected?: any) {
  if (!Number.isSafeInteger(args?.campaignId) || args.campaignId < 1 ||
      (args.creativeIndex !== undefined && (!Number.isSafeInteger(args.creativeIndex) || args.creativeIndex < 0)) ||
      !["feed", "stories", "square"].includes(args.format || "feed") || !["start", "status", "revalidate"].includes(args.action || "start")) {
    return { ok: false, erro: "Campanha, formato ou acao invalida." };
  }
  const db = injected ?? await import("./db");
  const campaign = await db.getCampaignById(args.campaignId);
  const project = campaign && await db.getProjectById(campaign.projectId);
  if (!campaign || !project || project.userId !== userId) return { ok: false, erro: "Campanha indisponivel para esta conta." };
  const pool = await db.getPool(); if (!pool) return { ok: false, erro: "Fila de imagens indisponivel." };
  const action = args.action || "start";
  if (action === "revalidate") {
    await pool.query("UPDATE campaign_image_jobs SET status='pending_validation', attempts=0, next_attempt=NOW() WHERE user_id=$1 AND campaign_id=$2 AND status='pending_validation' AND candidate_url IS NOT NULL", [userId, campaign.id]);
  }
  const blocked: Array<{ index: number; reason: string }> = [];
  if (action === "start") {
    const creatives = JSON.parse(campaign.creatives || "[]");
    if (!Array.isArray(creatives) || !creatives.length || creatives.length > 10) return { ok: false, erro: "Selecione uma campanha com 1 a 10 criativos." };
    if (args.creativeIndex !== undefined && !creatives[args.creativeIndex]) return { ok: false, erro: "Criativo nao encontrado." };
    // Validate every selected brief before reserving work.
    const selected = creatives.map((creative, index) => ({ creative, index })).filter(c => args.creativeIndex === undefined || c.index === args.creativeIndex);
    const ready = [];
    for (const { creative, index } of selected) {
      // Formato por CRIATIVO, derivado da orientation dele — nao um unico
      // valor pra chamada inteira. Ver formatoPorOrientacao.
      const formatoDoCard = formatoPorOrientacao(creative?.orientation, args.format);
      if (hasCreativeImage(creative, formatoDoCard)) continue;
      if (creative.usesRealPhoto) { blocked.push({ index, reason: "Foto real vinculada sem URL: recupere o anexo; nao substituida por imagem sintetica." }); continue; }
      let brief;
      try { brief = imageBrief(campaign, creative); } catch { return { ok: false, erro: "Faltam fatos e segmento confirmados na campanha. Confirme o briefing; nao precisa enviar dez fotos." }; }
      ready.push({ index, brief, formato: formatoDoCard });
    }
    for (const { index, brief, formato } of ready) {
      const fingerprint = imageFingerprint({ userId, campaignId: campaign.id, index, format: formato, brief });
      await pool.query("INSERT INTO campaign_image_jobs (user_id,campaign_id,creative_index,format,fingerprint,brief) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (fingerprint) DO NOTHING", [userId, campaign.id, index, formato, fingerprint, JSON.stringify(brief)]);
    }
  }
  const result = await pool.query("SELECT id,creative_index,format,status,score,reason,attempts,candidate_url AS preview_url,provider FROM campaign_image_jobs WHERE user_id=$1 AND campaign_id=$2 ORDER BY id DESC LIMIT 30", [userId, campaign.id]);
  // `estado` e deterministico e diz se a fila ainda vai agir sozinha — a
  // informacao que faltava quando o chat inventou "aguarde 10-15 minutos"
  // para tarefas que haviam esgotado as tentativas. Ver resumoDeTarefasDeImagem.
  const estado = resumoDeTarefasDeImagem(result.rows);
  return { ok: true, campaignId: campaign.id, jobs: result.rows, blocked, published: false, estado,
    note: "Ultimas 30 tarefas, incluindo historico. Tarefas persistentes, nao publicacao. Consulte action=status. preview_url e somente para revisao, nao autoriza publicar. Pendente significa imagem preservada aguardando validacao. Aprovadas sao salvas nos criativos. Revalidar nao gera nova imagem. Relate o estado a partir de `estado`, nunca inferindo do formato das linhas: se estado.filaVaiAgir for false, NAO diga ao usuario para aguardar — diga o que esta em estado.destravar." };
}

// One global advisory lock: serial processing across replicas, automatically released on disconnect.
export async function processCampaignImageJob(injected?: any) {
  const db = injected?.db ?? await import("./db"); const pool = await db.getPool(); if (!pool) return;
  const connection = await pool.connect(); let locked = false;
  try {
    locked = (await connection.query("SELECT pg_try_advisory_lock(727007) AS locked")).rows[0].locked;
    if (!locked) return;
    // A process died while working. Revalidate a stored candidate; never regenerate an uncertain request.
    await connection.query("UPDATE campaign_image_jobs SET status=CASE WHEN candidate_url IS NULL THEN 'needs_review' ELSE 'pending_validation' END, reason='interrupted_worker' WHERE status='running'");
    const found = await connection.query("SELECT * FROM campaign_image_jobs WHERE (status='queued' OR (status='pending_validation' AND attempts<$1)) AND next_attempt<=NOW() ORDER BY id LIMIT 1", [MAX_TENTATIVAS_VALIDACAO]);
    const job = found.rows[0]; if (!job) return;
    await connection.query("UPDATE campaign_image_jobs SET status='running',updated_at=NOW() WHERE id=$1", [job.id]);
    const update = async (status: string, reason: string, score: number | null = null) => {
      await connection.query("UPDATE campaign_image_jobs SET status=$2,reason=$3,score=$4,updated_at=NOW(),next_attempt=NOW()+INTERVAL '5 minutes' WHERE id=$1", [job.id, status, reason, score]);
      log.info("image-job", "Estado atualizado", { jobId: job.id, campaignId: job.campaign_id, status, reason });
    };
    try {
      const campaign = await db.getCampaignById(job.campaign_id);
      const project = campaign && await db.getProjectById(campaign.projectId);
      if (!campaign || project?.userId !== job.user_id) { await update("cancelled", "ownership_changed"); return; }
      const creatives = JSON.parse(campaign.creatives || "[]"); const creative = creatives[job.creative_index];
      if (!creative || imageFingerprint(imageBrief(campaign, creative)) !== imageFingerprint(job.brief)) { await update("cancelled", "brief_changed"); return; }
      if (creative.usesRealPhoto || hasCreativeImage(creative, job.format)) { await update("cancelled", "existing_media_preserved"); return; }
      let url = job.candidate_url;
      if (!url) {
        const generateCampaignImageCandidate = injected?.generate ?? (await import("./imageGeneration")).generateCampaignImageCandidate;
        const candidate = await generateCampaignImageCandidate(job.brief, job.format, job.creative_index);
        if (!candidate) { await update("failed", "generation_unavailable_no_automatic_retry"); return; }
        url = candidate.url;
        job.provider = candidate.provider;
        await connection.query("UPDATE campaign_image_jobs SET candidate_url=$2,provider=$3,updated_at=NOW() WHERE id=$1", [job.id, url, candidate.provider]);
      }
      await connection.query("UPDATE campaign_image_jobs SET attempts=attempts+1 WHERE id=$1", [job.id]);
      const validateCampaignImage = injected?.validate ?? (await import("./campaignImageValidator")).validateCampaignImage;
      const decision = await validateCampaignImage(url, job.brief);
      await connection.query("UPDATE campaign_image_jobs SET validation=$2 WHERE id=$1", [job.id, JSON.stringify(decision)]);
      if (decision.status !== "approved") { await update(decision.status, decision.reason, decision.score); return; }
      // Optimistic update protects concurrent edits, media and cover ordering.
      const { syncCreativeImageToV2 } = await import("../shared/campaignCreative.sync");
      creative[imageField(job.format)] = url;
      creative.imageProviderUsed = job.provider || "cloudflare";
      creative.imageValidationStatus = "approved";
      creatives[job.creative_index] = syncCreativeImageToV2(creative, job.format, { imageUrl: url, imageHash: null });
      await connection.query("BEGIN");
      try {
        const saved = await connection.query(`UPDATE campaigns c SET creatives=$2 WHERE c.id=$1 AND c.creatives IS NOT DISTINCT FROM $3 AND c."aiResponse" IS NOT DISTINCT FROM $4 AND c.objective=$5 AND EXISTS (SELECT 1 FROM projects p WHERE p.id=c."projectId" AND p."userId"=$6)`, [campaign.id, JSON.stringify(creatives), campaign.creatives, campaign.aiResponse, campaign.objective, job.user_id]);
        await update(saved.rowCount ? "approved" : "cancelled", saved.rowCount ? decision.reason : "campaign_changed_during_validation", decision.score);
        await connection.query("COMMIT");
      } catch (error) { await connection.query("ROLLBACK"); throw error; }
    } catch {
      await update("needs_review", "processing_interrupted_no_automatic_regeneration");
    }
  } finally {
    if (locked) await connection.query("SELECT pg_advisory_unlock(727007)").catch(() => {});
    connection.release();
  }
}

export function startCampaignImageWorker() {
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try { await processCampaignImageJob(); } catch { log.warn("image-job", "Fila indisponivel; nenhuma nova geracao confirmada"); } finally { busy = false; }
  };
  const timer = setInterval(tick, 15000); timer.unref(); void tick();
  return timer;
}
