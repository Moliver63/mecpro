/**
 * server/mcpServer.ts — VERSÃO MELHORADA
 *
 * Melhorias aplicadas:
 * 1. Schema upload_campaign_images sem .passthrough() — inputs previsíveis
 * 2. .describe() em TODOS os campos — GPT/Claude sabe exatamente o que enviar
 * 3. URLs incluídas no content.text — usuário vê o resultado
 * 4. Validação de creativeIndex ANTES do download — evita trabalho desperdiçado
 * 5. Retry com backoff no fetchImageBuffer — robustez contra falhas de rede
 * 6. Timeout de generate_campaign inclui tempo de upload — evita timeout falso
 * 7. Cache de imagens por SHA256 — economia de banda/storage
 * 8. Nova tool upload_image — upload genérico que retorna URL pública
 * 9. Suporte a formats[] no upload_campaign_images — multi-formato em 1 chamada
 * 10. structuredContent simplificado — menos confusão pro LLM
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import crypto from "crypto";
import * as db from "./db";
import { appRouter } from "./_core/router";
import { uploadBase64ImageToCloudinary, uploadImageBufferToCloudinary } from "./imageGeneration";
import { log } from "./logger";
import { evaluateCampaignBriefingReadiness } from "../shared/campaignBriefingReadiness";

// ── Cache de imagens por SHA256 (evita upload duplicado) ──────────────────
const _imageHashCache = new Map<string, { url: string; ts: number }>();
const IMAGE_HASH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function getCachedImageUrl(hash: string): Promise<string | null> {
  const cached = _imageHashCache.get(hash);
  if (cached && Date.now() - cached.ts < IMAGE_HASH_CACHE_TTL_MS) {
    log.info("mcp-upload-images", "Cache hit SHA256", { hash: hash.slice(0, 16) });
    return cached.url;
  }
  // Também consulta o banco (persistente entre reinícios)
  try {
    const pool = await db.getPool();
    if (!pool) return null;
    const res = await pool.query(
      `SELECT cloud_url FROM image_upload_cache WHERE sha256 = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [hash]
    );
    if (res.rows[0]?.cloud_url) {
      _imageHashCache.set(hash, { url: res.rows[0].cloud_url, ts: Date.now() });
      return res.rows[0].cloud_url;
    }
  } catch { /* silencioso */ }
  return null;
}

async function saveImageCache(hash: string, cloudUrl: string, fileName: string, bytes: number): Promise<void> {
  _imageHashCache.set(hash, { url: cloudUrl, ts: Date.now() });
  try {
    const pool = await db.getPool();
    if (!pool) return;
    await pool.query(
      `INSERT INTO image_upload_cache (sha256, cloud_url, file_name, bytes, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (sha256) DO UPDATE SET cloud_url = EXCLUDED.cloud_url, created_at = NOW()`,
      [hash, cloudUrl, fileName, bytes]
    );
  } catch { /* silencioso */ }
}

function formatBriefingReadinessText(readiness: ReturnType<typeof evaluateCampaignBriefingReadiness>): string {
  const required = readiness.requiredMissing.map((issue, index) => `${index + 1}. ${issue.question}`);
  const recommended = readiness.recommendedMissing.map((issue, index) => `${index + 1}. ${issue.question}`);
  return [
    readiness.summary,
    `Score do briefing: ${readiness.score}/100.`,
    required.length ? `Perguntas obrigatorias:\n${required.join("\n")}` : "",
    recommended.length ? `Perguntas recomendadas:\n${recommended.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// ── Validação de imagem enviada em base64 ─────────────────────────────────
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function decodeAndValidateImage(imageBase64: string): { ok: boolean; buffer: Buffer | null; error: string | null } {
  const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Clean, "base64");
  } catch {
    return { ok: false, buffer: null, error: "Base64 inválido — não foi possível decodificar a imagem." };
  }
  if (buffer.length === 0) return { ok: false, buffer: null, error: "Imagem vazia." };
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, buffer: null, error: `Imagem muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Máximo aceito: 12MB.` };
  }
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    return { ok: false, buffer: null, error: "Formato de imagem não reconhecido — envie JPEG, PNG ou WEBP." };
  }
  return { ok: true, buffer, error: null };
}

// ── Resolução de fileUrl — trata Google Drive + retry ─────────────────────
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;
const MAX_FILEURL_IMAGE_BYTES = 15 * 1024 * 1024;

function normalizeGoogleDriveUrl(url: string): string {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/,
    /drive\.google\.com\/open\?id=([^&]+)/,
    /drive\.google\.com\/uc\?.*[?&]id=([^&]+)/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

function looksLikeImage(contentType: string, fileUrl: string): boolean {
  if (contentType.startsWith("image/")) return true;
  if (!contentType || contentType === "application/octet-stream") {
    return IMAGE_EXT_RE.test(fileUrl);
  }
  return false;
}

async function fetchImageBuffer(
  rawUrl: string,
  timeoutMs = 20000,
  retries = 3
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const isDrive = /drive\.google\.com/.test(rawUrl);
  const url = isDrive ? normalizeGoogleDriveUrl(rawUrl) : rawUrl;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (e: any) {
      if (attempt < retries) {
        const delay = 1000 * attempt;
        log.info("mcp-upload-images", `fetch retry ${attempt}/${retries}`, { url: url.slice(0, 60), delay });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { ok: false, error: `Falha ao baixar a imagem de fileUrl: ${e?.message || "erro de rede"}.` };
    }
    if (!response.ok) {
      if (attempt < retries && response.status >= 500) {
        const delay = 1000 * attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { ok: false, error: `fileUrl retornou status ${response.status} — verifique se a URL é pública e acessível.` };
    }

    let contentType = response.headers.get("content-type") || "";
    let buffer = Buffer.from(await response.arrayBuffer());

    if (isDrive && contentType.startsWith("text/html")) {
      const html = buffer.toString("utf-8");
      const confirmMatch =
        html.match(/href="(\/uc\?export=download[^"]*)"/) ||
        html.match(/action="([^"]*)"[^>]*id="download-form"/);
      if (confirmMatch) {
        const confirmUrl = confirmMatch[1].startsWith("http")
          ? confirmMatch[1].replace(/&amp;/g, "&")
          : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, "&")}`;
        try {
          const retryRes = await fetch(confirmUrl, { signal: AbortSignal.timeout(timeoutMs) });
          if (retryRes.ok) {
            contentType = retryRes.headers.get("content-type") || "";
            buffer = Buffer.from(await retryRes.arrayBuffer());
          }
        } catch {
          // mantém o buffer/contentType da primeira tentativa
        }
      }
    }

    if (isDrive && contentType.startsWith("text/html")) {
      return {
        ok: false,
        error:
          "Este link do Google Drive está bloqueando o download direto (página de confirmação do próprio Drive). " +
          "Baixe o arquivo manualmente e reenvie como base64, ou hospede em outro serviço (Cloudinary, Imgur etc.).",
      };
    }
    if (!looksLikeImage(contentType, url)) {
      return { ok: false, error: `fileUrl não aponta pra uma imagem (content-type: ${contentType || "desconhecido"}).` };
    }
    if (buffer.byteLength > MAX_FILEURL_IMAGE_BYTES) {
      return { ok: false, error: "Imagem baixada de fileUrl excede 15MB — use uma imagem menor." };
    }
    return { ok: true, buffer };
  }

  return { ok: false, error: "Todas as tentativas de download falharam." };
}

// ── Normalização de input de imagem (schema limpo, sem passthrough) ───────
type McpUploadImageInput = {
  fileUrl?: string;
  url?: string;
  imageUrl?: string;
  downloadUrl?: string;
  imageBase64?: string;
  base64?: string;
  dataUrl?: string;
  bytes?: string;
  content?: string;
  data?: string;
  fileName?: string;
  name?: string;
  path?: string;
  filePath?: string;
  file?: {
    url?: string;
    imageUrl?: string;
    downloadUrl?: string;
    imageBase64?: string;
    base64?: string;
    dataUrl?: string;
    bytes?: string;
    content?: string;
    data?: string;
    fileName?: string;
    name?: string;
    path?: string;
  };
  creativeIndex?: number;
  format?: "feed" | "stories" | "square";
  formats?: Array<"feed" | "stories" | "square">;
};

type CampaignPhotoInsight = {
  url: string;
  originalIndex: number;
  fileName?: string;
  role: string;
  copyAngle: string;
  labels: string[];
  objects: string[];
  textFound?: string;
  hasText?: boolean;
  qualityScore?: number | null;
  isFeatured?: boolean;
};

function firstNonEmpty(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function looksLikeLocalAttachmentPath(value?: string): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  const decoded = (() => {
    try { return decodeURIComponent(lower); } catch { return lower; }
  })();
  return decoded.startsWith("/mnt/data/") ||
         decoded.includes("/mnt/data/") ||
         decoded.startsWith("sandbox:") ||
         decoded.includes("sandbox:/") ||
         decoded.includes("/sandbox/") ||
         decoded.startsWith("attachment:") ||
         decoded.startsWith("blob:") ||
         decoded.startsWith("file://") ||
         new RegExp("^[A-Za-z]:[\\\\/]").test(value);
}

function normalizeUploadImageInput(image: McpUploadImageInput, index: number): {
  fileUrl?: string;
  imageBase64?: string;
  fileName: string;
  sourceKind?: "fileUrl" | "imageBase64";
  formats: Array<"feed" | "stories" | "square">;
  error?: string;
} {
  const fileUrl = firstNonEmpty(
    image.fileUrl,
    image.url,
    image.imageUrl,
    image.downloadUrl,
    image.file?.url,
    image.file?.imageUrl,
    image.file?.downloadUrl
  );
  const imageBase64 = firstNonEmpty(
    image.imageBase64,
    image.base64,
    image.dataUrl,
    image.bytes,
    image.content,
    image.data,
    image.file?.imageBase64,
    image.file?.base64,
    image.file?.dataUrl,
    image.file?.bytes,
    image.file?.content,
    image.file?.data
  );
  const fileName = firstNonEmpty(image.fileName, image.name, image.file?.fileName, image.file?.name)
    || `campaign-upload-${index + 1}.jpg`;
  const localPath = firstNonEmpty(image.filePath, image.path, image.file?.path);

  // Resolve formats: aceita array formats OU format único
  const formats: Array<"feed" | "stories" | "square"> = [];
  if (Array.isArray(image.formats) && image.formats.length > 0) {
    for (const f of image.formats) {
      if (["feed", "stories", "square"].includes(f)) formats.push(f);
    }
  }
  if (formats.length === 0 && image.format && ["feed", "stories", "square"].includes(image.format)) {
    formats.push(image.format);
  }
  if (formats.length === 0) formats.push("feed");

  if (fileUrl) {
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(fileUrl)) {
      return { imageBase64: fileUrl, fileName, sourceKind: "imageBase64", formats };
    }
    if (looksLikeLocalAttachmentPath(fileUrl)) {
      return {
        fileName,
        formats,
        error:
          `Recebi "${fileUrl}" como caminho local do ambiente do cliente. ` +
          "O servidor MecProAI/Render não consegue ler /mnt/data, sandbox:, blob:, attachment: ou file:// diretamente; envie uma URL HTTPS pública/temporária baixável ou data:image/...;base64 com os bytes reais.",
      };
    }
    return { fileUrl, fileName, sourceKind: "fileUrl", formats };
  }

  if (imageBase64) {
    if (/^https?:\/\//i.test(imageBase64)) {
      return { fileUrl: imageBase64, fileName, sourceKind: "fileUrl", formats };
    }
    if (looksLikeLocalAttachmentPath(imageBase64)) {
      return {
        fileName,
        formats,
        error:
          `Recebi "${imageBase64}" dentro de imageBase64, mas isso é só um caminho local do cliente. ` +
          "Envie os bytes da imagem como data URL/base64 real ou uma URL HTTPS pública/temporária baixável.",
      };
    }
    const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
    if (base64Clean.length < 64) {
      return {
        fileName,
        formats,
        error:
          "imageBase64/dataUrl não contém bytes suficientes de imagem. " +
          "Envie data:image/jpeg;base64,/9j/... ou use fileUrl/url/downloadUrl com uma URL HTTPS pública.",
      };
    }
    return { imageBase64, fileName, sourceKind: "imageBase64", formats };
  }

  if (localPath) {
    return {
      fileName,
      formats,
      error:
        `Recebi apenas o caminho local "${localPath}". ` +
        "Esse caminho existe no ambiente do ChatGPT, não no servidor MecProAI. Envie URL HTTPS pública/temporária baixável ou base64 real.",
    };
  }

  return {
    fileName,
    formats,
    error:
      "Informe uma imagem como fileUrl/url/downloadUrl, dataUrl/base64/imageBase64, ou file.url/file.dataUrl.",
  };
}

function classifyCampaignPhoto(vision: any, index: number, total: number, segmentHint = ""): { role: string; copyAngle: string; orderWeight: number } {
  const text = [
    ...(Array.isArray(vision?.labels) ? vision.labels : []),
    ...(Array.isArray(vision?.objects) ? vision.objects : []),
    vision?.text_found || "",
    segmentHint,
  ].join(" ").toLowerCase();
  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

  if (has([/food|meal|dessert|cake|sweet|chocolate|cookie|brigadeiro|beijinho|doce|bolo|confeito|doceria|aliment|restaurante|delivery/])) {
    if (vision?.has_text || has([/card|logo|brand|marca|telefone|whatsapp|instagram|texto/])) {
      return { role: "offer_information", copyAngle: "contato, marca, pedido e chamada para acao", orderWeight: total > 1 ? 85 : 20 };
    }
    if (has([/box|package|gift|tray|kit|caixa|embalagem|presente|bandeja/])) {
      return { role: "package_proof", copyAngle: "apresentacao, quantidade e prova visual do produto", orderWeight: 25 };
    }
    if (has([/variety|assorted|mix|flavor|sabores|variado|sortido/]) || total > 2) {
      return { role: "menu_variety", copyAngle: "variedade de sabores, escolha e desejo imediato", orderWeight: index === 0 ? 10 : 30 };
    }
    return { role: "food_hero", copyAngle: "apetite, frescor e desejo de pedir agora", orderWeight: 10 + index };
  }

  if (has([/fashion|clothing|shirt|dress|shoe|bag|look|moda|roupa|camisa|vestido|sapato|bolsa/])) {
    if (has([/hanger|rack|shelf|mirror|cabide|arara|prateleira|espelho/])) {
      return { role: "product_variation", copyAngle: "variedade, estilo e combinacoes disponiveis", orderWeight: 30 };
    }
    return { role: index === 0 ? "look_hero" : "material_detail", copyAngle: index === 0 ? "estilo principal e desejo de compra" : "acabamento, caimento e detalhe do produto", orderWeight: index === 0 ? 10 : 45 };
  }

  if (has([/clinic|doctor|dentist|procedure|treatment|beauty|aesthetic|saude|clinica|dentista|procedimento|tratamento|estetica/])) {
    if (has([/machine|equipment|technology|device|aparelho|equipamento|tecnologia/])) {
      return { role: "technology_detail", copyAngle: "tecnologia, seguranca e resultado esperado", orderWeight: 30 };
    }
    return { role: index === 0 ? "clinic_environment" : "procedure_context", copyAngle: index === 0 ? "confianca, acolhimento e autoridade" : "beneficio do tratamento e reducao de objecoes", orderWeight: index === 0 ? 10 : 40 };
  }

  if (has([/car|vehicle|auto|motor|wheel|interior|oficina|carro|veiculo|automotivo|roda/])) {
    if (has([/seat|dashboard|interior|banco|painel|interno/])) {
      return { role: "interior_detail", copyAngle: "conforto, conservacao e detalhe interno", orderWeight: 35 };
    }
    return { role: index === 0 ? "vehicle_hero" : "service_detail", copyAngle: index === 0 ? "impacto do veiculo e desejo inicial" : "diferencial tecnico, estado e prova visual", orderWeight: index === 0 ? 10 : 45 };
  }

  if (has([/gym|fitness|training|workout|exercise|academia|treino|musculacao|personal/])) {
    if (has([/equipment|machine|weight|halter|aparelho|equipamento|peso/])) {
      return { role: "equipment_detail", copyAngle: "estrutura, variedade de treino e suporte", orderWeight: 35 };
    }
    return { role: index === 0 ? "gym_environment" : "class_experience", copyAngle: index === 0 ? "ambiente, energia e transformacao" : "experiencia de aula, acompanhamento e consistencia", orderWeight: index === 0 ? 10 : 45 };
  }

  if (has([/swimming|pool|water|terrace|balcony|deck|outdoor|facade|building|sky|view|vista|piscina|varanda/])) {
    return { role: "hero_exterior_amenity", copyAngle: "impacto visual, estilo de vida e desejo principal", orderWeight: 10 };
  }
  if (has([/kitchen|countertop|cabinet|appliance|dining|table|gourmet|restaurant|food|meal|cozinha|mesa|gourmet/])) {
    return { role: "main_living_gourmet", copyAngle: "uso diario, conforto e experiencia do produto", orderWeight: 30 };
  }
  if (has([/living room|sofa|couch|room|interior|stair|stairs|lounge|sala|escada/])) {
    return { role: "living_space", copyAngle: "amplitude, integracao e conforto", orderWeight: 35 };
  }
  if (has([/bed|bedroom|suite|pillow|mattress|quarto|suite|cama/])) {
    return { role: "private_suite", copyAngle: "privacidade, descanso e padrao de acabamento", orderWeight: 45 };
  }
  if (has([/wardrobe|closet|clothing|hanger|shelf|mirror|closet|roupa|cabide|espelho/])) {
    return { role: "detail_storage", copyAngle: "detalhes funcionais e praticidade", orderWeight: 60 };
  }
  if (vision?.has_text) {
    return { role: "offer_information", copyAngle: "informacoes objetivas, oferta e chamada para acao", orderWeight: total > 1 ? 90 : 20 };
  }
  return { role: index === 0 ? "hero_general" : "supporting_detail", copyAngle: index === 0 ? "impacto inicial" : "diferencial complementar", orderWeight: 50 + index };
}

function orderCampaignPhotoInsights(
  photos: CampaignPhotoInsight[],
  featuredPhotoIndex?: number,
  photoOrder?: number[],
  segmentHint = "",
): CampaignPhotoInsight[] {
  if (photoOrder?.length) {
    const byOriginalIndex = new Map(photos.map((photo) => [photo.originalIndex, photo]));
    const ordered: CampaignPhotoInsight[] = [];
    for (const originalIndex of photoOrder) {
      const photo = byOriginalIndex.get(originalIndex);
      if (photo && !ordered.includes(photo)) ordered.push(photo);
    }
    for (const photo of photos) {
      if (!ordered.includes(photo)) ordered.push(photo);
    }
    return ordered.map((photo, idx) => ({ ...photo, isFeatured: idx === 0 }));
  }

  const featured = typeof featuredPhotoIndex === "number"
    ? photos.find((photo) => photo.originalIndex === featuredPhotoIndex)
    : undefined;
  const rest = photos
    .filter((photo) => photo !== featured)
    .sort((a, b) => {
      const roleA = classifyCampaignPhoto({ labels: a.labels, objects: a.objects, text_found: a.textFound, has_text: a.hasText }, a.originalIndex, photos.length, segmentHint);
      const roleB = classifyCampaignPhoto({ labels: b.labels, objects: b.objects, text_found: b.textFound, has_text: b.hasText }, b.originalIndex, photos.length, segmentHint);
      return roleA.orderWeight - roleB.orderWeight || a.originalIndex - b.originalIndex;
    });
  return [...(featured ? [featured] : []), ...rest].map((photo, idx) => ({ ...photo, isFeatured: idx === 0 }));
}

function getCreativeMedia(c: any) {
  return {
    hash: c?.feedImageHash || c?.imageHash || c?.metaImageHash,
    url: c?.feedImageUrl || c?.imageUrl || c?.mediaUrl,
  };
}

function orderedCreativesForCarousel(creatives: any[]): any[] {
  return creatives
    .map((creative, index) => ({ creative, index }))
    .sort((a, b) => {
      const aFeatured = a.creative?.isFeaturedPhoto === true ? 0 : 1;
      const bFeatured = b.creative?.isFeaturedPhoto === true ? 0 : 1;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      const aOriginal = Number.isFinite(Number(a.creative?.photoOriginalIndex)) ? Number(a.creative.photoOriginalIndex) : Number.MAX_SAFE_INTEGER;
      const bOriginal = Number.isFinite(Number(b.creative?.photoOriginalIndex)) ? Number(b.creative.photoOriginalIndex) : Number.MAX_SAFE_INTEGER;
      if (aOriginal !== bOriginal) return aOriginal - bOriginal;
      return a.index - b.index;
    })
    .map((item) => item.creative);
}

function auditCarouselCreatives(creatives: any[]) {
  const mediaCreatives = orderedCreativesForCarousel(creatives)
    .filter((creative) => {
      const media = getCreativeMedia(creative);
      return media.hash || media.url;
    })
    .slice(0, 10);

  if (mediaCreatives.length < 2) return { ok: true, issues: [] as string[], orderedCreatives: mediaCreatives };

  const issues: string[] = [];
  const seenHeadlines = new Map<string, number>();
  const seenDescriptions = new Map<string, number>();
  const normalize = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  mediaCreatives.forEach((creative, index) => {
    const card = index + 1;
    const headline = normalize(creative?.headline || creative?.title || creative?.name);
    const description = normalize(creative?.description || creative?.shortDescription);
    const body = normalize(creative?.copy || creative?.bodyText || creative?.primaryText || creative?.text);

    if (headline.length < 8) issues.push(`Card ${card}: headline ausente ou curta demais.`);
    if (description.length < 4) issues.push(`Card ${card}: description/shortDescription ausente ou curta demais.`);
    if (body.length < 80) issues.push(`Card ${card}: copy/bodyText principal curto demais para carrossel.`);

    const previousHeadline = headline ? seenHeadlines.get(headline) : undefined;
    if (previousHeadline !== undefined) issues.push(`Card ${card}: headline repetida do card ${previousHeadline + 1}.`);
    if (headline) seenHeadlines.set(headline, index);

    const previousDescription = description ? seenDescriptions.get(description) : undefined;
    if (previousDescription !== undefined) issues.push(`Card ${card}: description repetida do card ${previousDescription + 1}.`);
    if (description) seenDescriptions.set(description, index);
  });

  return { ok: issues.length === 0, issues, orderedCreatives: mediaCreatives };
}

// ── Escopo de acesso por API key ──────────────────────────────────────────
type McpScope = "read" | "write" | "publish";
const SCOPE_RANK: Record<McpScope, number> = { read: 0, write: 1, publish: 2 };

function hasScope(userScope: McpScope, required: McpScope): boolean {
  return SCOPE_RANK[userScope] >= SCOPE_RANK[required];
}

function scopeErrorContent(required: McpScope, userScope: McpScope) {
  return {
    content: [{
      type: "text" as const,
      text:
        `Esta API key tem escopo '${userScope}' e essa ferramenta exige '${required}'. ` +
        `Gere ou eleve o escopo de uma API key em Configurações → API Keys no MecProAI ` +
        `pra liberar esta ação.`,
    }],
    isError: true,
  };
}

export function createMcpServerForUser(userId: number, scope: McpScope = "publish"): McpServer {
  const server = new McpServer({ name: "mecproai", version: "1.2.0" });

  async function getCaller() {
    const user = await db.getUserById(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    return appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 1 — tools de leitura
  // ═══════════════════════════════════════════════════════════════════════

  server.registerTool(
    "list_projects",
    {
      title: "Listar projetos",
      description:
        "Lista todos os projetos (clientes/negócios) do usuário autenticado. " +
        "Cada projeto pode ter uma ou mais campanhas. Use isso primeiro pra " +
        "descobrir os projectId antes de listar campanhas de um projeto específico.",
      inputSchema: {},
    },
    async () => {
      const projects = await db.getProjectsByUserId(userId);
      const summary = projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        niche: p.niche || null,
        createdAt: p.createdAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: { projects: summary },
      };
    }
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "Listar campanhas",
      description:
        "Lista campanhas do usuário autenticado. Se projectId for informado, " +
        "lista só as campanhas daquele projeto — senão, lista de todos os " +
        "projetos do usuário. Retorna resumo (id, nome, status, orçamento); " +
        "use get_campaign pra detalhe completo de uma campanha específica.",
      inputSchema: {
        projectId: z.number().int().positive().optional()
          .describe("ID do projeto (opcional). Sem isso, lista campanhas de todos os projetos do usuário."),
      },
    },
    async ({ projectId }) => {
      let projectIds: number[];
      if (projectId) {
        const project = await db.getProjectById(projectId);
        if (!project || (project as any).userId !== userId) {
          return {
            content: [{ type: "text", text: `Projeto ${projectId} não encontrado ou não pertence a este usuário.` }],
            isError: true,
          };
        }
        projectIds = [projectId];
      } else {
        const projects = await db.getProjectsByUserId(userId);
        projectIds = projects.map((p: any) => p.id);
      }

      const all: any[] = [];
      for (const pid of projectIds) {
        const camps = await db.getCampaignsByProjectId(pid);
        for (const c of camps as any[]) {
          all.push({
            id: c.id,
            projectId: c.projectId,
            name: c.name,
            publishStatus: c.publishStatus || "draft",
            generatedAt: c.generatedAt,
            suggestedBudgetDaily: c.suggestedBudgetDaily ?? null,
            suggestedBudgetMonthly: c.suggestedBudgetMonthly ?? null,
            metaCampaignId: c.metaCampaignId || null,
          });
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(all, null, 2) }],
        structuredContent: { campaigns: all },
      };
    }
  );

  server.registerTool(
    "get_campaign",
    {
      title: "Detalhar campanha",
      description:
        "Retorna detalhes completos de uma campanha específica — objetivo, " +
        "orçamento, status de publicação, e um resumo de quantos ad sets e " +
        "criativos ela tem. Só funciona se a campanha pertencer ao usuário " +
        "autenticado.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (obtido via list_campaigns)."),
      },
    },
    async ({ campaignId }) => {
      const c: any = await db.getCampaignById(campaignId);
      if (!c) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(c.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const adSets  = (() => { try { return JSON.parse(c.adSets || "[]"); } catch { return []; } })();
      const creatives = (() => { try { return JSON.parse(c.creatives || "[]"); } catch { return []; } })();

      const detail = {
        id: c.id,
        projectId: c.projectId,
        projectName: project.name,
        name: c.name,
        objective: c.objective || null,
        publishStatus: c.publishStatus || "draft",
        generatedAt: c.generatedAt,
        publishedAt: c.publishedAt || null,
        suggestedBudgetDaily: c.suggestedBudgetDaily ?? null,
        suggestedBudgetMonthly: c.suggestedBudgetMonthly ?? null,
        durationDays: c.durationDays ?? null,
        metaCampaignId: c.metaCampaignId || null,
        metaAdSetId: c.metaAdSetId || null,
        metaAdId: c.metaAdId || null,
        metaCreativeId: c.metaCreativeId || null,
        adSetsCount: Array.isArray(adSets) ? adSets.length : 0,
        creativesCount: Array.isArray(creatives) ? creatives.length : 0,
        adSets,
        creatives,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
        structuredContent: detail,
      };
    }
  );

  server.registerTool(
    "get_campaign_metrics",
    {
      title: "Métricas diárias de uma campanha",
      description:
        "Retorna a série temporal diária de performance real da Meta " +
        "(impressões, cliques, gasto, CTR, CPC, CPM, alcance, frequência, " +
        "leads, compras, ROAS) para uma campanha já publicada. Útil pra " +
        "analisar tendência ao longo do tempo, não só o total acumulado. " +
        "Só funciona se a campanha pertencer ao usuário autenticado.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (obtido via list_campaigns)."),
        days: z.number().int().min(1).max(90).optional()
          .describe("Quantos dias pra trás buscar (padrão: 30, máximo: 90)."),
      },
    },
    async ({ campaignId, days }) => {
      const c: any = await db.getCampaignById(campaignId);
      if (!c) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(c.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const rows = await db.getCampaignMetricsDaily(campaignId, days || 30);
      if (rows.length === 0) {
        return {
          content: [{
            type: "text",
            text: `Nenhuma métrica diária registrada ainda para a campanha ${campaignId}. ` +
              `Isso é normal se a campanha foi publicada recentemente (o sync roda a cada 24h) ` +
              `ou se ela não está ativa na Meta no momento.`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        structuredContent: { campaignId, days: days || 30, metrics: rows },
      };
    }
  );

  server.registerTool(
    "get_full_ads_report",
    {
      title: "Relatório completo Meta / Google / TikTok",
      description:
        "Traz um relatório completo e granular de métricas de anúncios, " +
        "direto das APIs oficiais Meta Ads, Google Ads e TikTok Ads — não do " +
        "MCP padrão de cada plataforma. Inclui totais consolidados, métricas " +
        "por campanha, e quebras (breakdowns) por idade/gênero, " +
        "posicionamento/plataforma e dispositivo (Meta), por dispositivo " +
        "com conversões reais (Google), e por idade/gênero (TikTok). Use " +
        "quando o usuário pedir 'relatório', 'métricas', 'performance' ou " +
        "'como estão minhas campanhas' na Meta, Google ou TikTok. Requer " +
        "que a integração da plataforma já esteja configurada em " +
        "Configurações — plataformas sem integração aparecem no relatório " +
        "com configured:false, sem quebrar o restante.",
      inputSchema: {
        platforms: z.array(z.enum(["meta", "google", "tiktok"])).optional()
          .describe("Quais plataformas incluir. Padrão: todas as três (meta, google, tiktok)."),
        period: z.enum(["7d", "30d", "90d"]).optional()
          .describe("Janela de tempo do relatório. Padrão: 30d."),
      },
    },
    async ({ platforms, period }) => {
      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao autenticar: ${e.message}` }], isError: true };
      }
      try {
        const result = await caller.unified.getFullReport({
          platforms: platforms || ["meta", "google", "tiktok"],
          period: period || "30d",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as any,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao gerar relatório: ${e.message}` }], isError: true };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — tools de escrita
  // ═══════════════════════════════════════════════════════════════════════

  server.registerTool(
    "create_project",
    {
      title: "Criar projeto (cliente)",
      description:
        "Cria um novo projeto no MecProAI — o 'container' que representa um " +
        "cliente/negócio. Toda campanha precisa pertencer a um projeto. Use " +
        "list_projects primeiro pra checar se o cliente já não tem um projeto.",
      inputSchema: {
        name: z.string().min(2).describe("Nome do projeto/cliente (ex: 'Clínica Dr. Silva')."),
        description: z.string().optional().describe("Descrição breve opcional."),
      },
    },
    async ({ name, description }) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const check = await db.checkPlanLimit(userId, "projects");
      if (!check.allowed) {
        return { content: [{ type: "text", text: `Não foi possível criar: ${check.reason}` }], isError: true };
      }
      const project: any = await db.createProject({ name, description, userId } as any);
      return {
        content: [{ type: "text", text: `Projeto criado: "${project.name}" (id: ${project.id})` }],
        structuredContent: { id: project.id, name: project.name },
      };
    }
  );

  server.registerTool(
    "set_client_profile",
    {
      title: "Definir perfil do cliente",
      description:
        "Preenche ou atualiza o perfil do cliente de um projeto — nicho, público-alvo, " +
        "dor principal, proposta de valor, objeções, site. Quanto mais completo, melhor " +
        "a qualidade da copy que a IA do MecProAI vai gerar. Chame isso ANTES de " +
        "generate_campaign — a geração usa esses dados como contexto principal.",
      inputSchema: {
        projectId: z.number().int().positive().describe("ID do projeto (de create_project ou list_projects)."),
        companyName: z.string().describe("Nome da empresa/cliente."),
        niche: z.string().describe("Nicho/segmento de mercado (ex: 'clínica odontológica', 'e-commerce de moda')."),
        productService: z.string().describe("O que a empresa vende — produto ou serviço."),
        targetAudience: z.string().optional().describe("Público-alvo (ex: 'mulheres 25-45, classe B/C, interessadas em bem-estar')."),
        mainPain: z.string().optional().describe("Principal dor/problema que o público tem."),
        desiredTransformation: z.string().optional().describe("O que o público quer alcançar/se tornar."),
        uniqueValueProposition: z.string().optional().describe("O que diferencia essa empresa da concorrência."),
        mainObjections: z.string().optional().describe("Principais objeções de compra que o público costuma ter."),
        campaignObjective: z.enum(["leads", "sales", "branding", "traffic", "engagement"]).optional(),
        monthlyBudget: z.number().optional().describe("Orçamento mensal de mídia em reais."),
        websiteUrl: z.string().optional().describe("Site da empresa (com ou sem https://)."),
        socialLinks: z.string().optional().describe("Links de redes sociais (Instagram, Facebook etc), texto livre."),
        businessScope: z.enum(["local", "regional", "national", "global"]).optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      },
    },
    async (input) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const project: any = await db.getProjectById(input.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Projeto ${input.projectId} não encontrado ou não pertence a este usuário.` }], isError: true };
      }
      const websiteUrl = (() => {
        const raw = String(input.websiteUrl || "").trim();
        if (!raw) return undefined;
        if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
        const lower = raw.toLowerCase().replace(/\s+/g, "");
        if (/^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}(\/.*)?$/.test(lower)) return `https://${lower}`;
        return raw;
      })();
      await db.upsertClientProfile({ ...input, websiteUrl } as any);
      return {
        content: [{ type: "text", text: `Perfil do cliente salvo para o projeto ${input.projectId} (${project.name}).` }],
      };
    }
  );

  server.registerTool(
    "assess_campaign_briefing",
    {
      title: "Avaliar briefing de campanha",
      description:
        "Verifica se o projeto tem informacoes suficientes para gerar uma campanha com boa chance " +
        "de performance. Use antes de generate_campaign. Retorna score, itens obrigatorios, " +
        "perguntas recomendadas e o que falta conforme o objetivo: leads, vendas, trafego, " +
        "engajamento ou reconhecimento.",
      inputSchema: {
        projectId: z.number().int().positive().describe("ID do projeto."),
        objective: z.string().optional().describe("Objetivo: leads, sales, traffic, engagement ou branding."),
        platform: z.string().optional().describe("Plataforma: meta, google, tiktok, both ou all."),
        budget: z.number().optional().describe("Orcamento total em reais."),
        duration: z.number().int().optional().describe("Duracao em dias."),
        extraContext: z.string().optional(),
        creativeMode: z.enum(["auto", "upload"]).optional(),
        uploadedImages: z.array(z.string()).optional().describe("URLs publicas das fotos que serao usadas."),
        realPhotosBase64: z.array(z.object({
          imageBase64: z.string(),
          fileName: z.string().optional(),
        })).optional().describe("Fotos em base64, se houver."),
        featuredPhotoIndex: z.number().int().min(0).max(9).optional().describe("Foto escolhida como destaque/capa, começando em 0."),
        photoOrder: z.array(z.number().int().min(0).max(9)).optional().describe("Ordem manual das fotos por índice original, começando em 0."),
        locationMode: z.enum(["brasil", "paises", "raio", "cidade"]).optional(),
        regions: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional(),
        geoCity: z.string().optional(),
        geoRadius: z.number().optional(),
        leadForm: z.any().optional(),
      },
    },
    async (input) => {
      if (!hasScope(scope, "read")) return scopeErrorContent("read", scope);
      const project: any = await db.getProjectById(input.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Projeto ${input.projectId} não encontrado ou não pertence a este usuário.` }], isError: true };
      }
      const clientProfile = await db.getClientProfile(input.projectId);
      const readiness = evaluateCampaignBriefingReadiness(input, clientProfile);
      return {
        content: [{ type: "text", text: formatBriefingReadinessText(readiness) }],
        structuredContent: readiness,
      };
    }
  );

  // ── generate_campaign (melhorado: timeout inclui upload) ───────────────
  server.registerTool(
    "generate_campaign",
    {
      title: "Gerar campanha",
      description:
        "Dispara o motor de geração de campanha do MecProAI — a mesma lógica de IA " +
        "que roda quando alguém clica 'gerar' na interface (copy, criativos, orçamento " +
        "por ad set, auditoria de qualidade). NÃO publica na Meta — só cria o rascunho " +
        "da campanha. Chame assess_campaign_briefing antes para saber se precisa perguntar " +
        "objetivo, orcamento, destino, publico, oferta ou foto destaque. Chame set_client_profile " +
        "antes, se o projeto ainda não tiver perfil preenchido — a qualidade da copy depende disso. " +
        "Pode demorar até 50s (é IA real gerando).",
      inputSchema: {
        projectId: z.number().int().positive(),
        name: z.string().describe("Nome da campanha."),
        objective: z.string().describe("Objetivo (ex: 'sales', 'leads', 'traffic', 'branding')."),
        platform: z.string().describe("Plataforma (ex: 'meta', 'google', 'tiktok')."),
        budget: z.number().positive().describe("Orçamento total em reais."),
        duration: z.number().int().positive().describe("Duração em dias."),
        extraContext: z.string().optional().describe("Contexto adicional livre pra IA considerar."),
        ageMin: z.number().int().min(13).max(65).optional(),
        ageMax: z.number().int().min(18).max(65).optional(),
        locationMode: z.enum(["brasil", "paises", "raio", "cidade"]).optional(),
        regions: z.array(z.string()).optional().describe("Estados do Brasil (sigla), se locationMode='brasil'."),
        countries: z.array(z.string()).optional().describe("Países, se locationMode='paises'."),
        geoCity: z.string().optional().describe("Cidade, se locationMode='raio'."),
        geoRadius: z.number().optional().describe("Raio em km, se locationMode='raio'."),
        mediaFormat: z.string().optional().describe("Formato de mídia (ex: 'image', 'video', 'carousel', 'mixed')."),
        audienceProfile: z.string().optional(),
        uploadedImages: z.array(z.string()).optional().describe(
          "URLs https públicas das fotos reais do cliente. Combina com realPhotosBase64 se ambos " +
          "forem informados. Quando informado, cada criativo usa UMA foto real em vez de gerar por " +
          "IA, e a quantidade de criativos passa a acompanhar a quantidade de fotos (a menos que " +
          "numCreatives seja informado)."
        ),
        realPhotosBase64: z.array(z.object({
          imageBase64: z.string().describe("Conteúdo da foto em base64 (com ou sem prefixo data:image/...;base64,)."),
          fileName: z.string().optional().describe("Nome do arquivo, com extensão (ex: foto-cliente-1.jpg)."),
        })).optional().describe(
          "Fotos reais do cliente enviadas em base64 (ex: fotos que o usuário mandou direto na " +
          "conversa) — sobe cada uma pro Cloudinary automaticamente ANTES de gerar a campanha, sem " +
          "precisar gerar primeiro e trocar imagem depois. Cada JPEG/PNG/WEBP até 12MB. Combina com " +
          "uploadedImages se ambos forem informados (essas entram depois das URLs já públicas)."
        ),
        featuredPhotoIndex: z.number().int().min(0).max(9).optional().describe(
          "Índice da foto escolhida pelo usuário como destaque/capa do carrossel, começando em 0. " +
          "Se omitido, o sistema escolhe automaticamente pela análise visual."
        ),
        photoOrder: z.array(z.number().int().min(0).max(9)).optional().describe(
          "Ordem manual opcional das fotos, usando os índices originais começando em 0. " +
          "Quando informado, tem prioridade sobre a ordenação automática."
        ),
        numCreatives: z.number().int().min(2).max(10).optional().describe(
          "Quantidade de criativos a gerar (2-10). Se omitido: usa 1 por foto (uploadedImages + " +
          "realPhotosBase64 combinadas), ou 4 (padrão) se nenhuma foto real for informada. Cada " +
          "criativo recebe copy própria e distinta — é isso que evita headline/texto repetido entre " +
          "os cards de um carrossel."
        ),
      },
    },
    async (input) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const project: any = await db.getProjectById(input.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Projeto ${input.projectId} não encontrado ou não pertence a este usuário.` }], isError: true };
      }
      const check = await db.checkPlanLimit(userId, "campaigns", { projectId: input.projectId });
      if (!check.allowed) {
        return { content: [{ type: "text", text: `Não foi possível gerar: ${check.reason}` }], isError: true };
      }
      const clientProfile = await db.getClientProfile(input.projectId);
      const segmentHint = [
        project?.name || "",
        project?.niche || "",
        (clientProfile as any)?.companyName || "",
        (clientProfile as any)?.niche || "",
        (clientProfile as any)?.productName || "",
        (clientProfile as any)?.productService || "",
        input.objective || "",
        input.mediaFormat || "",
        input.extraContext || "",
      ].filter(Boolean).join(" ");
      const readiness = evaluateCampaignBriefingReadiness(input, clientProfile);
      if (readiness.status === "blocked") {
        return {
          content: [{
            type: "text",
            text:
              "Antes de gerar a campanha, colete as informações obrigatórias abaixo.\n\n" +
              formatBriefingReadinessText(readiness),
          }],
          structuredContent: readiness,
          isError: true,
        };
      }

      // ── TIMER COMEÇA ANTES do upload (inclui tempo total) ──────────────
      const totalRealImages = (input.uploadedImages?.length || 0) + (input.realPhotosBase64?.length || 0);
      const timeoutMs = Math.min(50_000 + totalRealImages * 4_000, 120_000);
      const startTime = Date.now();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          `A geração demorou mais que o esperado (>${Math.round(timeoutMs / 1000)}s). Verifique list_campaigns em alguns segundos — ela pode ter sido criada com sucesso mesmo assim.`
        )), timeoutMs)
      );

      // ── Sobe fotos reais em base64 pro Cloudinary ───────────────────────
      const uploadedFromUrl: string[] = [];
      const uploadedFromBase64: string[] = [];
      const visualLabelsSet = new Set<string>();
      const photoInsights: CampaignPhotoInsight[] = [];

      if (input.uploadedImages?.length) {
        const { analyzeImageWithVision } = await import("./imageRAG");
        for (let i = 0; i < input.uploadedImages.length; i++) {
          const url = String(input.uploadedImages[i] || "").trim();
          if (!/^https:\/\//i.test(url)) {
            return { content: [{ type: "text", text: `Foto por URL ${i + 1}/${input.uploadedImages.length} inválida: use uma URL HTTPS pública.` }], isError: true };
          }
          const downloaded = await fetchImageBuffer(url, 20000);
          if (!downloaded.ok || !downloaded.buffer) {
            return { content: [{ type: "text", text: `Falha ao baixar a foto ${i + 1}/${input.uploadedImages.length}: ${downloaded.error}` }], isError: true };
          }

          // Cache por SHA256
          const hash = crypto.createHash("sha256").update(downloaded.buffer).digest("hex");
          const cachedUrl = await getCachedImageUrl(hash);
          let cloudUrl: string | null = cachedUrl;
          if (!cloudUrl) {
            cloudUrl = await uploadImageBufferToCloudinary(
              downloaded.buffer,
              `campaign-photo-${input.projectId}-url-${i}-${Date.now()}.jpg`,
            );
            if (cloudUrl) await saveImageCache(hash, cloudUrl, `campaign-photo-url-${i}.jpg`, downloaded.buffer.length);
          }

          if (!cloudUrl) {
            return { content: [{ type: "text", text: `Falha ao subir a foto ${i + 1}/${input.uploadedImages.length} pro Cloudinary. Verifique as credenciais do Cloudinary no servidor.` }], isError: true };
          }
          uploadedFromUrl.push(cloudUrl);

          let vision: any = null;
          try {
            vision = await analyzeImageWithVision(cloudUrl);
            if (vision?.labels?.length) vision.labels.slice(0, 4).forEach((l: string) => visualLabelsSet.add(l));
            if (vision?.objects?.length) vision.objects.slice(0, 3).forEach((o: string) => visualLabelsSet.add(o));
          } catch {
            // Vision indisponível — segue sem labels dessa foto
          }
          const classified = classifyCampaignPhoto(vision, i, totalRealImages, segmentHint);
          photoInsights.push({
            url: cloudUrl,
            originalIndex: i,
            fileName: `url-${i + 1}.jpg`,
            role: classified.role,
            copyAngle: classified.copyAngle,
            labels: Array.isArray(vision?.labels) ? vision.labels.slice(0, 8) : [],
            objects: Array.isArray(vision?.objects) ? vision.objects.slice(0, 5) : [],
            textFound: vision?.text_found ? String(vision.text_found).slice(0, 160) : undefined,
            hasText: !!vision?.has_text,
            qualityScore: typeof vision?.quality_score === "number" ? vision.quality_score : null,
          });
        }
      }

      if (input.realPhotosBase64?.length) {
        const { analyzeImageWithVision } = await import("./imageRAG");
        for (let i = 0; i < input.realPhotosBase64.length; i++) {
          const photo = input.realPhotosBase64[i];
          const decoded = decodeAndValidateImage(photo.imageBase64);
          if (!decoded.ok || !decoded.buffer) {
            return { content: [{ type: "text", text: `Foto ${i + 1}/${input.realPhotosBase64.length} (${photo.fileName || "sem nome"}) inválida: ${decoded.error}` }], isError: true };
          }

          // Cache por SHA256
          const hash = crypto.createHash("sha256").update(decoded.buffer).digest("hex");
          const cachedUrl = await getCachedImageUrl(hash);
          let cloudUrl: string | null = cachedUrl;
          if (!cloudUrl) {
            cloudUrl = await uploadImageBufferToCloudinary(
              decoded.buffer,
              photo.fileName || `campaign-photo-${input.projectId}-${i}-${Date.now()}.jpg`,
            );
            if (cloudUrl) await saveImageCache(hash, cloudUrl, photo.fileName || `campaign-photo-${i}.jpg`, decoded.buffer.length);
          }

          if (!cloudUrl) {
            return { content: [{ type: "text", text: `Falha ao subir a foto ${i + 1}/${input.realPhotosBase64.length} pro Cloudinary. Verifique as credenciais do Cloudinary no servidor.` }], isError: true };
          }
          uploadedFromBase64.push(cloudUrl);

          let vision: any = null;
          try {
            vision = await analyzeImageWithVision(cloudUrl);
            if (vision?.labels?.length) vision.labels.slice(0, 4).forEach((l: string) => visualLabelsSet.add(l));
            if (vision?.objects?.length) vision.objects.slice(0, 3).forEach((o: string) => visualLabelsSet.add(o));
          } catch {
            // Vision indisponível — segue sem labels
          }
          const originalIndex = (input.uploadedImages?.length || 0) + i;
          const classified = classifyCampaignPhoto(vision, originalIndex, totalRealImages, segmentHint);
          photoInsights.push({
            url: cloudUrl,
            originalIndex,
            fileName: photo.fileName || `base64-${i + 1}.jpg`,
            role: classified.role,
            copyAngle: classified.copyAngle,
            labels: Array.isArray(vision?.labels) ? vision.labels.slice(0, 8) : [],
            objects: Array.isArray(vision?.objects) ? vision.objects.slice(0, 5) : [],
            textFound: vision?.text_found ? String(vision.text_found).slice(0, 160) : undefined,
            hasText: !!vision?.has_text,
            qualityScore: typeof vision?.quality_score === "number" ? vision.quality_score : null,
          });
        }
      }

      const orderedPhotoInsights = orderCampaignPhotoInsights(photoInsights, input.featuredPhotoIndex, input.photoOrder, segmentHint);
      const allRealImages = orderedPhotoInsights.length
        ? orderedPhotoInsights.map((photo) => photo.url)
        : [...uploadedFromUrl, ...uploadedFromBase64];
      const visualLabels = Array.from(visualLabelsSet).slice(0, 8);

      const { generateCampaign } = await import("./ai");
      const segmentContext = [
        input.extraContext || "",
        (input.regions?.length)   ? "Regioes: " + input.regions.join(", ")                         : "",
        (input.countries?.length) ? "Paises: "  + input.countries.join(", ")                       : "",
        input.geoCity             ? "Raio de "  + (input.geoRadius || 15) + "km em " + input.geoCity : "",
        (input.ageMin && input.ageMax) ? "Faixa etaria: " + input.ageMin + "-" + input.ageMax + " anos" : "",
        (input.mediaFormat && input.mediaFormat !== "mixed") ? "Formato de midia: " + input.mediaFormat : "",
      ].filter(Boolean).join(". ");

      const campaignPromise = generateCampaign({
        projectId: input.projectId, userId, name: input.name, objective: input.objective,
        platform: input.platform, budget: input.budget, duration: input.duration,
        extraContext: segmentContext, ageMin: input.ageMin, ageMax: input.ageMax,
        regions: input.regions, countries: input.countries, locationMode: input.locationMode,
        geoCity: input.geoCity, geoRadius: input.geoRadius, mediaFormat: input.mediaFormat,
        realImages: allRealImages.length ? allRealImages : undefined,
        photoInsights: orderedPhotoInsights.length ? orderedPhotoInsights : undefined,
        visualLabels: visualLabels.length ? visualLabels : undefined,
        numCreatives: input.numCreatives,
      } as any);

      try {
        const campaign: any = await Promise.race([campaignPromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;
        return {
          content: [{ type: "text", text: `Campanha gerada: "${campaign.name || input.name}" (id: ${campaign.id}) no projeto ${project.name}. Tempo total: ${Math.round(elapsed/1000)}s. Ainda não publicada na Meta.` }],
          structuredContent: {
            id: campaign.id,
            name: campaign.name || input.name,
            projectId: input.projectId,
            photoOrder: orderedPhotoInsights.map((photo) => photo.originalIndex),
            featuredPhotoIndex: orderedPhotoInsights[0]?.originalIndex ?? null,
            photoInsights: orderedPhotoInsights,
          },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message || "Falha ao gerar a campanha." }], isError: true };
      }
    }
  );

  // ── upload_creative_image (individual) ─────────────────────────────────
  server.registerTool(
    "upload_creative_image",
    {
      title: "Enviar imagem manual pra um criativo",
      description:
        "Substitui a imagem gerada por IA de um criativo específico da " +
        "campanha por uma imagem enviada manualmente (ex: foto real do " +
        "cliente). Sobe a imagem pro Cloudinary e atualiza o rascunho da " +
        "campanha — não publica nada na Meta. Chame get_campaign antes pra " +
        "saber o creativeIndex certo. Informe imageBase64 OU fileUrl (nunca " +
        "os dois) — fileUrl é preferível quando a imagem já está hospedada " +
        "em algum lugar acessível, pois evita payload grande.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (de get_campaign/list_campaigns)."),
        creativeIndex: z.number().int().min(0).describe("Índice do criativo dentro da campanha (0 = primeiro)."),
        format: z.enum(["feed", "stories", "square"]).describe(
          "Formato/aspect ratio de destino: feed (4:5), stories (9:16) ou square (1:1). " +
          "Uma mesma foto normalmente não serve pros 3 formatos sem cortar errado — " +
          "confirme com o usuário qual formato ele quer trocar."
        ),
        imageBase64: z.string().optional().describe(
          "Conteúdo da imagem em base64 (com ou sem prefixo data:image/...;base64,). " +
          "Use isso OU fileUrl, não os dois."
        ),
        fileUrl: z.string().url().optional().describe(
          "URL pública HTTPS de onde baixar a imagem (preferível a imageBase64 " +
          "quando disponível — evita payload grande, especialmente com várias " +
          "imagens). Use isso OU imageBase64, não os dois."
        ),
        fileName: z.string().describe("Nome do arquivo, com extensão (ex: foto-cliente.jpg)."),
      },
    },
    async ({ campaignId, creativeIndex, format, imageBase64, fileUrl, fileName }) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);

      const campaign: any = await db.getCampaignById(campaignId);
      if (!campaign) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(campaign.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const creatives = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();
      if (!creatives[creativeIndex]) {
        return { content: [{ type: "text", text: `Criativo de índice ${creativeIndex} não existe nessa campanha (ela tem ${creatives.length}).` }], isError: true };
      }

      if (!imageBase64 && !fileUrl) {
        return { content: [{ type: "text", text: "Informe imageBase64 ou fileUrl." }], isError: true };
      }
      if (imageBase64 && fileUrl) {
        return { content: [{ type: "text", text: "Informe apenas um: imageBase64 OU fileUrl, não os dois." }], isError: true };
      }

      let buffer: Buffer;
      if (fileUrl) {
        const result = await fetchImageBuffer(fileUrl, 15000);
        if (!result.ok) {
          return { content: [{ type: "text", text: result.error }], isError: true };
        }
        buffer = result.buffer;
      } else {
        const decoded = decodeAndValidateImage(imageBase64!);
        if (!decoded.ok || !decoded.buffer) {
          return { content: [{ type: "text", text: decoded.error || "Imagem inválida." }], isError: true };
        }
        buffer = decoded.buffer;
      }

      const cloudUrl = await uploadImageBufferToCloudinary(buffer, fileName || `manual-${campaignId}-${creativeIndex}-${Date.now()}.jpg`);
      if (!cloudUrl) {
        return { content: [{ type: "text", text: "Falha ao subir a imagem pro Cloudinary. Verifique as credenciais do Cloudinary no servidor." }], isError: true };
      }

      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
      try {
        const result: any = await caller.campaigns.updateCreativeImage({
          campaignId, creativeIndex, format, imageUrl: cloudUrl,
        } as any);
        return {
          content: [{ type: "text", text: `✅ Imagem do criativo ${creativeIndex} (${format}) atualizada com sucesso.\nURL: ${cloudUrl}` }],
          structuredContent: { ok: true, imageUrl: cloudUrl, creativeIndex, format, creative: result?.creative ?? null },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Upload pro Cloudinary funcionou, mas falhou ao salvar no criativo: ${e.message}` }], isError: true };
      }
    }
  );

  // ── upload_campaign_images (lote — schema limpo, sem passthrough) ──────
  const uploadCampaignImagesInputSchema = {
    campaignId: z.number().int().positive()
      .describe("ID da campanha onde as imagens serão inseridas."),
    images: z.array(
      z.object({
        fileUrl: z.string().optional()
          .describe("URL HTTPS pública da imagem. Preferível a base64."),
        url: z.string().optional()
          .describe("Alias de fileUrl — mesmo comportamento."),
        imageUrl: z.string().optional()
          .describe("Alias de fileUrl — mesmo comportamento."),
        downloadUrl: z.string().optional()
          .describe("Alias de fileUrl — mesmo comportamento."),
        imageBase64: z.string().optional()
          .describe("Imagem em base64 (com ou sem prefixo data:image/...;base64,). Use isso OU fileUrl."),
        base64: z.string().optional()
          .describe("Alias de imageBase64 — mesmo comportamento."),
        dataUrl: z.string().optional()
          .describe("Alias de imageBase64 — mesmo comportamento."),
        bytes: z.string().optional()
          .describe("Alias de imageBase64 — bytes/base64 reais da imagem."),
        content: z.string().optional()
          .describe("Alias de imageBase64 — conteúdo/base64 real da imagem."),
        data: z.string().optional()
          .describe("Alias de imageBase64 — dados/base64 reais da imagem."),
        fileName: z.string().optional()
          .describe("Nome do arquivo com extensão (ex: foto.jpg). Se omitido, gera um nome automático."),
        name: z.string().optional()
          .describe("Alias de fileName — mesmo comportamento."),
        creativeIndex: z.number().int().min(0).optional()
          .describe("Índice do criativo a substituir. Se omitido, usa a posição da imagem no array (0, 1, 2...)."),
        format: z.enum(["feed", "stories", "square"]).default("feed")
          .describe("Formato de destino: feed (4:5), stories (9:16) ou square (1:1)."),
        formats: z.array(z.enum(["feed", "stories", "square"])).optional()
          .describe("Array de formatos — envia a MESMA imagem em múltiplos formatos de uma vez (ex: ['feed','stories'])."),
        file: z.object({
          url: z.string().optional().describe("URL da imagem dentro do objeto file."),
          imageUrl: z.string().optional().describe("Alias de url dentro do file."),
          downloadUrl: z.string().optional().describe("Alias de url dentro do file."),
          imageBase64: z.string().optional().describe("Base64 da imagem dentro do objeto file."),
          base64: z.string().optional().describe("Alias de imageBase64 dentro do file."),
          dataUrl: z.string().optional().describe("Alias de imageBase64 dentro do file."),
          bytes: z.string().optional().describe("Alias de imageBase64 dentro do file."),
          content: z.string().optional().describe("Alias de imageBase64 dentro do file."),
          data: z.string().optional().describe("Alias de imageBase64 dentro do file."),
          fileName: z.string().optional().describe("Nome do arquivo dentro do objeto file."),
          name: z.string().optional().describe("Alias de fileName dentro do objeto file."),
        }).optional()
          .describe("Objeto aninhado com os mesmos campos do nível raiz. Alguns clientes MCP enviam anexos neste formato."),
      })
    ).min(1).max(10)
      .describe("Array de 1 a 10 imagens a enviar. Cada item pode usar fileUrl OU imageBase64 (nunca ambos)."),
  };

  const uploadCampaignImagesToolConfig = {
    title: "Enviar várias imagens para uma campanha",
    description:
      "Envia várias fotos reais de uma só vez para os criativos da campanha. " +
      "Prefira enviar anexos como file.url/url/downloadUrl HTTPS pública/temporária baixável; " +
      "também aceita dataUrl/base64/imageBase64/bytes/content/data reais. Não envie referências internas " +
      "como /mnt/data, sandbox:, blob: ou attachment:, porque o servidor MecProAI não consegue ler o filesystem do cliente. " +
      "Use 'formats' para enviar a mesma imagem em múltiplos formatos (feed + stories) de uma vez.",
    inputSchema: uploadCampaignImagesInputSchema,
  };

  async function uploadCampaignImagesHandler({ campaignId, images }: {
    campaignId: number;
    images: McpUploadImageInput[];
  }) {
    if (!hasScope(scope, "write")) {
      return scopeErrorContent("write", scope);
    }
    log.info("mcp-upload-images", "batch start", { userId, campaignId, total: images.length });

    const campaign: any = await db.getCampaignById(campaignId);
    if (!campaign) {
      log.warn("mcp-upload-images", "campaign not found", { userId, campaignId });
      return {
        content: [{ type: "text" as const, text: `Campanha ${campaignId} não encontrada.` }],
        isError: true,
      };
    }

    const project: any = await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) {
      log.warn("mcp-upload-images", "campaign ownership denied", { userId, campaignId, projectId: campaign.projectId });
      return {
        content: [{ type: "text" as const, text: `Campanha ${campaignId} não pertence a este usuário.` }],
        isError: true,
      };
    }

    const creatives = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();

    let caller;
    try {
      caller = await getCaller();
    } catch (error: any) {
      log.error("mcp-upload-images", "prepare caller failed", { userId, campaignId, total: images.length, error: error?.message });
      return {
        content: [{
          type: "text" as const,
          text: "Conector MECProAI disponível, mas falhou ao preparar o contexto interno antes do upload. " +
            `Detalhe: ${error?.message || "erro desconhecido"}`,
        }],
        structuredContent: {
          campaignId, successCount: 0, total: images.length,
          errorType: "connector_runtime", stage: "prepare_trpc_caller",
        },
        isError: true,
      };
    }

    async function processOne(image: (typeof images)[number], index: number) {
      const creativeIndex = image.creativeIndex !== undefined ? image.creativeIndex : index;

      // ── VALIDAÇÃO DE creativeIndex ANTES de baixar/validar imagem ──────
      if (!creatives[creativeIndex]) {
        log.warn("mcp-upload-images", "creative not found", { userId, campaignId, index, creativeIndex, creativesCount: creatives.length });
        return {
          index, creativeIndex, success: false,
          errorType: "campaign_validation", stage: "creative_lookup",
          error: `Criativo de índice ${creativeIndex} não existe (campanha tem ${creatives.length} criativos).`,
        };
      }

      const normalized = normalizeUploadImageInput(image, index);
      if (normalized.error) {
        log.warn("mcp-upload-images", "attachment normalize failed", {
          userId, campaignId, index, creativeIndex,
          error: normalized.error.slice(0, 240),
        });
        return {
          index, creativeIndex, success: false,
          errorType: "payload_validation", stage: "normalize_attachment",
          error: normalized.error,
        };
      }

      try {
        let buffer: Buffer;

        if (normalized.fileUrl) {
          log.info("mcp-upload-images", "fetching image url", { userId, campaignId, index, creativeIndex, fileName: normalized.fileName.slice(0, 120) });
          const result = await fetchImageBuffer(normalized.fileUrl, 20000);
          if (!result.ok) {
            log.warn("mcp-upload-images", "fetch image url failed", { userId, campaignId, index, creativeIndex, error: result.error.slice(0, 240) });
            return {
              index, creativeIndex, success: false,
              errorType: "file_download", stage: "fetch_file_url",
              error: result.error,
            };
          }
          buffer = result.buffer;
        } else {
          log.info("mcp-upload-images", "decoding image base64", { userId, campaignId, index, creativeIndex, fileName: normalized.fileName.slice(0, 120) });
          const decoded = decodeAndValidateImage(normalized.imageBase64!);
          if (!decoded.ok || !decoded.buffer) {
            log.warn("mcp-upload-images", "decode image base64 failed", { userId, campaignId, index, creativeIndex, error: (decoded.error || "Imagem inválida").slice(0, 240) });
            return {
              index, creativeIndex, success: false,
              errorType: "payload_validation", stage: "decode_image_base64",
              error: decoded.error || "Imagem inválida",
            };
          }
          buffer = decoded.buffer;
        }

        // ── Cache por SHA256 ──────────────────────────────────────────────
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        const cachedUrl = await getCachedImageUrl(hash);
        let cloudUrl: string | null = cachedUrl;

        if (!cloudUrl) {
          log.info("mcp-upload-images", "uploading to cloudinary", {
            userId, campaignId, index, creativeIndex,
            sourceKind: normalized.sourceKind, bytes: buffer.byteLength,
            fileName: normalized.fileName.slice(0, 120),
          });
          cloudUrl = await uploadImageBufferToCloudinary(buffer, normalized.fileName);
          if (cloudUrl) await saveImageCache(hash, cloudUrl, normalized.fileName, buffer.byteLength);
        } else {
          log.info("mcp-upload-images", "cache hit — reusing cloudinary url", { userId, campaignId, index, creativeIndex, hash: hash.slice(0, 16) });
        }

        if (!cloudUrl) {
          log.error("mcp-upload-images", "cloudinary upload failed", { userId, campaignId, index, creativeIndex, bytes: buffer.byteLength });
          return {
            index, creativeIndex, success: false,
            errorType: "cloudinary_upload", stage: "upload_cloudinary",
            error: "Falha no upload para Cloudinary",
          };
        }

        // ── Aplica em TODOS os formatos solicitados ───────────────────────
        const appliedFormats: string[] = [];
        const failedFormats: string[] = [];

        for (const fmt of normalized.formats) {
          try {
            log.info("mcp-upload-images", "updating creative image", { userId, campaignId, index, creativeIndex, format: fmt });
            await caller.campaigns.updateCreativeImage({
              campaignId, creativeIndex, format: fmt, imageUrl: cloudUrl,
            } as any);
            appliedFormats.push(fmt);
          } catch (error: any) {
            log.error("mcp-upload-images", "creative update failed", { userId, campaignId, index, creativeIndex, format: fmt, error: error?.message });
            failedFormats.push(fmt);
          }
        }

        if (appliedFormats.length === 0) {
          return {
            index, creativeIndex, success: false,
            errorType: "creative_update", stage: "save_creative_image",
            imageUrl: cloudUrl,
            error: `Upload feito, mas falhou ao salvar em todos os formatos: ${failedFormats.join(", ")}`,
          };
        }

        return {
          index, creativeIndex, success: true,
          imageUrl: cloudUrl,
          formatsApplied: appliedFormats,
          formatsFailed: failedFormats.length ? failedFormats : undefined,
        };
      } catch (error: any) {
        log.error("mcp-upload-images", "process image unexpected error", { userId, campaignId, index, creativeIndex, error: error?.message });
        return {
          index, creativeIndex, success: false,
          errorType: "unexpected", stage: "process_image",
          error: error?.message || "Erro desconhecido",
        };
      }
    }

    const settled = await Promise.allSettled(
      images.map((image, i) => processOne(image, i))
    );

    const results = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            index: i, creativeIndex: images[i].creativeIndex ?? i,
            success: false, errorType: "unexpected", stage: "promise_settlement",
            error: r.reason?.message || "Erro desconhecido",
          }
    );

    const successCount = results.filter(r => r.success).length;
    const failedByType = results.reduce<Record<string, number>>((acc, result: any) => {
      if (!result.success) {
        const type = result.errorType || "unknown";
        acc[type] = (acc[type] || 0) + 1;
      }
      return acc;
    }, {});
    const firstError = results.find((r: any) => !r.success);

    // ── Texto amigável com URLs no content.text ──────────────────────────
    const successLines = results
      .filter((r: any) => r.success)
      .map((r: any) => `✅ Criativo ${r.creativeIndex}: ${r.imageUrl} (formatos: ${r.formatsApplied?.join(", ") || "feed"})`);
    const errorLines = results
      .filter((r: any) => !r.success)
      .map((r: any) => `❌ Criativo ${r.creativeIndex}: ${r.error}`);

    const textParts = [
      `${successCount}/${images.length} imagens enviadas para a campanha ${campaignId}.`,
      ...(successLines.length ? ["", "Imagens enviadas:", ...successLines] : []),
      ...(errorLines.length ? ["", "Falhas:", ...errorLines] : []),
    ];

    log.info("mcp-upload-images", "batch done", {
      userId, campaignId, successCount, total: images.length,
      failedByType, firstErrorType: firstError?.errorType || null,
    });

    return {
      content: [{ type: "text" as const, text: textParts.join("\n") }],
      structuredContent: {
        campaignId, successCount, total: images.length,
        images: results.map((r: any) => ({
          creativeIndex: r.creativeIndex,
          success: r.success,
          imageUrl: r.imageUrl || null,
          formatsApplied: r.formatsApplied || null,
          errorType: r.errorType || null,
          stage: r.stage || null,
          error: r.error || null,
        })),
      },
      isError: successCount === 0,
    };
  }

  server.registerTool("upload_campaign_images", uploadCampaignImagesToolConfig, uploadCampaignImagesHandler);
  server.registerTool("MECPROAI.upload_campaign_images", {
    ...uploadCampaignImagesToolConfig,
    title: "Enviar várias imagens para uma campanha (alias MECPROAI)",
  }, uploadCampaignImagesHandler);
  server.registerTool("mecproai.upload_campaign_images", {
    ...uploadCampaignImagesToolConfig,
    title: "Enviar várias imagens para uma campanha (alias mecproai)",
  }, uploadCampaignImagesHandler);

  // ── NOVA TOOL: upload_image (genérica) ─────────────────────────────────
  server.registerTool(
    "upload_image",
    {
      title: "Subir imagem genérica pro Cloudinary",
      description:
        "Sobe uma imagem pro Cloudinary e retorna a URL pública permanente. " +
        "Use quando precisar de uma imagem disponível para uso futuro, sem " +
        "vincular imediatamente a um criativo específico. Aceita fileUrl OU " +
        "imageBase64 (nunca ambos).",
      inputSchema: {
        fileUrl: z.string().url().optional()
          .describe("URL HTTPS pública da imagem a baixar e subir."),
        imageBase64: z.string().optional()
          .describe("Imagem em base64 (com ou sem prefixo data:image/...;base64,)."),
        fileName: z.string().optional()
          .describe("Nome do arquivo com extensão. Se omitido, gera automaticamente."),
      },
    },
    async ({ fileUrl, imageBase64, fileName }) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);

      if (!fileUrl && !imageBase64) {
        return { content: [{ type: "text", text: "Informe fileUrl ou imageBase64." }], isError: true };
      }
      if (fileUrl && imageBase64) {
        return { content: [{ type: "text", text: "Informe apenas um: fileUrl OU imageBase64." }], isError: true };
      }

      let buffer: Buffer;
      if (fileUrl) {
        const result = await fetchImageBuffer(fileUrl, 20000);
        if (!result.ok) return { content: [{ type: "text", text: result.error }], isError: true };
        buffer = result.buffer;
      } else {
        const decoded = decodeAndValidateImage(imageBase64!);
        if (!decoded.ok || !decoded.buffer) {
          return { content: [{ type: "text", text: decoded.error || "Imagem inválida." }], isError: true };
        }
        buffer = decoded.buffer;
      }

      // Cache por SHA256
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const cachedUrl = await getCachedImageUrl(hash);
      if (cachedUrl) {
        return {
          content: [{ type: "text", text: `✅ Imagem já existia no cache.\nURL: ${cachedUrl}\nTamanho: ${buffer.byteLength} bytes` }],
          structuredContent: { imageUrl: cachedUrl, cached: true, bytes: buffer.byteLength },
        };
      }

      const finalFileName = fileName || `upload-${Date.now()}.jpg`;
      const cloudUrl = await uploadImageBufferToCloudinary(buffer, finalFileName);
      if (!cloudUrl) {
        return { content: [{ type: "text", text: "Falha ao subir a imagem pro Cloudinary." }], isError: true };
      }

      await saveImageCache(hash, cloudUrl, finalFileName, buffer.byteLength);

      return {
        content: [{ type: "text", text: `✅ Imagem subida com sucesso.\nURL: ${cloudUrl}\nTamanho: ${buffer.byteLength} bytes` }],
        structuredContent: { imageUrl: cloudUrl, cached: false, bytes: buffer.byteLength, fileName: finalFileName },
      };
    }
  );

  // ── set_featured_photo ────────────────────────────────────────────────
  const setFeaturedPhotoToolConfig = {
    title: "Definir foto destaque da campanha",
    description:
      "Marca um criativo/foto como destaque/capa da campanha. Use depois de " +
      "upload_campaign_images e antes de publish_campaign. Não publica nada na Meta.",
    inputSchema: {
      campaignId: z.number().int().positive().describe("ID da campanha."),
      creativeIndex: z.number().int().min(0).describe("Índice da foto/criativo que deve ser destaque (0 = primeira)."),
    },
  };

  async function setFeaturedPhotoHandler({ campaignId, creativeIndex }: {
    campaignId: number;
    creativeIndex: number;
  }) {
    if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);

    const campaign: any = await db.getCampaignById(campaignId);
    if (!campaign) {
      return { content: [{ type: "text" as const, text: `Campanha ${campaignId} não encontrada.` }], isError: true };
    }
    const project: any = await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) {
      return { content: [{ type: "text" as const, text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
    }

    let caller;
    try {
      caller = await getCaller();
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `Falha ao preparar contexto interno: ${error?.message || "erro desconhecido"}` }],
        structuredContent: { campaignId, creativeIndex, errorType: "connector_runtime", stage: "prepare_trpc_caller" },
        isError: true,
      };
    }

    try {
      const result: any = await caller.campaigns.setFeaturedPhoto({ campaignId, creativeIndex } as any);
      log.info("mcp-upload-images", "featured photo set", { userId, campaignId, creativeIndex });
      return {
        content: [{ type: "text" as const, text: `✅ Foto destaque definida: criativo ${creativeIndex} da campanha ${campaignId}.` }],
        structuredContent: { ok: true, campaignId, creativeIndex, result },
      };
    } catch (error: any) {
      log.error("mcp-upload-images", "set featured photo failed", { userId, campaignId, creativeIndex, error: error?.message });
      return {
        content: [{ type: "text" as const, text: `Falha ao definir foto destaque: ${error?.message || "erro desconhecido"}` }],
        structuredContent: { campaignId, creativeIndex, errorType: "creative_update", stage: "set_featured_photo" },
        isError: true,
      };
    }
  }

  server.registerTool("set_featured_photo", setFeaturedPhotoToolConfig, setFeaturedPhotoHandler);
  server.registerTool("MECPROAI.set_featured_photo", {
    ...setFeaturedPhotoToolConfig,
    title: "Definir foto destaque da campanha (alias MECPROAI)",
  }, setFeaturedPhotoHandler);
  server.registerTool("mecproai.set_featured_photo", {
    ...setFeaturedPhotoToolConfig,
    title: "Definir foto destaque da campanha (alias mecproai)",
  }, setFeaturedPhotoHandler);

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 — publicação real na Meta
  // ═══════════════════════════════════════════════════════════════════════

  server.registerTool(
    "list_meta_pages",
    {
      title: "Listar Páginas do Facebook conectadas",
      description:
        "Lista as Páginas do Facebook que a conta Meta do usuário tem acesso — " +
        "necessário pra saber qual pageId usar em publish_campaign. Chame isso " +
        "antes de publicar, se o usuário não souber o pageId de cor.",
      inputSchema: {},
    },
    async () => {
      if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
      const integration: any = await db.getApiIntegration(userId, "meta");
      if (!integration?.accessToken) {
        return { content: [{ type: "text", text: "Conta Meta não conectada. Acesse Configurações → Meta Ads no MecProAI primeiro." }], isError: true };
      }
      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/me/accounts?fields=id,name&limit=50&access_token=${integration.accessToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const data: any = await res.json();
        if (data.error) {
          return { content: [{ type: "text", text: `Erro ao buscar páginas: ${data.error.message}` }], isError: true };
        }
        const pages = (data.data || []).map((p: any) => ({ pageId: p.id, name: p.name }));
        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
          structuredContent: { pages },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao consultar a Meta: ${e.message}` }], isError: true };
      }
    }
  );

  const listLeadFormsToolConfig = {
    title: "Listar formularios instantaneos Meta",
    description:
      "Lista os formularios instantaneos de uma Pagina do Facebook. Use antes " +
      "de publicar com destination='lead_form' para reaproveitar um formulario " +
      "existente quando fizer sentido.",
    inputSchema: {
      pageId: z.string().trim().min(1).describe("ID da Pagina do Facebook."),
    },
  };

  async function listLeadFormsHandler({ pageId }: { pageId: string }) {
    if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
    try {
      const caller = await getCaller();
      const forms = await caller.integrations.listLeadForms({ pageId } as any);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(forms, null, 2) }],
        structuredContent: { pageId, forms },
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Falha ao listar formularios: ${e?.message || "erro desconhecido"}` }], isError: true };
    }
  }

  server.registerTool("list_lead_forms", listLeadFormsToolConfig, listLeadFormsHandler);
  server.registerTool("MECPROAI.list_lead_forms", {
    ...listLeadFormsToolConfig,
    title: "Listar formularios instantaneos Meta (alias MECPROAI)",
  }, listLeadFormsHandler);
  server.registerTool("mecproai.list_lead_forms", {
    ...listLeadFormsToolConfig,
    title: "Listar formularios instantaneos Meta (alias mecproai)",
  }, listLeadFormsHandler);

  const createLeadFormToolConfig = {
    title: "Criar formulario instantaneo Meta",
    description:
      "Cria um formulario instantaneo padrao na Pagina do Facebook para " +
      "campanhas de leads. Use quando o usuario pedir formulario ou quando a " +
      "campanha for de lead_form e ainda nao existir leadGenFormId. Depois passe " +
      "o id retornado para publish_campaign.",
    inputSchema: {
      pageId: z.string().trim().min(1).describe("ID da Pagina do Facebook."),
      name: z.string().trim().min(1).describe("Nome do formulario."),
      fields: z.array(z.string()).optional().describe("Campos Meta. Padrao: FULL_NAME, EMAIL, PHONE."),
      customQuestion: z.string().optional().describe("Pergunta personalizada, ex: 'Qual tipo de imovel voce procura?'"),
      thankYouMessage: z.string().optional().describe("Mensagem de obrigado apos envio."),
      privacyUrl: z.string().trim().min(1).describe("URL da politica de privacidade."),
    },
  };

  async function createLeadFormHandler(input: {
    pageId: string;
    name: string;
    fields?: string[];
    customQuestion?: string;
    thankYouMessage?: string;
    privacyUrl: string;
  }) {
    if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
    try {
      const caller = await getCaller();
      const form = await caller.integrations.createLeadForm({
        pageId: input.pageId,
        name: input.name,
        fields: input.fields?.length ? input.fields : ["FULL_NAME", "EMAIL", "PHONE"],
        customQuestion: input.customQuestion,
        thankYouMessage: input.thankYouMessage,
        privacyUrl: input.privacyUrl,
      } as any);
      return {
        content: [{ type: "text" as const, text: `Formulario criado: ${JSON.stringify(form, null, 2)}` }],
        structuredContent: form as any,
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Falha ao criar formulario: ${e?.message || "erro desconhecido"}` }], isError: true };
    }
  }

  server.registerTool("create_lead_form", createLeadFormToolConfig, createLeadFormHandler);
  server.registerTool("MECPROAI.create_lead_form", {
    ...createLeadFormToolConfig,
    title: "Criar formulario instantaneo Meta (alias MECPROAI)",
  }, createLeadFormHandler);
  server.registerTool("mecproai.create_lead_form", {
    ...createLeadFormToolConfig,
    title: "Criar formulario instantaneo Meta (alias mecproai)",
  }, createLeadFormHandler);

  const updateLiveMetaCampaignToolConfig = {
    title: "Atualizar campanha ativa na Meta",
    description:
      "Atualiza uma campanha ja publicada na Meta Ads usando os IDs salvos no MecProAI. " +
      "Use apenas para ajustes seguros de campanha/ad set: status ACTIVE/PAUSED, orçamento diario, idade, localizacao/raio/cidades/estados e posicionamentos. " +
      "Nao troca fotos nem copy; para isso crie uma nova versao/anuncio, porque a Meta trata criativos publicados como objetos separados. " +
      "Sempre confirme explicitamente com o usuario antes de chamar, pois uma campanha ativa pode gastar orçamento real.",
    inputSchema: {
      campaignId: z.number().int().positive().describe("ID local da campanha no MecProAI, ex: 700."),
      confirmed: z.boolean().describe("Deve ser true somente depois de confirmacao explicita do usuario."),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Novo status da campanha na Meta."),
      dailyBudget: z.number().min(1).optional().describe("Novo orçamento diario em reais para o ad set."),
      adSetId: z.string().optional().describe("ID do ad set Meta. Se omitido, usa o metaAdSetId salvo na campanha ou o primeiro ad set encontrado na Meta."),
      placementMode: z.enum(["auto", "manual"]).optional().describe("auto para Advantage+ placements; manual para usar placements."),
      placements: z.array(z.string()).optional().describe("IDs internos: fb_feed, fb_story, fb_marketplace, fb_search, ig_feed, ig_story, ig_reels, ig_explore etc."),
      ageMin: z.number().min(13).max(65).optional(),
      ageMax: z.number().min(18).max(65).optional(),
      locationMode: z.enum(["brasil", "paises", "raio", "cidade"]).optional(),
      geoCity: z.string().optional().describe("Cidade/endereco para raio, ex: Balneario Camboriu, SC, Brasil."),
      geoRadius: z.number().min(1).max(80).optional().describe("Raio em km."),
      cities: z.array(z.string()).optional().describe("Cidades exatas no Brasil, ex: Balneario Camboriu."),
      regions: z.array(z.string()).optional().describe("Estados/UFs, ex: SC, PR."),
      countries: z.array(z.string()).optional().describe("Paises ISO, ex: BR."),
    },
  };

  async function updateLiveMetaCampaignHandler(input: {
    campaignId: number;
    confirmed: boolean;
    status?: "ACTIVE" | "PAUSED";
    dailyBudget?: number;
    adSetId?: string;
    placementMode?: "auto" | "manual";
    placements?: string[];
    ageMin?: number;
    ageMax?: number;
    locationMode?: "brasil" | "paises" | "raio" | "cidade";
    geoCity?: string;
    geoRadius?: number;
    cities?: string[];
    regions?: string[];
    countries?: string[];
  }) {
    if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
    if (!input.confirmed) {
      return {
        content: [{
          type: "text" as const,
          text: "Atualizacao bloqueada: confirme explicitamente com o usuario antes de mexer em campanha ativa na Meta e envie confirmed=true.",
        }],
        structuredContent: { errorType: "confirmation_required", campaignId: input.campaignId },
        isError: true,
      };
    }

    const campaign: any = await db.getCampaignById(input.campaignId);
    if (!campaign) {
      return { content: [{ type: "text" as const, text: `Campanha ${input.campaignId} nao encontrada.` }], isError: true };
    }
    const project: any = await db.getProjectById(campaign.projectId);
    if (!project || project.userId !== userId) {
      return { content: [{ type: "text" as const, text: `Campanha ${input.campaignId} nao pertence a este usuario.` }], isError: true };
    }

    const metaCampaignId = String(campaign.metaCampaignId || "").trim();
    if (!metaCampaignId) {
      return {
        content: [{ type: "text" as const, text: `Campanha ${input.campaignId} ainda nao tem metaCampaignId salvo. Publique primeiro ou recrie uma versao.` }],
        structuredContent: { errorType: "missing_meta_campaign_id", campaignId: input.campaignId },
        isError: true,
      };
    }

    let caller;
    try {
      caller = await getCaller();
    } catch (error: any) {
      return { content: [{ type: "text" as const, text: `Falha ao preparar contexto interno: ${error?.message || "erro desconhecido"}` }], isError: true };
    }

    const results: Array<{ action: string; success: boolean; error?: string; metaId?: string }> = [];
    let resolvedAdSetId = input.adSetId || String(campaign.metaAdSetId || "").trim();

    const needsAdSet =
      input.dailyBudget !== undefined ||
      input.placementMode !== undefined ||
      input.placements !== undefined ||
      input.ageMin !== undefined ||
      input.ageMax !== undefined ||
      input.locationMode !== undefined ||
      input.geoCity !== undefined ||
      input.geoRadius !== undefined ||
      input.cities !== undefined ||
      input.regions !== undefined ||
      input.countries !== undefined;

    if (needsAdSet && !resolvedAdSetId) {
      try {
        const details: any = await caller.metaCampaigns.details({ campaignId: metaCampaignId } as any);
        resolvedAdSetId = String(details?.adSets?.[0]?.id || "").trim();
      } catch (error: any) {
        results.push({ action: "resolve_adset", success: false, error: error?.message || "Nao foi possivel buscar ad sets da campanha." });
      }
    }

    if (input.status) {
      try {
        await caller.metaCampaigns.updateStatus({ campaignId: metaCampaignId, status: input.status } as any);
        await db.updateCampaign(input.campaignId, {
          updatedAt: new Date(),
        } as any).catch(() => {});
        results.push({ action: "status", success: true, metaId: metaCampaignId });
      } catch (error: any) {
        results.push({ action: "status", success: false, error: error?.message || "Erro ao atualizar status.", metaId: metaCampaignId });
      }
    }

    if (input.dailyBudget !== undefined) {
      if (!resolvedAdSetId) {
        results.push({ action: "budget", success: false, error: "Ad set Meta nao encontrado para atualizar orçamento." });
      } else {
        try {
          await caller.metaCampaigns.updateBudget({ adSetId: resolvedAdSetId, dailyBudget: input.dailyBudget } as any);
          await db.updateCampaign(input.campaignId, {
            suggestedBudgetDaily: input.dailyBudget,
            suggestedBudgetMonthly: Math.round(input.dailyBudget * 30),
            updatedAt: new Date(),
          } as any).catch(() => {});
          results.push({ action: "budget", success: true, metaId: resolvedAdSetId });
        } catch (error: any) {
          results.push({ action: "budget", success: false, error: error?.message || "Erro ao atualizar orçamento.", metaId: resolvedAdSetId });
        }
      }
    }

    const shouldUpdateTargeting =
      input.placementMode !== undefined ||
      input.placements !== undefined ||
      input.ageMin !== undefined ||
      input.ageMax !== undefined ||
      input.locationMode !== undefined ||
      input.geoCity !== undefined ||
      input.geoRadius !== undefined ||
      input.cities !== undefined ||
      input.regions !== undefined ||
      input.countries !== undefined;

    if (shouldUpdateTargeting) {
      if (!resolvedAdSetId) {
        results.push({ action: "targeting", success: false, error: "Ad set Meta nao encontrado para atualizar publico/localizacao." });
      } else {
        const placements = input.placements ?? [];
        const placementMode = input.placementMode ?? (placements.length > 0 ? "manual" : "auto");
        try {
          await caller.metaCampaigns.updateAdSetPlacements({
            adSetId: resolvedAdSetId,
            placements,
            placementMode,
            regions: input.regions,
            countries: input.countries,
            geoCity: input.geoCity,
            geoRadius: input.geoRadius,
            cities: input.cities,
            ageMin: input.ageMin,
            ageMax: input.ageMax,
            locationMode: input.locationMode,
          } as any);
          results.push({ action: "targeting", success: true, metaId: resolvedAdSetId });
        } catch (error: any) {
          results.push({ action: "targeting", success: false, error: error?.message || "Erro ao atualizar publico/localizacao.", metaId: resolvedAdSetId });
        }
      }
    }

    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Nenhuma alteracao enviada. Informe status, dailyBudget, idade, localizacao ou posicionamentos." }],
        structuredContent: { campaignId: input.campaignId, metaCampaignId, metaAdSetId: resolvedAdSetId || null, results },
        isError: true,
      };
    }

    const successCount = results.filter((r) => r.success).length;
    const summary = results.map((r) =>
      r.success ? `OK ${r.action}${r.metaId ? ` (${r.metaId})` : ""}` : `FALHA ${r.action}: ${r.error || "erro desconhecido"}`
    ).join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `${successCount}/${results.length} ajuste(s) aplicado(s) na campanha Meta ${metaCampaignId}.\n\n${summary}`,
      }],
      structuredContent: { campaignId: input.campaignId, metaCampaignId, metaAdSetId: resolvedAdSetId || null, results },
      isError: successCount !== results.length,
    };
  }

  server.registerTool("update_live_meta_campaign", updateLiveMetaCampaignToolConfig, updateLiveMetaCampaignHandler);
  server.registerTool("MECPROAI.update_live_meta_campaign", {
    ...updateLiveMetaCampaignToolConfig,
    title: "Atualizar campanha ativa na Meta (alias MECPROAI)",
  }, updateLiveMetaCampaignHandler);
  server.registerTool("mecproai.update_live_meta_campaign", {
    ...updateLiveMetaCampaignToolConfig,
    title: "Atualizar campanha ativa na Meta (alias mecproai)",
  }, updateLiveMetaCampaignHandler);

  server.registerTool(
    "publish_campaign",
    {
      title: "Publicar campanha na Meta",
      description:
        "PUBLICA a campanha na Meta Ads DE VERDADE — a partir daqui, o orçamento " +
        "real do cliente começa a ser gasto. NUNCA chame isso sem confirmação " +
        "explícita do usuário sobre orçamento, página e público antes. Publica " +
        "todos os ad sets da campanha (ou só os índices indicados), reaproveitando " +
        "a mesma campanha na Meta entre eles. Usa as imagens já geradas pelo " +
        "generate_campaign — se houver 2+ imagens distintas nos criativos, publica " +
        "como carrossel automaticamente; não gera imagem nova.\n\n" +
        "IDEMPOTÊNCIA: sempre gere um idempotencyKey único (ex: UUID v4) na " +
        "primeira vez que chamar essa tool pra uma dada intenção de publicação, " +
        "e reenvie o MESMO valor se precisar repetir a chamada (timeout, erro " +
        "de rede, retry automático). Isso evita publicar a campanha duas vezes " +
        "e gastar orçamento em dobro. Nunca gere uma key nova só porque a " +
        "resposta demorou ou pareceu falhar — reenvie a key original.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha a publicar."),
        pageId: z.string().describe("ID da Página do Facebook (use list_meta_pages se não souber)."),
        destination: z.enum(["website", "lead_form"]).optional().describe("Padrão: website."),
        leadGenFormId: z.string().optional().describe("ID de um formulario instantaneo Meta ja existente. Obrigatorio para destination=lead_form publicar como formulario real."),
        linkUrl: z.string().optional().describe("URL de destino. Se omitido, tenta resolver automaticamente via WhatsApp/site da página."),
        adSetIndexes: z.array(z.number().int().min(0)).optional().describe("Quais ad sets publicar (por índice, começando em 0). Se omitido, publica todos."),
        idempotencyKey: z.string().min(8).max(200)
          .describe("Identificador único desta tentativa de publicação (ex: UUID v4). Reenvie o MESMO valor em caso de retry para evitar publicar a campanha duas vezes."),
      },
    },
    async (input) => {
      if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
      const campaign: any = await db.getCampaignById(input.campaignId);
      if (!campaign) {
        return { content: [{ type: "text", text: `Campanha ${input.campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(campaign.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${input.campaignId} não pertence a este usuário.` }], isError: true };
      }

      const requestKey = `publish_campaign:${input.idempotencyKey}`;
      let idempotency: Awaited<ReturnType<typeof db.reserveMcpIdempotencyKey>>;
      try {
        idempotency = await db.reserveMcpIdempotencyKey(userId, "publish_campaign", input.idempotencyKey);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao verificar idempotência: ${e.message}` }], isError: true };
      }

      if (idempotency.kind === "cached_result") {
        const cached = idempotency.result || {};
        return {
          content: [{
            type: "text",
            text: `[Resultado já processado anteriormente para esta idempotencyKey — nenhuma publicação nova foi feita]\n\n${cached.summaryText || JSON.stringify(cached, null, 2)}`,
          }],
          structuredContent: { ...cached, fromCache: true },
          isError: cached.isError === true,
        };
      }
      if (idempotency.kind === "duplicate_in_progress") {
        return {
          content: [{ type: "text", text: "Já existe uma publicação em andamento com essa mesma idempotencyKey. Aguarde ela terminar em vez de repetir a chamada — repetir agora pode causar condição de corrida." }],
          isError: true,
        };
      }
      const idempotencyRecordId = idempotency.recordId;

      const adSets: any[] = (() => { try { return JSON.parse(campaign.adSets || "[]"); } catch { return []; } })();
      const creatives: any[] = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();
      if (adSets.length === 0) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, "Campanha sem ad sets gerados.");
        return { content: [{ type: "text", text: "Essa campanha não tem ad sets gerados. Rode generate_campaign primeiro." }], isError: true };
      }

      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, e.message);
        return { content: [{ type: "text", text: e.message }], isError: true };
      }

      const copyAudit = auditCarouselCreatives(creatives);
      if (!copyAudit.ok) {
        const message =
          "Publicação bloqueada pela auditoria de carrossel: há cards com copy fraca, curta ou repetida. " +
          "Regere ou atualize os criativos antes de publicar na Meta.\n\n" +
          copyAudit.issues.map((issue) => `- ${issue}`).join("\n");
        await db.failMcpIdempotencyKey(idempotencyRecordId, message);
        return {
          content: [{ type: "text", text: message }],
          structuredContent: {
            errorType: "creative_copy_audit",
            stage: "pre_publish_carousel_copy_audit",
            issues: copyAudit.issues,
          },
          isError: true,
        };
      }

      const orderedCreatives = orderedCreativesForCarousel(creatives);
      const uniqueImages = Array.from(new Set(
        orderedCreatives
          .map((c: any) => getCreativeMedia(c))
          .filter((x: any) => x.hash || x.url)
          .map((x: any) => x.hash ? `hash:${x.hash}` : `url:${x.url}`)
      )).slice(0, 10);

      if (uniqueImages.length === 0) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, "Nenhuma imagem encontrada nos criativos.");
        return { content: [{ type: "text", text: "Nenhuma imagem encontrada nos criativos gerados — não é possível publicar sem imagem." }], isError: true };
      }

      async function resolveToHash(tagged: string): Promise<string> {
        if (tagged.startsWith("hash:")) return tagged.slice(5);
        const url = tagged.slice(4);
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const uploadResult: any = await caller.integrations.uploadImageToMeta({
          imageBase64: buf.toString("base64"),
          fileName: `campaign-${input.campaignId}-${Date.now()}.jpg`,
        } as any);
        return uploadResult.hash || uploadResult.imageHash;
      }

      let imageHash: string | undefined;
      let imageHashes: string[] | undefined;
      try {
        if (uniqueImages.length === 1) {
          imageHash = await resolveToHash(uniqueImages[0]);
        } else {
          imageHashes = await Promise.all(uniqueImages.map(resolveToHash));
        }
      } catch (e: any) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, `Falha ao enviar imagem(ns): ${e.message}`);
        return { content: [{ type: "text", text: `Falha ao enviar imagem(ns) pra Meta: ${e.message}` }], isError: true };
      }

      let linkUrl = input.linkUrl;
      if (!linkUrl) {
        try {
          const resolved: any = await caller.competitors.resolvePageLink({ pageId: input.pageId });
          linkUrl = resolved?.whatsappUrl || (resolved?.website ? (resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`) : undefined);
        } catch { /* segue sem link automático */ }
      }

      const NON_RETRYABLE_ERROR_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]);

      const indexesToPublish = input.adSetIndexes?.length ? input.adSetIndexes : adSets.map((_, i) => i);
      const results: { adSetName: string; success: boolean; error?: string; errorCode?: string; retryable?: boolean }[] = [];
      let sharedMetaCampaignId: string | undefined;

      for (const idx of indexesToPublish) {
        const adSetName = adSets[idx]?.name || `Conjunto ${idx + 1}`;
        try {
          const result: any = await caller.campaigns.publishToMeta({
            campaignId: input.campaignId,
            projectId: campaign.projectId,
            pageId: input.pageId,
            destination: input.destination || "website",
            leadGenFormId: input.leadGenFormId,
            linkUrl,
            imageHash,
            imageHashes,
            adSetIndex: idx,
            ...(sharedMetaCampaignId ? { existingMetaCampaignId: sharedMetaCampaignId } : {}),
          } as any);
          if (!sharedMetaCampaignId && result?.campaignId) sharedMetaCampaignId = result.campaignId;
          results.push({ adSetName, success: true });
        } catch (e: any) {
          const errorCode: string | undefined = e?.code;
          results.push({
            adSetName,
            success: false,
            error: e?.message || "Erro desconhecido ao publicar.",
            ...(errorCode ? { errorCode, retryable: !NON_RETRYABLE_ERROR_CODES.has(errorCode) } : {}),
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const summary = results.map(r => r.success ? `✅ ${r.adSetName}` : `❌ ${r.adSetName}: ${r.error}`).join("\n");
      const summaryText = `${successCount}/${results.length} ad set(s) publicado(s) na Meta.\n\n${summary}`;
      const isPartial = successCount > 0 && successCount < results.length;
      const failedSummary = results
        .filter(r => !r.success)
        .map(r => `${r.adSetName}: ${r.error}`)
        .join("\n");
      const finalPayload = {
        successCount,
        total: results.length,
        results,
        metaCampaignId: sharedMetaCampaignId,
        summaryText,
        status: successCount === results.length ? "success" : successCount === 0 ? "error" : "partial",
        isError: successCount !== results.length,
      };

      if (successCount !== results.length) {
        await db.updateCampaign(input.campaignId, {
          publishStatus: successCount === 0 ? "error" : "partial",
          publishError: failedSummary || "Publicação parcial na Meta.",
        } as any).catch(() => {});
      }

      await db.completeMcpIdempotencyKey(idempotencyRecordId, finalPayload);

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: { successCount, total: results.length, results, metaCampaignId: sharedMetaCampaignId, partial: isPartial },
        isError: successCount !== results.length,
      };
    }
  );

  return server;
}
