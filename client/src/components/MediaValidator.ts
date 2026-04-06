/**
 * MediaValidator.ts
 * Valida dimensões, proporção e formato de mídia antes de enviar para a Meta API.
 * 
 * USO no CampaignResult.tsx:
 *   import { validateMediaForPlacements, getImageDimensions } from "@/components/MediaValidator";
 * 
 *   const file = e.target.files[0];
 *   const dims = await getImageDimensions(file);
 *   const result = validateMediaForPlacements(dims, selectedPlacements);
 *   if (!result.canPublish) toast.error(result.errors[0]);
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface MediaDimensions {
  width:       number;
  height:      number;
  ratio:       string;        // "9:16" | "4:5" | "1:1" | "16:9" | "4:3" | "custom"
  orientation: "vertical" | "square" | "horizontal";
  mediaType:   "image" | "video";
  fileSizeMB?: number;
  durationSec?: number;       // só para vídeo
}

export interface PlacementValidation {
  placement:   string;
  label:       string;
  status:      "ok" | "warning" | "error";
  message:     string;
  fix?:        string;
}

export interface MediaValidationResult {
  canPublish:   boolean;
  dimensions:   MediaDimensions;
  errors:       string[];
  warnings:     string[];
  placements:   PlacementValidation[];
  recommended:  string[];   // placements recomendados para esta mídia
  blocked:      string[];   // placements que vão rejeitar esta mídia
  summary:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGRAS OFICIAIS META (2025)
// ─────────────────────────────────────────────────────────────────────────────

const META_RULES: Record<string, {
  label:        string;
  minWidth:     number;
  minHeight:    number;
  maxFileMB:    number;
  allowsImage:  boolean;
  allowsVideo:  boolean;
  idealRatio:   string;
  acceptRatios: string[];
  maxVideSec:   number;
  minVideSec:   number;
}> = {
  fb_feed: {
    label: "Facebook Feed",
    minWidth: 600, minHeight: 315,
    maxFileMB: 30,
    allowsImage: true, allowsVideo: true,
    idealRatio: "4:5", acceptRatios: ["1:1", "4:5", "16:9", "1.91:1"],
    maxVideSec: 241, minVideSec: 1,
  },
  fb_story: {
    label: "Facebook Stories",
    minWidth: 500, minHeight: 889,  // ← CRÍTICO: min 500px largura
    maxFileMB: 30,
    allowsImage: true, allowsVideo: true,
    idealRatio: "9:16", acceptRatios: ["9:16"],
    maxVideSec: 15, minVideSec: 1,
  },
  fb_reels: {
    label: "Facebook Reels",
    minWidth: 500, minHeight: 889,
    maxFileMB: 4000,
    allowsImage: false, allowsVideo: true,  // ← SÓ VÍDEO
    idealRatio: "9:16", acceptRatios: ["9:16"],
    maxVideSec: 60, minVideSec: 3,
  },
  ig_feed: {
    label: "Instagram Feed",
    minWidth: 600, minHeight: 315,
    maxFileMB: 30,
    allowsImage: true, allowsVideo: true,
    idealRatio: "4:5", acceptRatios: ["1:1", "4:5"],
    maxVideSec: 60, minVideSec: 3,
  },
  ig_story: {
    label: "Instagram Stories",
    minWidth: 500, minHeight: 889,
    maxFileMB: 30,
    allowsImage: true, allowsVideo: true,
    idealRatio: "9:16", acceptRatios: ["9:16"],
    maxVideSec: 60, minVideSec: 1,
  },
  ig_reels: {
    label: "Instagram Reels",
    minWidth: 500, minHeight: 889,
    maxFileMB: 4000,
    allowsImage: false, allowsVideo: true,  // ← SÓ VÍDEO
    idealRatio: "9:16", acceptRatios: ["9:16"],
    maxVideSec: 60, minVideSec: 3,
  },
  messenger_story: {
    label: "Messenger Stories",
    minWidth: 500, minHeight: 889,
    maxFileMB: 30,
    allowsImage: true, allowsVideo: true,
    idealRatio: "9:16", acceptRatios: ["9:16"],
    maxVideSec: 15, minVideSec: 1,
  },
  an_rewarded: {
    label: "Audience Network (Incentivado)",
    minWidth: 320, minHeight: 480,
    maxFileMB: 200,
    allowsImage: false, allowsVideo: true,  // ← SÓ VÍDEO
    idealRatio: "16:9", acceptRatios: ["16:9", "4:3", "1:1"],
    maxVideSec: 30, minVideSec: 15,
  },
  fb_right_column: {
    label: "Coluna direita Facebook",
    minWidth: 254, minHeight: 133,
    maxFileMB: 30,
    allowsImage: true, allowsVideo: false,  // ← SÓ IMAGEM
    idealRatio: "1.91:1", acceptRatios: ["1.91:1", "1:1"],
    maxVideSec: 0, minVideSec: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DETECTAR PROPORÇÃO
// ─────────────────────────────────────────────────────────────────────────────

function detectRatio(w: number, h: number): string {
  if (!w || !h) return "custom";
  const r = w / h;
  if (r >= 0.55 && r <= 0.57)  return "9:16";
  if (r >= 0.79 && r <= 0.81)  return "4:5";
  if (r >= 0.98 && r <= 1.02)  return "1:1";
  if (r >= 1.32 && r <= 1.35)  return "4:3";
  if (r >= 1.75 && r <= 1.80)  return "16:9";
  if (r >= 1.89 && r <= 1.93)  return "1.91:1";
  return "custom";
}

function detectOrientation(w: number, h: number): "vertical" | "square" | "horizontal" {
  if (w === h) return "square";
  return w < h ? "vertical" : "horizontal";
}

// ─────────────────────────────────────────────────────────────────────────────
// LER DIMENSÕES DO ARQUIVO
// ─────────────────────────────────────────────────────────────────────────────

export function getImageDimensions(file: File): Promise<MediaDimensions> {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith("video/");
    const sizeMB  = file.size / (1024 * 1024);
    const url     = URL.createObjectURL(file);

    if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        URL.revokeObjectURL(url);
        resolve({
          width:       w,
          height:      h,
          ratio:       detectRatio(w, h),
          orientation: detectOrientation(w, h),
          mediaType:   "video",
          fileSizeMB:  sizeMB,
          durationSec: Math.round(video.duration),
        });
      };
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo"));
      video.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve({
          width:       w,
          height:      h,
          ratio:       detectRatio(w, h),
          orientation: detectOrientation(w, h),
          mediaType:   "image",
          fileSizeMB:  sizeMB,
        });
      };
      img.onerror = () => reject(new Error("Não foi possível ler a imagem"));
      img.src = url;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAR PARA PLACEMENTS SELECIONADOS
// ─────────────────────────────────────────────────────────────────────────────

export function validateMediaForPlacements(
  dims: MediaDimensions,
  selectedPlacements: string[]
): MediaValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];
  const results:  PlacementValidation[] = [];
  const blocked:  string[] = [];
  const recommended: string[] = [];

  // Valida cada placement selecionado
  for (const pid of selectedPlacements) {
    const rule = META_RULES[pid];
    if (!rule) {
      results.push({ placement: pid, label: pid, status: "warning", message: "Placement não catalogado" });
      continue;
    }

    // Tipo de mídia
    if (dims.mediaType === "image" && !rule.allowsImage) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ ${rule.label} não aceita imagens — apenas vídeo`,
        fix: "Faça upload de um vídeo ou remova este placement",
      });
      blocked.push(pid);
      errors.push(`${rule.label}: requer vídeo, não imagem`);
      continue;
    }

    if (dims.mediaType === "video" && !rule.allowsVideo) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ ${rule.label} não aceita vídeos — apenas imagem`,
        fix: "Faça upload de uma imagem ou remova este placement",
      });
      blocked.push(pid);
      errors.push(`${rule.label}: requer imagem, não vídeo`);
      continue;
    }

    // Dimensões mínimas
    if (dims.width < rule.minWidth) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ Largura insuficiente: ${dims.width}px (mínimo ${rule.minWidth}px para ${rule.label})`,
        fix: `Redimensione para pelo menos ${rule.minWidth}×${rule.minHeight}px`,
      });
      blocked.push(pid);
      errors.push(`${rule.label}: largura mínima ${rule.minWidth}px — sua imagem tem ${dims.width}px`);
      continue;
    }

    if (dims.height < rule.minHeight) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ Altura insuficiente: ${dims.height}px (mínimo ${rule.minHeight}px para ${rule.label})`,
        fix: `Redimensione para pelo menos ${rule.minWidth}×${rule.minHeight}px`,
      });
      blocked.push(pid);
      errors.push(`${rule.label}: altura mínima ${rule.minHeight}px — sua imagem tem ${dims.height}px`);
      continue;
    }

    // Proporção
    if (dims.ratio !== "custom" && !rule.acceptRatios.includes(dims.ratio)) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ Proporção ${dims.ratio} não aceita em ${rule.label} (aceita: ${rule.acceptRatios.join(", ")})`,
        fix: `Crie uma versão ${rule.idealRatio} desta mídia`,
      });
      blocked.push(pid);
      errors.push(`${rule.label}: proporção ${dims.ratio} não aceita — use ${rule.idealRatio}`);
      continue;
    }

    // Duração de vídeo
    if (dims.mediaType === "video" && dims.durationSec !== undefined) {
      if (rule.maxVideSec > 0 && dims.durationSec > rule.maxVideSec) {
        results.push({
          placement: pid, label: rule.label, status: "error",
          message: `❌ Vídeo muito longo: ${dims.durationSec}s (máximo ${rule.maxVideSec}s para ${rule.label})`,
          fix: `Corte o vídeo para até ${rule.maxVideSec} segundos`,
        });
        blocked.push(pid);
        errors.push(`${rule.label}: vídeo de ${dims.durationSec}s excede limite de ${rule.maxVideSec}s`);
        continue;
      }

      if (dims.durationSec < rule.minVideSec) {
        warnings.push(`${rule.label}: vídeo muito curto (${dims.durationSec}s — mínimo ${rule.minVideSec}s)`);
        results.push({
          placement: pid, label: rule.label, status: "warning",
          message: `⚠️ Vídeo muito curto: ${dims.durationSec}s (mínimo ${rule.minVideSec}s)`,
        });
        continue;
      }
    }

    // Tamanho do arquivo
    if (dims.fileSizeMB && rule.maxFileMB > 0 && dims.fileSizeMB > rule.maxFileMB) {
      results.push({
        placement: pid, label: rule.label, status: "error",
        message: `❌ Arquivo muito grande: ${dims.fileSizeMB.toFixed(1)}MB (máximo ${rule.maxFileMB}MB)`,
        fix: "Comprima o arquivo antes de fazer upload",
      });
      blocked.push(pid);
      errors.push(`${rule.label}: arquivo de ${dims.fileSizeMB.toFixed(1)}MB excede limite de ${rule.maxFileMB}MB`);
      continue;
    }

    // Aviso se proporção não é ideal
    if (dims.ratio !== "custom" && dims.ratio !== rule.idealRatio && rule.acceptRatios.includes(dims.ratio)) {
      warnings.push(`${rule.label}: proporção ${dims.ratio} aceita, mas ${rule.idealRatio} teria melhor performance`);
      results.push({
        placement: pid, label: rule.label, status: "warning",
        message: `⚠️ Proporção ${dims.ratio} aceita, mas ${rule.idealRatio} é ideal para ${rule.label}`,
      });
    } else {
      // Aprovado
      recommended.push(pid);
      results.push({
        placement: pid, label: rule.label, status: "ok",
        message: `✅ ${dims.width}×${dims.height}px (${dims.ratio}) — compatível com ${rule.label}`,
      });
    }
  }

  // Sugestão de placements compatíveis para esta mídia
  const compatibleAll = Object.entries(META_RULES)
    .filter(([, rule]) => {
      if (dims.mediaType === "image" && !rule.allowsImage) return false;
      if (dims.mediaType === "video" && !rule.allowsVideo) return false;
      if (dims.width < rule.minWidth || dims.height < rule.minHeight) return false;
      if (dims.ratio !== "custom" && !rule.acceptRatios.includes(dims.ratio)) return false;
      return true;
    })
    .map(([id]) => id);

  const canPublish = errors.length === 0 || recommended.length > 0;

  let summary = "";
  if (errors.length === 0 && warnings.length === 0) {
    summary = `✅ Mídia ${dims.width}×${dims.height}px (${dims.ratio}) compatível com todos os ${selectedPlacements.length} placements`;
  } else if (blocked.length === selectedPlacements.length) {
    summary = `🚨 Nenhum placement compatível — ${errors[0]}`;
  } else {
    summary = `⚠️ ${recommended.length} placements ok, ${blocked.length} bloqueados — verifique os alertas`;
  }

  return { canPublish, dimensions: dims, errors, warnings, placements: results, recommended, blocked, summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Placements recomendados para uma proporção
// ─────────────────────────────────────────────────────────────────────────────

export function getRecommendedPlacements(dims: MediaDimensions): string[] {
  return Object.entries(META_RULES)
    .filter(([, rule]) => {
      if (dims.mediaType === "image" && !rule.allowsImage) return false;
      if (dims.mediaType === "video" && !rule.allowsVideo) return false;
      if (dims.width > 0 && dims.width < rule.minWidth)   return false;
      if (dims.height > 0 && dims.height < rule.minHeight) return false;
      if (dims.ratio !== "custom" && rule.idealRatio === dims.ratio) return true;
      if (dims.ratio !== "custom" && rule.acceptRatios.includes(dims.ratio)) return true;
      return false;
    })
    .map(([id]) => id);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Texto de orientação para o usuário
// ─────────────────────────────────────────────────────────────────────────────

export function getOrientationGuide(dims: MediaDimensions): string {
  const { ratio, orientation, width, height, mediaType } = dims;
  const guides: Record<string, string> = {
    "9:16":   "📱 Vertical 9:16 — ideal para Stories, Reels, TikTok",
    "4:5":    "📸 Vertical 4:5 — ideal para Feed Instagram e Facebook (maior área no mobile)",
    "1:1":    "⬜ Quadrado 1:1 — feed universal, funciona em todas as plataformas",
    "16:9":   "🖥️ Horizontal 16:9 — ideal para YouTube, Google Display, Facebook Feed desktop",
    "4:3":    "📺 Horizontal 4:3 — Audience Network, banners",
    "1.91:1": "🖥️ Horizontal 1.91:1 — link ads, coluna direita Facebook",
  };
  return guides[ratio] || `${orientation === "vertical" ? "📱 Vertical" : orientation === "square" ? "⬜ Quadrado" : "🖥️ Horizontal"} ${width}×${height}px`;
}
