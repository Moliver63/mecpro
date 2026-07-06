/**
 * adAudit.ts — Sistema de auditoria e correção automática de criativos
 *
 * Valida e corrige automaticamente:
 * - Textos (headline, body, description, CTA)
 * - Imagens (dimensões, aspect ratio, formato)
 * - Payload Meta (campos obrigatórios, compatibilidade)
 * - Preview (renderização, overflow, encoding)
 */

import { z } from "zod";
import { log } from "./logger";

// ── Limites Meta Ads (mai/2026) ───────────────────────────────────────────────
export const META_LIMITS = {
  headline:    { min: 1,  max: 40  },
  primaryText: { min: 1,  max: 125 }, // acima de 125 é truncado no feed
  description: { min: 0,  max: 30  },
  ctaText:     { min: 1,  max: 25  },
  // Dimensões obrigatórias por formato
  images: {
    feed:    { width: 1080, height: 1080, ratio: "1:1",   minWidth: 600  },
    feed45:  { width: 1080, height: 1350, ratio: "4:5",   minWidth: 600  },
    stories: { width: 1080, height: 1920, ratio: "9:16",  minWidth: 500  },
    banner:  { width: 1200, height: 628,  ratio: "1.91:1",minWidth: 600  },
  },
  minBytes: 10_000,
  maxBytes: 30_000_000,
} as const;

// ── Tipos ────────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface AuditIssue {
  field:    string;
  severity: Severity;
  code:     string;
  message:  string;
  original: string;
  fixed?:   string;
}

export interface AuditResult {
  valid:           boolean;
  blockPublish:    boolean;
  issues:          AuditIssue[];
  correctedCopy:   CopyPayload;
  log:             string[];
}

export interface CopyPayload {
  headline:    string;
  primaryText: string;
  description: string;
  cta:         string;
}

// ── Schemas Zod ──────────────────────────────────────────────────────────────

export const headlineSchema = z
  .string()
  .min(1, "Headline não pode estar vazia")
  .max(META_LIMITS.headline.max, `Headline máx ${META_LIMITS.headline.max} chars`);

export const primaryTextSchema = z
  .string()
  .min(1, "Texto principal não pode estar vazio")
  .max(META_LIMITS.primaryText.max, `Texto principal máx ${META_LIMITS.primaryText.max} chars`);

export const descriptionSchema = z
  .string()
  .max(META_LIMITS.description.max, `Descrição máx ${META_LIMITS.description.max} chars`)
  .optional();

export const copyPayloadSchema = z.object({
  headline:    headlineSchema,
  primaryText: primaryTextSchema,
  description: descriptionSchema,
  cta:         z.string().min(1),
});

// ── Sanitização de texto ─────────────────────────────────────────────────────

function sanitizeText(raw: string): string {
  return raw
    .replace(/\u00A0/g, " ")           // non-breaking spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/\r\n|\r/g, "\n")         // normalize line endings
    .replace(/[ \t]+\n/g, "\n")        // trailing spaces
    .replace(/\n{3,}/g, "\n\n")        // max 2 consecutive newlines
    .replace(/[ \t]{2,}/g, " ")        // multiple spaces
    .trim();
}

function sanitizeHeadline(raw: string): string {
  return raw
    .replace(/[\n\r]/g, " ")           // headlines cannot have newlines
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[^\w\s\-àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇ!?.,'"():@#$%&*+\/]/g, "")
    .trim()
    .slice(0, META_LIMITS.headline.max);
}

function truncateSmart(text: string, max: number): string {
  if (text.length <= max) return text;
  // Tenta cortar em palavra
  const cut = text.lastIndexOf(" ", max - 3);
  return (cut > max * 0.6 ? text.slice(0, cut) : text.slice(0, max - 3)) + "...";
}

function ensureCTA(text: string, objective: string): string {
  const ctaMap: Record<string, string> = {
    leads:      "Saiba mais",
    sales:      "Comprar agora",
    traffic:    "Saiba mais",
    engagement: "Fale no WhatsApp",
    branding:   "Ver mais",
  };
  const hasCTA = /saiba|comprar|cadastr|falar|agendar|baixar|assinar|ver mais|whatsapp|clique|acesse|descubra|conheça/i.test(text);
  if (hasCTA) return text;
  const append = ctaMap[objective] || "Saiba mais";
  return text.slice(0, META_LIMITS.primaryText.max - append.length - 2) + "\n" + append;
}

// ── Auditoria de texto ───────────────────────────────────────────────────────

export function auditAndFixCopy(
  input: Partial<CopyPayload>,
  objective: string = "traffic",
): AuditResult {
  const issues: AuditIssue[] = [];
  const auditLog: string[] = [];
  let blockPublish = false;

  const orig = {
    headline:    String(input.headline    || "").trim(),
    primaryText: String(input.primaryText || input.headline || "").trim(),
    description: String(input.description || "").trim(),
    cta:         String(input.cta         || "").trim(),
  };

  // ── Headline ──────────────────────────────────────────────────────────────
  let headline = sanitizeHeadline(orig.headline);

  if (!headline) {
    issues.push({ field: "headline", severity: "critical", code: "HEADLINE_EMPTY",
      message: "Headline vazia — publicação bloqueada", original: orig.headline });
    blockPublish = true;
    headline = "Conheça nossa solução";
    auditLog.push(`[CRÍTICO] Headline vazia → gerado fallback: "${headline}"`);
  } else if (headline.length > META_LIMITS.headline.max) {
    const fixed = headline.slice(0, META_LIMITS.headline.max);
    issues.push({ field: "headline", severity: "warning", code: "HEADLINE_TOO_LONG",
      message: `Headline ${headline.length} chars > máx ${META_LIMITS.headline.max}`,
      original: orig.headline, fixed });
    headline = fixed;
    auditLog.push(`[AVISO] Headline truncada: ${orig.headline.length} → ${fixed.length} chars`);
  } else if (headline.length < 10) {
    issues.push({ field: "headline", severity: "warning", code: "HEADLINE_TOO_SHORT",
      message: `Headline muito curta (${headline.length} chars)`, original: orig.headline });
    auditLog.push(`[AVISO] Headline curta demais: "${headline}"`);
  }

  // ── Texto Principal ───────────────────────────────────────────────────────
  let primaryText = sanitizeText(orig.primaryText || orig.headline);

  if (!primaryText) {
    issues.push({ field: "primaryText", severity: "critical", code: "TEXT_EMPTY",
      message: "Texto principal vazio — publicação bloqueada", original: orig.primaryText });
    blockPublish = true;
    primaryText = headline;
    auditLog.push(`[CRÍTICO] Texto vazio → usando headline como fallback`);
  } else if (primaryText.length > META_LIMITS.primaryText.max) {
    const fixed = truncateSmart(primaryText, META_LIMITS.primaryText.max);
    issues.push({ field: "primaryText", severity: "warning", code: "TEXT_TOO_LONG",
      message: `Texto ${primaryText.length} chars > máx ${META_LIMITS.primaryText.max} (truncado no feed)`,
      original: orig.primaryText, fixed });
    primaryText = fixed;
    auditLog.push(`[AVISO] Texto truncado: ${orig.primaryText.length} → ${fixed.length} chars`);
  }

  // Verifica CTA no texto
  const textWithCTA = ensureCTA(primaryText, objective);
  if (textWithCTA !== primaryText) {
    issues.push({ field: "primaryText", severity: "info", code: "CTA_MISSING",
      message: "Texto sem CTA explícito — CTA adicionado automaticamente",
      original: primaryText, fixed: textWithCTA });
    primaryText = textWithCTA;
    auditLog.push(`[INFO] CTA ausente → adicionado automaticamente`);
  }

  // ── Descrição ─────────────────────────────────────────────────────────────
  let description = sanitizeText(orig.description);
  if (description.length > META_LIMITS.description.max) {
    const fixed = description.slice(0, META_LIMITS.description.max);
    issues.push({ field: "description", severity: "warning", code: "DESC_TOO_LONG",
      message: `Descrição ${description.length} chars > máx ${META_LIMITS.description.max}`,
      original: orig.description, fixed });
    description = fixed;
    auditLog.push(`[AVISO] Descrição truncada: ${orig.description.length} → ${fixed.length} chars`);
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  let cta = orig.cta || "Saiba mais";
  if (!cta) {
    issues.push({ field: "cta", severity: "warning", code: "CTA_EMPTY",
      message: "CTA vazio — usando padrão", original: orig.cta, fixed: "Saiba mais" });
    cta = "Saiba mais";
    auditLog.push(`[AVISO] CTA vazio → padrão "Saiba mais"`);
  }

  const correctedCopy: CopyPayload = { headline, primaryText, description, cta };

  // ── Validação Zod final ───────────────────────────────────────────────────
  const zodResult = copyPayloadSchema.safeParse(correctedCopy);
  if (!zodResult.success) {
    zodResult.error.errors.forEach(e => {
      issues.push({ field: e.path.join("."), severity: "critical",
        code: "ZOD_VALIDATION", message: e.message, original: "" });
      blockPublish = true;
    });
  }

  if (issues.length > 0) {
    log.info("ad-audit", `Auditoria de copy: ${issues.length} issues, blockPublish=${blockPublish}`, {
      headline: correctedCopy.headline.slice(0, 40),
      issues: issues.map(i => `${i.code}:${i.severity}`).join(", "),
    });
  }

  return {
    valid:         !blockPublish,
    blockPublish,
    issues,
    correctedCopy,
    log:           auditLog,
  };
}

// ── Auditoria de imagem ───────────────────────────────────────────────────────

export interface ImageAuditResult {
  valid:         boolean;
  blockPublish:  boolean;
  issues:        AuditIssue[];
  recommendedFormat: string;
  log:           string[];
}

export function auditImageForMeta(opts: {
  url:    string;
  width?: number;
  height?:number;
  bytes?: number;
  format: "feed" | "feed45" | "stories" | "banner";
}): ImageAuditResult {
  const issues: AuditIssue[] = [];
  const auditLog: string[] = [];
  let blockPublish = false;

  const { url, width = 0, height = 0, bytes = 0, format } = opts;
  const target = META_LIMITS.images[format];

  // URL vazia
  if (!url || url.includes("placeholder") || url.includes("mock")) {
    issues.push({ field: "imageUrl", severity: "critical", code: "IMAGE_MISSING",
      message: "Imagem ausente ou placeholder — publicação bloqueada", original: url });
    blockPublish = true;
    auditLog.push("[CRÍTICO] Imagem ausente");
  }

  // Tamanho mínimo
  if (bytes > 0 && bytes < META_LIMITS.minBytes) {
    issues.push({ field: "imageBytes", severity: "critical", code: "IMAGE_TOO_SMALL",
      message: `Imagem muito pequena (${bytes} bytes) — possível erro`, original: String(bytes) });
    blockPublish = true;
  }

  // Tamanho máximo (30MB)
  if (bytes > META_LIMITS.maxBytes) {
    issues.push({ field: "imageBytes", severity: "critical", code: "IMAGE_TOO_LARGE",
      message: `Imagem ${(bytes/1_000_000).toFixed(1)}MB > máx 30MB`, original: String(bytes) });
    blockPublish = true;
  }

  // Dimensões mínimas
  if (width > 0 && width < target.minWidth) {
    issues.push({ field: "imageWidth", severity: "warning", code: "IMAGE_LOW_RES",
      message: `Largura ${width}px < mínimo ${target.minWidth}px recomendado`, original: String(width) });
  }

  // Aspect ratio
  if (width > 0 && height > 0) {
    const actualRatio = width / height;
    const [rw, rh] = target.ratio.split(":").map(Number);
    const targetRatio = rw / rh;
    const diff = Math.abs(actualRatio - targetRatio) / targetRatio;
    if (diff > 0.05) { // tolerância 5%
      issues.push({ field: "imageRatio", severity: "warning", code: "IMAGE_WRONG_RATIO",
        message: `Aspect ratio ${width}x${height} difere de ${target.ratio} esperado para ${format}`,
        original: `${width}x${height}` });
      auditLog.push(`[AVISO] Ratio incorreto: ${width}x${height} vs ${target.width}x${target.height}`);
    }
  }

  // Cloudinary URL é confiável
  const isCloudinary = url.includes("res.cloudinary.com");
  const isPixabay    = url.includes("pixabay.com") || url.includes("cdn.pixabay.com");
  if (isPixabay) {
    issues.push({ field: "imageUrl", severity: "warning", code: "IMAGE_HOTLINK",
      message: "URL Pixabay direta — deve ser re-hospedada no Cloudinary antes de enviar ao Meta",
      original: url });
    auditLog.push("[AVISO] Pixabay direto — re-hospedar no Cloudinary");
  }

  const recommendedFormat = width && height
    ? (width === height ? "1:1 feed" : width > height ? "1.91:1 banner" : "4:5 ou 9:16")
    : format;

  return { valid: !blockPublish, blockPublish, issues, recommendedFormat, log: auditLog };
}

// ── Auditoria completa de criativo ────────────────────────────────────────────

export interface CreativeAuditResult {
  valid:           boolean;
  blockPublish:    boolean;
  copyAudit:       AuditResult;
  imageAudit:      ImageAuditResult | null;
  correctedPayload: {
    message:     string;
    headline:    string;
    description: string;
    cta:         string;
  };
  totalIssues:     number;
  criticalCount:   number;
  warningCount:    number;
  summary:         string;
}

export function auditCreative(opts: {
  headline:    string;
  primaryText: string;
  description?:string;
  cta:         string;
  imageUrl?:   string;
  imageBytes?: number;
  imageWidth?: number;
  imageHeight?:number;
  format:      "feed" | "feed45" | "stories" | "banner";
  objective:   string;
}): CreativeAuditResult {

  const copyAudit  = auditAndFixCopy({
    headline:    opts.headline,
    primaryText: opts.primaryText,
    description: opts.description || "",
    cta:         opts.cta,
  }, opts.objective);

  const imageAudit = opts.imageUrl ? auditImageForMeta({
    url:    opts.imageUrl,
    bytes:  opts.imageBytes,
    width:  opts.imageWidth,
    height: opts.imageHeight,
    format: opts.format,
  }) : null;

  const allIssues = [
    ...copyAudit.issues,
    ...(imageAudit?.issues || []),
  ];

  const criticalCount = allIssues.filter(i => i.severity === "critical").length;
  const warningCount  = allIssues.filter(i => i.severity === "warning").length;
  const blockPublish  = copyAudit.blockPublish || (imageAudit?.blockPublish ?? false);

  const summary = blockPublish
    ? `🚨 BLOQUEADO: ${criticalCount} crítico(s), ${warningCount} aviso(s)`
    : warningCount > 0
      ? `⚠️ AVISOS: ${warningCount} correção(ões) aplicada(s)`
      : `✅ APROVADO: criativo válido para publicação`;

  if (blockPublish) {
    log.warn("ad-audit", "Criativo BLOQUEADO para publicação", {
      criticalCount, warningCount,
      codes: allIssues.filter(i => i.severity === "critical").map(i => i.code).join(", "),
    });
  }

  return {
    valid:        !blockPublish,
    blockPublish,
    copyAudit,
    imageAudit,
    correctedPayload: {
      message:     copyAudit.correctedCopy.primaryText,
      headline:    copyAudit.correctedCopy.headline,
      description: copyAudit.correctedCopy.description,
      cta:         copyAudit.correctedCopy.cta,
    },
    totalIssues:  allIssues.length,
    criticalCount,
    warningCount,
    summary,
  };
}

// ── Guard para uso no router antes de enviar ao Meta ─────────────────────────

export function assertCreativeValid(audit: CreativeAuditResult): void {
  if (audit.blockPublish) {
    throw new Error(
      `Criativo inválido — publicação bloqueada. ${audit.criticalCount} erro(s) crítico(s): ` +
      audit.copyAudit.issues
        .filter(i => i.severity === "critical")
        .map(i => i.message)
        .join("; ")
    );
  }
}

// ── Deduplicação de frases redundantes ───────────────────────────────────────
// Detecta e remove sentenças consecutivas com >60% de overlap de palavras
// (ex: "Não perca essa oportunidade\n\nVocê não quer perder a oportunidade...")
export function dedupeSentences(text: string): string {
  if (!text) return text;
  const parts = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return text;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(w => w.length > 3);

  const result: string[] = [];
  for (const part of parts) {
    const words = new Set(normalize(part));
    const isDupe = result.some(prev => {
      const prevWords = new Set(normalize(prev));
      if (words.size === 0 || prevWords.size === 0) return false;
      let overlap = 0;
      words.forEach(w => { if (prevWords.has(w)) overlap++; });
      const ratio = overlap / Math.min(words.size, prevWords.size);
      return ratio > 0.6;
    });
    if (!isDupe) result.push(part);
  }
  return result.join("\n\n");
}

// ── Variação de headline por persona do adSet ────────────────────────────────
// Deriva a persona do nome do adSet (ex: TOF_Investidor_FII_...) e adapta
// a headline para o vocabulário do público — evita copy idêntica entre
// adSets de personas opostas.
const PERSONA_HEADLINE_PATTERNS: Array<{ match: RegExp; prefix?: string; rewrite?: (h: string) => string }> = [
  {
    match: /investidor|fii|renda.?passiva|airbnb|invest/i,
    rewrite: (h) => {
      if (/invest|renda|valoriza|rentabil/i.test(h)) return h; // já tem vocabulário certo
      return `Invista: ${h}`.slice(0, 40);
    },
  },
  {
    match: /lifestyle|decoracao|decoração|beach|viagem|familia|família|conforto/i,
    rewrite: (h) => {
      if (/viva|desfrute|sinta|seu novo|momento/i.test(h)) return h;
      return `Viva isso: ${h}`.slice(0, 40);
    },
  },
  {
    match: /luxo|premium|alto.?padrao|alto.?padrão/i,
    rewrite: (h) => {
      if (/exclusiv|premium|luxo|sofistica/i.test(h)) return h;
      return `Exclusivo: ${h}`.slice(0, 40);
    },
  },
];

export function personalizeHeadlineForAdSet(headline: string, adSetName?: string | null): string {
  if (!headline || !adSetName) return headline;
  for (const p of PERSONA_HEADLINE_PATTERNS) {
    if (p.match.test(adSetName)) {
      const varied = p.rewrite ? p.rewrite(headline) : headline;
      return varied.length <= 40 ? varied : headline;
    }
  }
  return headline;
}
