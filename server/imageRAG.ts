/**
 * imageRAG.ts — Sistema RAG para classificação e validação de imagens
 *
 * Arquitetura:
 *   Upload/Geração → Análise Visual (Google Vision) → RAG Retrieval
 *   → Validação Multi-Score → Associação/Rejeição → Auto-Learning
 */

import { log }    from "./logger";

// Lazy pool — evita crash no startup se DATABASE_URL não estiver disponível
let _ragPool: any = null;
function getRagPool() {
  if (!_ragPool) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require("pg");
    _ragPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  }
  return _ragPool;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ImageRAGResult {
  image_id:             string;
  cloud_url:            string;
  detected_product:     string;
  recommended_campaign: string;
  confidence_score:     number;
  validation_status:    "approved" | "pending_validation" | "rejected";
  scores: {
    quality_score:          number;
    conversion_score:       number;
    branding_score:         number;
    visual_similarity_score:number;
    product_match_score:    number;
    campaign_match_score:   number;
    overall_score:          number;
  };
  retrieved_context:  string[];
  validation_logs:    string[];
  association_reason: string;
  rejection_reason:   string;
  generated_tags:     string[];
}

export interface RAGContext {
  projectId?:     number;
  segment:        string;
  format:         string;
  productName?:   string;
  productService?:string;
  niche?:         string;
  campaignId?:    number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  confidence:       0.75,  // reduzido de 0.85 — sem embeddings vetoriais reais
  product_match:    0.70,
  campaign_match:   0.70,
  branding:         0.65,
  min_bytes:        20_000, // imagens < 20KB são placeholder/erro
};

// ── ETAPA 1: Análise Visual via Google Vision ────────────────────────────────

interface VisionAnalysis {
  labels:       string[];
  objects:      string[];
  text_found:   string;
  has_text:     boolean;
  dominant_colors: string[];
  safe:         boolean;
  quality_score:number;
}

export async function analyzeImageWithVision(
  imageUrl: string
): Promise<VisionAnalysis | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    // Baixa a imagem para análise
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const b64    = buffer.toString("base64");

    const body = {
      requests: [{
        image:    { content: b64 },
        features: [
          { type: "LABEL_DETECTION",       maxResults: 10 },
          { type: "OBJECT_LOCALIZATION",   maxResults: 5  },
          { type: "TEXT_DETECTION",        maxResults: 5  },
          { type: "IMAGE_PROPERTIES",      maxResults: 5  },
          { type: "SAFE_SEARCH_DETECTION"              },
        ],
      }],
    };

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;

    const data: any = await res.json();
    const r = data?.responses?.[0];
    if (!r) return null;

    const labels  = (r.labelAnnotations  || []).map((l: any) => l.description as string);
    const objects = (r.localizedObjectAnnotations || []).map((o: any) => o.name as string);
    const textAnnotations = r.textAnnotations || [];
    const text_found = textAnnotations[0]?.description || "";
    const has_text   = text_found.replace(/\s/g, "").length > 3;

    // Cores dominantes
    const colors = (r.imagePropertiesAnnotation?.dominantColors?.colors || [])
      .slice(0, 3)
      .map((c: any) => {
        const { red = 0, green = 0, blue = 0 } = c.color || {};
        return `rgb(${Math.round(red)},${Math.round(green)},${Math.round(blue)})`;
      });

    // Safe search
    const ss   = r.safeSearchAnnotation || {};
    const safe = !["LIKELY","VERY_LIKELY"].includes(ss.adult || "") &&
                 !["LIKELY","VERY_LIKELY"].includes(ss.violence || "");

    // Score de qualidade baseado em labels de qualidade
    const qualityLabels = ["professional", "beauty", "luxury", "modern", "clean",
                           "bright", "natural", "artistic"];
    const qualityHits = labels.filter((l: string) =>
      qualityLabels.some(q => l.toLowerCase().includes(q))
    ).length;
    const quality_score = Math.min(1, 0.5 + qualityHits * 0.12);

    return { labels, objects, text_found, has_text, dominant_colors: colors, safe, quality_score };
  } catch (err: any) {
    log.warn("image-rag", "Vision API error", { error: err?.message?.slice(0, 60) });
    return null;
  }
}

// ── ETAPA 2: RAG Retrieval — busca contexto do banco ─────────────────────────

interface RetrievedContext {
  approved_images:  Array<{ url: string; segment: string; usage_count: number }>;
  campaign_patterns:Array<{ niche: string; score: number; platform: string }>;
  product_keywords: string[];
  segment_rules:    Record<string, string[]>;
}

async function retrieveRAGContext(ctx: RAGContext): Promise<RetrievedContext> {
  const result: RetrievedContext = {
    approved_images:   [],
    campaign_patterns: [],
    product_keywords:  [],
    segment_rules:     {},
  };

  try {
    // Imagens aprovadas do mesmo segmento
    const imgRows = await getRagPool().query(
      `SELECT cloud_url, segment, usage_count FROM approved_images
       WHERE segment = $1 ORDER BY usage_count DESC LIMIT 5`,
      [ctx.segment]
    );
    result.approved_images = imgRows.rows;

    // Padrões de campanhas bem-sucedidas do mesmo nicho
    if (ctx.projectId) {
      const campRows = await getRagPool().query(
        `SELECT m.feature_niche as niche, m.label_score as score, m.feature_platform as platform
         FROM ml_dataset m
         WHERE m.project_id = $1 AND m.label_is_winner = 1
         ORDER BY m.label_score DESC LIMIT 5`,
        [ctx.projectId]
      );
      result.campaign_patterns = campRows.rows;
    }

    // Keywords do produto para match semântico simples
    result.product_keywords = [
      ctx.productName, ctx.productService, ctx.niche, ctx.segment,
    ].filter(Boolean) as string[];

    // Regras do segmento (forbidden words, CTAs)
    result.segment_rules = {
      forbidden: ctx.segment?.includes("imoveis") ?
        ["garantido","cura","milagre","melhor preço"] :
        ["garantia de resultado","cura"],
    };
  } catch { /* silencioso */ }

  return result;
}

// ── ETAPA 3: Scoring multi-dimensional ───────────────────────────────────────

function computeScores(
  vision:    VisionAnalysis,
  ctx:       RAGContext,
  retrieved: RetrievedContext,
): ImageRAGResult["scores"] {

  // Quality Score: baseado na análise visual
  const quality_score = vision.quality_score;

  // Product Match Score: quanto as labels da imagem correspondem ao produto
  const productKeywords = retrieved.product_keywords.join(" ").toLowerCase();
  const labelText       = [...vision.labels, ...vision.objects].join(" ").toLowerCase();
  const productHits = retrieved.product_keywords.filter(kw =>
    kw && labelText.includes(kw.toLowerCase().split(" ")[0])
  ).length;
  const product_match_score = retrieved.product_keywords.length > 0
    ? Math.min(1, productHits / retrieved.product_keywords.length + 0.3)
    : 0.5;

  // Campaign Match Score: histórico de campanhas similares
  const campaign_match_score = retrieved.campaign_patterns.length > 0
    ? Math.min(1, retrieved.campaign_patterns[0]?.score / 100 || 0.5)
    : 0.5;

  // Branding Score: sem texto alucinado + imagem segura + boa qualidade
  const branding_score = (vision.safe ? 0.4 : 0) +
    (!vision.has_text ? 0.35 : 0) +
    quality_score * 0.25;

  // Visual Similarity Score: quantas imagens aprovadas do segmento existem
  const visual_similarity_score = retrieved.approved_images.length >= 3
    ? 0.8 : retrieved.approved_images.length * 0.2 + 0.2;

  // Conversion Score: baseado em padrões de campanhas vencedoras
  const conversion_score = retrieved.campaign_patterns.length > 0
    ? Math.min(1, (retrieved.campaign_patterns[0]?.score || 50) / 100)
    : 0.5;

  // Overall Score: média ponderada
  const overall_score = (
    quality_score          * 0.20 +
    product_match_score    * 0.25 +
    campaign_match_score   * 0.15 +
    branding_score         * 0.20 +
    visual_similarity_score* 0.10 +
    conversion_score       * 0.10
  );

  return {
    quality_score:           Math.round(quality_score          * 100) / 100,
    conversion_score:        Math.round(conversion_score       * 100) / 100,
    branding_score:          Math.round(branding_score         * 100) / 100,
    visual_similarity_score: Math.round(visual_similarity_score* 100) / 100,
    product_match_score:     Math.round(product_match_score    * 100) / 100,
    campaign_match_score:    Math.round(campaign_match_score   * 100) / 100,
    overall_score:           Math.round(overall_score          * 100) / 100,
  };
}

// ── ETAPA 4: Validação e decisão ──────────────────────────────────────────────

function validateAndDecide(
  scores:    ImageRAGResult["scores"],
  vision:    VisionAnalysis,
  imageBytes:number,
): { status: ImageRAGResult["validation_status"]; reason: string; rejection: string } {
  const logs: string[] = [];

  // Bloqueios imediatos
  if (!vision.safe) {
    return { status: "rejected", reason: "", rejection: "Conteúdo inadequado detectado pelo SafeSearch" };
  }
  if (imageBytes < THRESHOLDS.min_bytes) {
    return { status: "rejected", reason: "", rejection: `Imagem muito pequena (${imageBytes} bytes) — possível placeholder` };
  }
  if (vision.has_text) {
    return { status: "rejected", reason: "", rejection: `Texto alucinado detectado: "${vision.text_found.slice(0, 50)}"` };
  }

  // Validação por scores
  const fails: string[] = [];
  if (scores.product_match_score  < THRESHOLDS.product_match)  fails.push(`product_match ${scores.product_match_score} < ${THRESHOLDS.product_match}`);
  if (scores.campaign_match_score < THRESHOLDS.campaign_match) fails.push(`campaign_match ${scores.campaign_match_score} < ${THRESHOLDS.campaign_match}`);
  if (scores.branding_score       < THRESHOLDS.branding)       fails.push(`branding ${scores.branding_score} < ${THRESHOLDS.branding}`);
  if (scores.overall_score        < THRESHOLDS.confidence)     fails.push(`overall ${scores.overall_score} < ${THRESHOLDS.confidence}`);

  if (fails.length === 0) {
    return {
      status: "approved",
      reason: `Todos os scores acima do threshold. Overall: ${scores.overall_score}`,
      rejection: "",
    };
  }

  // Falha em 1-2 scores → pending (revisão humana)
  if (fails.length <= 2) {
    return {
      status: "pending_validation",
      reason: "",
      rejection: `Scores abaixo do threshold: ${fails.join("; ")}`,
    };
  }

  // Falha em 3+ scores → rejected
  return {
    status: "rejected",
    reason: "",
    rejection: `Múltiplos scores abaixo do threshold: ${fails.join("; ")}`,
  };
}

// ── Função principal: RAG completa ────────────────────────────────────────────

export async function runImageRAG(
  cloudUrl:   string,
  imageBytes: number,
  ctx:        RAGContext,
): Promise<ImageRAGResult> {

  const image_id  = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const logs: string[] = [];

  logs.push(`[${new Date().toISOString()}] RAG iniciado: ${ctx.segment}/${ctx.format}`);

  // ETAPA 1: Análise visual
  const vision = await analyzeImageWithVision(cloudUrl);
  if (!vision) {
    logs.push("Vision API indisponível — usando scores conservadores");
  }

  const visionFallback: VisionAnalysis = vision || {
    labels: [], objects: [], text_found: "", has_text: false,
    dominant_colors: [], safe: true, quality_score: 0.5,
  };

  logs.push(`Labels detectados: ${visionFallback.labels.slice(0, 5).join(", ")}`);
  logs.push(`Texto na imagem: ${visionFallback.has_text ? `SIM — "${visionFallback.text_found.slice(0, 40)}"` : "NÃO ✅"}`);

  // ETAPA 2: RAG Retrieval
  const retrieved = await retrieveRAGContext(ctx);
  logs.push(`Contexto recuperado: ${retrieved.approved_images.length} imagens aprovadas, ${retrieved.campaign_patterns.length} padrões de campanhas`);
  logs.push(`Keywords do produto: ${retrieved.product_keywords.join(", ")}`);

  // ETAPA 3: Scores
  const scores = computeScores(visionFallback, ctx, retrieved);
  logs.push(`Scores: quality=${scores.quality_score} product=${scores.product_match_score} branding=${scores.branding_score} overall=${scores.overall_score}`);

  // ETAPA 4: Decisão
  const decision = validateAndDecide(scores, visionFallback, imageBytes);
  logs.push(`Decisão: ${decision.status.toUpperCase()} — ${decision.reason || decision.rejection}`);

  // Tags geradas a partir dos labels
  const generated_tags = [
    ...visionFallback.labels.slice(0, 5),
    ...visionFallback.objects.slice(0, 3),
    ctx.segment, ctx.format,
  ].filter(Boolean);

  // Produto detectado via labels
  const productLabels = visionFallback.labels.filter(l =>
    retrieved.product_keywords.some(kw =>
      kw && l.toLowerCase().includes(kw.toLowerCase().split(" ")[0])
    )
  );
  const detected_product = productLabels[0] || ctx.productName || "Não identificado";

  // Campanha recomendada
  const recommended_campaign = retrieved.campaign_patterns[0]?.niche
    ? `Campanha ${retrieved.campaign_patterns[0].niche} (score ${retrieved.campaign_patterns[0].score})`
    : ctx.segment;

  // Log no banco
  await saveRAGLog({
    imageId: image_id,
    cloudUrl,
    segment: ctx.segment,
    format: ctx.format,
    status: decision.status,
    overallScore: scores.overall_score,
    hasText: visionFallback.has_text,
    labels: visionFallback.labels,
    projectId: ctx.projectId,
  });

  log.info("image-rag", `RAG ${decision.status}`, {
    image_id, segment: ctx.segment, format: ctx.format,
    overall: scores.overall_score, has_text: visionFallback.has_text,
    status: decision.status,
  });

  return {
    image_id,
    cloud_url: cloudUrl,
    detected_product,
    recommended_campaign,
    confidence_score: scores.overall_score,
    validation_status: decision.status,
    scores,
    retrieved_context: [
      `${retrieved.approved_images.length} imagens aprovadas no segmento`,
      `${retrieved.campaign_patterns.length} padrões de campanhas`,
      `Keywords: ${retrieved.product_keywords.join(", ")}`,
    ],
    validation_logs: logs,
    association_reason: decision.reason,
    rejection_reason: decision.rejection,
    generated_tags,
  };
}

// ── Persistência de logs RAG ──────────────────────────────────────────────────

async function saveRAGLog(data: {
  imageId: string; cloudUrl: string; segment: string; format: string;
  status: string; overallScore: number; hasText: boolean;
  labels: string[]; projectId?: number;
}): Promise<void> {
  try {
    await getRagPool().query(
      `INSERT INTO image_rag_logs
         (image_id, cloud_url, segment, format, validation_status,
          overall_score, has_text, labels, project_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT DO NOTHING`,
      [
        data.imageId, data.cloudUrl, data.segment, data.format,
        data.status, data.overallScore, data.hasText,
        JSON.stringify(data.labels), data.projectId || null,
      ]
    );
  } catch { /* silencioso se tabela não existir ainda */ }
}

// ── Auto-learning: promove imagens aprovadas ──────────────────────────────────

export async function promoteImageToLibrary(
  cloudUrl: string, segment: string, format: string,
  ragResult: ImageRAGResult,
): Promise<void> {
  if (ragResult.validation_status !== "approved") return;

  try {
    await getRagPool().query(
      `INSERT INTO approved_images (cloud_url, segment, format, query, provider, bytes)
       VALUES ($1, $2, $3, $4, 'rag_validated', 0)
       ON CONFLICT DO NOTHING`,
      [cloudUrl, segment, format,
       `rag:${ragResult.generated_tags.slice(0, 3).join(",")} score:${ragResult.scores.overall_score}`]
    );
    log.info("image-rag", "♻️ Imagem promovida para biblioteca", { segment, format, score: ragResult.scores.overall_score });
  } catch { /* silencioso */ }
}
