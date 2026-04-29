import { useLocation, useParams } from "wouter";
import PlacementSelector from "@/components/PlacementSelector";
import { PlacementPresetSelector } from "@/components/PlacementPresetSelector";
import VSLGeneratorPanel from "@/components/VSLGeneratorPanel";
import AdPreviewPanel from "@/components/AdPreviewPanel";
import { getImageDimensions, validateMediaForPlacements, getOrientationGuide, type MediaDimensions, type MediaValidationResult } from "@/components/MediaValidator";
import { PLATFORM_PLACEMENTS, AUTO_PLACEMENTS, type PlacementMode } from "@/components/PlacementConfig";
import { useEffect, useState, useRef } from "react";
import Layout from "@/components/layout/Layout";
import CampaignAudit from "@/components/CampaignAudit";
import PublishValidator, { validateForPublish } from "@/components/PublishValidator";
import PixelPanel from "@/components/PixelPanel";
import { trpc } from "@/lib/trpc";
import WhatsAppField from "@/components/WhatsAppField";
import { toast } from "sonner";
import type { CampaignCreative, CreativeFormat, PublishToMetaInput } from "../../../shared/campaignCreative.schema";
import {
  buildPublishMediaFromCreative,
  mergeCreativeWithProjectedLegacy,
  resolveLegacyImageHashByFormat,
  resolveLegacyImageUrlByFormat,
} from "../../../shared/campaignCreative.schema";
import {
  getPlacementGuidance,
  normalizeRatio,
  type MediaType as GuidanceMediaType,
  type PlacementGuidanceItem,
  type PlacementGuidanceStatus,
  type PlacementType as GuidancePlacementType,
} from "@/lib/placementGuidance";

const BR_STATE_OPTIONS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const COUNTRY_OPTIONS = [
  { code: "BR", label: "🇧🇷 Brasil" },
  { code: "PT", label: "🇵🇹 Portugal" },
  { code: "US", label: "🇺🇸 EUA" },
  { code: "AR", label: "🇦🇷 Argentina" },
  { code: "CL", label: "🇨🇱 Chile" },
  { code: "CO", label: "🇨🇴 Colômbia" },
  { code: "MX", label: "🇲🇽 México" },
  { code: "ES", label: "🇪🇸 Espanha" },
  { code: "FR", label: "🇫🇷 França" },
  { code: "DE", label: "🇩🇪 Alemanha" },
  { code: "IT", label: "🇮🇹 Itália" },
  { code: "GB", label: "🇬🇧 Reino Unido" },
  { code: "CA", label: "🇨🇦 Canadá" },
  { code: "AU", label: "🇦🇺 Austrália" },
  { code: "JP", label: "🇯🇵 Japão" },
  { code: "AO", label: "🇦🇴 Angola" },
  { code: "MZ", label: "🇲🇿 Moçambique" },
  { code: "UY", label: "🇺🇾 Uruguai" },
  { code: "PY", label: "🇵🇾 Paraguai" },
  { code: "PE", label: "🇵🇪 Peru" },
];

function normalizeDestinationUrl(raw?: string | null): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^wa\.me\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (/^[\d\s()+-]{8,}$/.test(candidate)) {
      const digits = candidate.replace(/\D/g, "");
      if (digits) candidate = `https://wa.me/${digits}`;
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

const GUIDANCE_STATUS_UI: Record<PlacementGuidanceStatus, { label: string; bg: string; border: string; color: string; pillBg: string }> = {
  ideal: {
    label: "Alinhado ao placement",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    color: "#166534",
    pillBg: "#dcfce7",
  },
  warning: {
    label: "Ajuste recomendado",
    bg: "#fffbeb",
    border: "#fde68a",
    color: "#b45309",
    pillBg: "#fef3c7",
  },
  info: {
    label: "Pode melhorar",
    bg: "#eff6ff",
    border: "#bfdbfe",
    color: "#1d4ed8",
    pillBg: "#dbeafe",
  },
};

function resolvePlacementGuidanceType(placement: string): GuidancePlacementType | null {
  const normalized = String(placement || "").toLowerCase();
  if (normalized.includes("reels")) return "reels";
  if (normalized.includes("story")) return "stories";
  if (normalized.includes("feed")) return "feed";
  return null;
}

function uniqueGuidancePlacements(placements: string[]): GuidancePlacementType[] {
  const ordered: GuidancePlacementType[] = [];
  const seen = new Set<GuidancePlacementType>();

  for (const placement of placements) {
    const resolved = resolvePlacementGuidanceType(placement);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    ordered.push(resolved);
  }

  return ordered;
}

function formatGuidanceContext(mediaType: GuidanceMediaType, ratio: ReturnType<typeof normalizeRatio>, cardsCount: number): string {
  if (cardsCount >= 2) {
    return `Carrossel com ${cardsCount} cards${ratio !== "unknown" && ratio !== "mixed" ? ` · ${ratio}` : ""}`;
  }

  const mediaLabel = mediaType === "video"
    ? "Vídeo"
    : mediaType === "image"
      ? "Imagem"
      : mediaType === "mixed"
        ? "Mídia mista"
        : "Mídia";

  return ratio !== "unknown" ? `${mediaLabel} · ${ratio}` : mediaLabel;
}

export default function CampaignResult() {
  const { id: routeId, campaignId } = useParams<{ id: string; campaignId: string }>();
  const [, setLocation] = useLocation();

  const id        = Number(campaignId || 0);
  const projectId = Number(routeId    || 0);

  // ── estado publicação ──
  const [showModal,    setShowModal]    = useState(false);
  const [publishing,   setPublishing]   = useState(false);
  const [publishResult,setPublishResult]= useState<any>(null);
  const [pageId,       setPageId]       = useState("");
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [multiPageMode,   setMultiPageMode]   = useState(false);
  const [imageUrl,     setImageUrl]     = useState("");
  const [linkUrl,      setLinkUrl]      = useState("");
  const [adSetIndex,   setAdSetIndex]   = useState(0);

  const [pages,        setPages]        = useState<{id:string; name:string}[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  // ── estado upload de mídia ──
  const [mediaFile,    setMediaFile]    = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [mediaType,    setMediaType]    = useState<"image" | "video" | null>(null);
  const [uploadedHash, setUploadedHash] = useState<string>("");
  const [uploadedVid,  setUploadedVid]  = useState<string>("");
  const [uploadedThumbHash, setUploadedThumbHash] = useState<string>("");
  const [uploadedThumbPreview, setUploadedThumbPreview] = useState<string>("");
  const pendingAutoUploadRef = useRef<File | null>(null); // arquivo aguardando auto-upload
  const autoAssigningCreativeImagesRef = useRef(false);

  // ── Reseta estado de mídia — evita conflito entre uploads e tentativas ──────
  function resetMediaState() {
    setUploadedHash("");
    setUploadedVid("");
    setUploadedThumbHash("");
    setUploadDone(false);
    setMediaType(null);
  }

  // ── Normaliza payload de mídia — garante 1 tipo apenas (vídeo OU imagem) ───
  function buildMediaPayload(opts?: { forceImageHash?: string; forceVideoId?: string }) {
    const vid  = opts?.forceVideoId  || uploadedVid;
    const hash = opts?.forceImageHash || uploadedHash;
    if (vid) {
      return { videoId: vid, videoThumbnailHash: uploadedThumbHash || undefined };
    }
    if (hash) {
      return { imageHash: hash };
    }
    const url = imageUrl.trim();
    if (url) {
      return { imageUrl: url };
    }
    return {};
  }
  const [uploading,    setUploading]    = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [uploadDone,   setUploadDone]   = useState(false);
  const [placementPreset, setPlacementPreset] = useState("ecommerce");
  const [showVSL,       setShowVSL]       = useState(false);
  const [showAudit,    setShowAudit]    = useState(false);
  const [showPixel,    setShowPixel]    = useState(false);
  const [showValidator, setShowValidator] = useState(false);
  const [mediaMode,    setMediaMode]    = useState<"none" | "url" | "upload">("none");
  const [mediaDims,    setMediaDims]    = useState<MediaDimensions | null>(null);
  const [mediaValidation, setMediaValidation] = useState<MediaValidationResult | null>(null);

  // ── estado multi-upload ──
  const [mediaFiles,      setMediaFiles]      = useState<File[]>([]);
  const [mediaPreviews,   setMediaPreviews]   = useState<string[]>([]);
  const [uploadedHashes,  setUploadedHashes]  = useState<string[]>([]);
  const [creativePreviewByHash, setCreativePreviewByHash] = useState<Record<string, string>>({});
  const [featuredIndex,   setFeaturedIndex]   = useState<number>(0);
  const [uploadingIndex,  setUploadingIndex]  = useState<number | null>(null);

  const creativePreviewStorageKey = `campaign-creative-preview:${id}`;

  const MAX_META_CAROUSEL_ITEMS = 10;

  // Sincroniza uploadedHash com a foto em destaque
  const handleSetFeatured = (idx: number) => {
    setFeaturedIndex(idx);
    if (uploadedHashes[idx]) {
      setUploadedHash(uploadedHashes[idx]);
      setUploadDone(true);
    } else {
      setUploadedHash("");
      setUploadDone(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    try {
      const raw = window.localStorage.getItem(creativePreviewStorageKey);
      setCreativePreviewByHash(raw ? JSON.parse(raw) : {});
    } catch {
      setCreativePreviewByHash({});
    }
  }, [creativePreviewStorageKey, id]);

  function cacheCreativePreview(hash: string, preview: string | null | undefined) {
    if (!hash || !preview) return;
    setCreativePreviewByHash((prev) => {
      if (prev[hash] === preview) return prev;
      const next = { ...prev, [hash]: preview };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(creativePreviewStorageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }

  function readFileAsDataUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // ── navegação por abas ──
  const [activeTab, setActiveTab] = useState<"overview" | "meta" | "google" | "tiktok">("overview");

  // ── placements ──
  const [placementMode,       setPlacementMode]       = useState<PlacementMode>("auto");
  const [selectedPlacements,  setSelectedPlacements]  = useState<string[]>([]);

  // ── post orgânico ──
  const [showOrganicModal,  setShowOrganicModal]  = useState(false);
  const [organicPageId,     setOrganicPageId]     = useState("");
  const [organicPageName,   setOrganicPageName]   = useState("");
  const [organicHandle,     setOrganicHandle]     = useState("");
  const [organicMessage,    setOrganicMessage]    = useState("");
  const [organicLinkUrl,    setOrganicLinkUrl]    = useState("");
  const [organicPosting,    setOrganicPosting]    = useState(false);
  const [organicResult,     setOrganicResult]     = useState<any>(null);
  const [discoveringPage,   setDiscoveringPage]   = useState(false);
  const [discoverError,     setDiscoverError]     = useState("");
  const [organicImageFile,   setOrganicImageFile]   = useState<File | null>(null);
  const [organicImagePreview,setOrganicImagePreview] = useState("");
  const [organicImageBase64, setOrganicImageBase64]  = useState("");
  const [organicUploading,   setOrganicUploading]    = useState(false);

  // ── estado edição manual ──
  const [editingCreative, setEditingCreative] = useState<number | null>(null);
  const [editingAdSet,    setEditingAdSet]    = useState<number | null>(null);
  const [editDraft,       setEditDraft]       = useState<any>({});
  const [regenerating,    setRegenerating]    = useState<string | null>(null);
  const [regenContext,    setRegenContext]     = useState("");
  const [showRegenModal,  setShowRegenModal]  = useState<string | null>(null);
  const [replacingCreativeImage, setReplacingCreativeImage] = useState<number | null>(null);
  // Preview local de vídeo por criativo (URL.createObjectURL após upload bem-sucedido)
  const [creativeVideoPreviews, setCreativeVideoPreviews] = useState<Record<number, string>>({});
  // ── Estados formulário de leads (usados no modal) ──
  const [leadDestination, setLeadDestination] = useState<"website" | "lead_form">("website");
  const [leadFormId,      setLeadFormId]      = useState<string>("");
  const [leadForms,       setLeadForms]       = useState<{id:string;name:string;status:string;leads_count:number}[]>([]);
  const [loadingForms,    setLoadingForms]    = useState(false);
  const [ageMin,          setAgeMin]          = useState<number>(18);
  const [ageMax,          setAgeMax]          = useState<number>(65);
  const [locationMode,    setLocationMode]    = useState<"brasil" | "paises" | "raio">("brasil");
  const [regions,         setRegions]         = useState<string[]>([]);
  const [countries,       setCountries]       = useState<string[]>([]);
  const [geoCity,         setGeoCity]         = useState("");
  const [geoRadius,       setGeoRadius]       = useState<number>(15);
  const [hydratedCampaignId, setHydratedCampaignId] = useState<number | null>(null);

  // ── mutations edição ──
  const updateCreativeMutation = (trpc as any).campaigns?.updateCreative?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success("◎ Criativo atualizado!");
      setEditingCreative(null);
      setEditDraft({});
      refetchCampaign?.();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  }) ?? { mutate: () => {}, isLoading: false };

  const updateAdSetMutation = (trpc as any).campaigns?.updateAdSet?.useMutation?.({
    onSuccess: () => {
      toast.success("◎ Conjunto atualizado!");
      setEditingAdSet(null);
      setEditDraft({});
      refetchCampaign?.();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  }) ?? { mutate: () => {}, isLoading: false };

  const regenerateMutation = (trpc as any).campaigns?.regeneratePart?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`◎ ${data.part === "creatives" ? "Criativos" : data.part === "adSets" ? "Públicos" : data.part === "hooks" ? "Hooks" : data.part === "abTests" ? "Testes A/B" : "Copies"} regenerados!`);
      setRegenerating(null);
      setShowRegenModal(null);
      setRegenContext("");
      refetchCampaign?.();
    },
    onError: (e: any) => { toast.error("Erro: " + e.message); setRegenerating(null); },
  }) ?? { mutate: () => {}, isLoading: false };

  const { data: metaIntegration } = trpc.integrations.list.useQuery();
  const { data: clientProfile }  = (trpc as any).clientProfile?.get?.useQuery?.({ projectId }, { enabled: !!projectId }) ?? { data: null };
  const metaConnected = (metaIntegration as any[])?.some(i => i.provider === "meta" && i.isActive);

  let refetchCampaign: (() => void) | undefined;

  async function fetchPages() {
    setLoadingPages(true);
    try {
      const integration = (metaIntegration as any[])?.find(i => i.provider === "meta");
      const token = integration?.accessToken;
      if (!token) { toast.error("Token Meta não encontrado. Reconecte em Configurações → Meta Ads."); return; }

      // Busca páginas + campos de WhatsApp vinculado automaticamente
      const res = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,phone,whatsapp_connected_id,connected_instagram_account&access_token=${token}`
      );
      const data = await res.json();
      if (data.error) { toast.error(`Erro ao buscar páginas: ${data.error.message}`); return; }
      const list = data.data || [];
      setPages(list);

      if (list.length === 1) {
        setPageId(list[0].id);

        // Auto-detecta WhatsApp vinculado à página
        await autoDetectWhatsApp(list[0], token);
      }
      if (list.length === 0) toast.error("Nenhuma página encontrada nessa conta.");
    } catch (e: any) {
      toast.error("Erro ao buscar páginas do Facebook.");
    } finally { setLoadingPages(false); }
  }

  // Busca automaticamente o WhatsApp vinculado à página do Facebook
  async function autoDetectWhatsApp(page: any, token: string) {
    try {
      let digits = "";

      // 1. Direto na listagem (me/accounts já trouxe o campo)
      if (page.whatsapp_connected_id || page.phone) {
        const phone = page.whatsapp_connected_id || page.phone;
        digits = String(phone).replace(/\D/g, "");
      }

      // 2. Busca extra via Graph API se não veio na listagem
      if (!digits || digits.length < 8) {
        const waRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=whatsapp_connected_id,phone_number&access_token=${token}`
        );
        const waData = await waRes.json();
        if (!waData.error) {
          const phone = waData.whatsapp_connected_id || waData.phone_number;
          if (phone) digits = String(phone).replace(/\D/g, "");
        }
      }

      if (!digits || digits.length < 8) return;

      const fullDigits = digits.startsWith("55") ? digits : `55${digits}`;
      const waUrl = `https://wa.me/${fullDigits}`;

      // Preenche linkUrl se vazio
      if (!linkUrl.trim()) {
        setLinkUrl(waUrl);
        toast.success(`◎ WhatsApp detectado: +${fullDigits}`);
      }

      // Salva como padrão na integração Meta via tRPC (silencioso)
      const metaInt = (metaIntegration as any[])?.find(i => i.provider === "meta");
      if (metaInt && !metaInt.whatsappPhone) {
        try {
          await (trpc as any).integrations?.saveWhatsApp?.mutate?.({ phone: fullDigits });
        } catch {}
      }
    } catch {
      // Silencioso — WhatsApp é opcional
    }
  }

  const publishMutation = trpc.campaigns.publishToMeta.useMutation({
    onSuccess: (data: any) => {
      setPublishResult(data);
      setShowModal(false);
      setPublishing(false);
      if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
        toast.warning(`⚠️ ${data.warnings[0]}`);
      } else {
        toast.success("◎ Campanha publicada no Meta Ads!");
      }
    },
    onError: (e: any) => {
      const msg = e?.message || e?.data?.message || "Erro desconhecido ao publicar";
      if (msg.includes("Failed to fetch") || msg.includes("abort") || msg.includes("timeout")) {
        toast.error("⏱ A publicação demorou mais que o esperado. Verifique no Meta Ads Manager se a campanha foi criada antes de tentar novamente.", { duration: 10000 });
      } else {
        toast.error(`✕ ${msg}`, { duration: 8000 });
      }
      setPublishing(false);
    },
  });

  // ── Upload de imagem via tRPC hook ───────────────────────────────────────
  const uploadImageMutation   = (trpc as any).integrations?.uploadImageToMeta?.useMutation?.() ?? { mutateAsync: null };
  const uploadVideoMutation   = (trpc as any).integrations?.uploadVideoToMeta?.useMutation?.() ?? { mutateAsync: null };
  const createLeadFormMutation = (trpc as any).integrations?.createLeadForm?.useMutation?.() ?? { mutateAsync: null, isPending: false };

  const updateCreativeImageMutation = (trpc as any).campaigns?.updateCreativeImage?.useMutation?.({
    onSuccess: () => {
      if (!autoAssigningCreativeImagesRef.current) {
        toast.success("🖼️ Imagem do criativo atualizada!");
        refetchCampaign?.();
      }
      setReplacingCreativeImage(null);
    },
    onError: (e: any) => {
      toast.error("Erro ao salvar imagem do criativo: " + e.message);
      setReplacingCreativeImage(null);
    },
  }) ?? { mutateAsync: null, isLoading: false };

  const regenerateCreativeImageMutation = (trpc as any).campaigns?.regenerateCreativeImage?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.diagnostics?.reason) {
        toast.warning(`🖼️ Imagem atualizada com fallback: ${data.diagnostics.reason}`);
      } else {
        toast.success("🖼️ Imagem regenerada com sucesso!");
      }
      refetchCampaign?.();
    },
    onError: (e: any) => toast.error("Erro ao regenerar imagem: " + e.message),
  }) ?? { mutate: () => {}, isLoading: false };

  const discoverPageIdMutation = (trpc as any).competitors?.discoverPageId?.useMutation?.({
    onSuccess: (data: any) => {
      setDiscoveringPage(false);
      if (data?.found && data?.pageId) {
        setOrganicPageId(data.pageId);
        setOrganicPageName(data.pageName || "");
        setDiscoverError("");
        toast.success(`◎ Page ID encontrado: ${data.pageId}${data.pageName ? ` (${data.pageName})` : ""}`);
      } else {
        setDiscoverError("Não foi possível encontrar o Page ID automaticamente. Informe manualmente.");
        toast.error("✕ Page ID não encontrado. Informe manualmente.");
      }
    },
    onError: (e: any) => {
      setDiscoveringPage(false);
      setDiscoverError("Erro ao buscar: " + (e?.message || "tente novamente"));
    },
  }) ?? { mutate: () => {}, isPending: false };

  const organicPostMutation   = (trpc as any).integrations?.publishOrganicPost?.useMutation?.({
    onSuccess: (data: any) => {
      setOrganicResult(data);
      setOrganicPosting(false);
      toast.success("◎ Post publicado com sucesso na Página!");
    },
    onError: (e: any) => {
      toast.error("✕ " + (e?.message || "Erro ao publicar post orgânico"));
      setOrganicPosting(false);
    },
  }) ?? { mutate: () => {}, isPending: false };

  // ── Compliance check antes de publicar ──────────────────────────────────
  const complianceMutation = trpc.campaigns.validateCompliance.useMutation();
  const [complianceResult, setComplianceResult] = useState<{
    score: "safe" | "warning" | "danger";
    issues: string[];
    suggestions: string[];
  } | null>(null);
  const [showPreview, setShowPreview]         = useState(false);
  const [previewHtml, setPreviewHtml]         = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview]   = useState(false);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // ── Busca preview real via Meta API ──────────────────────────────────────
  async function fetchAdPreview(creativeId: string) {
    if (!creativeId) return;
    setLoadingPreview(true);
    try {
      // Usa a integração Meta já carregada via tRPC (não window.__metaIntegration)
      const integration = (metaIntegration as any[])?.find((i: any) => i.provider === "meta");
      const token = integration?.accessToken ?? "";
      if (!token) { setPreviewHtml("<p style='color:#888'>Token Meta não disponível para preview. Reconecte em Configurações → Meta Ads.</p>"); return; }
      const formats = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD"];
      const previews: string[] = [];
      for (const fmt of formats) {
        const res  = await fetch(`https://graph.facebook.com/v19.0/${creativeId}/previews?ad_format=${fmt}&access_token=${token}`);
        const data = await res.json();
        if (data?.data?.[0]?.body) {
          previews.push(`<div style="margin-bottom:24px"><strong style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px">${fmt.replace(/_/g,' ')}</strong><div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-top:8px">${data.data[0].body}</div></div>`);
        }
      }
      setPreviewHtml(previews.length ? previews.join("") : "<p style='color:#888'>Preview não disponível para este criativo.</p>");
    } catch (e: any) {
      setPreviewHtml(`<p style='color:#e11'>Erro ao carregar preview: ${e.message}</p>`);
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Verifica compliance antes de abrir modal de publicação ───────────────
  async function checkComplianceAndPublish() {
    const camp = c as any;
    const creatives = (() => { try { return JSON.parse(camp.creatives || "[]"); } catch { return []; } })();
    const texts = [
      camp.name || "",
      camp.strategy || "",
      ...creatives.map((cr: any) => `${cr.headline || ""} ${cr.copy || ""} ${cr.cta || ""}`),
    ].filter(Boolean);

    setCheckingCompliance(true);
    try {
      const result = await complianceMutation.mutateAsync({ texts });
      setComplianceResult(result);
      if (result.score === "danger") {
        toast.error("✕ Campanha com risco alto de rejeição pela Meta! Revise os criativos.");
      } else if (result.score === "warning") {
        toast.warning("⚠️ Atenção: há pontos sensíveis. Revise antes de publicar.");
      } else {
        toast.success("◎ Compliance OK! Campanha dentro das políticas Meta.");
      }
      setShowModal(true);
      fetchPages();
    } catch (e: any) {
      toast.error("Erro ao verificar compliance: " + e.message);
      setShowModal(true);
      fetchPages();
    } finally {
      setCheckingCompliance(false);
    }
  }

  const VIDEO_TYPES = new Set([
    "video/mp4","video/mov","video/quicktime","video/mpeg","video/webm",
    "video/avi","video/x-msvideo","video/x-matroska","video/3gpp",
    "video/x-flv","video/ogg",
  ]);
  const AUDIO_TYPES = new Set([
    "audio/mpeg","audio/mp3","audio/mp4","audio/aac","audio/ogg",
    "audio/wav","audio/webm","audio/x-wav","audio/flac",
  ]);
  const VIDEO_EXTS  = /\.(mp4|mov|mpeg|mpg|webm|avi|mkv|3gp|flv|ogv|wmv)$/i;
  const AUDIO_EXTS  = /\.(mp3|aac|ogg|wav|flac|m4a|opus)$/i;

  function isVideoFile(file?: File | null) {
    if (!file) return false;
    return VIDEO_TYPES.has(file.type) || file.type.startsWith("video/") || VIDEO_EXTS.test(file.name);
  }

  function isAudioFile(file?: File | null) {
    if (!file) return false;
    return AUDIO_TYPES.has(file.type) || file.type.startsWith("audio/") || AUDIO_EXTS.test(file.name);
  }

  function isVideoOrAudioFile(file?: File | null) {
    return isVideoFile(file) || isAudioFile(file);
  }

  function isImageFile(file?: File | null) {
    return !!file && file.type.startsWith("image/");
  }

  async function createLeadFormFromDraft(): Promise<string | null> {
    if (!pageId.trim()) {
      toast.error("Selecione a página antes de criar o formulário na Meta.");
      return null;
    }
    if (!createLeadFormMutation.mutateAsync) {
      toast.error("Função de criação de formulário não disponível. Recarregue a página.");
      return null;
    }
    const draft = leadFormDraft && typeof leadFormDraft === "object" ? leadFormDraft : null;
    if (!draft) {
      toast.error("Nenhum rascunho de formulário foi salvo nesta campanha.");
      return null;
    }
    const privacyUrl = String(draft.privacyUrl || "").trim();
    if (!privacyUrl) {
      toast.error("O rascunho salvo não possui URL de política de privacidade.");
      return null;
    }

    const created = await createLeadFormMutation.mutateAsync({
      pageId: pageId.trim(),
      name: String(draft.name || `Leads - ${(campaign as any)?.name || "Campanha"}`).trim(),
      fields: Array.isArray(draft.fields) && draft.fields.length > 0 ? draft.fields : ["FULL_NAME", "EMAIL", "PHONE"],
      customQuestion: String(draft.customQuestion || "").trim() || undefined,
      thankYouMessage: String(draft.thankYouMessage || "").trim() || undefined,
      privacyUrl,
    });

    const createdForm = {
      id: String(created?.id || "").trim(),
      name: String(created?.name || draft.name || `Leads - ${(campaign as any)?.name || "Campanha"}`).trim(),
      status: "ACTIVE",
      leads_count: 0,
    };

    if (createdForm.id) {
      setLeadForms((prev) => prev.some((form) => form.id === createdForm.id) ? prev : [createdForm, ...prev]);
      setLeadFormId(createdForm.id);
      await Promise.resolve(leadFormsQuery.refetch?.());
      toast.success("◎ Formulário criado na Meta e selecionado para o publish.");
      return createdForm.id;
    }

    toast.error("A Meta não retornou um ID de formulário válido.");
    return null;
  }

  // ── Publicação em múltiplas páginas sequencial ──────────────────────────────
  async function handlePublishMultiPage(pageIds: string[]) {
    if (!pageIds.length) { toast.error("Selecione pelo menos uma página"); return; }

    const results: { pageId: string; pageName: string; success: boolean; error?: string }[] = [];
    let successCount = 0;

    for (const pid of pageIds) {
      const pageName = (pages as any[]).find(p => p.id === pid)?.name || pid;
      toast.loading(`📤 Publicando em ${pageName}...`, { id: `pub-${pid}` });
      try {
        // ── Resolve automaticamente o link de cada página via backend ────────
        // O backend usa o token Meta do usuário para consultar a Graph API
        // Prioridade: 1) link manual digitado  2) WhatsApp da página  3) website da página
        let pageAutoLink: string | undefined = normalizeDestinationUrl(linkUrl) || undefined;

        if (!pageAutoLink) {
          // Sem link manual → busca automaticamente pela página
          try {
            const resolved = await (trpc as any).campaigns?.resolvePageLink?.query?.({ pageId: pid });
            if (resolved?.whatsappUrl) {
              pageAutoLink = resolved.whatsappUrl;
              toast.loading(`📱 ${pageName}: WhatsApp ...${resolved.phone?.slice(-4)} detectado`, { id: `pub-${pid}` });
            } else if (resolved?.website) {
              pageAutoLink = resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`;
              toast.loading(`🌐 ${pageName}: site detectado`, { id: `pub-${pid}` });
            }
          } catch { /* ignora — publica sem link automático */ }
        }
        // Se usuário digitou link manual → usa o manual (nunca sobrescreve)

        const prevPageId = pageId;
        setPageId(pid);
        await new Promise(r => setTimeout(r, 50));
        // buildMediaPayload garante payload limpo e sem conflito de tipos
        const mpMedia = buildMediaPayload();
        const mpValidHashes = uploadedHashes.filter(h => !!h);
        const mpImageHashes = !uploadedVid && mpValidHashes.length >= 2 ? mpValidHashes : undefined;

        await publishMutation.mutateAsync({
          campaignId: id,
          projectId,
          pageId: pid,
          destination: leadDestination,
          linkUrl: pageAutoLink,
          ageMin, ageMax,
          placementMode,
          placements: selectedPlacements.length > 0 ? selectedPlacements : undefined,
          locationMode,
          regions:   locationMode === "brasil"  ? regions            : undefined,
          countries: locationMode === "paises"  ? countries          : undefined,
          geoCity:   locationMode === "raio"    ? geoCity.trim()     : undefined,
          geoRadius: locationMode === "raio"    ? geoRadius          : undefined,
          imageHash:   mpMedia.imageHash,
          videoId:     mpMedia.videoId,
          imageHashes: mpImageHashes,
          imageUrl:    mpMedia.imageUrl,
          videoThumbnailHash: mpMedia.videoThumbnailHash,
        } as any);
        setPageId(prevPageId);
        results.push({ pageId: pid, pageName, success: true });
        successCount++;
        toast.success(`✅ ${pageName}`, { id: `pub-${pid}`, duration: 3000 });
      } catch (e: any) {
        results.push({ pageId: pid, pageName, success: false, error: e.message });
        toast.error(`❌ ${pageName}: ${(e.message || "").slice(0, 60)}`, { id: `pub-${pid}`, duration: 5000 });
      }
    }

    if (successCount === pageIds.length) {
      toast.success(`🎉 Campanha publicada em todas as ${successCount} páginas!`);
    } else {
      toast.warning(`Publicado em ${successCount}/${pageIds.length} páginas. Verifique os erros acima.`);
    }
  }

  async function handlePublish() {
    if (!pageId.trim()) { toast.error("Informe o ID da Página do Facebook"); return; }
    if (ageMin >= ageMax) { toast.error("A idade mínima deve ser menor que a idade máxima."); return; }
    if (locationMode === "paises" && countries.length === 0) { toast.error("Selecione pelo menos um país para segmentação internacional."); return; }
    if (locationMode === "raio" && !geoCity.trim()) { toast.error("Informe a cidade ou endereço para segmentação por raio."); return; }
    // Verifica se tem arquivo pendente de upload
    if (mediaMode === "upload" && mediaFiles.length > 0) {
      const singleVideoSelected = mediaFiles.length === 1 && isVideoFile(mediaFiles[0]);
      const pendingVideo = singleVideoSelected && !uploadedVid;
      const pendingImages = !singleVideoSelected && mediaFiles.some((file, idx) => isImageFile(file) && !uploadedHashes[idx]);
      if (pendingVideo || pendingImages) {
        toast.error(singleVideoSelected
          ? "⚠️ Envie o vídeo primeiro — clique no botão azul '📤' acima."
          : "⚠️ Envie as fotos primeiro — clique no botão azul '📤' acima.");
        // Scroll suave até a área de mídia
        document.querySelector('[data-upload-area]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const campaignCreatives = (() => {
      try { return JSON.parse((campaign as any)?.creatives || "[]"); } catch { return []; }
    })();
    const mergedCreatives = Array.isArray(campaignCreatives)
      ? campaignCreatives.map((cr: any) => mergeCreativeWithProjectedLegacy(cr))
      : [];
    const placementsToCheck = selectedPlacements.length > 0
      ? selectedPlacements
      : placementMode === "auto"
        ? ["fb_feed", "ig_feed", "fb_story", "ig_story"]
        : ["fb_feed", "ig_feed"];
    const requiresStoryAsset = placementsToCheck.some((p) => ["fb_story", "ig_story", "messenger_story"].includes(p));
    const requiresReelsVideo = placementsToCheck.some((p) => ["ig_reels"].includes(p)); // fb_reels removido
    const hasUploadedMedia = !!uploadedVid || !!uploadedHash || uploadedHashes.filter(Boolean).length >= 2 || !!imageUrl.trim();

    // Verifica se criativos têm apenas imagens placeholder (placehold.co)
    const creativesHavePlaceholder = mergedCreatives.some((cr: any) => {
      const img = cr.feedImageUrl || cr.storyImageUrl || cr.squareImageUrl || cr.imageUrl || "";
      return img.includes("placehold.co") || img.includes("via.placeholder");
    });
    const creativesHaveRealMedia = mergedCreatives.some((cr: any) =>
      cr.feedImageHash || cr.storyImageHash || cr.squareImageHash ||
      cr.publishMedia?.videoId || cr.publishMedia?.imageHash
    );
    if (!hasUploadedMedia && creativesHavePlaceholder && !creativesHaveRealMedia) {
      toast.error("⚠️ Faça upload de uma foto ou vídeo real antes de publicar. As imagens geradas automaticamente (placeholder) são rejeitadas pelo Meta.", { duration: 6000 });
      setPublishing(false);
      return;
    }
    const hasStoryReadyCreative = mergedCreatives.some((cr: any) => !!(cr.storyImageUrl || cr.storyImageHash || cr.publishMedia?.videoId));
    const hasReelsReadyCreative = mergedCreatives.some((cr: any) => !!cr.publishMedia?.videoId);

    if (requiresStoryAsset && !hasStoryReadyCreative && !hasUploadedMedia) {
      toast.warning?.("⚠️ Sem mídia 9:16 dedicada — publicando stories com criativo de feed. Para melhor resultado, envie uma mídia vertical.");
      // Não bloqueia — publica com mídia disponível
    }

    if (requiresReelsVideo && !uploadedVid && !hasReelsReadyCreative) {
      toast.warning?.("⚠️ Reels sem vídeo dedicado — publicando com imagem. Para melhor resultado, envie um vídeo vertical.");
      // Não bloqueia — publica com imagem
    }

    // Apenas sales e traffic exigem URL externa obrigatoriamente
    const campaignObj = (campaign as any)?.objective || "";
    const needsDest = ["sales", "traffic"].includes(campaignObj);
    const normalizedProfileWebsite = normalizeDestinationUrl((clientProfile as any)?.websiteUrl);
    const hasProfileDest = !!normalizedProfileWebsite || !!(clientProfile as any)?.socialLinks;
    const hasManualLink = !!normalizeDestinationUrl(linkUrl);

    if (needsDest && !hasProfileDest && !hasManualLink) {
      toast.error(
        "⚠️ Informe uma URL de destino no campo abaixo. " +
        "Ex: https://seusite.com.br"
      );
      return;
    }

    setPublishing(true);
    try {
      const resolvedLeadFormId = leadDestination === "lead_form"
        ? (leadFormId.trim() || await createLeadFormFromDraft() || "")
        : "";
      if (leadDestination === "lead_form" && !resolvedLeadFormId) {
        toast.error("Selecione um formulário existente ou crie o formulário salvo antes de publicar.");
        return;
      }

      // Prepara dados de imagem — carrossel se tiver 2+ fotos enviadas
      const validHashes = uploadedHashes.filter(h => !!h);
      const isCarousel  = validHashes.length >= 2;

      const manualImageUrl = mediaMode === "url" ? imageUrl.trim() : "";
      const effectiveVideoId = uploadedVid || undefined;
      const effectiveVideoThumbnailHash = effectiveVideoId ? (uploadedThumbHash || undefined) : undefined;
      const effectiveImageHashes = !effectiveVideoId && isCarousel ? validHashes : undefined;
      const effectiveImageHash = !effectiveVideoId && !effectiveImageHashes?.length && !manualImageUrl
        ? (uploadedHash || undefined)
        : undefined;
      const effectiveImageUrl = !effectiveVideoId && !effectiveImageHashes?.length && !effectiveImageHash
        ? (manualImageUrl || undefined)
        : undefined;
      const normalizedLinkUrl = normalizeDestinationUrl(linkUrl) || normalizedProfileWebsite;
      if (effectiveVideoId && !effectiveVideoThumbnailHash) {
        toast.error("Envie uma thumbnail para o vídeo antes de publicar no Meta.");
        return;
      }
      const publishPayload: PublishToMetaInput = {
        campaignId: id,
        projectId,
        pageId: pageId.trim(),
        destination: leadDestination,
        leadGenFormId: leadDestination === "lead_form" ? resolvedLeadFormId : undefined,
        imageUrl: effectiveImageUrl,
        imageHash: effectiveImageHash,
        imageHashes: effectiveImageHashes,
        videoId: effectiveVideoId,
        videoThumbnailHash: effectiveVideoThumbnailHash,
        linkUrl: normalizedLinkUrl || undefined,
        adSetIndex,
        placementMode,
        placements: selectedPlacements.length > 0 ? selectedPlacements : undefined,
        ageMin,
        ageMax,
        locationMode,
        regions: locationMode === "brasil" ? regions : undefined,
        countries: locationMode === "paises" ? countries : undefined,
        geoCity: locationMode === "raio" ? geoCity.trim() : undefined,
        geoRadius: locationMode === "raio" ? geoRadius : undefined,
      };

      // Multi-página: publica em todas as páginas selecionadas
      if (multiPageMode && selectedPageIds.length > 1) {
        await handlePublishMultiPage(selectedPageIds);
      } else {
        await publishMutation.mutateAsync(publishPayload as any);
      }
    } finally { setPublishing(false); }
  }

  // ── Upload de mídia via FormData (sem base64 — sem limite de tamanho) ──────
  // ── Auto-upload: dispara quando pendingAutoUploadRef é preenchido ──────────
  useEffect(() => {
    const file = pendingAutoUploadRef.current;
    if (!file) return;
    pendingAutoUploadRef.current = null;
    // Pequeno delay para garantir que React commitou os estados
    const timer = setTimeout(() => {
      handleUploadMedia(file);
    }, 200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFiles]); // dispara quando mediaFiles muda (novo arquivo selecionado)

  async function handleUploadMedia(fileOverride?: File): Promise<{ kind: "image"; hash: string } | { kind: "video"; videoId: string } | null> {
    const targetFile = fileOverride || mediaFile;
    if (!targetFile) return null;
    // Guard: não re-fazer upload se vídeo já foi enviado
    if (isVideoFile(targetFile) && uploadedVid) {
      return { kind: "video", videoId: uploadedVid };
    }
    if (uploading) return null; // evita duplo clique simultâneo
    setUploading(true);

    const isVid = isVideoFile(targetFile);
    const isAud = isAudioFile(targetFile);
    const isMedia = isVid || isAud;
    const sizeMB = (targetFile.size / 1024 / 1024).toFixed(1);

    try {
      toast.info?.(`📤 Enviando ${isMedia ? (isAud ? "áudio" : "vídeo") : "imagem"}: ${targetFile.name} (${sizeMB}MB)...`);

      const form = new FormData();
      form.append("file", targetFile, targetFile.name);

      const endpoint = isMedia ? "/api/meta/upload-video" : "/api/meta/upload-image";
      const res = await fetch(endpoint, { method: "POST", body: form, credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        toast.error(`✕ Upload falhou: ${data.error || "Erro desconhecido"}`);
        return null;
      }

      if (isMedia) {
        if (!data.videoId) { toast.error("✕ Upload concluído mas sem videoId retornado."); return null; }
        setUploadedVid(data.videoId); setUploadedHash(""); setUploadDone(true);
        toast.success(`◎ ${isAud ? "Áudio" : "Vídeo"} enviado! (${targetFile.name.slice(0, 20)})`);
        return { kind: "video", videoId: data.videoId };
      } else {
        if (!data.hash) { toast.error("✕ Upload concluído mas sem hash retornado."); return null; }
        setUploadedHash(data.hash); setUploadedVid(""); setUploadDone(true);
        toast.success(`◎ Foto enviada! (${targetFile.name.slice(0, 20)})`);
        return { kind: "image", hash: data.hash };
      }
    } catch (e: any) {
      toast.error(`✕ Upload falhou: ${e?.message || "Erro de rede"}`);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadVideoThumbnail(file: File): Promise<string | null> {
    if (!isImageFile(file)) {
      toast.error("A thumbnail do vídeo precisa ser uma imagem JPG, PNG, GIF ou WebP.");
      return null;
    }
    if (thumbnailUploading) return null;

    setThumbnailUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/meta/upload-image", { method: "POST", body: form, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || !data.hash) {
        toast.error(`✕ Falha ao enviar thumbnail: ${data.error || "Erro desconhecido"}`);
        return null;
      }
      setUploadedThumbHash(data.hash);
      setUploadedThumbPreview(URL.createObjectURL(file));
      toast.success("◎ Thumbnail enviada para a Meta!");
      return data.hash as string;
    } catch (e: any) {
      toast.error(`✕ Falha ao enviar thumbnail: ${e?.message || "Erro de rede"}`);
      return null;
    } finally {
      setThumbnailUploading(false);
    }
  }

  async function handleManualCreativeImage(file: File, creativeIndex: number, format: "feed" | "stories" | "square") {
    const isVid = isVideoFile(file);
    const isAud = isAudioFile(file);
    const isImg = isImageFile(file);

    if (!isVid && !isAud && !isImg) {
      toast.error("Tipo inválido. Use imagem (JPG, PNG, WebP, GIF), vídeo (MP4, MOV, WEBM, AVI, MKV) ou áudio (MP3, AAC, WAV).");
      return;
    }
    if (!updateCreativeImageMutation.mutateAsync) {
      toast.error("Função de upload manual indisponível. Recarregue a página.");
      return;
    }

    setReplacingCreativeImage(creativeIndex);
    try {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      toast.info?.(`📤 Enviando ${isVid || isAud ? "mídia" : "imagem"}: ${file.name} (${sizeMB}MB)...`);

      const form = new FormData();
      form.append("file", file, file.name);
      const endpoint = (isVid || isAud) ? "/api/meta/upload-video" : "/api/meta/upload-image";
      const res = await fetch(endpoint, { method: "POST", body: form, credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        toast.error(`Erro no upload: ${data.error || "Falha desconhecida"}`);
        return;
      }

      if (isVid || isAud) {
        if (!data.videoId) { toast.error("Upload concluído mas sem videoId retornado."); return; }
        await updateCreativeImageMutation.mutateAsync({ campaignId: id, creativeIndex, format, videoId: data.videoId });
        // Sincroniza com o state global de publish — garante que o payload de publicação use esta mídia
        setUploadedVid(data.videoId);
        setUploadedHash("");
        setUploadDone(true);
        // Salva preview local para exibir no card
        const previewUrl = URL.createObjectURL(file);
        setCreativeVideoPreviews(prev => ({ ...prev, [creativeIndex]: previewUrl }));
        toast.success(`◎ ${isAud ? "Áudio" : "Vídeo"} vinculado ao criativo ${creativeIndex + 1}! Agora clique em Publicar.`);
      } else {
        if (!data.hash) { toast.error("Upload concluído mas sem hash retornado."); return; }
        const localPreview = await readFileAsDataUrl(file);
        if (localPreview) cacheCreativePreview(data.hash, localPreview);
        await updateCreativeImageMutation.mutateAsync({ campaignId: id, creativeIndex, format, imageUrl: undefined, imageHash: data.hash });
        // Sincroniza com o state global de publish
        setUploadedHash(data.hash);
        setUploadedVid("");
        setUploadDone(true);
        toast.success(`◎ Imagem atualizada no criativo ${creativeIndex + 1}! Agora clique em Publicar.`);
      }
    } catch (e: any) {
      toast.error(`Erro ao trocar mídia: ${e?.message || "falha desconhecida"}`);
      setReplacingCreativeImage(null);
    }
  }

  // ── Selecionar arquivo ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = isVideoFile(file);
    const isAudio = isAudioFile(file);
    const isImage = isImageFile(file);
    if (!isVideo && !isAudio && !isImage) {
      toast.error("Tipo inválido. Use imagem (JPG, PNG, GIF, WebP), vídeo (MP4, MOV, WEBM, AVI, MKV) ou áudio (MP3, AAC, WAV).");
      return;
    }
    setMediaFile(file);
    setMediaType(isVideo || isAudio ? "video" : "image");
    setUploadDone(false);
    setUploadedHash("");
    setUploadedVid("");
    setUploadedThumbHash("");
    setUploadedThumbPreview("");
    // ── Validar dimensões automaticamente para conformidade Meta ──
    getImageDimensions(file).then(dims => {
      setMediaDims(dims);
      const placements = selectedPlacements.length > 0
        ? selectedPlacements
        : placementMode === "auto"
        ? ["fb_feed", "ig_feed", "fb_story", "ig_story"]
        : ["fb_feed", "ig_feed"];
      const validation = validateMediaForPlacements(dims, placements);
      setMediaValidation(validation);
      if (validation.errors.length > 0) {
        toast.error("⚠️ " + validation.errors[0]);
      } else if (validation.warnings.length > 0) {
        toast.warning?.("⚠️ " + validation.warnings[0]);
      } else {
        toast.success("◎ Mídia compatível: " + dims.width + "×" + dims.height + "px (" + dims.ratio + ")");
      }
    }).catch(() => setMediaDims(null));
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (ev) => setMediaPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setMediaPreview("");
    }
  }

  const { data: campaign, isLoading, refetch: _refetch } = trpc.campaigns.get.useQuery({ id }, { enabled: !!id });
  refetchCampaign = _refetch;

  const adSets    = campaign ? parseJson((campaign as any).adSets) : null;
  const creatives = campaign ? parseJson((campaign as any).creatives) : null;
  const creativeList: CampaignCreative[] = Array.isArray(creatives) ? creatives : [];
  const funnel    = campaign ? parseJson((campaign as any).conversionFunnel) : null;
  const plan      = campaign ? parseJson((campaign as any).executionPlan) : null;
  const extra     = campaign ? parseJson((campaign as any).aiResponse) : null;
  const targetingConfig = extra?.targetingConfig || null;
  const leadFormDraft = extra?.leadFormDraft || null;
  const publishPreferences = extra?.publishPreferences || null;
  const metrics      = extra?.metrics      || null;
  const glossary     = extra?.glossary     || null;
  const suggestedName = extra?.campaignName || null;
  const hooks        = extra?.hooks        || null;
  const abTests      = extra?.abTests      || null;
  const tracking     = extra?.tracking     || null;
  const optimization = extra?.optimization || null;
  const scaling      = extra?.scaling      || null;
  // ── Helpers determinísticos para diagnóstico e priorização ──────────────────

  function diagnoseCTR(ctr: string | number | null): { label: string; color: string; detail: string } {
    const v = parseFloat(String(ctr || "0").replace(",", ".").replace("%", ""));
    if (!v) return { label: "Sem dados", color: "#94a3b8", detail: "CTR não disponível" };
    if (v >= 4)   return { label: "Excelente", color: "#059669", detail: `${v}% — acima da média. Escale com confiança.` };
    if (v >= 2)   return { label: "Bom",       color: "#2563eb", detail: `${v}% — dentro da média do setor. Otimize copy.` };
    if (v >= 1)   return { label: "Atenção",   color: "#d97706", detail: `${v}% — abaixo do ideal. Troque o criativo ou headline.` };
    return         { label: "Crítico",  color: "#dc2626", detail: `${v}% — muito baixo. Pausar e revisar público + criativo.` };
  }

  function diagnoseCPC(cpc: string | null, niche: string): { label: string; color: string; detail: string } {
    const v = parseFloat(String(cpc || "0").replace("R$", "").replace(",", ".").trim());
    if (!v) return { label: "Sem dados", color: "#94a3b8", detail: "CPC não disponível" };
    const isImoveis = /imov|imobi|apart|casa/i.test(niche);
    const isServico = /clinica|saude|beleza|academia/i.test(niche);
    const benchmarkLow  = isImoveis ? 0.5  : isServico ? 0.3  : 0.2;
    const benchmarkHigh = isImoveis ? 2.5  : isServico ? 1.5  : 1.0;
    if (v < benchmarkLow)  return { label: "Suspeito", color: "#d97706", detail: `R$${v.toFixed(2)} — muito baixo para o nicho. Pode ser público de baixa qualidade.` };
    if (v > benchmarkHigh) return { label: "Alto",     color: "#dc2626", detail: `R$${v.toFixed(2)} — acima do benchmark. Revisar segmentação.` };
    return                   { label: "Normal",   color: "#059669", detail: `R$${v.toFixed(2)} — dentro do esperado para ${niche}.` };
  }

  function calcROI(
    budget: number | null,
    leadsPerMonth: string | null,
    niche: string
  ): { ticketEstimado: number; valorPorLead: number; roiPotencial: string; insight: string } | null {
    const isImoveis = /imov|imobi|apart|casa/i.test(niche);
    const isAcademia = /academia|fitness|gym/i.test(niche);
    const isServico  = /clinica|saude|beleza|restaurante/i.test(niche);

    const tickets: Record<string, number> = {
      imoveis: 500_000, academia: 800, servico: 300, default: 1_500
    };
    const conversionRates: Record<string, number> = {
      imoveis: 0.02, academia: 0.15, servico: 0.10, default: 0.08
    };
    const commissions: Record<string, number> = {
      imoveis: 0.05, academia: 1.0, servico: 1.0, default: 1.0
    };

    const cat = isImoveis ? "imoveis" : isAcademia ? "academia" : isServico ? "servico" : "default";
    const ticket = tickets[cat];
    const conv   = conversionRates[cat];
    const comm   = commissions[cat];

    const leads = parseInt(String(leadsPerMonth || "0").replace(/\D/g, "")) || 0;
    if (!leads || !budget) return null;

    const salesPerMonth   = leads * conv;
    const revenuePerMonth = salesPerMonth * ticket * comm;
    const roiMultiplier   = budget > 0 ? (revenuePerMonth / budget) : 0;
    const valorPorLead    = leads > 0 ? revenuePerMonth / leads : 0;

    return {
      ticketEstimado: ticket,
      valorPorLead:   Math.round(valorPorLead),
      roiPotencial:   roiMultiplier >= 1 ? `${roiMultiplier.toFixed(1)}x` : `${Math.round(roiMultiplier * 100)}%`,
      insight: isImoveis
        ? `Ticket médio estimado R$ ${ticket.toLocaleString("pt-BR")}. Com ${leads} leads/mês e taxa de conversão ${conv * 100}%, cada lead pode valer até R$ ${Math.round(valorPorLead).toLocaleString("pt-BR")} em comissão.`
        : `Com ${leads} leads/mês e conversão de ${conv * 100}%, retorno potencial de R$ ${Math.round(revenuePerMonth).toLocaleString("pt-BR")}/mês sobre budget de R$ ${budget?.toLocaleString("pt-BR")}.`,
    };
  }

  function buildActionPlan(
    ctr: string | null,
    plan: any[] | null,
    hooks: any[] | null,
    abTests: any[] | null,
    creativeList: any[],
  ): Array<{ window: "AGORA" | "48H" | "7 DIAS"; icon: string; action: string; why: string }> {
    const actions: Array<{ window: "AGORA" | "48H" | "7 DIAS"; icon: string; action: string; why: string }> = [];
    const ctrVal = parseFloat(String(ctr || "0").replace(",", ".").replace("%", ""));

    // AGORA
    const hasVideo = creativeList.some(cr => cr.adType === "video" || cr.feedVideoId || cr.storyVideoId);
    if (!hasVideo) actions.push({ window: "AGORA", icon: "🎬", action: "Criar criativo em vídeo (15-30s)", why: "Vídeo gera 3x mais CTR que imagem no Meta. Maior impacto rápido." });
    if (ctrVal > 0 && ctrVal < 1) actions.push({ window: "AGORA", icon: "🛑", action: "Pausar anúncios com CTR < 1%", why: `CTR atual de ${ctrVal}% indica criativo ou público fraco.` });
    if (!hooks || hooks.length === 0) actions.push({ window: "AGORA", icon: "🎣", action: "Testar 3 hooks diferentes nos primeiros 3s", why: "Os primeiros 3 segundos definem 80% do resultado do vídeo." });
    if (actions.length < 1) actions.push({ window: "AGORA", icon: "📊", action: "Ativar a campanha e monitorar primeiras 48h", why: "Dados iniciais são críticos para ajustes rápidos." });

    // 48H
    if (abTests && abTests.length > 0) {
      actions.push({ window: "48H", icon: "🔀", action: `Iniciar Teste A/B: ${abTests[0]?.test || "Copy vs Headline"}`, why: "Testes paralelos aceleram a identificação do criativo vencedor." });
    }
    actions.push({ window: "48H", icon: "📝", action: "Adicionar prova social ao copy (depoimento real ou número)", why: "Proof points aumentam conversão em média 20-35%." });
    if (ctrVal >= 2) actions.push({ window: "48H", icon: "💰", action: "Aumentar budget 20% nos conjuntos com melhor CTR", why: `CTR de ${ctrVal}% acima da média — hora de escalar.` });

    // 7 DIAS
    actions.push({ window: "7 DIAS", icon: "👥", action: "Criar Lookalike 1-3% a partir dos leads gerados", why: "Lookalike de clientes reais é o público mais rentável do Meta." });
    actions.push({ window: "7 DIAS", icon: "🔁", action: "Ativar remarketing para visitantes dos últimos 7 dias", why: "Quem já viu o anúncio converte 2-5x mais barato." });
    if (plan && plan.length >= 2) actions.push({ window: "7 DIAS", icon: "📋", action: plan[1]?.action?.slice(0, 80) || "Executar Semana 2 do plano", why: "Seguir o plano estruturado garante consistência." });

    return actions.slice(0, 7); // máximo 7 ações
  }


  const leadFormsQuery = (trpc as any).integrations?.listLeadForms?.useQuery?.(
    { pageId: pageId.trim() },
    {
      enabled: showModal && leadDestination === "lead_form" && !!pageId.trim(),
      retry: false,
      staleTime: 30_000,
    }
  ) ?? { data: [], isLoading: false, refetch: () => undefined };

  useEffect(() => {
    setLoadingForms(!!leadFormsQuery.isLoading);
    if (Array.isArray(leadFormsQuery.data)) {
      setLeadForms(leadFormsQuery.data as any);
    }
  }, [leadFormsQuery.data, leadFormsQuery.isLoading]);

  // ── Preenche linkUrl automaticamente com WhatsApp padrão da conta ───────────
  // Prioridade: 1) WhatsApp salvo nas integrações, 2) WhatsApp do perfil do cliente
  useEffect(() => {
    if (!showModal || linkUrl.trim()) return; // Só preenche se modal abriu e campo vazio

    // 1. WhatsApp salvo nas configurações Meta
    const metaInt = (metaIntegration as any[])?.find(i => i.provider === "meta");
    if (metaInt?.whatsappPhone) {
      const digits = metaInt.whatsappPhone.replace(/\D/g, "");
      if (digits.length >= 8) {
        setLinkUrl(`https://wa.me/${digits}`);
        return;
      }
    }

    // 2. WhatsApp do perfil do cliente (socialLinks)
    const profile = clientProfile as any;
    if (profile?.socialLinks) {
      try {
        const social = JSON.parse(profile.socialLinks);
        const waUrl = social?.whatsappUrl || social?.whatsapp;
        if (waUrl && String(waUrl).includes("wa.me")) {
          setLinkUrl(String(waUrl));
          return;
        }
        if (waUrl) {
          const digits = String(waUrl).replace(/\D/g, "");
          if (digits.length >= 8) {
            setLinkUrl(`https://wa.me/${digits.startsWith("55") ? digits : "55" + digits}`);
            return;
          }
        }
      } catch {}
    }

    // 3. Site do cliente como fallback
    if (profile?.websiteUrl) {
      setLinkUrl(profile.websiteUrl);
    }
  }, [showModal, metaIntegration, clientProfile]);

  useEffect(() => {
    const campaignKey = Number((campaign as any)?.id || 0);
    if (!campaignKey || hydratedCampaignId === campaignKey) return;

    setAgeMin(Number(targetingConfig?.ageMin ?? 18));
    setAgeMax(Number(targetingConfig?.ageMax ?? 65));
    setLocationMode((targetingConfig?.locationMode || "brasil") as "brasil" | "paises" | "raio");
    setRegions(Array.isArray(targetingConfig?.regions) ? targetingConfig.regions : []);
    setCountries(Array.isArray(targetingConfig?.countries) ? targetingConfig.countries : []);
    setGeoCity(String(targetingConfig?.geoCity || ""));
    setGeoRadius(Number(targetingConfig?.geoRadius ?? 15));

    const objective = String((campaign as any)?.objective || "").toLowerCase();
    const preferredDestination = publishPreferences?.destination === "website" ? "website" : objective === "leads" ? "lead_form" : "website";
    setLeadDestination(preferredDestination);
    setHydratedCampaignId(campaignKey);
  }, [campaign, hydratedCampaignId, publishPreferences?.destination, targetingConfig]);

  useEffect(() => {
    const objective = String((campaign as any)?.objective || "").toLowerCase();
    if (showModal && objective === "leads" && !leadFormId) {
      setLeadDestination("lead_form");
    }
  }, [showModal, campaign, leadFormId]);

  useEffect(() => {
    if (leadDestination !== "lead_form") {
      setLeadFormId("");
      return;
    }
    const draftName = String(leadFormDraft?.name || "").trim().toLowerCase();
    if (!leadFormId && draftName) {
      const matched = leadForms.find((form) => String(form.name || "").trim().toLowerCase() === draftName);
      if (matched?.id) {
        setLeadFormId(matched.id);
        return;
      }
    }
    if (leadForms.length === 1 && !leadFormId) {
      setLeadFormId(leadForms[0].id);
    }
  }, [leadDestination, leadForms, leadFormId, leadFormDraft]);

  // ── Gera mensagem orgânica direcionada com dados reais da campanha ──────────
  function generateOrganicMessage(camp: any): string {
    const crs     = (() => { try { return JSON.parse(camp.creatives || "[]"); } catch { return []; } })();
    const sets    = (() => { try { return JSON.parse(camp.adSets    || "[]"); } catch { return []; } })();
    const extra   = (() => { try { return JSON.parse(camp.aiResponse || "{}"); } catch { return {}; } })();
    const hooks_  = extra?.hooks || [];

    // Pega o criativo principal (primeiro)
    const mainCreative = Array.isArray(crs) ? crs[0] : null;
    const hook    = mainCreative?.hook    || (Array.isArray(hooks_) ? hooks_[0]?.text || hooks_[0] : null) || "";
    const headline = mainCreative?.headline || "";
    const copy    = mainCreative?.copy    || "";
    const cta     = mainCreative?.cta     || "Saiba mais";

    // Público principal (primeiro ad set)
    const mainSet = Array.isArray(sets) ? sets[0] : null;
    const audience = mainSet?.audience || mainSet?.name || "";

    // Objetivo formatado
    const objMap: Record<string, string> = {
      leads: "captar leads qualificados",
      sales: "gerar vendas",
      traffic: "atrair visitantes",
      engagement: "engajar o público",
      awareness: "aumentar o reconhecimento da marca",
    };
    const objLabel = objMap[(camp.objective || "").toLowerCase()] || camp.objective || "";

    // Monta a mensagem em camadas
    const parts: string[] = [];

    // Hook — abertura impactante
    if (hook) {
      const hookClean = String(hook).replace(/^["']|["']$/g, "").trim();
      if (hookClean) parts.push(hookClean);
    }

    // Headline — proposta de valor
    if (headline) {
      parts.push(headline.trim());
    }

    // Copy — desenvolvimento
    if (copy) {
      const copyTrimmed = copy.trim().slice(0, 280);
      if (copyTrimmed && copyTrimmed !== headline) parts.push(copyTrimmed);
    }

    // Público / contexto
    if (audience && audience.length < 100) {
      parts.push(`📌 Para: ${audience}`);
    }

    // CTA final
    const ctaMap: Record<string, string> = {
      LEARN_MORE:    "👉 Saiba mais",
      SIGN_UP:       "📝 Cadastre-se agora",
      CONTACT_US:    "📞 Entre em contato",
      APPLY_NOW:     "◎ Solicite agora",
      GET_QUOTE:     "💬 Peça um orçamento",
      BOOK_NOW:      "📅 Agende agora",
      SHOP_NOW:      "🛒 Compre agora",
      WHATSAPP_MESSAGE: "📲 Fale pelo WhatsApp",
      CALL_NOW:      "📞 Ligue agora",
      MESSAGE_PAGE:  "💬 Envie uma mensagem",
    };
    const ctaText = ctaMap[(cta || "").toUpperCase()] || `👉 ${cta}`;
    parts.push(ctaText);

    // Hashtags baseadas no nicho / objetivo
    const nicho = (extra?.niche || camp.name || "").toLowerCase();
    const hashtagsBase = ["#publicidade", "#marketing"];
    if (nicho.includes("financ") || nicho.includes("crédito") || nicho.includes("invest"))
      hashtagsBase.push("#financas", "#credito", "#investimentos");
    else if (nicho.includes("imóv") || nicho.includes("imov") || nicho.includes("corret"))
      hashtagsBase.push("#imoveis", "#imobiliaria");
    else if (nicho.includes("saúd") || nicho.includes("saud") || nicho.includes("med"))
      hashtagsBase.push("#saude", "#bemestar");
    else if (nicho.includes("educ") || nicho.includes("curso") || nicho.includes("ensino"))
      hashtagsBase.push("#educacao", "#cursos");
    parts.push(hashtagsBase.slice(0, 4).join(" "));

    return parts.filter(Boolean).join("\n\n");
  }

  function inferCreativeFormat(creative: any): "feed" | "stories" | "square" {
    const format = String(creative?.format || creative?.type || creative?.orientation || "").toLowerCase();
    if (/(story|stories|reels|9:16)/i.test(format)) return "stories";
    if (/(1:1|square|quadrado)/i.test(format)) return "square";
    return "feed";
  }

  function getCreativeMediaState(creative: CampaignCreative, preferredFormat: "feed" | "stories" | "square") {
    const mergedCreative = mergeCreativeWithProjectedLegacy(creative);
    const resolvedUrl = resolveLegacyImageUrlByFormat(mergedCreative, preferredFormat as CreativeFormat | undefined);
    const resolvedHash = resolveLegacyImageHashByFormat(mergedCreative, preferredFormat as CreativeFormat | undefined);
    const publishMedia = buildPublishMediaFromCreative(mergedCreative, preferredFormat as CreativeFormat | undefined);
    const hasRealImageUrl = !!resolvedUrl && !resolvedUrl.includes("placehold.co") && !resolvedUrl.startsWith("data:image/svg");
    const cachedPreviewUrl = resolvedHash ? creativePreviewByHash[resolvedHash] || null : null;
    const previewUrl = cachedPreviewUrl || (hasRealImageUrl ? resolvedUrl : null) || publishMedia?.videoThumbnailUrl || null;
    const hasRealVisual = !!resolvedHash || !!hasRealImageUrl || !!publishMedia?.videoId || !!publishMedia?.videoThumbnailHash || !!publishMedia?.videoThumbnailUrl;

    return {
      mergedCreative,
      previewUrl,
      resolvedUrl,
      resolvedHash,
      publishMedia,
      hasRealVisual,
    };
  }

  function getCreativeImage(creative: CampaignCreative, preferredFormat?: "feed" | "stories" | "square"): string {
    const mediaState = getCreativeMediaState(creative, preferredFormat || "feed");
    if (!mediaState.previewUrl) {
      return buildCreativeSvg(creative, preferredFormat || "feed");
    }
    return mediaState.previewUrl;
  }

  function getPreferredFormatsForUploadedRatio(ratio?: string | null): Array<"feed" | "stories" | "square"> {
    const normalized = normalizeRatio(ratio || undefined);
    if (normalized === "9:16") return ["stories", "feed", "square"];
    if (normalized === "1:1") return ["square", "feed", "stories"];
    return ["feed", "square", "stories"];
  }

  async function autoAssignUploadedImagesToEmptyCreatives(items: Array<{ hash: string; ratio?: string | null }>) {
    if (!items.length || !updateCreativeImageMutation.mutateAsync) {
      return { assigned: 0, failed: 0, skipped: items.length };
    }

    const availableSlots = creativeList
      .map((creative, creativeIndex) => {
        const format = inferCreativeFormat(creative);
        const mediaState = getCreativeMediaState(creative, format);
        return mediaState.hasRealVisual ? null : { creativeIndex, format };
      })
      .filter(Boolean) as Array<{ creativeIndex: number; format: "feed" | "stories" | "square" }>;

    if (!availableSlots.length) {
      return { assigned: 0, failed: 0, skipped: items.length };
    }

    let assigned = 0;
    let failed = 0;
    const remainingSlots = [...availableSlots];
    autoAssigningCreativeImagesRef.current = true;

    try {
      for (const item of items) {
        if (!remainingSlots.length) break;

        const preferredFormats = getPreferredFormatsForUploadedRatio(item.ratio);
        const preferredSlotIndex = remainingSlots.findIndex((slot) => preferredFormats.includes(slot.format));
        const slotIndex = preferredSlotIndex >= 0 ? preferredSlotIndex : 0;
        const slot = remainingSlots[slotIndex];
        if (!slot) break;

        try {
          await updateCreativeImageMutation.mutateAsync({
            campaignId: id,
            creativeIndex: slot.creativeIndex,
            format: slot.format,
            imageUrl: undefined,
            imageHash: item.hash,
          });
          assigned += 1;
          remainingSlots.splice(slotIndex, 1);
        } catch {
          failed += 1;
        }
      }
    } finally {
      autoAssigningCreativeImagesRef.current = false;
    }

    if (assigned > 0) {
      await refetchCampaign?.();
      toast.success(`◎ ${assigned} criativo(s) sem imagem foram preenchidos automaticamente.`);
    }
    if (failed > 0) {
      toast.warning?.(`⚠️ ${failed} mídia(s) não puderam ser vinculadas automaticamente aos criativos vazios.`);
    }

    return {
      assigned,
      failed,
      skipped: Math.max(items.length - assigned - failed, 0),
    };
  }



  // ── SVG premium como preview de criativo ────────────────────────────────────
  function buildCreativeSvg(creative: any, format: "feed" | "stories" | "square"): string {
    try {
      const headline = String(creative?.headline || creative?.hook || "Criativo").slice(0, 44);
      const copy     = String(creative?.copy || creative?.bodyText || "").slice(0, 110);
      const cta      = String(creative?.cta || "Saiba Mais").slice(0, 28);
      const funnel   = String(creative?.funnelStage || "TOF");
      const type     = String(creative?.type || creative?.format || "");
      const angle    = String(creative?.angle || "");

      // Paletas premium por funil
      const pals: Record<string, { bg: string; bg2: string; ac: string; tx: string; sub: string; btn: string }> = {
        TOF: { bg: "#0a0f1e", bg2: "#0d1b3e", ac: "#4f8ef7", tx: "#f0f4ff", sub: "#8fa3cc", btn: "#1a56db" },
        MOF: { bg: "#12082a", bg2: "#1e0f40", ac: "#9d6ef9", tx: "#f3f0ff", sub: "#9b85c8", btn: "#6d28d9" },
        BOF: { bg: "#031a0e", bg2: "#062d18", ac: "#22d07a", tx: "#f0fff7", sub: "#71c998", btn: "#059652" },
      };
      const p = pals[funnel] || pals["TOF"];

      const W = 400;
      const H = format === "stories" ? 711 : format === "square" ? 400 : 500;

      // Escape XML seguro — sem chars não-ASCII no btoa
      const x = (s: string) => s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/[^\u0000-\u007f]/g, c => "&#" + c.charCodeAt(0) + ";");

      // Quebrar headline em linhas
      const hlWords = headline.split(" ");
      const hlLines: string[] = [];
      let hlCur = "";
      for (const w of hlWords) {
        const test = (hlCur ? hlCur + " " : "") + w;
        if (test.length > 20) { if (hlCur) hlLines.push(hlCur); hlCur = w; }
        else hlCur = test;
      }
      if (hlCur) hlLines.push(hlCur);
      const hl = hlLines.slice(0, 3);

      // Quebrar copy
      const cpWords = copy.split(" ");
      const cpLines: string[] = [];
      let cpCur = "";
      for (const w of cpWords) {
        const test = (cpCur ? cpCur + " " : "") + w;
        if (test.length > 42) { if (cpCur) cpLines.push(cpCur); cpCur = w; }
        else cpCur = test;
      }
      if (cpCur) cpLines.push(cpCur);
      const cp = cpLines.slice(0, 3);

      const yHL   = 115;
      const yCP   = yHL + hl.length * 34 + 18;
      const yBTN  = H - 68;

      // Tipo de criativo como badge
      const typeLabel = type.includes("video") ? "VIDEO" : type.includes("carousel") ? "CARROSSEL"
        : type.includes("story") ? "STORY" : "IMAGEM";
      const angleLabel = angle ? angle.replace(/_/g, " ").toUpperCase().slice(0, 18) : "";

      let s = "";
      s += `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
      s += "<defs>";
      // Gradiente de fundo
      s += `<linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">`;
      s += `<stop offset="0%" stop-color="${p.bg}"/>`;
      s += `<stop offset="100%" stop-color="${p.bg2}"/>`;
      s += "</linearGradient>";
      // Gradiente de brilho superior
      s += `<linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">`;
      s += `<stop offset="0%" stop-color="${p.ac}" stop-opacity="0.25"/>`;
      s += `<stop offset="100%" stop-color="${p.ac}" stop-opacity="0"/>`;
      s += "</linearGradient>";
      // Gradiente inferior overlay
      s += `<linearGradient id="bot" x1="0" y1="0" x2="0" y2="1">`;
      s += `<stop offset="0%" stop-color="rgba(0,0,0,0)" stop-opacity="0"/>`;
      s += `<stop offset="100%" stop-color="rgba(0,0,0,0.65)" stop-opacity="1"/>`;
      s += "</linearGradient>";
      s += `<filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>`;
      s += "</defs>";

      // Fundo
      s += `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
      // Círculo de brilho decorativo
      s += `<circle cx="${W * 0.75}" cy="${H * 0.18}" r="120" fill="${p.ac}" opacity="0.06" filter="url(#blur)"/>`;
      s += `<circle cx="${W * 0.15}" cy="${H * 0.75}" r="90" fill="${p.ac}" opacity="0.05" filter="url(#blur)"/>`;
      // Overlay brilho lateral
      s += `<rect x="0" y="0" width="${W * 0.5}" height="${H}" fill="url(#glow)"/>`;
      // Overlay escuro inferior
      s += `<rect x="0" y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#bot)"/>`;
      // Linha decorativa lateral
      s += `<rect x="0" y="0" width="3" height="${H}" fill="${p.ac}" opacity="0.9"/>`;
      // Linha horizontal sutil no topo
      s += `<rect x="0" y="0" width="${W}" height="1" fill="${p.ac}" opacity="0.2"/>`;

      // Badge de tipo/funil (topo esquerda)
      s += `<rect x="16" y="18" rx="5" ry="5" width="${typeLabel.length * 7 + 16}" height="20" fill="${p.ac}" opacity="0.2"/>`;
      s += `<text x="24" y="32" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" fill="${p.ac}" letter-spacing="1">${x(typeLabel)}</text>`;

      // Badge de ângulo (se existir)
      if (angleLabel) {
        const ax = typeLabel.length * 7 + 40;
        s += `<rect x="${ax}" y="18" rx="5" ry="5" width="${angleLabel.length * 6 + 14}" height="20" fill="${p.ac}" opacity="0.12"/>`;
        s += `<text x="${ax + 7}" y="32" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="600" fill="${p.sub}">${x(angleLabel)}</text>`;
      }

      // Separador
      s += `<rect x="16" y="52" width="32" height="2" rx="1" fill="${p.ac}" opacity="0.8"/>`;

      // Funil badge
      s += `<text x="56" y="65" font-family="Arial,Helvetica,sans-serif" font-size="10" fill="${p.sub}" opacity="0.8">${x(funnel)} · MECPro AI</text>`;

      // Headline
      hl.forEach((line, i) => {
        s += `<text x="16" y="${yHL + i * 34}" font-family="Arial,Helvetica,sans-serif" font-size="${i === 0 ? 24 : 22}" font-weight="800" fill="${p.tx}">${x(line)}</text>`;
      });

      // Copy
      cp.forEach((line, i) => {
        s += `<text x="16" y="${yCP + i * 20}" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${p.sub}">${x(line)}</text>`;
      });

      // Botão CTA
      const btnW = Math.min(cta.length * 9 + 28, W - 32);
      s += `<rect x="16" y="${yBTN}" rx="8" ry="8" width="${btnW}" height="34" fill="${p.btn}"/>`;
      s += `<rect x="16" y="${yBTN}" rx="8" ry="8" width="${btnW}" height="34" fill="${p.ac}" opacity="0.2"/>`;
      s += `<text x="${16 + btnW / 2}" y="${yBTN + 22}" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" fill="white" text-anchor="middle">${x(cta)}</text>`;

      // Watermark sutil
      s += `<text x="${W - 12}" y="${H - 10}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="${p.sub}" opacity="0.4" text-anchor="end">mecproai.com</text>`;

      s += "</svg>";

      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    } catch {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#0a0f1e"/><text x="20" y="60" font-family="Arial" font-size="18" font-weight="800" fill="white">Criativo</text></svg>'
      );
    }
  }

  function getScoreBadge(score?: number) {
    const numericScore = Number(score || 0);
    if (numericScore >= 75) return { label: `${numericScore}/100`, bg: "#dcfce7", color: "#166534" };
    if (numericScore >= 60) return { label: `${numericScore}/100`, bg: "#fef3c7", color: "#92400e" };
    return { label: `${numericScore}/100`, bg: "#fee2e2", color: "#b91c1c" };
  }

  function parseJson(str: string | null) {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  }

  if (isLoading) return (
    <Layout>
      <div style={{ textAlign: "center", padding: 80, color: "var(--muted)" }}>Carregando campanha...</div>
    </Layout>
  );

  if (!campaign) return (
    <Layout>
      <div style={{ textAlign: "center", padding: 80 }}>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Campanha não encontrada.</p>
        <button className="btn btn-md btn-primary" onClick={() => setLocation(`/projects/${projectId}/campaign`)}>Criar campanha</button>
      </div>
    </Layout>
  );

  const c = campaign as any;
  const budgetDaily = c.suggestedBudgetDaily ?? Math.round(c.suggestedBudgetMonthly / 30);
  const activePlacementCodes = selectedPlacements.length > 0
    ? selectedPlacements
    : placementMode === "auto"
      ? ["fb_feed", "ig_feed", "fb_story", "ig_story"]
      : ["fb_feed", "ig_feed"];
  const guidancePlacements = uniqueGuidancePlacements(activePlacementCodes);
  const uploadedImageCount = mediaFiles.filter((file) => isImageFile(file)).length;
  const uploadedHashCount = uploadedHashes.filter(Boolean).length;
  const cardsCount = Math.max(uploadedImageCount, uploadedHashCount);
  const isCarouselMedia = cardsCount >= 2;
  const primaryCreative = creativeList.length > 0 ? mergeCreativeWithProjectedLegacy(creativeList[0] as any) : null;
  const fallbackCreativeFormat = primaryCreative ? inferCreativeFormat(primaryCreative) : null;
  const fallbackRatio = fallbackCreativeFormat === "stories"
    ? "9:16"
    : fallbackCreativeFormat === "square"
      ? "1:1"
      : fallbackCreativeFormat === "feed"
        ? "4:5"
        : undefined;
  const fallbackMediaType: GuidanceMediaType = primaryCreative?.publishMedia?.videoId
    ? "video"
    : primaryCreative
      ? "image"
      : "unknown";
  const detectedGuidanceMediaType: GuidanceMediaType = (mediaFiles.length === 1 && isVideoFile(mediaFiles[0])) || mediaType === "video" || !!uploadedVid
    ? "video"
    : isCarouselMedia || mediaType === "image" || !!uploadedHash || !!imageUrl.trim() || uploadedHashCount > 0
      ? "image"
      : fallbackMediaType;
  const detectedGuidanceRatio = normalizeRatio(isCarouselMedia ? "mixed" : mediaDims?.ratio || fallbackRatio);
  const guidanceContextLabel = formatGuidanceContext(detectedGuidanceMediaType, detectedGuidanceRatio, cardsCount);
  const guidanceSourceLabel = mediaFiles.length > 0 || !!mediaType || !!uploadedHash || !!uploadedVid || !!imageUrl.trim()
    ? "Baseado na mídia atual selecionada"
    : primaryCreative
      ? "Baseado no criativo salvo da campanha"
      : "Envie uma mídia para receber orientação automática";
  const placementGuidanceCards: Array<{ key: string; placement: GuidancePlacementType; guidance: PlacementGuidanceItem }> = [];

  if (isCarouselMedia) {
    placementGuidanceCards.push({
      key: `carousel-${cardsCount}`,
      placement: "carousel",
      guidance: getPlacementGuidance({
        placement: "carousel",
        mediaType: detectedGuidanceMediaType,
        ratio: isCarouselMedia ? "mixed" : mediaDims?.ratio || fallbackRatio,
        cardsCount,
      }),
    });
  }

  for (const placement of guidancePlacements) {
    placementGuidanceCards.push({
      key: `${placement}-${detectedGuidanceMediaType}-${detectedGuidanceRatio}`,
      placement,
      guidance: getPlacementGuidance({
        placement,
        mediaType: detectedGuidanceMediaType,
        ratio: mediaDims?.ratio || fallbackRatio,
        cardsCount,
      }),
    });
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 4px", fontFamily: "var(--font)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setLocation(`/projects/${projectId}/campaign`)} style={{ paddingLeft: 0 }}>← Módulo 4</button>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>{c.name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: "var(--green-xl)", color: "var(--green-dk)", padding: "3px 10px", borderRadius: 6 }}>{c.objective}</span>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1e40af", padding: "3px 10px", borderRadius: 6 }}>{c.platform}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Gerada em {c.generatedAt ? new Date(c.generatedAt).toLocaleDateString("pt-BR") : "—"}</span>
            {/* Badge de status de publicação */}
            {(c as any).publishStatus && (c as any).publishStatus !== "draft" && (() => {
              const s = (c as any).publishStatus;
              const cfg: Record<string, { label: string; bg: string; color: string }> = {
                processing: { label: "⏳ Publicando...", bg: "#fef3c7", color: "#92400e" },
                success:    { label: "◎ Publicado",    bg: "#dcfce7", color: "#166534" },
                error:      { label: "✕ Erro",         bg: "#fee2e2", color: "#dc2626" },
              };
              const c2 = cfg[s];
              if (!c2) return null;
              return (
                <span style={{ fontSize: 11, fontWeight: 700, background: c2.bg, color: c2.color, padding: "3px 10px", borderRadius: 6 }}>
                  {c2.label}
                </span>
              );
            })()}
            {(c as any).publishStatus === "success" && (c as any).metaCampaignId && (
              <a href={`https://www.facebook.com/adsmanager/manage/campaigns`} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: "#1877f2", fontWeight: 700 }}>
                Ver no Ads Manager →
              </a>
            )}
            {(c as any).publishStatus === "error" && (c as any).publishError && (
              <span title={(c as any).publishError} style={{ fontSize: 11, color: "#dc2626", cursor: "help" }}>
                ⓘ {((c as any).publishError as string).slice(0, 60)}...
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-md btn-ghost" onClick={() => window.print()}>⬇ Exportar</button>
          <button
            className="btn btn-md"
            style={{ background: "#30d158", color: "white", fontWeight: 700, fontSize: 12 }}
            onClick={() => window.location.href = `/marketplace/publish?campaignId=${c.id}`}>
            🛒 Publicar no Marketplace
          </button>
          <button
            onClick={() => {
              setOrganicMessage(generateOrganicMessage(c));
              setOrganicResult(null);
              setDiscoverError("");
              setOrganicPageName("");
              setOrganicImageFile(null);
              setOrganicImagePreview("");
              setOrganicImageBase64("");
              // Auto-fill page ID from clientProfile if available
              const cp = clientProfile as any;
              if (cp?.facebookPageId) {
                setOrganicPageId(cp.facebookPageId);
                setOrganicPageName(cp.facebookPageUrl || "");
              } else if (cp?.instagramUrl || cp?.socialLinks) {
                // Extract IG handle and auto-discover
                const igRaw = cp.instagramUrl || "";
                const handle = igRaw.replace(/.*instagram\.com\//, "").replace(/\/$/, "").replace(/^@/, "").trim();
                setOrganicHandle(handle);
                setOrganicPageId("");
              }
              // Carrega páginas automaticamente ao abrir modal orgânico
              if (pages.length === 0 && !loadingPages) fetchPages();
              setShowOrganicModal(true);
            }}
            style={{ background: "white", border: "1.5px solid #1877f2", color: "#1877f2", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
            📝 Post Orgânico
          </button>
          <button onClick={() => checkComplianceAndPublish()}
            className="btn-publish" style={{ background: checkingCompliance ? "#93c5fd" : "#1877f2", color: "white", fontWeight: 700, fontSize: 13, padding: "10px 20px", borderRadius: 10, border: "none", cursor: checkingCompliance ? "wait" : "pointer", transition: "all .2s ease" }}>
            {checkingCompliance ? "🔍 Verificando compliance..." : "📘 Publicar no Meta Ads"}
          </button>
          <button
            onClick={() => setShowValidator(v => !v)}
            style={{ background: showValidator ? "#1e293b" : "var(--off)", color: showValidator ? "white" : "var(--black)",
              fontWeight: 700, fontSize: 12, padding: "8px 14px", borderRadius: 10,
              border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            {showValidator ? "✕ Fechar checklist" : "✓ Checklist de publicação"}
          </button>
          <button
            onClick={() => setShowAudit(a => !a)}
            style={{ background: showAudit ? "#1e293b" : "var(--off)", color: showAudit ? "white" : "var(--black)",
              fontWeight: 700, fontSize: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🔍 {showAudit ? "Fechar Auditoria" : "Auditar campanha"}
          </button>
          <button
            onClick={() => setShowPixel(p => !p)}
            style={{ background: showPixel ? "#1e293b" : "var(--off)", color: showPixel ? "white" : "var(--black)",
              fontWeight: 700, fontSize: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            📡 {showPixel ? "Fechar Pixel" : "Pixel & Audiências"}
          </button>
          <button
            onClick={() => {
              if (!id || id <= 0) { toast.error("Campanha inválida. Gere a campanha primeiro."); return; }
              if (!projectId || projectId <= 0) { toast.error("Projeto inválido."); return; }
              setLocation(`/projects/${projectId}/campaign/result/${id}/google`);
            }}
            style={{ background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer" }}>
            🔵 Google Ads
          </button>
          <button
            onClick={() => {
              if (!id || id <= 0) { toast.error("Campanha inválida. Gere a campanha primeiro."); return; }
              if (!projectId || projectId <= 0) { toast.error("Projeto inválido."); return; }
              setLocation(`/projects/${projectId}/campaign/result/${id}/tiktok`);
            }}
            style={{ background: "#010101", color: "white", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer" }}>
            🎵 TikTok Ads
          </button>
        </div>
      </div>

      {/* ── Inteligência Competitiva usada ── */}
      {(c as any).competitorInsights && (() => {
        let ci: any = null;
        try { ci = JSON.parse((c as any).competitorInsights); } catch {}
        if (!ci) return null;
        return (
          <div style={{ background: "#f8faff", border: "1px solid #c7d2fe", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#3730a3", marginBottom: 10 }}>
              🧠 Inteligência Competitiva Aplicada nesta Campanha
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontSize: 12 }}>
              {ci.competitors && (
                <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #e0e7ff" }}>
                  <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>🏢 Concorrentes Analisados</div>
                  <div>{ci.competitors.join(", ")}</div>
                </div>
              )}
              {ci.totalAds !== undefined && (
                <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #e0e7ff" }}>
                  <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>📊 Anúncios Analisados</div>
                  <div>{ci.totalAds} anúncios ({ci.activeAds} ativos)</div>
                </div>
              )}
              {ci.topCtas && (
                <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #e0e7ff" }}>
                  <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>🎯 CTAs dos Concorrentes</div>
                  <div>{ci.topCtas.join(", ")}</div>
                </div>
              )}
              {ci.dominantFormat && (
                <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #e0e7ff" }}>
                  <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>🎨 Formato Dominante</div>
                  <div>{ci.dominantFormat} (usamos diferente para se destacar)</div>
                </div>
              )}
              {ci.positioning && (
                <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #e0e7ff", gridColumn: "span 2" }}>
                  <div style={{ color: "#6366f1", fontWeight: 700, marginBottom: 4 }}>💡 Diferencial Estratégico</div>
                  <div>{ci.positioning}</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── RESUMO EXECUTIVO ── */}
      {(() => {
        const cpl    = metrics?.cpl_estimado || metrics?.cpl || null;
        const ctr    = metrics?.ctr || null;
        const leads  = metrics?.leads_per_month || metrics?.leads_estimados || null;
        const budget = c.suggestedBudgetMonthly || 0;

        const getStatus = (type: string, val: any) => {
          if (!val) return "neutral";
          const n = parseFloat(String(val).replace(/[^0-9.,]/g, "").replace(",", "."));
          if (type === "cpl")   return n < 100 ? "good" : n < 300 ? "warning" : "danger";
          if (type === "ctr")   return n >= 1.5 ? "good" : n >= 0.85 ? "warning" : "danger";
          if (type === "leads") return n >= 20 ? "good" : n >= 10 ? "warning" : "danger";
          return "neutral";
        };

        const statusColor = (s: string) => s === "good" ? "#16a34a" : s === "warning" ? "#d97706" : s === "danger" ? "#dc2626" : "#64748b";
        const statusBg    = (s: string) => s === "good" ? "#f0fdf4" : s === "warning" ? "#fffbeb" : s === "danger" ? "#fef2f2" : "#f8fafc";
        const statusIcon  = (s: string) => s === "good" ? "◎" : s === "warning" ? "◬" : s === "danger" ? "🔴" : "📊";

        const cplStatus   = getStatus("cpl", cpl);
        const ctrStatus   = getStatus("ctr", ctr);
        const leadsStatus = getStatus("leads", leads);

        // Ação recomendada baseada nos status
        const action =
          ctrStatus === "danger"    ? "Trocar criativos — CTR baixo indica anúncio pouco atrativo" :
          cplStatus === "danger"    ? "Ajustar segmentação — CPL alto indica público errado" :
          leadsStatus === "warning" ? "Aumentar orçamento para escalar volume de leads" :
          ctrStatus === "warning"   ? "Testar novos hooks e CTAs para melhorar CTR" :
          "Campanha bem configurada — monitore os primeiros 3 dias";

        const actionUrgency =
          ctrStatus === "danger" || cplStatus === "danger" ? "alta" :
          ctrStatus === "warning" || cplStatus === "warning" ? "média" : "baixa";

        return (
          <div style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
            borderRadius: 18, padding: "20px 24px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Resumo Executivo</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: "white", margin: "4px 0 0" }}>{c.name}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.8)" }}>
                  {c.objective}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.8)" }}>
                  {c.platform}
                </span>
              </div>
            </div>

            {/* Métricas principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
              {[
                { label: "CPL estimado",    value: cpl    ? `R$ ${parseFloat(String(cpl).replace(/[^0-9.,]/g,"").replace(",",".")).toFixed(0)}` : "—", status: cplStatus,   icon: "🎯" },
                { label: "CTR estimado",    value: ctr    ? `${parseFloat(String(ctr).replace(/[^0-9.,]/g,"").replace(",",".")).toFixed(2)}%`    : "—", status: ctrStatus,   icon: "📉" },
                { label: "Leads/mês est.", value: leads  ? `${Math.round(parseFloat(String(leads).replace(/[^0-9.,]/g,"").replace(",",".")))}`   : "—", status: leadsStatus, icon: "🔥" },
                { label: "Budget/mês",      value: budget ? `R$ ${budget.toLocaleString("pt-BR")}`                                                     : "—", status: "neutral",  icon: "◈" },
              ].map(m => (
                <div key={m.label} style={{ background: statusBg(m.status), borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: statusColor(m.status), textTransform: "uppercase" }}>{m.status !== "neutral" ? m.status : ""}</span>
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: statusColor(m.status), margin: 0, fontFamily: "var(--font-display)" }}>{m.value}</p>
                  <p style={{ fontSize: 10, color: "#64748b", margin: "2px 0 0" }}>{m.label}</p>
                </div>
              ))}
            </div>

            {/* Ação recomendada */}
            <div style={{
              background: actionUrgency === "alta" ? "rgba(239,68,68,.15)" : actionUrgency === "média" ? "rgba(245,158,11,.15)" : "rgba(34,197,94,.15)",
              border: `1px solid ${actionUrgency === "alta" ? "rgba(239,68,68,.3)" : actionUrgency === "média" ? "rgba(245,158,11,.3)" : "rgba(34,197,94,.3)"}`,
              borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>
                {actionUrgency === "alta" ? "🚨" : actionUrgency === "média" ? "⚡" : "◎"}
              </span>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.5)", margin: 0, textTransform: "uppercase" }}>
                  Ação recomendada — prioridade {actionUrgency}
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,.85)", margin: "2px 0 0" }}>{action}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── NAVEGAÇÃO POR PLATAFORMA ── */}
      {(() => {
        const platform = (c.platform || "meta").toLowerCase();
        const tabs = [
          { key: "overview", label: "Visão Geral",  icon: "📊" },
          ...(platform.includes("meta")   || platform === "both" || platform === "all" ? [{ key: "meta",   label: "Meta Ads",   icon: "📘" }] : []),
          ...(platform.includes("google") || platform === "both" || platform === "all" ? [{ key: "google", label: "Google Ads", icon: "🔍" }] : []),
          ...(platform.includes("tiktok") || platform === "all"                        ? [{ key: "tiktok", label: "TikTok Ads", icon: "🎵" }] : []),
        ] as { key: string; label: string; icon: string }[];

        if (tabs.length <= 2) return null; // só mostra se tiver mais de 1 plataforma

        return (
          <div style={{ display: "flex", gap: 0, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 20 }}>
            {tabs.map((tab, i) => (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  flex: 1, padding: "12px 16px", border: "none", cursor: "pointer",
                  borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                  background: activeTab === tab.key ? "var(--navy)" : "white",
                  color: activeTab === tab.key ? "white" : "var(--muted)",
                  fontSize: 12, fontWeight: 700, transition: "all .15s",
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* KPIs orçamento — redesign premium */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Budget diário",  value: budgetDaily ? `R$ ${budgetDaily.toLocaleString("pt-BR")}` : "—", sub: "por dia de veiculação", icon: "📅", accent: "#16a34a", bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)" },
          { label: "Budget mensal",  value: c.suggestedBudgetMonthly ? `R$ ${c.suggestedBudgetMonthly.toLocaleString("pt-BR")}` : "—", sub: "investimento total", icon: "◈", accent: "#2563eb", bg: "linear-gradient(135deg,#eff6ff,#dbeafe)" },
          { label: "Duração",        value: c.durationDays ? `${c.durationDays}d` : "—", sub: c.durationDays ? `${Math.round(c.durationDays/7)} semanas` : "", icon: "⏱", accent: "#d97706", bg: "linear-gradient(135deg,#fffbeb,#fef3c7)" },
          { label: "Plataforma",     value: c.platform === "both" ? "Meta+Google" : c.platform === "all" ? "Multi" : (c.platform||"meta").toUpperCase(), sub: c.platform === "tiktok" ? "TikTok Ads" : c.platform === "both" ? "Meta + Google Ads" : c.platform === "all" ? "Meta+Google+TikTok" : "Facebook + Instagram", icon: c.platform === "tiktok" ? "🎵" : c.platform === "google" ? "🔍" : "📘", accent: "#7c3aed", bg: "linear-gradient(135deg,#faf5ff,#ede9fe)" },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 16, padding: "16px 18px", border: `1.5px solid ${k.accent}22`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -8, right: -8, fontSize: 48, opacity: 0.08 }}>{k.icon}</div>
            <p style={{ fontSize: 10, fontWeight: 700, color: k.accent, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 0 8px" }}>{k.label}</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: k.accent, fontFamily: "var(--font-display)", margin: 0, lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 10, color: "#64748b", margin: "4px 0 0" }}>{k.sub}</p>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `${k.accent}33` }}>
              <div style={{ height: "100%", background: k.accent, width: "100%", opacity: 0.6 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* Estratégia — redesign em cards com leitura rápida */}
        {c.strategy && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎯</span>
                Estratégia da campanha
              </p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "var(--green-xl)", color: "var(--green-dk)" }}>
                IA Gerada
              </span>
            </div>
            {/* Divide estratégia em parágrafos para facilitar leitura */}
            {/* Divide estratégia em parágrafos */}
            {(() => {
              const paras = (c.strategy as string).split("\n\n").filter((p: string) => p.trim());
              if (paras.length > 1) return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {paras.map((para: string, i: number) => (
                    <div key={i} style={{
                      padding: "12px 16px", borderRadius: 10,
                      background: i === 0 ? "var(--navy)" : "var(--off)",
                      borderLeft: i > 0 ? "3px solid var(--green)" : "none",
                    }}>
                      <p style={{ fontSize: 13, color: i === 0 ? "rgba(255,255,255,.85)" : "var(--body)", lineHeight: 1.7, margin: 0 }}>{para.trim()}</p>
                    </div>
                  ))}
                </div>
              );
              return (
                <div style={{ padding: "14px 18px", background: "var(--off)", borderRadius: 12, borderLeft: "3px solid var(--green)" }}>
                  <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.8, margin: 0 }}>{c.strategy}</p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Ad Sets */}
        {adSets && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📦</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Conjuntos de anúncios</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{Array.isArray(adSets) ? adSets.length : 0} conjunto(s) criado(s)</p>
                </div>
              </div>
              <button
                onClick={() => setShowRegenModal("adSets")}
                style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              >
                🔄 Regenerar públicos
              </button>
            </div>
            {Array.isArray(adSets) ? adSets.map((s: any, i: number) => (
              <div key={i} className="adset-card" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 10, transition: "all .2s ease" }}>
                {editingAdSet === i ? (
                  // ── Modo edição ──
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input value={editDraft.name ?? s.name ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, name: e.target.value }))}
                      placeholder="Nome do conjunto" className="input input-sm w-full" />
                    <textarea value={editDraft.audience ?? s.audience ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, audience: e.target.value }))}
                      placeholder="Público-alvo" className="textarea w-full" rows={2} />
                    <input value={editDraft.budget ?? s.budget ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, budget: e.target.value }))}
                      placeholder="Budget (ex: R$ 50/dia)" className="input input-sm w-full" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { updateAdSetMutation.mutate({ campaignId: id, index: i, ...editDraft }); }}
                        disabled={updateAdSetMutation.isLoading}
                        className="btn btn-sm btn-green">
                        {updateAdSetMutation.isLoading ? "Salvando..." : "◎ Salvar"}
                      </button>
                      <button onClick={() => { setEditingAdSet(null); setEditDraft({}); }} className="btn btn-sm btn-ghost">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  // ── Modo visualização ──
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 6 }}>
                        {s.name || `Conjunto ${i + 1}`}
                        {s._edited && <span style={{ fontSize: 10, marginLeft: 6, color: "#7c3aed", fontWeight: 700 }}>✏️ editado</span>}
                      </p>
                      <button onClick={() => { setEditingAdSet(i); setEditDraft({}); }}
                        style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                        ✏️ Editar
                      </button>
                    </div>
                    {s.audience && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>👥 {s.audience}</p>}
                    {s.budget && <p style={{ fontSize: 12, color: "var(--green-d)", fontWeight: 700 }}>💰 {s.budget}</p>}
                    {s.objective && <p style={{ fontSize: 12, color: "var(--muted)" }}>🎯 {s.objective}</p>}
                    {s.funnelStage && <span style={{ fontSize: 10, fontWeight: 700, background: "#f3e8ff", color: "#7c3aed", padding: "2px 8px", borderRadius: 4 }}>{s.funnelStage}</span>}
                  </>
                )}
              </div>
            )) : <p style={{ fontSize: 13, color: "var(--body)", whiteSpace: "pre-wrap" }}>{JSON.stringify(adSets, null, 2)}</p>}
          </div>
        )}

        {/* Criativos — preview premium */}
        {creatives && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#faf5ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎨</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Criativos sugeridos</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{Array.isArray(creatives) ? creatives.length : 0} criativo(s) • clique para editar</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowRegenModal("copies")}
                  style={{ fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                  📝 Novas copies
                </button>
                <button onClick={() => setShowRegenModal("creatives")}
                  style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                  🔄 Regenerar criativos
                </button>
              </div>
            </div>
            {Array.isArray(creatives) ? creatives.map((cr: any, i: number) => {
              const creativeFormat = inferCreativeFormat(cr);
              const creativeImage = getCreativeImage(cr, creativeFormat);
              const scoreBadge = getScoreBadge(cr.finalScore);
              const mergedCreative = mergeCreativeWithProjectedLegacy(cr);
              const creativeAudit = {
                story: !!(mergedCreative.storyImageUrl || mergedCreative.storyImageHash),
                feed: !!(mergedCreative.feedImageUrl || mergedCreative.feedImageHash),
                square: !!(mergedCreative.squareImageUrl || mergedCreative.squareImageHash),
                video: !!mergedCreative.publishMedia?.videoId,
              };
              return (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", marginBottom: 14, background: i === 0 ? "var(--green-l)" : "white" }}>
                {editingCreative === i ? (
                  <div style={{ display: "grid", gridTemplateColumns: "clamp(120px,18%,160px) 1fr", gap: 16, alignItems: "start" }}>
                    {/* Preview da imagem mantido durante edição */}
                    <div>
                      {creativeVideoPreviews[i] ? (
                        <video src={creativeVideoPreviews[i]} style={{ width: "100%", borderRadius: 10, border: "2px solid #6366f1", aspectRatio: creativeFormat === "stories" ? "9/16" : "4/5" }} muted playsInline />
                      ) : creativeImage ? (
                        <img src={creativeImage} alt="" style={{ width: "100%", borderRadius: 10, border: "1px solid #e5e7eb", objectFit: "cover", aspectRatio: creativeFormat === "stories" ? "9/16" : "4/5" }} />
                      ) : (
                        <div style={{ width: "100%", borderRadius: 10, border: "1px dashed #cbd5e1", background: "#f8fafc", aspectRatio: "4/5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎨</div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>HEADLINE</label>
                      <input value={editDraft.headline ?? cr.headline ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, headline: e.target.value }))}
                        placeholder="Título do anúncio (máx 40 chars)" className="input input-sm w-full" maxLength={40} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>COPY (texto principal)</label>
                      <textarea value={editDraft.copy ?? cr.copy ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, copy: e.target.value }))}
                        placeholder="Texto principal (máx 125 chars)" className="textarea w-full" rows={3} maxLength={125} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>HOOK</label>
                      <input value={editDraft.hook ?? cr.hook ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, hook: e.target.value }))}
                        placeholder="Frase de gancho inicial" className="input input-sm w-full" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>CTA</label>
                      <input value={editDraft.cta ?? cr.cta ?? ""} onChange={e => setEditDraft((d: any) => ({ ...d, cta: e.target.value }))}
                        placeholder="Botão de ação (ex: Saiba Mais)" className="input input-sm w-full" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>FORMATO</label>
                      <select className="input input-sm w-full"
                        value={editDraft.format ?? cr.format ?? cr.type ?? ""}
                        onChange={e => setEditDraft((d: any) => ({ ...d, format: e.target.value }))}>
                        <option value="">Selecionar formato</option>
                        <option value="Feed 4:5 (Vertical)">📱 Feed 4:5 — Vertical (Instagram/Facebook)</option>
                        <option value="Stories 9:16 (Vertical)">⭕ Stories 9:16 — Vertical (Stories/Reels)</option>
                        <option value="Feed 1:1 (Quadrado)">⬜ Feed 1:1 — Quadrado (Universal)</option>
                        <option value="Feed 1.91:1 (Horizontal)">🖥️ Feed 1.91:1 — Horizontal (Link Ads)</option>
                        <option value="Reels 9:16 (Vídeo)">🎬 Reels 9:16 — Vídeo (Reels/TikTok)</option>
                        <option value="Carrossel">🎠 Carrossel (múltiplas imagens)</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => updateCreativeMutation.mutate({ campaignId: id, index: i, ...editDraft })}
                        disabled={updateCreativeMutation.isLoading} className="btn btn-sm btn-green">
                        {updateCreativeMutation.isLoading ? "Salvando..." : "◎ Salvar"}
                      </button>
                      <button onClick={() => { setEditingCreative(null); setEditDraft({}); }} className="btn btn-sm btn-ghost">Cancelar</button>
                    </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: creativeImage ? "clamp(160px,22%,220px) 1fr" : "1fr", gap: 16, alignItems: "start" }}>
                      <div>
                        {/* Preview: vídeo ou imagem */}
                        {creativeVideoPreviews[i] ? (
                          <div style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "2px solid #6366f1", aspectRatio: creativeFormat === "stories" ? "9 / 16" : creativeFormat === "square" ? "1 / 1" : "4 / 5" }}>
                            <video src={creativeVideoPreviews[i]} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls muted playsInline />
                            <div style={{ position: "absolute", top: 6, left: 6, background: "#6366f1", color: "white", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>🎬 VÍDEO</div>
                          </div>
                        ) : creativeImage ? (
                          <div style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", aspectRatio: creativeFormat === "stories" ? "9 / 16" : creativeFormat === "square" ? "1 / 1" : "4 / 5" }}>
                            <img src={creativeImage} alt={cr.headline || `Criativo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ) : (
                          <label htmlFor={`creative-image-input-${i}`} style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            width: "100%", borderRadius: 12, border: "2px dashed #94a3b8", background: "#f8fafc",
                            aspectRatio: creativeFormat === "stories" ? "9 / 16" : creativeFormat === "square" ? "1 / 1" : "4 / 5",
                            color: "#64748b", cursor: "pointer", textAlign: "center", padding: 16,
                            transition: "all .2s",
                          }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", marginBottom: 4 }}>Subir foto ou vídeo</div>
                            <div style={{ fontSize: 10, color: "#94a3b8" }}>JPG, PNG, MP4, MOV</div>
                          </label>
                        )}

                        {/* Botões de mídia — separados por tipo */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                          {/* Foto */}
                          <label htmlFor={`creative-photo-input-${i}`} style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8",
                            border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 0",
                            cursor: replacingCreativeImage === i ? "wait" : "pointer",
                            opacity: replacingCreativeImage === i ? 0.7 : 1,
                          }}>
                            📷 {replacingCreativeImage === i ? "Enviando..." : "Foto"}
                          </label>
                          <input id={`creative-photo-input-${i}`} type="file"
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleManualCreativeImage(f, i, creativeFormat); e.currentTarget.value = ""; }}
                          />

                          {/* Vídeo */}
                          <label htmlFor={`creative-video-input-${i}`} style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            fontSize: 11, fontWeight: 700, background: "#f3e8ff", color: "#7c3aed",
                            border: "1px solid #d8b4fe", borderRadius: 8, padding: "7px 0",
                            cursor: replacingCreativeImage === i ? "wait" : "pointer",
                            opacity: replacingCreativeImage === i ? 0.7 : 1,
                          }}>
                            🎬 {replacingCreativeImage === i ? "Enviando..." : "Vídeo"}
                          </label>
                          <input id={`creative-video-input-${i}`} type="file"
                            accept="video/mp4,video/mov,video/quicktime,video/webm,video/avi,.mp4,.mov,.webm,.avi,.mkv"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleManualCreativeImage(f, i, creativeFormat); e.currentTarget.value = ""; }}
                          />
                        </div>

                        {/* Regenerar com IA */}
                        <button
                          onClick={() => regenerateCreativeImageMutation.mutate({ campaignId: id, creativeIndex: i, format: creativeFormat })}
                          disabled={regenerateCreativeImageMutation.isLoading}
                          style={{ width: "100%", fontSize: 11, fontWeight: 700, background: "var(--off)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 0", cursor: "pointer", marginTop: 4 }}>
                          🤖 {regenerateCreativeImageMutation.isLoading ? "Gerando..." : "Gerar imagem com IA"}
                        </button>

                        {/* Badge de formato */}
                        <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: 700, color: "#64748b" }}>
                          {creativeFormat === "stories" ? "⭕ Stories 9:16" : creativeFormat === "square" ? "⬜ Square 1:1" : "📱 Feed 4:5"}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green-d)" }}>⭐ PRINCIPAL</span>}
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", margin: 0 }}>{cr.format || cr.type || `Criativo ${i + 1}`}</p>
                            {cr._edited && <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700 }}>✏️ editado</span>}
                            {cr.finalScore ? (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 999, background: scoreBadge.bg, color: scoreBadge.color }}>
                                Score {scoreBadge.label}
                              </span>
                            ) : null}
                          </div>
                          <button onClick={() => {
                              setEditingCreative(i);
                              setEditDraft({
                                headline: cr.headline ?? "",
                                copy:     cr.copy     ?? "",
                                hook:     cr.hook     ?? "",
                                cta:      cr.cta      ?? "",
                                format:   cr.format   ?? cr.type ?? "",
                              });
                            }}
                            style={{ fontSize: 12, fontWeight: 700, color: "white", background: "#334155", border: "none", borderRadius: 8, padding: "5px 14px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                            ✏️ Editar texto
                          </button>
                        </div>
                        {cr.hook && <p style={{ fontSize: 11, color: "#7c3aed", fontStyle: "italic", marginBottom: 4 }}>🎣 Hook: "{cr.hook}"</p>}
                        {cr.headline && <p style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600, marginBottom: 3 }}>"{cr.headline}"</p>}
                        {cr.copy && <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>{cr.copy}</p>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {cr.cta && <span style={{ fontSize: 11, fontWeight: 700, background: "var(--navy)", color: "white", padding: "3px 10px", borderRadius: 6 }}>CTA: {cr.cta}</span>}
                          {cr.complianceRisk && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                              background: cr.complianceRisk === "Baixo" ? "#dcfce7" : cr.complianceRisk === "Médio" ? "#fef3c7" : "#fee2e2",
                              color: cr.complianceRisk === "Baixo" ? "#166534" : cr.complianceRisk === "Médio" ? "#92400e" : "#dc2626" }}>
                              {cr.complianceRisk === "Baixo" ? "◎ Risco baixo" : cr.complianceRisk === "Médio" ? "⚠️ Risco médio" : "✕ Risco alto"}
                            </span>
                          )}
                        </div>
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 8 }}>🧭 Auditoria de criativo por canal</p>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: creativeAudit.story ? "#dcfce7" : "#fee2e2", color: creativeAudit.story ? "#166534" : "#b91c1c" }}>
                              Meta Story 9:16: {creativeAudit.story ? "OK" : "Falta"}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: creativeAudit.feed ? "#dcfce7" : "#fef3c7", color: creativeAudit.feed ? "#166534" : "#92400e" }}>
                              Feed: {creativeAudit.feed ? "OK" : "Revisar"}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: creativeAudit.square ? "#dcfce7" : "#fef3c7", color: creativeAudit.square ? "#166534" : "#92400e" }}>
                              Square 1:1: {creativeAudit.square ? "OK" : "Opcional"}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: creativeAudit.video ? "#dcfce7" : "#fee2e2", color: creativeAudit.video ? "#166534" : "#b91c1c" }}>
                              TikTok/Reels vídeo: {creativeAudit.video ? "OK" : "Falta"}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8" }}>
                              Google Search: texto OK
                            </span>
                          </div>
                        </div>
                        {(cr.hookStrength || cr.clarity || cr.urgency || cr.specificity) ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                            {[
                              { label: "Hook", value: cr.hookStrength },
                              { label: "Clareza", value: cr.clarity },
                              { label: "Urgência", value: cr.urgency },
                              { label: "Especificidade", value: cr.specificity },
                            ].map((metric) => (
                              <div key={metric.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "8px 10px" }}>
                                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{metric.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{metric.value || 0}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {cr.imageGenerationReason && !creativeImage.startsWith("data:image/svg") && !creativeImage.startsWith("data:image/png") && (
                          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: "#9a3412", marginBottom: 4 }}>Diagnóstico da imagem</p>
                            <p style={{ fontSize: 12, color: "#7c2d12", margin: 0 }}>{cr.imageGenerationReason}</p>
                          </div>
                        )}
                        {Array.isArray(cr.recommendations) && cr.recommendations.length > 0 && (
                          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: "#9a3412", marginBottom: 6 }}>Recomendações</p>
                            <ul style={{ margin: 0, paddingLeft: 18, color: "#7c2d12", fontSize: 12, lineHeight: 1.5 }}>
                              {cr.recommendations.map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      {(() => { const P = AdPreviewPanel as any; return <P
                        creative={{ ...cr, format: creativeFormat === "stories" ? "stories" : creativeFormat === "square" ? "image" : "image" }}
                        platform={(campaign as any)?.platform || "meta"}
                        objective={(campaign as any)?.objective}
                        clientName={(clientProfile as any)?.companyName}
                        creativeImageDataUrl={creativeImage || undefined}
                        mediaPreview={creativeImage && !creativeImage.startsWith("data:") ? creativeImage : undefined}
                      />; })()}
                    </div>
                  </>
                )}
              </div>
            )}) : <p style={{ fontSize: 13, color: "var(--body)", whiteSpace: "pre-wrap" }}>{JSON.stringify(creatives, null, 2)}</p>}
          </div>
        )}

        {/* ── PRÓXIMOS PASSOS ── */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a, #1e3a5f)",
          borderRadius: 18, padding: 22, marginBottom: 4, gridColumn: "1 / -1",
        }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 16 }}>🚀 Próximos passos</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { icon: "📘", label: "Publicar campanha",    action: "Clique em 'Publicar no Meta Ads'",           color: "#1877f2" },
              { icon: "🧪", label: "Testar criativos A/B", action: "Use variações de hook para testes A/B",      color: "#7c3aed" },
              { icon: "◈", label: "Ajustar orçamento",    action: "Revise o budget conforme CPL real pós-lançamento", color: "#d97706" },
              { icon: "👥", label: "Criar públicos",       action: "Adicione públicos lookalike após 50+ leads", color: "#16a34a" },
            ].map(step => (
              <div key={step.label} style={{
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${step.color}22`, border: `1px solid ${step.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {step.icon}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: "white", margin: 0 }}>{step.label}</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", margin: "2px 0 0" }}>{step.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funil */}
        {funnel && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🔀</span> Funil de conversão
            </p>
            {Array.isArray(funnel) ? funnel.map((stage: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "var(--navy)" : i === funnel.length - 1 ? "var(--green)" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: i === 0 || i === funnel.length - 1 ? "white" : "var(--muted)", flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 2 }}>{stage.stage || stage.name || `Etapa ${i + 1}`}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{stage.action || stage.description}</p>
                  {stage.format && <p style={{ fontSize: 11, color: "var(--green-d)", fontWeight: 600 }}>Formato: {stage.format}</p>}
                </div>
              </div>
            )) : <p style={{ fontSize: 13, color: "var(--body)", whiteSpace: "pre-wrap" }}>{JSON.stringify(funnel, null, 2)}</p>}
          </div>
        )}

        {/* ── Plano de execução semanal ── */}
        {(() => {
          const budgetMonthly = (campaign as any)?.suggestedBudgetMonthly || 1500;
          const budgetDaily   = (campaign as any)?.suggestedBudgetDaily   || Math.round(budgetMonthly / 30);
          const duration      = (campaign as any)?.durationDays || 30;
          const weeks         = Math.ceil(duration / 7);
          const objective     = (campaign as any)?.objective || "engagement";

          // Gera planejamento semanal automático quando plan está vazio ou incompleto
          const autoWeeks = Array.from({ length: Math.min(weeks, 4) }, (_, i) => {
            const w = i + 1;
            const budgetSem = budgetDaily * 7;
            const configs = [
              {
                titulo: "Lançamento & Teste",
                dias: `Dias 1–7`,
                orcamento: `R$ ${budgetSem.toFixed(0)}/semana`,
                acoes: [
                  "Ativar campanhas com todos os criativos",
                  "Configurar pixel e eventos de conversão",
                  "Iniciar teste A/B de hooks (Variação A vs B)",
                  "Monitorar CTR, CPC e frequência diariamente",
                ],
                kpis: [
                  { label: "CTR mínimo",   valor: "> 1,5%" },
                  { label: "CPC máximo",   valor: `< R$ ${(metrics?.estimatedCPC?.replace("R$ ","") || "2,00")}` },
                  { label: "Frequência",   valor: "< 2,5x" },
                ],
                decisao: "Pausar criativos com CTR < 0,8% após 3 dias",
                cor: "#1e40af", bg: "#eff6ff",
              },
              {
                titulo: "Otimização",
                dias: `Dias 8–14`,
                orcamento: `R$ ${budgetSem.toFixed(0)}/semana`,
                acoes: [
                  "Pausar ad sets e criativos de baixa performance",
                  "Aumentar budget 20% nos ad sets vencedores",
                  "Testar novos públicos (Lookalike 1%)",
                  "Otimizar landing page com CRO se necessário",
                ],
                kpis: [
                  { label: "CPL alvo",       valor: metrics?.estimatedCPL || "< R$ 30" },
                  { label: "Frequência",     valor: "< 3x" },
                  { label: "ROAS mínimo",    valor: objective === "sales" ? "> 2x" : "N/A" },
                ],
                decisao: "Cortar ad sets com CPL > 2x a meta após 7 dias",
                cor: "#7c3aed", bg: "#f5f3ff",
              },
              {
                titulo: "Escala",
                dias: `Dias 15–21`,
                orcamento: `R$ ${(budgetSem * 1.2).toFixed(0)}/semana`,
                acoes: [
                  "Escalar budget +20% nos vencedores",
                  "Criar variações dos criativos de melhor performance",
                  "Expandir para Lookalike 3% e 5%",
                  "Ativar remarketing para visitantes do site (7 dias)",
                ],
                kpis: [
                  { label: "Volume leads",  valor: `+30% vs semana 2` },
                  { label: "CPL estável",   valor: "variação < 15%" },
                  { label: "ROAS",          valor: objective === "sales" ? "> 3x" : "N/A" },
                ],
                decisao: "Se CPL subir > 20% ao escalar, pausar escala e revisar público",
                cor: "#059669", bg: "#ecfdf5",
              },
              {
                titulo: "Consolidação & Análise",
                dias: `Dias 22–${duration}`,
                orcamento: `R$ ${budgetSem.toFixed(0)}/semana`,
                acoes: [
                  "Avaliar performance geral vs metas",
                  "Documentar aprendizados de cada teste A/B",
                  "Planejar criativo novo para próxima campanha",
                  "Criar audiências personalizadas para remarketing futuro",
                ],
                kpis: [
                  { label: "CPL final",     valor: metrics?.estimatedCPL || "< R$ 30" },
                  { label: "ROI geral",     valor: objective === "sales" ? "> 3x" : "Engajamento" },
                  { label: "Leads totais",  valor: `${Math.round(budgetMonthly / 25)}+ leads` },
                ],
                decisao: "Relatório completo + definição de budget para próximo mês",
                cor: "#b45309", bg: "#fffbeb",
              },
            ];

            // Usa dados do plan real se disponível e tem budget/kpi
            const realStep = plan && Array.isArray(plan) && plan[i];
            if (realStep?.budget && realStep?.kpi) {
              return {
                titulo: realStep.title || realStep.action || configs[i]?.titulo,
                dias: realStep.week || realStep.day || configs[i]?.dias,
                orcamento: realStep.budget,
                acoes: [realStep.action || realStep.description || ""].filter(Boolean),
                kpis: [{ label: "KPI", valor: realStep.kpi }],
                decisao: realStep.decision || configs[i]?.decisao || "",
                cor: configs[i]?.cor || "#1e40af",
                bg: configs[i]?.bg || "#eff6ff",
              };
            }
            return configs[i] || configs[0];
          });

          return (
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, gridColumn: "1/-1" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <span>📅</span> Planejamento semanal
                </p>
                <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--off)", padding: "3px 10px", borderRadius: 20 }}>
                  {duration} dias · R$ {budgetMonthly.toLocaleString("pt-BR")}/mês · R$ {budgetDaily}/dia
                </span>
              </div>

              {/* Timeline visual */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(autoWeeks.length, 2)}, 1fr)`, gap: 12 }}>
                {autoWeeks.map((wk, i) => (
                  <div key={i} style={{ border: `2px solid ${wk.cor}22`, borderRadius: 12, overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{ background: wk.bg, borderBottom: `1px solid ${wk.cor}22`, padding: "10px 14px",
                      display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: wk.cor, textTransform: "uppercase", letterSpacing: 1 }}>
                          Semana {i + 1}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginTop: 2 }}>{wk.titulo}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "var(--muted)" }}>{wk.dias}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: wk.cor }}>{wk.orcamento}</div>
                      </div>
                    </div>

                    <div style={{ padding: "12px 14px" }}>
                      {/* Ações */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                          ✅ Ações
                        </div>
                        {wk.acoes.map((a, ai) => (
                          <div key={ai} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                            <span style={{ color: wk.cor, flexShrink: 0, fontSize: 11, marginTop: 1 }}>→</span>
                            <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{a}</span>
                          </div>
                        ))}
                      </div>

                      {/* KPIs */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {wk.kpis.filter(k => k.valor && k.valor !== "N/A").map((k, ki) => (
                          <div key={ki} style={{ background: `${wk.cor}11`, borderRadius: 6, padding: "4px 8px" }}>
                            <div style={{ fontSize: 9, color: wk.cor, fontWeight: 700, textTransform: "uppercase" }}>{k.label}</div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: wk.cor }}>{k.valor}</div>
                          </div>
                        ))}
                      </div>

                      {/* Decisão */}
                      {wk.decisao && (
                        <div style={{ background: "#fef3c7", borderRadius: 6, padding: "6px 8px", fontSize: 10, color: "#92400e", lineHeight: 1.4 }}>
                          ⚡ {wk.decisao}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Checklist de lançamento */}
              <div style={{ marginTop: 16, background: "var(--off)", borderRadius: 12, padding: "14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  🚀 Checklist antes de ativar
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { ok: true,  label: "Criativos revisados e aprovados" },
                    { ok: !!pageId?.trim(), label: "Página do Facebook selecionada" },
                    { ok: true,  label: "Pixel Meta instalado no site" },
                    { ok: true,  label: "Públicos configurados (TOF/MOF/BOF)" },
                    { ok: true,  label: "URLs com UTM configuradas" },
                    { ok: !!metrics, label: "Métricas de referência definidas" },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        background: item.ok ? "#16a34a" : "#e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {item.ok && <span style={{ color: "white", fontSize: 10, fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 11, color: item.ok ? "var(--black)" : "var(--muted)" }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Resposta bruta da IA (fallback) */}
        {c.aiResponse && !adSets && !creatives && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, gridColumn: "1 / -1" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 12 }}>🤖 Estratégia completa</p>
            <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{c.aiResponse}</p>
          </div>
        )}
      </div>

      {/* ── Banner resultado publicação ── */}
      {publishResult && (
        <div style={{ background: "var(--green-l)", border: "1px solid var(--green-xl)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green-dk)", marginBottom: 8 }}>◎ Campanha publicada no Meta Ads!</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
            {publishResult.campaignId && <p style={{ fontSize: 12, color: "var(--muted)" }}>Campaign ID: <strong>{publishResult.campaignId}</strong></p>}
            {publishResult.adSetId    && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ad Set ID: <strong>{publishResult.adSetId}</strong></p>}
            {publishResult.adId       && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ad ID: <strong>{publishResult.adId}</strong></p>}
          </div>
          <a href="https://business.facebook.com/adsmanager" target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: "#1877f2", fontWeight: 700 }}>Ver no Gerenciador de Anúncios →</a>
        </div>
      )}

      {/* ── Banner: dados incompletos — orienta o usuário ── */}
      {campaign && (() => {
        const missingItems = [];
        if (!funnel?.length)   missingItems.push({ icon: "🔀", label: "Funil de conversão" });
        if (!plan?.length)     missingItems.push({ icon: "📋", label: "Plano de execução" });
        if (!metrics)          missingItems.push({ icon: "📊", label: "Métricas estimadas" });
        if (!hooks?.length)    missingItems.push({ icon: "🎣", label: "Hooks criativos" });
        if (!abTests?.length)  missingItems.push({ icon: "🧪", label: "Testes A/B" });
        const extra2 = parseJson((campaign as any)?.aiResponse);
        const isMock = extra2?._isMock === true;
        if (missingItems.length === 0 && !isMock) return null;
        return (
          <div style={{ background: isMock ? "#fef3c7" : "#f8fafc", border: `1px solid ${isMock ? "#fde68a" : "var(--border)"}`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: isMock ? "#92400e" : "var(--black)", marginBottom: 4 }}>
                  {isMock ? "⚠️ Campanha gerada com dados de template" : "ℹ️ Alguns dados não foram gerados"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {isMock
                    ? "A IA estava indisponível. Regenere para obter dados personalizados do seu nicho."
                    : `Faltando: ${missingItems.map(m => m.label).join(", ")}`}
                </div>
              </div>
              <button
                onClick={() => {
                  regenerateMutation.mutate({ campaignId: id, projectId, part: "creatives" });
                  toast.info("⏳ Regenerando campanha com IA...", { duration: 8000 });
                }}
                style={{ background: isMock ? "#f59e0b" : "var(--blue)", color: "white", border: "none",
                  borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                🔄 Regenerar campanha completa
              </button>
            </div>
            {missingItems.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {missingItems.map(m => (
                  <span key={m.label} style={{ fontSize: 11, background: "#fee2e2", color: "#dc2626",
                    padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                    {m.icon} {m.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}


      {/* ════ BLOCO DE DECISÃO: O QUE FAZER AGORA ════ */}
      {(() => {
        const niche = (clientProfile as any)?.niche || "";
        const budget = (clientProfile as any)?.monthlyBudget || null;
        const ctrRaw = metrics?.estimatedCTR || metrics?.ctr || null;
        const leadsRaw = metrics?.leadsPerMonth || metrics?.estimatedLeads || null;
        const actionPlan = buildActionPlan(ctrRaw, plan, hooks, abTests, creativeList);
        const ctrDiag = diagnoseCTR(ctrRaw);
        const cpcDiag = diagnoseCPC(metrics?.estimatedCPC || null, niche);
        const roiCalc = calcROI(budget, String(leadsRaw || ""), niche);

        return (
          <div style={{ marginBottom: 24 }}>

            {/* ── Bloco 72h ── */}
            <div style={{ background: "white", border: "2px solid #0f172a", borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.03em" }}>O que fazer agora</p>
                  <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Ações priorizadas por impacto e urgência</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {actionPlan.map((a, i) => {
                  const colors = {
                    "AGORA": { bg: "#fef2f2", border: "#fecaca", badge: "#dc2626", text: "#7f1d1d" },
                    "48H":   { bg: "#fffbeb", border: "#fde68a", badge: "#d97706", text: "#78350f" },
                    "7 DIAS":{ bg: "#f0fdf4", border: "#bbf7d0", badge: "#059669", text: "#14532d" },
                  }[a.window];
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 32px 1fr", gap: 10, alignItems: "start", padding: "12px 14px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: "white", background: colors.badge, borderRadius: 20, padding: "3px 0", textAlign: "center", letterSpacing: "0.05em", marginTop: 2 }}>{a.window}</div>
                      <div style={{ fontSize: 20, textAlign: "center" }}>{a.icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 3 }}>{a.action}</div>
                        <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{a.why}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Diagnóstico de Métricas ── */}
            {(ctrRaw || metrics?.estimatedCPC) && (
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔬</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.03em" }}>Diagnóstico das métricas</p>
                    <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Interpretação com base no benchmark do nicho</p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ctrRaw && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: ctrDiag.color + "18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: ctrDiag.color }}>CTR</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{ctrRaw}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, background: ctrDiag.color + "20", color: ctrDiag.color, padding: "2px 8px", borderRadius: 20 }}>{ctrDiag.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>{ctrDiag.detail}</p>
                      </div>
                    </div>
                  )}
                  {metrics?.estimatedCPC && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: cpcDiag.color + "18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: cpcDiag.color }}>CPC</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>{metrics.estimatedCPC}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, background: cpcDiag.color + "20", color: cpcDiag.color, padding: "2px 8px", borderRadius: 20 }}>{cpcDiag.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>{cpcDiag.detail}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ROI e Valor por Lead ── */}
            {roiCalc && (
              <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", borderRadius: 16, padding: "20px 22px", marginBottom: 16, color: "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💰</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 900, color: "white", margin: 0, letterSpacing: "-0.03em" }}>Projeção financeira</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,.6)", margin: 0 }}>ROI estimado baseado no nicho {niche}</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>VALOR POR LEAD</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#34d399", fontFamily: "var(--font-display)" }}>
                      R$ {roiCalc.valorPorLead.toLocaleString("pt-BR")}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>receita potencial por lead</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>ROI POTENCIAL</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-display)" }}>
                      {roiCalc.roiPotencial}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>retorno sobre o investimento</div>
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,.8)", margin: 0, lineHeight: 1.6 }}>
                    💡 {roiCalc.insight}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Métricas estimadas — redesign premium ── */}

      {metrics && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📊</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Métricas estimadas</p>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Projeções baseadas no nicho e dados históricos da conta</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
            {[
              { key: "estimatedCPC",  label: "CPC",   icon: "🖱️", bg: "#eff6ff",        fg: "#1e40af" },
              { key: "estimatedCPL",  label: "CPL",   icon: "🎯", bg: "var(--green-l)", fg: "var(--green-dk)" },
              { key: "estimatedCPM",  label: "CPM",   icon: "👁",  bg: "#f5f3ff",        fg: "#5b21b6" },
              { key: "estimatedCTR",  label: "CTR",   icon: "📈", bg: "#fef2f2",        fg: "#991b1b" },
              { key: "expectedROAS",  label: "ROAS",  icon: "💹", bg: "var(--green-l)", fg: "var(--green-dk)" },
              { key: "breakEvenROAS", label: "Break-even", icon: "⚖️", bg: "#fff7ed",  fg: "#9a3412" },
              { key: "estimatedCPA",  label: "CPA",   icon: "◍", bg: "#fff7ed",        fg: "#9a3412" },
              { key: "leadsPerMonth", label: "Leads/mês", icon: "👥", bg: "#eff6ff",   fg: "#1e40af" },
            ].filter(m => metrics[m.key]).map(m => (
              <div key={m.key} style={{ background: m.bg, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: m.fg, fontFamily: "var(--font-display)", marginBottom: 2 }}>{metrics[m.key]}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.fg }}>{m.label}</div>
              </div>
            ))}
          </div>
          {metrics.insight && (
            <div style={{ background: "var(--navy)", borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.9)", lineHeight: 1.6 }}>💡 {metrics.insight}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Glossário ── */}
      {glossary && Array.isArray(glossary) && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 16 }}>📖 Glossário da campanha</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {glossary.map((g: any, i: number) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                <span style={{ fontSize: 12, fontWeight: 800, background: "var(--navy)", color: "white", padding: "2px 8px", borderRadius: 5, display: "inline-block", marginBottom: 6 }}>{g.term}</span>
                <p style={{ fontSize: 12, color: "var(--black)", fontWeight: 600, marginBottom: 3 }}>{g.meaning}</p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>Ex: {g.example}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hooks ── */}
      {hooks && Array.isArray(hooks) && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎣</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Variações de Hook</p>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Teste estes ganchos nos primeiros 3 segundos</p>
              </div>
            </div>
            <button onClick={() => setShowRegenModal("hooks")}
              style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
              🔄 Novos hooks
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {hooks.map((h: any, i: number) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", background: "var(--off)" }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--green-d)", display: "block", marginBottom: 6 }}>{h.type}</span>
                <p style={{ fontSize: 13, color: "var(--black)", lineHeight: 1.6 }}>"{h.text}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Testes A/B ── */}
      {abTests && Array.isArray(abTests) && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔀</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Matriz de Testes A/B</p>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Execute um teste por vez para resultados confiáveis</p>
              </div>
            </div>
            <button onClick={() => setShowRegenModal("abTests")}
              style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
              🔄 Novos testes
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {abTests.map((t: any, i: number) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "clamp(80px,12%,120px) 1fr 1fr clamp(60px,8%,80px)", gap: 10, alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--navy)" }}>Teste {i + 1}: {t.test}</span>
                <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--green-d)", fontWeight: 700, marginBottom: 2 }}>VARIAÇÃO A</div>
                  <div style={{ fontSize: 12, color: "var(--body)" }}>{t.variationA}</div>
                </div>
                <div style={{ background: "#eff6ff", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "#1d4ed8", fontWeight: 700, marginBottom: 2 }}>VARIAÇÃO B</div>
                  <div style={{ fontSize: 12, color: "var(--body)" }}>{t.variationB}</div>
                </div>
                <span style={{ fontSize: 11, background: "var(--off)", borderRadius: 6, padding: "4px 8px", textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>↗ {t.metric}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gerador de Vídeo VSL ── */}
      {campaign && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showVSL ? 20 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fdf4ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎬</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Gerador de Vídeo VSL</p>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Gemini gera o roteiro · ElevenLabs narra</p>
              </div>
            </div>
            <button onClick={() => setShowVSL((v: boolean) => !v)} style={{
              fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8,
              border: "1px solid var(--border)", background: showVSL ? "#f8fafc" : "#7c3aed",
              color: showVSL ? "var(--muted)" : "white", cursor: "pointer",
            }}>
              {showVSL ? "▲ Fechar" : "🎬 Gerar vídeo"}
            </button>
          </div>
          {showVSL && (
            <VSLGeneratorPanel
              campaignId={(campaign as any)?.id}
              platform={(campaign as any)?.platform}
              objective={(campaign as any)?.objective}
              niche={(clientProfile as any)?.niche}
              productName={(clientProfile as any)?.companyName}
              targetAudience={(clientProfile as any)?.targetAudience}
              mainBenefit={(clientProfile as any)?.uniqueValueProposition}
              onVideoReady={(videoUrl: string) => {
                setImageUrl(videoUrl);
                toast.success("◎ Vídeo pronto!");
              }}
            />
          )}
        </div>
      )}

   {/* ── Tracking & Pixel ── */}
      {tracking && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📡</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Tracking & Pixel</p>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Configure antes de ativar a campanha</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {tracking.pixel && (
              <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>📌 Meta Pixel — Eventos obrigatórios</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Array.isArray(tracking.pixel.events) && tracking.pixel.events.map((e: string, i: number) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, background: "white", border: "1px solid #fde68a", padding: "3px 10px", borderRadius: 6, color: "#92400e" }}>{e}</span>
                  ))}
                </div>
                {tracking.pixel.priority && <p style={{ fontSize: 11, color: "#92400e", marginTop: 8 }}>⚠️ {tracking.pixel.priority}</p>}
              </div>
            )}
            {tracking.ga4 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#15803d", marginBottom: 8 }}>📊 Google Analytics 4</p>
                <p style={{ fontSize: 12, color: "var(--body)" }}>{tracking.ga4}</p>
                {tracking.recommendation && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>💡 {tracking.recommendation}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Otimização ── */}
      {optimization && Array.isArray(optimization) && (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", margin: 0 }}>Estratégia de Otimização</p>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Regras baseadas em dados reais da sua conta</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {optimization.map((o: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, background: o.priority === "alta" ? "#fef2f2" : "var(--off)" }}>
                <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: o.priority === "alta" ? "#fecaca" : "#e2e8f0", color: o.priority === "alta" ? "#dc2626" : "var(--muted)", flexShrink: 0 }}>
                  {o.priority?.toUpperCase()}
                </span>
                <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>SE {o.condition}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>→</span>
                <span style={{ fontSize: 13, color: "var(--body)", fontWeight: 600 }}>{o.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Escala ── */}
      {scaling && (
        <div style={{ background: "var(--navy)", borderRadius: 16, padding: 22, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◈</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "white", margin: 0 }}>Estratégia de Escala</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", margin: 0 }}>Escale o que funciona após os primeiros 7 dias</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {scaling.lookalike && Array.isArray(scaling.lookalike) && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Lookalike Audiences</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {scaling.lookalike.map((l: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ fontSize: 13, color: "white" }}>{l.audience}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)", background: "rgba(34,197,94,.2)", padding: "3px 10px", borderRadius: 6 }}>{l.budget}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scaling.strategy && (
              <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Regra de Escala</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.9)", lineHeight: 1.6 }}>📈 {scaling.strategy}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal publicar Meta ── */}
      {/* ── Banner conclusão — navegação de volta ao projeto ── */}
      {!showModal && (
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, #1a3a6e 100%)",
          borderRadius: 16, padding: "18px 24px", marginTop: 24, marginBottom: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
        }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>
              🚀 Campanha gerada com sucesso!
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>
              Publique no Meta Ads ou volte ao projeto para criar outra campanha.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              className="btn btn-ghost"
              style={{ color: "rgba(255,255,255,.8)", borderColor: "rgba(255,255,255,.3)", whiteSpace: "nowrap", fontSize: 13, padding: "10px 18px" }}
              onClick={() => setLocation(`/projects/${projectId}/campaign`)}
            >
              + Nova campanha
            </button>
            <button
              className="btn btn-green"
              style={{ whiteSpace: "nowrap", fontWeight: 700, fontSize: 14, padding: "10px 20px" }}
              onClick={() => setLocation(`/projects/${projectId}`)}
            >
              ← Voltar ao Projeto
            </button>
          </div>
        </div>
      )}

      
      {/* ── Painel de Compliance Meta ── */}
      {complianceResult && (
        <div style={{
          background: complianceResult.score === "safe" ? "#f0fdf4" : complianceResult.score === "warning" ? "#fffbeb" : "#fef2f2",
          border: `1px solid ${complianceResult.score === "safe" ? "#86efac" : complianceResult.score === "warning" ? "#fcd34d" : "#fca5a5"}`,
          borderRadius: 12, padding: 16, marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>
              {complianceResult.score === "safe" ? "◎" : complianceResult.score === "warning" ? "◬" : "✕"}
            </span>
            <strong style={{ fontSize: 14 }}>
              {complianceResult.score === "safe" ? "Compliance OK — dentro das políticas Meta" :
               complianceResult.score === "warning" ? "Atenção — pontos sensíveis detectados" :
               "Risco Alto — campanha pode ser rejeitada pela Meta"}
            </strong>
          </div>
          {complianceResult.issues.length > 0 && (
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12, color: "#7f1d1d" }}>
              {complianceResult.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
            </ul>
          )}
          {complianceResult.suggestions.length > 0 && (
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 12, color: "#78350f" }}>
              {complianceResult.suggestions.map((s: string, i: number) => <li key={i}>💡 {s}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* ── Preview do Anúncio ── */}
      {publishResult?.creativeId && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => { setShowPreview(!showPreview); if (!showPreview && !previewHtml) fetchAdPreview(publishResult.creativeId); }}
            style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {showPreview ? "🙈 Ocultar Preview" : "👁️ Ver Preview do Anúncio"}
          </button>
          {showPreview && (
            <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}>
              <strong style={{ fontSize: 13, color: "#374151" }}>📱 Preview nos Formatos Meta</strong>
              {loadingPreview
                ? <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>Carregando preview...</div>
                : <div dangerouslySetInnerHTML={{ __html: previewHtml || "" }} />
              }
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(8px, 2vw, 20px)", overflowY: "auto", paddingTop: "clamp(16px, 4vh, 40px)" }}>
          <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 1200, boxShadow: "0 24px 80px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", maxHeight: "95vh", overflow: "hidden" }}>

            {/* HEADER */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📘</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", margin: 0 }}>Publicar no Meta Ads</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Criada como PAUSADA — revise antes de ativar</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>✕</button>
            </div>

            {/* BODY — duas colunas */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0, flexWrap: "nowrap" }} className="publish-modal-body">

              {/* COLUNA ESQUERDA — configurações */}
              <div style={{ width: "clamp(280px, 45%, 520px)", flexShrink: 0, overflowY: "auto", overflowX: "hidden", padding: "20px 24px", borderRight: "1px solid var(--border)" }}>

                {/* Preset de posicionamento por nicho */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>
                    🎯 Preset por nicho
                  </p>
                  <PlacementPresetSelector
                    value={placementPreset}
                    onChange={(presetId: string, placements: string[]) => {
                      setPlacementPreset(presetId);
                      if (placements && placements.length > 0) {
                        setSelectedPlacements(placements);
                        setPlacementMode("manual");
                      } else {
                        setPlacementMode("auto");
                        setSelectedPlacements([]);
                      }
                    }}
                  />
                </div>

                {/* Placement Selector */}
                <PlacementSelector
                  platform={(c.platform || "meta").toLowerCase()}
                  objective={c.objective}
                  hasVideo={mediaType === "video" || (mediaFiles.length === 1 && isVideoFile(mediaFiles[0]))}
                  mode={placementMode}
                  selectedPlacements={selectedPlacements}
                  onModeChange={m => {
                    setPlacementMode(m);
                    if (m === "auto") {
                      const plat = (c.platform || "meta").toLowerCase();
                      const base = PLATFORM_PLACEMENTS[plat] ?? [];
                      const obj  = c.objective ? (AUTO_PLACEMENTS[c.objective] ?? []) : [];
                      setSelectedPlacements([...new Set([...base, ...obj])]);
                    }
                  }}
                  onPlacementsChange={setSelectedPlacements}
                />

                <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1.5px solid #e2e8f0" }}>
                  <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>🧭</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Orientação automática de formato</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 10px" }}>
                      Esses avisos não bloqueiam a publicação. Eles apenas mostram o formato atual detectado e o formato mais recomendado para cada placement selecionado.
                    </p>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 12px" }}>
                      {guidanceSourceLabel}
                    </p>

                    {placementGuidanceCards.length > 0 ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {placementGuidanceCards.map(({ key, guidance }) => {
                          const tone = GUIDANCE_STATUS_UI[guidance.status];
                          return (
                            <div key={key} style={{ borderRadius: 12, border: `1px solid ${tone.border}`, background: tone.bg, padding: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                                <div>
                                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--black)", margin: 0 }}>{guidance.title}</p>
                                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>{guidanceContextLabel}</p>
                                </div>
                                <span style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 800, color: tone.color, background: tone.pillBg, padding: "4px 8px", borderRadius: 999 }}>
                                  {tone.label}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, lineHeight: 1.55, color: tone.color, margin: "0 0 8px" }}>{guidance.message}</p>
                              <p style={{ fontSize: 12, color: "var(--black)", margin: "0 0 6px" }}>
                                <strong>Recomendação:</strong> {guidance.recommendation}
                              </p>
                              <p style={{ fontSize: 12, color: "var(--black)", margin: 0 }}>
                                <strong>CTA sugerido:</strong> {guidance.suggestedCta.join(" • ")}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                        Envie uma mídia manual ou mantenha um criativo salvo para receber orientação automática por placement.
                      </p>
                    )}
                  </div>
                </div>

                {/* Seleção de ad set */}
                {Array.isArray(adSets) && adSets.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Conjunto de anúncios</label>
                    <select className="input" style={{ width: "100%" }} value={adSetIndex} onChange={e => setAdSetIndex(Number(e.target.value))}>
                      {adSets.map((s: any, i: number) => <option key={i} value={i}>{s.name || `Conjunto ${i + 1}`}</option>)}
                    </select>
                  </div>
                )}

                {/* Página do Facebook — seleção simples ou múltipla */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>Página do Facebook *</label>
                  {pages.length > 1 && (
                    <button
                      onClick={() => { setMultiPageMode(m => !m); setSelectedPageIds([]); }}
                      style={{ fontSize: 11, fontWeight: 700, background: multiPageMode ? "#1e293b" : "var(--off)",
                        color: multiPageMode ? "white" : "var(--muted)", border: "1px solid var(--border)",
                        borderRadius: 20, padding: "3px 12px", cursor: "pointer" }}>
                      {multiPageMode ? "✓ Multi-página ativo" : "Publicar em múltiplas páginas"}
                    </button>
                  )}
                </div>
                {loadingPages ? (
                  <div style={{ fontSize: 13, color: "var(--muted)", padding: "10px 0", marginBottom: 14 }}>⏳ Buscando suas páginas...</div>
                ) : pages.length > 0 ? (
                  <div style={{ marginBottom: 14 }}>
                    {!multiPageMode ? (
                      /* Seleção simples — dropdown normal */
                      <>
                        <select className="input" style={{ width: "100%", marginBottom: 4 }} value={pageId} onChange={e => {
                          setPageId(e.target.value);
                          const selected = pages.find((p: any) => p.id === e.target.value);
                          const integration = (metaIntegration as any[])?.find(i => i.provider === "meta");
                          if (selected && integration?.accessToken) {
                            autoDetectWhatsApp(selected, integration.accessToken);
                          }
                        }}>
                          <option value="">Selecione uma página...</option>
                          {pages.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                        </select>
                        <p style={{ fontSize: 11, color: "var(--muted)" }}>Páginas carregadas automaticamente da sua conta.</p>
                      </>
                    ) : (
                      /* Seleção múltipla — checkboxes */
                      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 4 }}>
                        {pages.map((p: any, pi: number) => {
                          const isChecked = selectedPageIds.includes(p.id);
                          return (
                            <div key={p.id}
                              onClick={() => {
                                setSelectedPageIds(prev =>
                                  prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                );
                                // Define pageId como o primeiro selecionado
                                if (!isChecked) setPageId(p.id);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 14px", cursor: "pointer",
                                background: isChecked ? "var(--blue-l)" : pi % 2 === 0 ? "var(--off)" : "white",
                                borderBottom: pi < pages.length - 1 ? "1px solid var(--border)" : "none",
                                transition: "background .15s",
                              }}>
                              {/* Checkbox visual */}
                              <div style={{
                                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                background: isChecked ? "var(--blue)" : "white",
                                border: `2px solid ${isChecked ? "var(--blue)" : "var(--border)"}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {isChecked && <span style={{ color: "white", fontSize: 11, fontWeight: 900 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isChecked ? "var(--blue)" : "var(--black)" }}>
                                  {p.name}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{p.id}</div>
                              </div>
                              {isChecked && (
                                <span style={{ fontSize: 10, background: "var(--blue)", color: "white",
                                  padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
                                  #{selectedPageIds.indexOf(p.id) + 1}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {/* Seleção rápida */}
                        <div style={{ display: "flex", gap: 8, padding: "8px 14px", background: "var(--off)", borderTop: "1px solid var(--border)" }}>
                          <button onClick={() => { setSelectedPageIds(pages.map((p: any) => p.id)); setPageId(pages[0]?.id || ""); }}
                            style={{ fontSize: 11, fontWeight: 700, background: "none", border: "1px solid var(--border)",
                              borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: "var(--muted)" }}>
                            Selecionar todas
                          </button>
                          <button onClick={() => { setSelectedPageIds([]); setPageId(""); }}
                            style={{ fontSize: 11, fontWeight: 700, background: "none", border: "1px solid var(--border)",
                              borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: "var(--muted)" }}>
                            Limpar
                          </button>
                          {selectedPageIds.length > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", marginLeft: "auto",
                              alignSelf: "center" }}>
                              {selectedPageIds.length} página{selectedPageIds.length > 1 ? "s" : ""} selecionada{selectedPageIds.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {multiPageMode && selectedPageIds.length > 0 && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10,
                        padding: "8px 12px", marginTop: 6, fontSize: 11, color: "#1d4ed8" }}>
                        ℹ️ A campanha será publicada em <strong>{selectedPageIds.length} página{selectedPageIds.length > 1 ? "s" : ""}</strong> sequencialmente.
                        Cada página terá seu próprio conjunto de anúncios.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <input className="input" placeholder="Ex: 248724168983172" value={pageId}
                      onChange={e => setPageId(e.target.value)}
                      style={{ width: "100%", marginBottom: 4, fontFamily: "monospace", fontSize: 12 }} />
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>
                      Não encontrou suas páginas?{" "}
                      <button onClick={fetchPages} style={{ background: "none", border: "none", color: "#1877f2", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}>
                        Carregar páginas
                      </button>
                    </p>
                  </div>
                )}

                {/* Destino do anúncio */}
                {(() => {
                  const objective   = (c as any).objective || "";
                  const isLeads     = objective === "leads";
                  const isAwareness = ["awareness","engagement"].includes(objective);
                  const isRequired  = !isLeads && !isAwareness;
                  return (
                    <>
                      <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: `1.5px solid ${isRequired ? "#ef4444" : "#e2e8f0"}` }}>
                        <div style={{ background: isRequired ? "#fee2e2" : "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>{isRequired ? "🔴" : isLeads || isAwareness ? "🟢" : "🔵"}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Destino do anúncio</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
                            background: isRequired ? "#fee2e2" : "#f0fdf4",
                            color: isRequired ? "#dc2626" : "#16a34a" }}>
                            {isRequired ? "Obrigatório" : "Opcional"}
                          </span>
                        </div>
                        <div style={{ padding: 14 }}>
                          {isLeads && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", margin: "0 0 4px" }}>📋 Campanha de Captação de Leads</p>
                                <p style={{ fontSize: 12, color: "#3b82f6", margin: 0, lineHeight: 1.5 }}>
                                  Escolha se quer publicar com formulário instantâneo da Meta ou com URL externa.
                                </p>
                              </div>
                              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                {[
                                  { key: "lead_form", label: "📋 Formulário Meta" },
                                  { key: "website", label: "🔗 Site / landing page" },
                                ].map(option => (
                                  <button key={option.key}
                                    onClick={() => setLeadDestination(option.key as "website" | "lead_form")}
                                    style={{
                                      flex: 1,
                                      padding: "8px 10px",
                                      borderRadius: 10,
                                      border: `1.5px solid ${leadDestination === option.key ? "#2563eb" : "#cbd5e1"}`,
                                      background: leadDestination === option.key ? "#dbeafe" : "white",
                                      color: leadDestination === option.key ? "#1d4ed8" : "#475569",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}>{option.label}</button>
                                ))}
                              </div>
                              {leadDestination === "lead_form" && (
                                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", margin: 0 }}>Formulário de leads</p>
                                    <button
                                      onClick={() => leadFormsQuery.refetch?.()}
                                      style={{ background: "none", border: "none", color: "#2563eb", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                                      Atualizar lista
                                    </button>
                                  </div>
                                  {!!leadFormDraft && (
                                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                                      <p style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700, margin: "0 0 4px" }}>
                                        Rascunho salvo do builder: {String(leadFormDraft?.name || `Leads - ${(campaign as any)?.name || "Campanha"}`)}
                                      </p>
                                      <p style={{ fontSize: 11, color: "#1d4ed8", margin: "0 0 8px", lineHeight: 1.5 }}>
                                        Campos: {Array.isArray(leadFormDraft?.fields) && leadFormDraft.fields.length > 0 ? leadFormDraft.fields.join(", ") : "FULL_NAME, EMAIL, PHONE"}
                                      </p>
                                      <button
                                        className="btn btn-sm btn-ghost"
                                        onClick={() => createLeadFormFromDraft().catch((e: any) => toast.error(`Erro ao criar formulário: ${e?.message || "falha desconhecida"}`))}
                                        disabled={!pageId.trim() || !!createLeadFormMutation.isPending}
                                        style={{ fontSize: 11, padding: "6px 10px", borderColor: "#93c5fd", color: "#1d4ed8" }}>
                                        {createLeadFormMutation.isPending ? "Criando formulário..." : "Criar formulário salvo na Meta"}
                                      </button>
                                      {!String(leadFormDraft?.privacyUrl || "").trim() && (
                                        <p style={{ fontSize: 10, color: "#b45309", margin: "8px 0 0" }}>
                                          O rascunho salvo precisa de URL de política de privacidade para ser criado automaticamente.
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {loadingForms ? (
                                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>⏳ Carregando formulários da página...</p>
                                  ) : leadForms.length > 0 ? (
                                    <>
                                      <select
                                        className="input"
                                        value={leadFormId}
                                        onChange={e => setLeadFormId(e.target.value)}
                                        style={{ width: "100%", fontSize: 12, marginBottom: 6 }}>
                                        <option value="">Selecione um formulário...</option>
                                        {leadForms.map((form) => (
                                          <option key={form.id} value={form.id}>
                                            {form.name} ({form.status || "ACTIVE"})
                                          </option>
                                        ))}
                                      </select>
                                      <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
                                        A Meta receberá o <strong>lead_gen_form_id</strong> selecionado no publish.
                                      </p>
                                    </>
                                  ) : (
                                    <p style={{ fontSize: 12, color: "#b45309", margin: 0 }}>
                                      Nenhum formulário encontrado para esta página. Você pode criar o rascunho salvo acima ou selecionar outra página antes de publicar.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {isAwareness && (
                            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                              <p style={{ fontSize: 12, color: "#166534", fontWeight: 600, margin: "0 0 4px" }}>📢 Campanha de Branding / Engajamento</p>
                              <p style={{ fontSize: 12, color: "#166534", margin: 0, lineHeight: 1.5 }}>
                                Direciona para a página do Facebook ou Instagram. URL opcional.
                              </p>
                            </div>
                          )}
                          {!isLeads && !isAwareness && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                              <p style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, margin: "0 0 4px" }}>
                                🔴 URL de destino obrigatória
                              </p>
                              <p style={{ fontSize: 12, color: "#dc2626", margin: 0, lineHeight: 1.5 }}>
                                Campanhas de tráfego/vendas precisam de uma URL de destino.
                              </p>
                            </div>
                          )}
                          {(leadDestination === "website" || !isLeads) && (
                            <div>
                              {/* Atalho WhatsApp */}
                              <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Atalho:</span>
                                {(metaIntegration as any[])?.find(i => i.provider === "meta")?.whatsappPhone && (
                                  <button
                                    onClick={() => setLinkUrl(`https://wa.me/${((metaIntegration as any[]).find(i => i.provider === "meta")?.whatsappPhone || "").replace(/\D/g,"")}`)}
                                    style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "1px solid #25d366", background: "#f0fdf4", color: "#16a34a", cursor: "pointer" }}>
                                    📱 Usar WhatsApp salvo
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    const wa = prompt("Digite o número WhatsApp (ex: 47999465824):");
                                    if (wa) setLinkUrl(`https://wa.me/${wa.replace(/\D/g,"")}`);
                                  }}
                                  style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer" }}>
                                  ➕ Inserir WhatsApp
                                </button>
                              </div>
                              <input
                                className="input"
                                placeholder="https://seusite.com.br  ou  https://wa.me/5547999999999"
                                value={linkUrl}
                                onChange={e => setLinkUrl(e.target.value)}
                                onBlur={e => {
                                  const normalized = normalizeDestinationUrl(e.target.value);
                                  if (normalized) setLinkUrl(normalized);
                                }}
                                style={{
                                  width: "100%",
                                  borderColor: isRequired && !linkUrl.trim() ? "#ef4444" : undefined,
                                  fontSize: 13,
                                }}
                              />
                              {/* Preview do link */}
                              {linkUrl.includes("wa.me") && (
                                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>📱 Destino WhatsApp detectado</span>
                                  <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#25d366" }}>Testar link</a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1.5px solid #e2e8f0" }}>
                        <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>📍</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Localização do público</span>
                        </div>
                        <div style={{ padding: 14 }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                            {[
                              { value: "brasil", label: "🇧🇷 Brasil" },
                              { value: "paises", label: "🌎 Internacional" },
                              { value: "raio", label: "📍 Por raio" },
                            ].map(option => (
                              <button key={option.value}
                                onClick={() => {
                                  setLocationMode(option.value as "brasil" | "paises" | "raio");
                                  if (option.value !== "brasil") setRegions([]);
                                  if (option.value !== "paises") setCountries([]);
                                }}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  border: `1px solid ${locationMode === option.value ? "var(--green)" : "var(--border)"}`,
                                  background: locationMode === option.value ? "var(--green-l)" : "white",
                                  color: locationMode === option.value ? "var(--green-d)" : "var(--muted)",
                                  cursor: "pointer",
                                }}>{option.label}</button>
                            ))}
                          </div>

                          {locationMode === "brasil" && (
                            <>
                              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Selecione estados específicos ou deixe vazio para Brasil inteiro.</p>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {BR_STATE_OPTIONS.map((uf) => (
                                  <button key={uf}
                                    onClick={() => setRegions((prev) => prev.includes(uf) ? prev.filter((item) => item !== uf) : [...prev, uf])}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 16,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      border: `1px solid ${regions.includes(uf) ? "var(--green)" : "var(--border)"}`,
                                      background: regions.includes(uf) ? "var(--green-l)" : "white",
                                      color: regions.includes(uf) ? "var(--green-d)" : "var(--muted)",
                                      cursor: "pointer",
                                    }}>{uf}</button>
                                ))}
                              </div>
                              <p style={{ fontSize: 11, color: regions.length ? "var(--green-d)" : "var(--muted)", margin: "8px 0 0" }}>
                                {regions.length ? `◎ Estados enviados: ${regions.join(", ")}` : "◎ Fallback para Brasil inteiro"}
                              </p>
                            </>
                          )}

                          {locationMode === "paises" && (
                            <>
                              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Selecione os países que devem ser enviados à Meta.</p>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {COUNTRY_OPTIONS.map((country) => (
                                  <button key={country.code}
                                    onClick={() => setCountries((prev) => prev.includes(country.code) ? prev.filter((item) => item !== country.code) : [...prev, country.code])}
                                    style={{
                                      padding: "5px 12px",
                                      borderRadius: 16,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      border: `1px solid ${countries.includes(country.code) ? "var(--green)" : "var(--border)"}`,
                                      background: countries.includes(country.code) ? "var(--green-l)" : "white",
                                      color: countries.includes(country.code) ? "var(--green-d)" : "var(--muted)",
                                      cursor: "pointer",
                                    }}>{country.label}</button>
                                ))}
                              </div>
                              <p style={{ fontSize: 11, color: countries.length ? "var(--green-d)" : "#b45309", margin: "8px 0 0" }}>
                                {countries.length ? `◎ Países enviados: ${countries.join(", ")}` : "Selecione ao menos um país para publish internacional."}
                              </p>
                            </>
                          )}

                          {locationMode === "raio" && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                              <div>
                                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Cidade / endereço</label>
                                <input className="input" value={geoCity} onChange={e => setGeoCity(e.target.value)} placeholder="Ex: Balneário Camboriú, SC" style={{ fontSize: 12 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Raio</label>
                                <select className="input" value={geoRadius} onChange={e => setGeoRadius(Number(e.target.value))} style={{ width: 100, fontSize: 12 }}>
                                  {[5,10,15,20,30,40,50,80,100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
                                </select>
                              </div>
                              <p style={{ fontSize: 11, color: geoCity.trim() ? "var(--green-d)" : "#b45309", margin: 0, gridColumn: "1 / -1" }}>
                                {geoCity.trim() ? `◎ Raio de ${geoRadius}km em torno de ${geoCity}` : "Informe a cidade para montar custom_locations na Meta."}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1.5px solid #e2e8f0" }}>
                        <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15 }}>👤</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--black)" }}>Faixa etária</span>
                        </div>
                        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Idade mínima</label>
                            <select className="input" value={ageMin} onChange={e => setAgeMin(Number(e.target.value))} style={{ fontSize: 12 }}>
                              {[13,18,21,25,28,30,32,35,40,45,50].map((age) => <option key={age} value={age}>{age} anos</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Idade máxima</label>
                            <select className="input" value={ageMax} onChange={e => setAgeMax(Number(e.target.value))} style={{ fontSize: 12 }}>
                              {[18,21,25,30,35,40,45,50,55,60,65].map((age) => <option key={age} value={age}>{age} anos</option>)}
                            </select>
                          </div>
                          <p style={{ fontSize: 11, color: ageMin < ageMax ? "var(--green-d)" : "#dc2626", margin: 0, gridColumn: "1 / -1" }}>
                            {ageMin < ageMax ? `◎ A Meta receberá ${ageMin}–${ageMax} anos no ad set.` : "A idade mínima precisa ser menor do que a máxima."}
                          </p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* COLUNA DIREITA — mídia + botões */}
              <div style={{ flex: 1, minWidth: 280, maxWidth: 400, overflowY: "auto", overflowX: "hidden", padding: "20px 24px", background: "var(--off)", display: "flex", flexDirection: "column" }}>

                {/* Mídia do criativo */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>
                    Mídia do criativo <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>
                  </label>

                  {/* Seletor de modo */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {[
                      { key: "none",   label: "Sem mídia" },
                      { key: "upload", label: "Upload" },
                      { key: "url",    label: "URL" },
                    ].map(m => (
                      <button key={m.key}
                        onClick={() => { setMediaMode(m.key as any); resetMediaState(); }}
                        style={{
                          flex: 1, padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          border: `1.5px solid ${mediaMode === m.key ? "var(--green)" : "var(--border)"}`,
                          background: mediaMode === m.key ? "var(--green-l)" : "white",
                          color: mediaMode === m.key ? "var(--green-d)" : "var(--muted)",
                        }}>{m.label}</button>
                    ))}
                  </div>

                  {/* Modo URL */}
                  {mediaMode === "url" && (
                    <div style={{ marginBottom: 8 }}>
                      <input className="input" placeholder="https://seusite.com/banner.jpg" value={imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                        style={{ width: "100%", fontSize: 12 }} />
                    </div>
                  )}

                  {/* Modo Upload */}
                  {mediaMode === "upload" && (
                    <div>
                      {mediaFiles.length > 0 ? (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
                            {mediaFiles.map((file, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (isImageFile(mediaFiles[idx])) handleSetFeatured(idx);
                                }}
                                style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: "#f1f5f9", cursor: isImageFile(mediaFiles[idx]) ? "pointer" : "default" }}>
                                {mediaPreviews[idx] && (
                                  isVideoFile(mediaFiles[idx]) ? (
                                    <video src={mediaPreviews[idx]} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline controls={false} />
                                  ) : (
                                    <img src={mediaPreviews[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  )
                                )}
                                {featuredIndex === idx && isImageFile(mediaFiles[idx]) && (
                                  <div style={{ position: "absolute", top: 4, left: 4, background: "#1877f2", color: "white",
                                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>⭐ Destaque</div>
                                )}
                                {uploadedHashes[idx] && (
                                  <div style={{ position: "absolute", bottom: 4, right: 4, background: "#15803d", color: "white",
                                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>◎</div>
                                )}
                                {uploadingIndex === idx && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
                                    display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11 }}>⏳</div>
                                )}
                                <button onClick={e => {
                                  e.stopPropagation();
                                  const removedWasVideo = isVideoFile(mediaFiles[idx]);
                                  const newFiles    = mediaFiles.filter((_: any, i: number) => i !== idx);
                                  const newPreviews = mediaPreviews.filter((_: any, i: number) => i !== idx);
                                  const newHashes   = uploadedHashes.filter((_: any, i: number) => i !== idx);
                                  setMediaFiles(newFiles);
                                  setMediaPreviews(newPreviews);
                                  setUploadedHashes(newHashes);
                                  if (removedWasVideo) {
                                    setUploadedVid("");
                                    setUploadDone(false);
                                  }
                                  if (newFiles.length === 0) {
                                    setMediaType(null);
                                    setUploadedHash("");
                                    setUploadedVid("");
                                    setUploadDone(false);
                                  } else if (featuredIndex === idx) {
                                    setFeaturedIndex(0);
                                    setUploadedHash(newHashes[0] || "");
                                    setUploadDone(!!newHashes[0]);
                                  } else if (featuredIndex > idx) {
                                    setFeaturedIndex(featuredIndex - 1);
                                  }
                                }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.6)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                              </div>
                            ))}
                            {mediaFiles.length < MAX_META_CAROUSEL_ITEMS && !mediaFiles.some(file => isVideoFile(file)) && (
                              <label htmlFor="meta-media-input-multi" style={{
                                borderRadius: 8, border: "2px dashed var(--border)", background: "white",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", aspectRatio: "1", fontSize: 20, color: "var(--muted)",
                              }}>
                                +
                                <input id="meta-media-input-multi" type="file" multiple
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov,video/quicktime,video/mpeg,video/webm,video/avi,video/x-matroska,audio/mpeg,audio/mp3,audio/aac,audio/wav,audio/ogg,.mp4,.mov,.mp3,.mpeg,.webm,.avi,.mkv,.aac,.wav"
                                  style={{ display: "none" }}
                                  onChange={e => {
                                    const files = Array.from(e.target.files || []) as File[];
                                    const hasVideoInSelection = files.some(file => isVideoFile(file));
                                    const hasImageInSelection = files.some(file => isImageFile(file));
                                    if (hasVideoInSelection) {
                                      toast.error("Carrossel aceita apenas fotos. Para vídeo, envie um único arquivo.");
                                      e.target.value = "";
                                      return;
                                    }
                                    if (!hasImageInSelection) {
                                      toast.error("Selecione imagens JPG, PNG, GIF ou WebP.");
                                      e.target.value = "";
                                      return;
                                    }
                                    const remaining = MAX_META_CAROUSEL_ITEMS - mediaFiles.length;
                                    const toAdd = files.filter(file => isImageFile(file)).slice(0, remaining);
                                    const newFiles    = [...mediaFiles,    ...toAdd];
                                    const newPreviews = [...mediaPreviews, ...toAdd.map(() => "")];
                                    const newHashes   = [...uploadedHashes,...toAdd.map(() => "")];
                                    setMediaType("image");
                                    setMediaFiles(newFiles);
                                    setMediaPreviews(newPreviews);
                                    setUploadedHashes(newHashes);
                                    toAdd.forEach((file, i) => {
                                      const globalIdx = mediaFiles.length + i;
                                      const reader = new FileReader();
                                      reader.onload = ev => {
                                        setMediaPreviews((prev: string[]) => { const n = [...prev]; n[globalIdx] = ev.target?.result as string; return n; });
                                      };
                                      reader.readAsDataURL(file);
                                    });
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                          </div>
                          {mediaFiles.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                                {mediaFiles.length === 1 && isVideoFile(mediaFiles[0])
                                  ? "🎬 Vídeo único"
                                  : mediaFiles.length >= 2
                                    ? `📸 Carrossel com ${mediaFiles.length} fotos`
                                    : "📸 Imagem única"}
                                {isVideoFile(mediaFiles[0]) ? "" : " — clique na imagem para definir o destaque"}
                              </p>
                              <button
                                onClick={async () => {
                                  const singleVideoSelected = mediaFiles.length === 1 && isVideoFile(mediaFiles[0]);
                                  if (singleVideoSelected) {
                                    setUploadingIndex(0);
                                    const uploadResult = await handleUploadMedia(mediaFiles[0]);
                                    setUploadingIndex(null);
                                    if (uploadResult?.kind === "video") {
                                      toast.success("◎ Vídeo enviado para a Meta!");
                                    }
                                    return;
                                  }

                                  const newHashes = [...uploadedHashes];
                                  const newlyUploadedItems: Array<{ hash: string; ratio?: string | null }> = [];
                                  for (let i = 0; i < mediaFiles.length; i++) {
                                    if (!newHashes[i] && isImageFile(mediaFiles[i])) {
                                      setUploadingIndex(i);
                                      const uploadResult = await handleUploadMedia(mediaFiles[i]);
                                      if (uploadResult?.kind === "image") {
                                        newHashes[i] = uploadResult.hash;
                                        const localPreview = mediaPreviews[i] || await readFileAsDataUrl(mediaFiles[i]);
                                        if (localPreview) cacheCreativePreview(uploadResult.hash, localPreview);
                                        const dims = await getImageDimensions(mediaFiles[i]).catch(() => null);
                                        newlyUploadedItems.push({
                                          hash: uploadResult.hash,
                                          ratio: dims ? `${dims.width}:${dims.height}` : null,
                                        });
                                        setUploadedHashes([...newHashes]);
                                        if (i === featuredIndex) {
                                          setUploadedHash(uploadResult.hash);
                                          setUploadDone(true);
                                        }
                                      }
                                    }
                                  }
                                  setUploadingIndex(null);
                                  if (newlyUploadedItems.length > 0) {
                                    await autoAssignUploadedImagesToEmptyCreatives(newlyUploadedItems);
                                  }
                                  const totalImages = mediaFiles.filter(file => isImageFile(file)).length;
                                  const allDone = newHashes.filter(Boolean).length === totalImages;
                                  if (allDone) toast.success(`◎ ${totalImages} foto(s) enviadas para a Meta!`);
                                }}
                                disabled={uploading || uploadDone || ((mediaFiles.length === 1 && isVideoFile(mediaFiles[0])) ? !!uploadedVid : mediaFiles.every((file: any, i: number) => !isImageFile(file) || !!uploadedHashes[i]))}
                                style={{
                                  width: "100%", padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                                  cursor: (uploading || uploadDone) ? "not-allowed" : "pointer",
                                  background: uploading ? "#dbeafe"
                                    : uploadDone ? "#dcfce7"
                                    : "linear-gradient(135deg, #1877f2, #0a5dc2)",
                                  color: uploading ? "#1d4ed8"
                                    : uploadDone ? "#166534"
                                    : "white",
                                  border: uploading ? "1.5px solid #93c5fd"
                                    : uploadDone ? "1.5px solid #86efac"
                                    : "none",
                                  boxShadow: (!uploading && !uploadDone) ? "0 4px 14px rgba(24,119,242,0.35)" : "none",
                                  transition: "all 0.2s",
                                }}>
                                {uploading
                                  ? "⏳ Enviando... aguarde"
                                  : uploadDone
                                    ? "◎ Pronto! Vídeo enviado para Meta"
                                    : (mediaFiles.length === 1 && isVideoFile(mediaFiles[0]))
                                      ? "📤 Clique para enviar vídeo à Meta"
                                      : `📤 Enviar ${mediaFiles.length} foto(s) para Meta`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label htmlFor="meta-media-input-multi" style={{ cursor: "pointer" }}>
                          <div data-upload-area style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📸🎬🎵</div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--body)", margin: "0 0 4px" }}>Clique para adicionar fotos, vídeo ou áudio</p>
                            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>JPG, PNG, WebP, GIF · MP4, MOV, WEBM, AVI, MKV · MP3, AAC, WAV · até 10 fotos ou 1 vídeo/áudio</p>
                          </div>
                          <input id="meta-media-input-multi" type="file" multiple
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov,video/quicktime,video/mpeg,video/webm,video/avi,video/x-matroska,audio/mpeg,audio/mp3,audio/aac,audio/wav,audio/ogg,.mp4,.mov,.mp3,.mpeg,.webm,.avi,.mkv,.aac,.wav"
                            style={{ display: "none" }}
                            onChange={e => {
                              const files = Array.from(e.target.files || []) as File[];
                              const hasVideoInSelection = files.some(file => isVideoFile(file));
                              const hasImageInSelection = files.some(file => isImageFile(file));

                              if (hasVideoInSelection && hasImageInSelection) {
                                toast.error("Escolha fotos para carrossel ou um único vídeo. Não misture os dois.");
                                e.target.value = "";
                                return;
                              }

                              if (hasVideoInSelection) {
                                const firstVideo = files.find(file => isVideoFile(file));
                                if (!firstVideo) {
                                  e.target.value = "";
                                  return;
                                }
                                setMediaType("video");
                                setMediaFiles([firstVideo]);
                                setMediaPreviews([URL.createObjectURL(firstVideo)]);
                                setUploadedHashes([""]);
                                setUploadedHash("");
                                setUploadedVid("");
                                setUploadedThumbHash("");
                                setUploadedThumbPreview("");
                                setUploadDone(false);
                                setUploading(false);
                                setFeaturedIndex(0);
                                // ── Auto-upload via ref (mais confiável que setTimeout) ──
                                pendingAutoUploadRef.current = firstVideo;
                                e.target.value = "";
                                return;
                              }

                              const toAdd = files.filter(file => isImageFile(file)).slice(0, MAX_META_CAROUSEL_ITEMS);
                              setMediaType("image");
                              setMediaFiles(toAdd);
                              setMediaPreviews(toAdd.map(() => ""));
                              setUploadedHashes(toAdd.map(() => ""));
                              setUploadedHash("");
                              setUploadedVid("");
                              setUploadedThumbHash("");
                              setUploadedThumbPreview("");
                              setUploadDone(false);
                              setFeaturedIndex(0);
                              toAdd.forEach((file, i) => {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  setMediaPreviews((prev: string[]) => { const n = [...prev]; n[i] = ev.target?.result as string; return n; });
                                };
                                reader.readAsDataURL(file);
                              });
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {mediaFiles.length === 1 && isVideoFile(mediaFiles[0]) && (
                  <div style={{ marginBottom: 16, background: "white", border: "1px solid #dbeafe", borderRadius: 12, padding: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 8 }}>
                      Thumbnail do vídeo <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px" }}>
                      A Meta exige uma thumbnail válida para publicar criativos em vídeo.
                    </p>
                    {uploadedThumbPreview ? (
                      <img src={uploadedThumbPreview} alt="Thumbnail do vídeo" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 10 }} />
                    ) : null}
                    <label htmlFor="meta-video-thumb-input" style={{ display: "block", cursor: "pointer" }}>
                      <div style={{ border: "1.5px dashed #93c5fd", borderRadius: 10, padding: 14, textAlign: "center", background: "#f8fbff" }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>🖼️</div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", margin: "0 0 4px" }}>Selecionar thumbnail</p>
                        <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>JPG, PNG, GIF ou WebP</p>
                      </div>
                      <input
                        id="meta-video-thumb-input"
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) await handleUploadVideoThumbnail(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <div style={{ marginTop: 10, fontSize: 11, color: uploadedThumbHash ? "#166534" : "#b45309", fontWeight: 600 }}>
                      {thumbnailUploading
                        ? "⏳ Enviando thumbnail..."
                        : uploadedThumbHash
                          ? `◎ Thumbnail enviada (${uploadedThumbHash.slice(0, 12)}...)`
                          : "⚠️ Envie a thumbnail antes de publicar"}
                    </div>
                  </div>
                )}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Botões */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <button onClick={handlePublish} disabled={publishing}
                    className="btn-publish"
                    style={{ width: "100%", background: publishing ? "#93c5fd" : "#1877f2", color: "white", fontWeight: 800, fontSize: 14, padding: "13px", borderRadius: 12, border: "none", cursor: publishing ? "not-allowed" : "pointer", transition: "all .2s" }}>
                    {publishing
                      ? `⏳ Publicando${multiPageMode && selectedPageIds.length > 1 ? ` em ${selectedPageIds.length} páginas` : ""}...`
                      : multiPageMode && selectedPageIds.length > 1
                        ? `📘 Publicar em ${selectedPageIds.length} páginas`
                        : "📘 Publicar no Meta Ads"}
                  </button>
                  <button className="btn btn-md btn-ghost" onClick={() => setShowModal(false)}
                    style={{ width: "100%", padding: "10px", borderRadius: 10, fontSize: 13 }}>
                    Cancelar
                  </button>
                  {id > 0 && projectId > 0 && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => { if (!id || id <= 0) { toast.error("Campanha inválida."); return; } setShowModal(false); setLocation(`/projects/${projectId}/campaign/result/${id}/google`); }}
                        style={{ flex: 1, background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 12, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer" }}>
                        🔵 Google Ads
                      </button>
                      <button
                        onClick={() => { if (!id || id <= 0) { toast.error("Campanha inválida."); return; } setShowModal(false); setLocation(`/projects/${projectId}/campaign/result/${id}/tiktok`); }}
                        style={{ flex: 1, background: "#010101", color: "white", fontWeight: 700, fontSize: 12, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer" }}>
                        🎵 TikTok Ads
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Regenerar Parte ── */}
      {showRegenModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "white", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
              🔄 Regenerar {
                showRegenModal === "creatives" ? "Criativos" :
                showRegenModal === "adSets"    ? "Públicos" :
                showRegenModal === "hooks"     ? "Hooks" :
                showRegenModal === "abTests"   ? "Testes A/B" : "Copies"
              }
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              A IA vai gerar novas variações substituindo as atuais. Adicione contexto opcional para direcionar melhor.
            </p>
            <textarea
              value={regenContext}
              onChange={e => setRegenContext(e.target.value)}
              placeholder="Contexto opcional... ex: 'foque em público feminino 30-45 anos' ou 'use linguagem mais direta'"
              rows={3}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowRegenModal(null); setRegenContext(""); }}
                className="btn btn-md btn-ghost">
                Cancelar
              </button>
              <button
                disabled={regenerateMutation.isLoading}
                onClick={() => {
                  setRegenerating(showRegenModal);
                  regenerateMutation.mutate({
                    campaignId:   id,
                    projectId,
                    part:         showRegenModal as any,
                    extraContext: regenContext || undefined,
                  });
                }}
                className="btn btn-md btn-green"
                style={{ minWidth: 140 }}
              >
                {regenerateMutation.isLoading ? "⏳ Gerando..." : "✨ Regenerar agora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Post Orgânico ── */}
      {showOrganicModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(8px, 2vw, 20px)", overflowY: "auto", paddingTop: "clamp(16px, 4vh, 40px)" }}>
          <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 1200, boxShadow: "0 24px 80px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", maxHeight: "95vh", overflow: "hidden" }}>

            {/* HEADER */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📝</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", margin: 0 }}>Post Orgânico</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Publica gratuitamente na timeline da sua Página do Facebook</p>
              </div>
              <button onClick={() => setShowOrganicModal(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>✕</button>
            </div>

            {organicResult ? (
              // ── Tela de sucesso ──
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40, textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>◈</div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Post publicado!</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>{organicResult.message}</p>
                  {organicResult.postUrl && (
                    <a href={organicResult.postUrl} target="_blank" rel="noreferrer"
                      style={{ display: "inline-block", background: "#1877f2", color: "white", fontWeight: 700, fontSize: 13, padding: "12px 28px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}>
                      👁️ Ver post no Facebook
                    </a>
                  )}
                  <br />
                  <button onClick={() => { setOrganicResult(null); setShowOrganicModal(false); }}
                    style={{ fontSize: 12, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", marginTop: 12 }}>
                    Fechar
                  </button>
                </div>
              </div>
            ) : (

              // ── BODY: duas colunas ──
              <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0, flexWrap: "nowrap" }} className="publish-modal-body">

                {/* COLUNA ESQUERDA — configurações */}
                <div style={{ width: "clamp(280px, 45%, 520px)", flexShrink: 0, overflowY: "auto", overflowX: "hidden", padding: "20px 24px", borderRight: "1px solid var(--border)" }}>

                  {/* Página do Facebook */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      Página do Facebook *
                    </label>
                    {organicPageId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10 }}>
                        <span style={{ fontSize: 16 }}>◎</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#166534" }}>{organicPageName || `Página ${organicPageId}`}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#15803d", fontFamily: "monospace" }}>ID: {organicPageId}</p>
                        </div>
                        <button onClick={() => { setOrganicPageId(""); setOrganicPageName(""); }}
                          style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1, position: "relative" }}>
                            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13 }}>@</span>
                            <input className="input" placeholder="handle do Instagram ou Facebook"
                              value={organicHandle} onChange={e => setOrganicHandle(e.target.value.replace(/^@/, ""))}
                              style={{ width: "100%", paddingLeft: 24, fontSize: 13 }}
                              onKeyDown={e => {
                                if (e.key === "Enter" && organicHandle.trim()) {
                                  setDiscoveringPage(true); setDiscoverError("");
                                  (discoverPageIdMutation as any).mutate({ instagramHandle: organicHandle.trim(), companyName: c.name || undefined });
                                }
                              }} />
                          </div>
                          <button disabled={discoveringPage || !organicHandle.trim()}
                            onClick={() => {
                              if (!organicHandle.trim()) return;
                              setDiscoveringPage(true); setDiscoverError("");
                              (discoverPageIdMutation as any).mutate({ instagramHandle: organicHandle.trim(), companyName: c.name || undefined });
                            }}
                            style={{ padding: "0 16px", borderRadius: 10, border: "none", background: discoveringPage ? "#93c5fd" : "#1877f2", color: "white", fontWeight: 700, fontSize: 12, cursor: discoveringPage ? "wait" : "pointer", flexShrink: 0 }}>
                            {discoveringPage ? "⏳" : "🔍 Buscar"}
                          </button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>ou informe manualmente</span>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input className="input" placeholder="ID numérico da Página"
                            value={organicPageId} onChange={e => setOrganicPageId(e.target.value)}
                            style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
                          {pages.length > 0 ? (
                            <select className="input" style={{ flex: 1 }} value={organicPageId}
                              onChange={e => { const p = pages.find((pg: any) => pg.id === e.target.value) as any; setOrganicPageId(e.target.value); setOrganicPageName(p?.name || ""); }}>
                              <option value="">Minhas páginas...</option>
                              {pages.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          ) : (
                            <button onClick={fetchPages}
                              style={{ padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "white", fontSize: 11, fontWeight: 700, color: "#1877f2", cursor: "pointer", flexShrink: 0 }}>
                              📋 Listar páginas
                            </button>
                          )}
                        </div>
                        {discoverError && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                            <p style={{ margin: 0, fontSize: 11, color: "#dc2626" }}>⚠️ {discoverError}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Link opcional */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Link (opcional)</label>
                    <input className="input" placeholder="https://seusite.com.br"
                      value={organicLinkUrl} onChange={e => setOrganicLinkUrl(e.target.value)}
                      style={{ width: "100%", fontSize: 13 }} />
                  </div>

                  {/* Aviso permissão */}
                  <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                    <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 800, margin: "0 0 8px" }}>🔒 Permissão necessária</p>
                    <p style={{ fontSize: 11, color: "#7f1d1d", margin: "0 0 10px", lineHeight: 1.6 }}>
                      Requer <strong>pages_manage_posts</strong> e <strong>pages_read_engagement</strong> aprovadas.
                    </p>
                    {[
                      "1. developers.facebook.com → My Apps → seu app",
                      "2. App Review → Permissions and Features",
                      "3. Solicite pages_manage_posts → Advanced Access",
                    ].map((s, i) => (
                      <p key={i} style={{ fontSize: 11, color: "#7f1d1d", margin: "2px 0", lineHeight: 1.5 }}>{s}</p>
                    ))}
                    <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "white", background: "#1877f2", padding: "6px 14px", borderRadius: 8, textDecoration: "none" }}>
                      Abrir developers.facebook.com →
                    </a>
                  </div>

                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px" }}>
                    <p style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600, margin: "0 0 4px" }}>ℹ️ Post orgânico vs. Anúncio pago</p>
                    <p style={{ fontSize: 11, color: "#1d4ed8", margin: 0, lineHeight: 1.6 }}>
                      Posts orgânicos aparecem na timeline da sua Página gratuitamente, mas com alcance limitado.
                      Para maior alcance, use "Publicar no Meta Ads".
                    </p>
                  </div>
                </div>

                {/* COLUNA DIREITA — mensagem + imagem + botões */}
                <div style={{ flex: 1, minWidth: 280, maxWidth: 400, overflowY: "auto", overflowX: "hidden", padding: "20px 24px", background: "var(--off)", display: "flex", flexDirection: "column" }}>

                  {/* Mensagem */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)" }}>Mensagem do post *</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                          background: organicMessage.length > 2200 ? "#fee2e2" : organicMessage.length > 1000 ? "#fef3c7" : "#f0fdf4",
                          color: organicMessage.length > 2200 ? "#dc2626" : organicMessage.length > 1000 ? "#92400e" : "#16a34a" }}>
                          {organicMessage.length} chars
                        </span>
                        <button onClick={() => setOrganicMessage(generateOrganicMessage(c))}
                          style={{ fontSize: 10, fontWeight: 700, color: "#1877f2", background: "none", border: "1px solid #bfdbfe", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                          🔄 Regenerar
                        </button>
                      </div>
                    </div>
                    <textarea className="textarea" rows={7} value={organicMessage}
                      onChange={e => setOrganicMessage(e.target.value)}
                      placeholder="A mensagem será gerada automaticamente com base nos criativos da campanha."
                      style={{ width: "100%", fontSize: 13, resize: "vertical", lineHeight: 1.6 }} />
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      💡 Gerado com hook + copy + CTA dos criativos. Edite antes de publicar.
                    </p>
                  </div>

                  {/* Upload de imagem */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      Imagem <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opcional)</span>
                    </label>
                    {organicImagePreview ? (
                      <div>
                        <img src={organicImagePreview} alt="preview" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          {!organicImageBase64 ? (
                            <button disabled={organicUploading} onClick={async () => {
                              if (!organicImageFile) return;
                              setOrganicUploading(true);
                              try {
                                const b64: string = await new Promise((res, rej) => {
                                  const reader = new FileReader();
                                  reader.onload  = () => res((reader.result as string).split(",")[1] ?? "");
                                  reader.onerror = () => rej(new Error("Falha ao ler imagem"));
                                  reader.readAsDataURL(organicImageFile);
                                });
                                setOrganicImageBase64(b64);
                                toast.success("◎ Imagem pronta para o post!");
                              } catch { toast.error("✕ Erro ao processar imagem"); }
                              setOrganicUploading(false);
                            }}
                              style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: organicUploading ? "#93c5fd" : "#1877f2", color: "white", border: "none", cursor: "pointer" }}>
                              {organicUploading ? "⏳ Processando..." : "◎ Usar esta imagem"}
                            </button>
                          ) : (
                            <div style={{ flex: 1, padding: "7px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #86efac", fontSize: 12, fontWeight: 700, color: "#16a34a", textAlign: "center" }}>
                              ◎ Imagem pronta
                            </div>
                          )}
                          <button onClick={() => { setOrganicImageFile(null); setOrganicImagePreview(""); setOrganicImageBase64(""); }}
                            style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, background: "none", border: "1px solid var(--border)", cursor: "pointer", color: "var(--muted)" }}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label htmlFor="organic-image-input" style={{ cursor: "pointer" }}>
                        <div style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: "16px", textAlign: "center", background: "white" }}>
                          <div style={{ fontSize: 28, marginBottom: 4 }}>🖼️</div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--body)", margin: 0 }}>Clique para adicionar imagem</p>
                          <p style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0 0" }}>JPG, PNG · máx 4MB</p>
                        </div>
                        <input id="organic-image-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: "none" }}
                          onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            setOrganicImageFile(file); setOrganicImageBase64("");
                            const reader = new FileReader();
                            reader.onload = ev => { const d = ev.target?.result as string; setOrganicImagePreview(d); setOrganicImageBase64(d.split(",")[1] ?? ""); };
                            reader.readAsDataURL(file); e.target.value = "";
                          }} />
                      </label>
                    )}
                  </div>

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Botões */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <button
                      disabled={organicPosting || !organicPageId.trim() || !organicMessage.trim()}
                      onClick={() => {
                        if (!organicPageId.trim()) { toast.error("Informe o ID da Página"); return; }
                        if (!organicMessage.trim()) { toast.error("Informe a mensagem do post"); return; }
                        setOrganicPosting(true);
                        (organicPostMutation as any).mutate({
                          pageId:      organicPageId.trim(),
                          message:     organicMessage.trim(),
                          linkUrl:     organicLinkUrl.trim() || undefined,
                          imageBase64: organicImageBase64 || undefined,
                        });
                      }}
                      style={{
                        width: "100%", background: organicPosting ? "#93c5fd" : "#1877f2",
                        color: "white", fontWeight: 800, fontSize: 14, padding: "13px",
                        borderRadius: 12, border: "none",
                        cursor: organicPosting || !organicPageId.trim() || !organicMessage.trim() ? "not-allowed" : "pointer",
                        opacity: !organicPageId.trim() || !organicMessage.trim() ? 0.6 : 1,
                      }}>
                      {organicPosting ? "⏳ Publicando..." : "📝 Publicar post agora"}
                    </button>
                    <button onClick={() => setShowOrganicModal(false)}
                      className="btn btn-md btn-ghost" style={{ width: "100%", padding: "10px", borderRadius: 10, fontSize: 13 }}>
                      Cancelar
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.3); }
          50%       { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
        }
        .campaign-section {
          animation: fadeInUp .4s ease both;
        }
        .metric-card:hover {
          transform: translateY(-2px);
          transition: transform .2s ease;
        }
        .creative-card:hover {
          border-color: var(--green) !important;
          box-shadow: 0 4px 20px rgba(34,197,94,.1);
          transition: all .2s ease;
        }
        .btn-publish:hover {
          transform: scale(1.02);
          box-shadow: 0 8px 25px rgba(24,119,242,.4);
          transition: all .2s ease;
        }
        .adset-card:hover {
          border-color: #93c5fd !important;
          transition: border-color .2s;
        }
        @media print {
          button, .no-print { display: none !important; }
        }
      `}</style>
      </div>
    {/* ── Painel de Auditoria ── */}
      {showAudit && campaign && (
        <div style={{ maxWidth: 900, margin: "0 auto 40px", padding: "0 16px" }}>
          <CampaignAudit
            campaign={campaign}
            clientProfile={(clientProfile as any)}
            projectId={projectId}
            onClose={() => setShowAudit(false)}
            onProfileUpdated={() => _refetch()}
          />
        </div>
      )}
    </Layout>
  );
}

