/**
 * MetaPlacementValidator.ts
 *
 * Validador inteligente de compatibilidade criativo × placements Meta Ads.
 * Baseado nas regras oficiais da Meta (2024/2025).
 *
 * INTEGRAÇÃO:
 *   - Usa tipos do CreativeDistributionEngine.ts
 *   - Consumido pelo MetaPlacementValidatorPanel.tsx (UI)
 *   - Chamado antes da publicação no FacebookCampaignCreator.tsx
 *   - Chamado na aba de publicação do CampaignResult.tsx
 */

import type { CreativeSpec, AspectRatio } from "./CreativeDistributionEngine";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = "approved" | "warning" | "blocked" | "requires_adjustment";

export interface PlacementValidationResult {
  placementId:   string;
  placementLabel: string;
  status:        ValidationStatus;
  // Motivo principal
  reason:        string;
  // Detalhes técnicos
  details:       string[];
  // O que fazer para resolver
  fix?:          string;
  // Sugestão de adaptação automática
  autoFix?:      AutoFixSuggestion;
  // Regra que causou o bloqueio
  rule?:         string;
}

export interface AutoFixSuggestion {
  type:        "convert_ratio" | "add_video" | "resize" | "uncheck_placement" | "link_account";
  label:       string;
  description: string;
  targetRatio?: AspectRatio;
  targetWidth?: number;
  targetHeight?: number;
}

export interface PublicationValidation {
  // Se pode publicar
  canPublish:          boolean;
  // Placements aprovados
  approvedPlacements:  string[];
  // Placements com aviso (pode publicar mas com risco)
  warningPlacements:   string[];
  // Placements bloqueados (não vai publicar)
  blockedPlacements:   string[];
  // Placements que precisam de ajuste
  adjustmentPlacements: string[];
  // Resultados detalhados por placement
  results:             PlacementValidationResult[];
  // Resumo para o usuário
  summary:             string;
  // Score de qualidade (0–100)
  qualityScore:        number;
  // Sugestões de melhoria
  suggestions:         string[];
  // Alertas críticos
  criticalAlerts:      string[];
}

export interface CreativeMetadata {
  // Dimensões
  width:           number;
  height:          number;
  // Tipo de mídia
  mediaType:       "image" | "video" | "carousel" | "unknown";
  // Duração do vídeo (segundos)
  durationSec?:    number;
  // Tamanho do arquivo (MB)
  fileSizeMB?:     number;
  // Tem conta do Instagram vinculada
  hasInstagram:    boolean;
  // Tem perfil do Threads
  hasThreads:      boolean;
  // URL da mídia
  mediaUrl?:       string;
  // Hash da imagem (para Meta)
  imageHash?:      string;
  // Proporção calculada
  ratio?:          AspectRatio;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGRAS OFICIAIS META ADS (2024/2025)
// ─────────────────────────────────────────────────────────────────────────────

interface PlacementRule {
  id:            string;
  label:         string;
  // Tipos de mídia aceitos
  allowedMediaTypes: ("image" | "video" | "carousel")[];
  // Proporções ideais
  idealRatios:   AspectRatio[];
  // Proporções aceitas (com degradação)
  acceptedRatios: AspectRatio[];
  // Dimensões mínimas
  minWidth:      number;
  minHeight:     number;
  // Dimensões máximas (0 = sem limite)
  maxWidth:      number;
  maxHeight:     number;
  // Duração mínima de vídeo (segundos)
  minVideoDuration: number;
  // Duração máxima de vídeo (segundos)
  maxVideoDuration: number;
  // Tamanho máximo de arquivo (MB)
  maxFileSizeMB: number;
  // Requer identidade vinculada
  requiresInstagram: boolean;
  requiresThreads:   boolean;
  // Notas especiais
  notes:         string[];
  // Dica de performance
  tip:           string;
  // API support flags
  apiUnsupported?: boolean;
  disabled?: boolean;
}

export const META_PLACEMENT_RULES: Record<string, PlacementRule> = {
  // ── FACEBOOK FEED ──────────────────────────────────────────────────────────
  fb_feed: {
    id: "fb_feed", label: "Facebook Feed",
    allowedMediaTypes: ["image", "video", "carousel"],
    idealRatios:    ["4:5", "1:1"],
    acceptedRatios: ["1.91:1", "16:9", "4:3"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 1, maxVideoDuration: 241,
    maxFileSizeMB: 30,
    requiresInstagram: false, requiresThreads: false,
    notes: ["Texto recomendado: máx 125 caracteres", "Título: máx 40 caracteres"],
    tip: "4:5 ocupa mais espaço no feed mobile — aumenta visibilidade",
  },

  // ── FACEBOOK STORIES ───────────────────────────────────────────────────────
  fb_story: {
    id: "fb_story", label: "Facebook Stories",
    allowedMediaTypes: ["image", "video"],
    idealRatios:    ["9:16"],
    acceptedRatios: ["4:5"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,  // ← REGRA CRÍTICA: mín 500px
    minVideoDuration: 1, maxVideoDuration: 15,
    maxFileSizeMB: 30,
    requiresInstagram: false, requiresThreads: false,
    notes: [
      "⚠️ Largura MÍNIMA: 500px (regra Meta obrigatória)",
      "Vídeo máximo: 15 segundos",
      "Zona segura: manter elementos importantes no centro (15% das bordas são cortadas)",
    ],
    tip: "9:16 imersivo — maior taxa de engajamento em Stories",
  },

  // ── MESSENGER STORIES ──────────────────────────────────────────────────────
  messenger_story: {
    id: "messenger_story", label: "Messenger Stories",
    allowedMediaTypes: ["image", "video"],
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 1, maxVideoDuration: 15,
    maxFileSizeMB: 30,
    requiresInstagram: false, requiresThreads: false,
    notes: [
      "⚠️ Apenas formatos 9:16 são compatíveis",
      "Carrossel NÃO é suportado neste placement",
      "GIFs animados NÃO são suportados",
    ],
    tip: "Messenger Stories tem alcance menor — priorize IG Stories e FB Stories",
  },

  // ── INSTAGRAM FEED ─────────────────────────────────────────────────────────
  ig_feed: {
    id: "ig_feed", label: "Instagram Feed",
    allowedMediaTypes: ["image", "video", "carousel"],
    idealRatios:    ["4:5", "1:1"],
    acceptedRatios: ["1.91:1"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 3, maxVideoDuration: 60,
    maxFileSizeMB: 30,
    requiresInstagram: true, requiresThreads: false,
    notes: ["Requer conta do Instagram vinculada", "Vídeo: 3–60 segundos"],
    tip: "4:5 premium — maior área no scroll mobile",
  },

  // ── INSTAGRAM STORIES ──────────────────────────────────────────────────────
  ig_story: {
    id: "ig_story", label: "Instagram Stories",
    allowedMediaTypes: ["image", "video"],
    idealRatios:    ["9:16"],
    acceptedRatios: ["4:5"],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 1, maxVideoDuration: 60,
    maxFileSizeMB: 30,
    requiresInstagram: true, requiresThreads: false,
    notes: ["Requer conta do Instagram vinculada", "Zona segura: 250px no topo e base"],
    tip: "Stories têm CTR 35% acima da média — invista no hook visual",
  },

  // ── INSTAGRAM REELS ────────────────────────────────────────────────────────
  ig_reels: {
    id: "ig_reels", label: "Instagram Reels",
    allowedMediaTypes: ["video"],
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 3, maxVideoDuration: 60,
    maxFileSizeMB: 4000,
    requiresInstagram: true, requiresThreads: false,
    notes: [
      "⚠️ APENAS vídeo — imagens NÃO são aceitas",
      "⚠️ APENAS proporção 9:16 — outros causam barras pretas",
      "Requer conta do Instagram vinculada",
    ],
    tip: "Hook impactante nos primeiros 3s — maior alcance orgânico",
  },

  // ── FACEBOOK REELS — NÃO SUPORTADO VIA API PADRÃO ────────────────────────
  // Meta API retorna erro 1815433 ao usar "reels" em facebook_positions
  // Use Instagram Reels (ig_reels) em vez disso
  fb_reels: {
    id: "fb_reels", label: "Facebook Reels ⚠️",
    allowedMediaTypes: ["video"],
    idealRatios:    ["9:16"],
    acceptedRatios: [],
    minWidth: 500, minHeight: 889, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 3, maxVideoDuration: 60,
    maxFileSizeMB: 4000,
    requiresInstagram: false, requiresThreads: false,
    notes: [
      "❌ NÃO suportado via API padrão (erro 1815433)",
      "✅ Use Instagram Reels (ig_reels) para Reels",
      "⚠️ APENAS vídeo — imagens NÃO são aceitas",
    ],
    tip: "Facebook Reels via API retorna erro — use apenas Instagram Reels",
    apiUnsupported: true,
  },

  // ── AUDIENCE NETWORK VÍDEO INCENTIVADO ────────────────────────────────────
  an_rewarded_video: {
    id: "an_rewarded_video", label: "Vídeos com incentivo (Audience Network)",
    allowedMediaTypes: ["video"],
    idealRatios:    ["16:9", "4:3"],
    acceptedRatios: ["1:1"],
    minWidth: 320, minHeight: 480, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 15, maxVideoDuration: 30,
    maxFileSizeMB: 200,
    requiresInstagram: false, requiresThreads: false,
    notes: [
      "⚠️ APENAS vídeo — imagens NÃO são aceitas",
      "Duração recomendada: 15–30 segundos",
      "Usuário assiste para ganhar recompensa — mantenha conteúdo engajante",
    ],
    tip: "Taxa de conclusão alta — usuário tem incentivo para assistir",
  },

  // ── AUDIENCE NETWORK IN-STREAM ─────────────────────────────────────────────
  an_instream: {
    id: "an_instream", label: "In-stream (Audience Network)",
    allowedMediaTypes: ["video"],
    idealRatios:    ["16:9"],
    acceptedRatios: ["4:3", "1:1"],
    minWidth: 320, minHeight: 180, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 5, maxVideoDuration: 120,
    maxFileSizeMB: 200,
    requiresInstagram: false, requiresThreads: false,
    notes: ["⚠️ APENAS vídeo", "Sem opção de pular nos primeiros 5s"],
    tip: "Funciona bem com vídeos de 15–30s com CTA claro",
  },

  // ── FACEBOOK MARKETPLACE ───────────────────────────────────────────────────
  fb_marketplace: {
    id: "fb_marketplace", label: "Facebook Marketplace",
    allowedMediaTypes: ["image", "video"],
    idealRatios:    ["1:1"],
    acceptedRatios: ["4:5", "1.91:1"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 1, maxVideoDuration: 241,
    maxFileSizeMB: 30,
    requiresInstagram: false, requiresThreads: false,
    notes: ["1:1 evita cortes automáticos"],
    tip: "Audiência em modo compra — destaque preço e produto",
  },

  // ── FACEBOOK RIGHT COLUMN ──────────────────────────────────────────────────
  fb_right_column: {
    id: "fb_right_column", label: "Coluna direita (Facebook)",
    allowedMediaTypes: ["image"],
    idealRatios:    ["1.91:1"],
    acceptedRatios: ["1:1"],
    minWidth: 254, minHeight: 133, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 0, maxVideoDuration: 0,
    maxFileSizeMB: 30,
    requiresInstagram: false, requiresThreads: false,
    notes: ["⚠️ Apenas imagens — vídeos NÃO são suportados", "Aparece apenas no desktop"],
    tip: "Baixo custo — bom para remarketing e brand awareness desktop",
  },

  // ── THREADS FEED ───────────────────────────────────────────────────────────
  threads_feed: {
    id: "threads_feed", label: "Feed do Threads",
    allowedMediaTypes: ["image", "video"],
    idealRatios:    ["1:1", "4:5"],
    acceptedRatios: ["1.91:1"],
    minWidth: 600, minHeight: 600, maxWidth: 0, maxHeight: 0,
    minVideoDuration: 1, maxVideoDuration: 60,
    maxFileSizeMB: 30,
    requiresInstagram: true, requiresThreads: true,
    notes: [
      "⚠️ Requer perfil do Threads vinculado",
      "⚠️ Requer conta do Instagram vinculada",
    ],
    tip: "Threads ainda tem menor concorrência — CPM mais baixo",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE DE VALIDAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

function calculateRatio(width: number, height: number): AspectRatio {
  if (!width || !height) return "unknown";
  const r = width / height;
  if (r >= 0.54 && r <= 0.58)  return "9:16";
  if (r >= 0.79 && r <= 0.81)  return "4:5";
  if (r >= 0.98 && r <= 1.02)  return "1:1";
  if (r >= 1.32 && r <= 1.35)  return "4:3";
  if (r >= 1.75 && r <= 1.80)  return "16:9";
  if (r >= 1.89 && r <= 1.93)  return "1.91:1";
  return "unknown";
}

export function validatePlacementForCreative(
  placementId: string,
  creative: CreativeMetadata
): PlacementValidationResult {
  const rule = META_PLACEMENT_RULES[placementId];

  if (!rule) {
    return {
      placementId,
      placementLabel: placementId,
      status: "warning",
      reason: "Placement não catalogado — sem regras de validação disponíveis",
      details: [],
    };
  }

  const ratio = creative.ratio || calculateRatio(creative.width, creative.height);
  const details: string[] = [];
  const issues: string[]  = [];

  // 1. Verificar tipo de mídia
  if (creative.mediaType !== "unknown" && !rule.allowedMediaTypes.includes(creative.mediaType as any)) {
    const allowed = rule.allowedMediaTypes.join(", ");
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `${rule.label} não aceita ${creative.mediaType} — apenas ${allowed}`,
      details: [`Tipo enviado: ${creative.mediaType}`, `Tipos aceitos: ${allowed}`],
      fix: creative.mediaType === "image"
        ? "Adicione um vídeo para usar este placement"
        : "Use uma imagem ou carrossel para este placement",
      autoFix: creative.mediaType === "image" && rule.allowedMediaTypes.includes("video")
        ? { type: "add_video", label: "Adicionar vídeo", description: "Grave ou faça upload de um vídeo para habilitar este placement" }
        : { type: "uncheck_placement", label: "Remover placement", description: `Desmarque "${rule.label}" para evitar erros de veiculação` },
      rule: `Tipos aceitos: ${allowed}`,
    };
  }

  // 2. Verificar dimensões mínimas
  if (creative.width > 0 && creative.width < rule.minWidth) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `Largura insuficiente: ${creative.width}px (mínimo ${rule.minWidth}px para ${rule.label})`,
      details: [
        `Largura atual: ${creative.width}px`,
        `Largura mínima: ${rule.minWidth}px`,
        `Altura atual: ${creative.height}px`,
      ],
      fix: `Redimensione a imagem para pelo menos ${rule.minWidth}×${rule.minHeight}px`,
      autoFix: {
        type: "resize",
        label: `Redimensionar para ${rule.minWidth}×${rule.minHeight}px`,
        description: "A imagem precisa ter no mínimo esta resolução para este placement",
        targetWidth: rule.minWidth,
        targetHeight: rule.minHeight,
      },
      rule: `Dimensão mínima: ${rule.minWidth}×${rule.minHeight}px`,
    };
  }

  if (creative.height > 0 && creative.height < rule.minHeight) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `Altura insuficiente: ${creative.height}px (mínimo ${rule.minHeight}px para ${rule.label})`,
      details: [
        `Altura atual: ${creative.height}px`,
        `Altura mínima: ${rule.minHeight}px`,
      ],
      fix: `Redimensione para pelo menos ${rule.minWidth}×${rule.minHeight}px`,
      autoFix: {
        type: "resize",
        label: "Redimensionar imagem",
        description: `Mínimo ${rule.minWidth}×${rule.minHeight}px`,
        targetWidth: rule.minWidth,
        targetHeight: rule.minHeight,
      },
      rule: `Dimensão mínima: ${rule.minWidth}×${rule.minHeight}px`,
    };
  }

  // 3. Verificar proporção
  if (ratio !== "unknown") {
    if (rule.idealRatios.length > 0 && !rule.idealRatios.includes(ratio) && !rule.acceptedRatios.includes(ratio)) {
      const isVertical   = ratio === "9:16" || ratio === "4:5";
      const needVertical = rule.idealRatios.some(r => r === "9:16" || r === "4:5");

      return {
        placementId,
        placementLabel: rule.label,
        status: "blocked",
        reason: `Proporção ${ratio} não é compatível com ${rule.label}`,
        details: [
          `Proporção atual: ${ratio}`,
          `Proporções aceitas: ${[...rule.idealRatios, ...rule.acceptedRatios].join(", ")}`,
          needVertical && !isVertical ? "Este placement exige orientação vertical" : "",
        ].filter(Boolean),
        fix: `Crie uma versão ${rule.idealRatios[0]} deste criativo`,
        autoFix: {
          type: "convert_ratio",
          label: `Converter para ${rule.idealRatios[0]}`,
          description: `${rule.label} precisa de proporção ${rule.idealRatios[0]}`,
          targetRatio: rule.idealRatios[0] as AspectRatio,
        },
        rule: `Proporções ideais: ${rule.idealRatios.join(", ")}`,
      };
    }

    if (rule.acceptedRatios.includes(ratio) && !rule.idealRatios.includes(ratio)) {
      issues.push(`Proporção ${ratio} aceita mas não ideal — ${rule.idealRatios[0]} teria melhor performance`);
    }
  }

  // 4. Verificar duração de vídeo
  if (creative.mediaType === "video" && creative.durationSec) {
    if (rule.maxVideoDuration > 0 && creative.durationSec > rule.maxVideoDuration) {
      return {
        placementId,
        placementLabel: rule.label,
        status: "blocked",
        reason: `Vídeo de ${creative.durationSec}s excede limite de ${rule.maxVideoDuration}s para ${rule.label}`,
        details: [
          `Duração atual: ${creative.durationSec}s`,
          `Duração máxima: ${rule.maxVideoDuration}s`,
        ],
        fix: `Corte o vídeo para até ${rule.maxVideoDuration} segundos`,
        autoFix: {
          type: "uncheck_placement",
          label: "Remover placement ou cortar vídeo",
          description: `${rule.label} aceita vídeos de até ${rule.maxVideoDuration}s`,
        },
        rule: `Duração máxima: ${rule.maxVideoDuration}s`,
      };
    }

    if (rule.minVideoDuration > 0 && creative.durationSec < rule.minVideoDuration) {
      issues.push(`Vídeo muito curto: ${creative.durationSec}s (mínimo ${rule.minVideoDuration}s)`);
    }
  }

  // 5. Verificar tamanho do arquivo
  if (creative.fileSizeMB && rule.maxFileSizeMB > 0 && creative.fileSizeMB > rule.maxFileSizeMB) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `Arquivo de ${creative.fileSizeMB.toFixed(1)}MB excede limite de ${rule.maxFileSizeMB}MB`,
      details: [`Tamanho: ${creative.fileSizeMB.toFixed(1)}MB`, `Limite: ${rule.maxFileSizeMB}MB`],
      fix: "Comprima o arquivo antes de fazer upload",
      rule: `Tamanho máximo: ${rule.maxFileSizeMB}MB`,
    };
  }

  // 6. Verificar identidade vinculada
  if (rule.requiresInstagram && !creative.hasInstagram) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `${rule.label} requer conta do Instagram vinculada à página do Facebook`,
      details: ["Conta do Instagram não detectada nas configurações"],
      fix: "Vincule uma conta do Instagram no Gerenciador de Negócios da Meta",
      autoFix: {
        type: "link_account",
        label: "Vincular conta do Instagram",
        description: "Acesse o Gerenciador de Negócios → Configurações → Contas do Instagram",
      },
      rule: "Requer Instagram vinculado",
    };
  }

  if (rule.requiresThreads && !creative.hasThreads) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "blocked",
      reason: `${rule.label} requer perfil do Threads vinculado`,
      details: ["Perfil do Threads não detectado"],
      fix: "Crie e vincule um perfil do Threads à sua conta do Instagram",
      autoFix: {
        type: "link_account",
        label: "Vincular perfil do Threads",
        description: "Crie um perfil no Threads conectado ao seu Instagram",
      },
      rule: "Requer Threads vinculado",
    };
  }

  // 7. Tudo OK — com ou sem avisos
  if (issues.length > 0) {
    return {
      placementId,
      placementLabel: rule.label,
      status: "warning",
      reason: issues[0],
      details: [...issues, ...rule.notes],
    };
  }

  // Aprovado ✅
  const isIdeal = ratio !== "unknown" && rule.idealRatios.includes(ratio);
  return {
    placementId,
    placementLabel: rule.label,
    status: "approved",
    reason: isIdeal
      ? `✅ Proporção ${ratio} é ideal para ${rule.label}`
      : `✅ Compatível com ${rule.label}`,
    details: rule.notes.length > 0 ? [rule.tip, ...rule.notes.slice(0, 2)] : [rule.tip],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO COMPLETA ANTES DA PUBLICAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export function validatePublicationReadiness(
  selectedPlacements: string[],
  creative: CreativeMetadata
): PublicationValidation {
  const results: PlacementValidationResult[] = [];
  const approved:    string[] = [];
  const warnings:    string[] = [];
  const blocked:     string[] = [];
  const adjustments: string[] = [];
  const criticalAlerts: string[] = [];
  const suggestions:    string[] = [];

  for (const placementId of selectedPlacements) {
    const result = validatePlacementForCreative(placementId, creative);
    results.push(result);

    switch (result.status) {
      case "approved":            approved.push(placementId);    break;
      case "warning":             warnings.push(placementId);    break;
      case "blocked":             blocked.push(placementId);     break;
      case "requires_adjustment": adjustments.push(placementId); break;
    }

    if (result.status === "blocked") {
      criticalAlerts.push(`❌ ${result.placementLabel}: ${result.reason}`);
      if (result.fix) suggestions.push(`💡 ${result.placementLabel}: ${result.fix}`);
    }
  }

  // Sugestões globais
  const ratio = creative.ratio || calculateRatio(creative.width, creative.height);
  const hasVertical   = selectedPlacements.some(p => ["fb_story","ig_story","ig_reels","fb_reels","messenger_story"].includes(p));
  const hasHorizontal = selectedPlacements.some(p => ["an_rewarded_video","an_instream"].includes(p));

  if (hasVertical && ratio !== "9:16" && ratio !== "4:5") {
    suggestions.push("💡 Crie uma versão 9:16 do criativo para usar Stories e Reels");
  }
  if (hasHorizontal && creative.mediaType === "image") {
    suggestions.push("💡 Audience Network com incentivo requer vídeo — adicione um vídeo para usar esse placement");
  }
  if (blocked.length > 0 && blocked.length === selectedPlacements.length) {
    suggestions.push("🚨 Nenhum placement está compatível — revise o criativo antes de publicar");
  }

  // Score de qualidade
  const total = selectedPlacements.length || 1;
  const qualityScore = Math.round(
    ((approved.length * 1.0 + warnings.length * 0.6) / total) * 100
  );

  // Resumo
  const canPublish = approved.length > 0 || warnings.length > 0;
  const summary = !canPublish
    ? `🚨 Não é possível publicar — todos os ${blocked.length} placements estão bloqueados`
    : blocked.length > 0
    ? `⚠️ ${approved.length + warnings.length} placements compatíveis, ${blocked.length} bloqueados — verifique os alertas`
    : `✅ Todos os ${approved.length} placements estão aprovados — pronto para publicar`;

  return {
    canPublish,
    approvedPlacements:   approved,
    warningPlacements:    warnings,
    blockedPlacements:    blocked,
    adjustmentPlacements: adjustments,
    results,
    summary,
    qualityScore,
    suggestions,
    criticalAlerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Detectar metadados do criativo a partir dos dados disponíveis
// ─────────────────────────────────────────────────────────────────────────────

export function buildCreativeMetadata(params: {
  mediaFile?:    File | null;
  mediaPreview?: string;
  mediaType?:    "image" | "video" | null;
  uploadedHash?: string;
  imageUrl?:     string;
  hasInstagram?: boolean;
  hasThreads?:   boolean;
  // Dimensões conhecidas (ex: do criativo gerado pela IA)
  width?:        number;
  height?:       number;
  durationSec?:  number;
}): CreativeMetadata {
  const width  = params.width  || 0;
  const height = params.height || 0;
  const ratio  = calculateRatio(width, height);

  let mediaType: "image" | "video" | "carousel" | "unknown" = "unknown";
  if (params.mediaType === "image") mediaType = "image";
  else if (params.mediaType === "video") mediaType = "video";
  else if (params.mediaFile) {
    mediaType = params.mediaFile.type.startsWith("video") ? "video" : "image";
  }

  const fileSizeMB = params.mediaFile ? params.mediaFile.size / (1024 * 1024) : undefined;

  return {
    width, height, ratio,
    mediaType,
    durationSec:  params.durationSec,
    fileSizeMB,
    hasInstagram: params.hasInstagram ?? false,
    hasThreads:   params.hasThreads   ?? false,
    mediaUrl:     params.mediaPreview || params.imageUrl,
    imageHash:    params.uploadedHash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Placements sugeridos automaticamente com base no criativo
// ─────────────────────────────────────────────────────────────────────────────

export function suggestCompatiblePlacements(creative: CreativeMetadata): string[] {
  const ratio = creative.ratio || calculateRatio(creative.width, creative.height);
  const suggested: string[] = [];

  for (const [id, rule] of Object.entries(META_PLACEMENT_RULES)) {
    // Pula se não tem o tipo de mídia
    if (creative.mediaType !== "unknown" && !rule.allowedMediaTypes.includes(creative.mediaType as any)) continue;
    // Pula se não tem instagram
    if (rule.requiresInstagram && !creative.hasInstagram) continue;
    // Pula se não tem threads
    if (rule.requiresThreads && !creative.hasThreads) continue;
    // Pula se dimensões muito pequenas
    if (creative.width > 0 && creative.width < rule.minWidth) continue;
    if (creative.height > 0 && creative.height < rule.minHeight) continue;
    // Verifica proporção
    if (ratio !== "unknown") {
      if (!rule.idealRatios.includes(ratio) && !rule.acceptedRatios.includes(ratio)) continue;
    }
    suggested.push(id);
  }

  return suggested;
}
