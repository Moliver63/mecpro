import { useLocation, useParams } from "wouter";
import PlacementSelector from "@/components/PlacementSelector";
import AdPreviewPanel from "@/components/AdPreviewPanel";
import { getImageDimensions, validateMediaForPlacements, getOrientationGuide, type MediaDimensions, type MediaValidationResult } from "@/components/MediaValidator";
import { PLATFORM_PLACEMENTS, AUTO_PLACEMENTS, type PlacementMode } from "@/components/PlacementConfig";
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  const [uploading,    setUploading]    = useState(false);
  const [uploadDone,   setUploadDone]   = useState(false);
  const [mediaMode,    setMediaMode]    = useState<"none" | "url" | "upload">("none");
  const [mediaDims,    setMediaDims]    = useState<MediaDimensions | null>(null);
  const [mediaValidation, setMediaValidation] = useState<MediaValidationResult | null>(null);

  // ── estado multi-upload ──
  const [mediaFiles,      setMediaFiles]      = useState<File[]>([]);
  const [mediaPreviews,   setMediaPreviews]   = useState<string[]>([]);
  const [uploadedHashes,  setUploadedHashes]  = useState<string[]>([]);
  const [featuredIndex,   setFeaturedIndex]   = useState<number>(0);
  const [uploadingIndex,  setUploadingIndex]  = useState<number | null>(null);

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
  // ── Estados formulário de leads (usados no modal) ──
  const [leadDestination, setLeadDestination] = useState<"website" | "lead_form">("website");
  const [leadFormId,      setLeadFormId]      = useState<string>("");
  const [leadForms,       setLeadForms]       = useState<{id:string;name:string;status:string;leads_count:number}[]>([]);
  const [loadingForms,    setLoadingForms]    = useState(false);

  // ── mutations edição ──
  const updateCreativeMutation = (trpc as any).campaigns?.updateCreative?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success("✅ Criativo atualizado!");
      setEditingCreative(null);
      setEditDraft({});
      refetchCampaign?.();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  }) ?? { mutate: () => {}, isLoading: false };

  const updateAdSetMutation = (trpc as any).campaigns?.updateAdSet?.useMutation?.({
    onSuccess: () => {
      toast.success("✅ Conjunto atualizado!");
      setEditingAdSet(null);
      setEditDraft({});
      refetchCampaign?.();
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  }) ?? { mutate: () => {}, isLoading: false };

  const regenerateMutation = (trpc as any).campaigns?.regeneratePart?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success(`✅ ${data.part === "creatives" ? "Criativos" : data.part === "adSets" ? "Públicos" : data.part === "hooks" ? "Hooks" : data.part === "abTests" ? "Testes A/B" : "Copies"} regenerados!`);
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
      const res = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`);
      const data = await res.json();
      if (data.error) { toast.error(`Erro ao buscar páginas: ${data.error.message}`); return; }
      const list = data.data || [];
      setPages(list);
      if (list.length === 1) setPageId(list[0].id);
      if (list.length === 0) toast.error("Nenhuma página encontrada nessa conta.");
    } catch (e: any) {
      toast.error("Erro ao buscar páginas do Facebook.");
    } finally { setLoadingPages(false); }
  }

  const publishMutation = trpc.campaigns.publishToMeta.useMutation({
    onSuccess: (data: any) => {
      setPublishResult(data);
      setShowModal(false);
      setPublishing(false);
      if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
        toast.warning(`⚠️ ${data.warnings[0]}`);
      } else {
        toast.success("✅ Campanha publicada no Meta Ads!");
      }
    },
    onError: (e: any) => {
      const msg = e?.message || e?.data?.message || "Erro desconhecido ao publicar";
      toast.error(`❌ ${msg}`);
      setPublishing(false);
    },
  });

  // ── Upload de imagem via tRPC hook ───────────────────────────────────────
  const uploadImageMutation   = (trpc as any).integrations?.uploadImageToMeta?.useMutation?.() ?? { mutateAsync: null };


  const regenerateCreativeImageMutation = (trpc as any).campaigns?.regenerateCreativeImage?.useMutation?.({
    onSuccess: (data: any) => {
      toast.success("🖼️ Imagem regenerada com sucesso!");
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
        toast.success(`✅ Page ID encontrado: ${data.pageId}${data.pageName ? ` (${data.pageName})` : ""}`);
      } else {
        setDiscoverError("Não foi possível encontrar o Page ID automaticamente. Informe manualmente.");
        toast.error("❌ Page ID não encontrado. Informe manualmente.");
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
      toast.success("✅ Post publicado com sucesso na Página!");
    },
    onError: (e: any) => {
      toast.error("❌ " + (e?.message || "Erro ao publicar post orgânico"));
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
        toast.error("❌ Campanha com risco alto de rejeição pela Meta! Revise os criativos.");
      } else if (result.score === "warning") {
        toast.warning("⚠️ Atenção: há pontos sensíveis. Revise antes de publicar.");
      } else {
        toast.success("✅ Compliance OK! Campanha dentro das políticas Meta.");
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

  async function handlePublish() {
    if (!pageId.trim()) { toast.error("Informe o ID da Página do Facebook"); return; }
    // Verifica se tem arquivo pendente de upload (modo upload sem hash)
    if (mediaMode === "upload" && mediaFiles.length > 0 && uploadedHashes.filter(Boolean).length === 0) {
      toast.error("Clique em '📤 Enviar foto(s) para Meta' antes de publicar.");
      return;
    }

    // Apenas sales e traffic exigem URL externa obrigatoriamente
    const campaignObj = (campaign as any)?.objective || "";
    const needsDest = ["sales", "traffic"].includes(campaignObj);
    const hasProfileDest = !!(clientProfile as any)?.websiteUrl || !!(clientProfile as any)?.socialLinks;
    const hasManualLink = !!linkUrl.trim();

    if (needsDest && !hasProfileDest && !hasManualLink) {
      toast.error(
        "⚠️ Informe uma URL de destino no campo abaixo. " +
        "Ex: https://seusite.com.br"
      );
      return;
    }

    setPublishing(true);
    try {
      // Prepara dados de imagem — carrossel se tiver 2+ fotos enviadas
      const validHashes = uploadedHashes.filter(h => !!h);
      const isCarousel  = validHashes.length >= 2;

      await publishMutation.mutateAsync({
        campaignId: id,
        projectId,
        pageId: pageId.trim(),
        imageUrl:    mediaMode === "url" ? imageUrl.trim() || undefined : undefined,
        imageHash:   !isCarousel ? (uploadedHash || undefined) : undefined,
        imageHashes: isCarousel ? validHashes : undefined,
        videoId:     uploadedVid  || undefined,
        linkUrl:     linkUrl.trim() || undefined,
        adSetIndex,
        placementMode,
        placements:  selectedPlacements.length > 0 ? selectedPlacements : undefined,
      } as any);
    } finally { setPublishing(false); }
  }

  // ── Upload de mídia para Meta Ads (via tRPC) ──
  // Upload de um arquivo específico (por índice ou por File object)
  async function handleUploadMedia(fileOverride?: File): Promise<string | null> {
    const targetFile = fileOverride || mediaFile;
    if (!targetFile) return null;
    setUploading(true);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsDataURL(targetFile);
      });

      if (!base64 || base64.length < 100) {
        toast.error("❌ Arquivo inválido ou corrompido. Tente outro arquivo.");
        return null;
      }

      const sizeBytes = Math.ceil(base64.length * 0.75);
      if (sizeBytes > 4 * 1024 * 1024) {
        toast.error(`❌ Imagem muito grande (${(sizeBytes/1024/1024).toFixed(1)}MB). Limite: 4MB.`);
        return null;
      }

      if (!uploadImageMutation.mutateAsync) {
        toast.error("❌ Função de upload não disponível. Recarregue a página.");
        return null;
      }

      const result = await uploadImageMutation.mutateAsync({
        imageBase64: base64,
        fileName: targetFile.name || "ad_image.jpg",
      });

      if (result?.hash) {
        // Se for upload único (sem mediaFiles), atualiza estado legado
        if (!fileOverride) {
          setUploadedHash(result.hash);
          setUploadedVid("");
          setUploadDone(true);
        }
        toast.success(`✅ Foto enviada! (${targetFile.name.slice(0, 20)})`);
        return result.hash as string;
      } else {
        toast.error("❌ Upload concluído mas sem hash retornado.");
        return null;
      }
    } catch (e: any) {
      const msg = e?.message || e?.data?.message || "Erro desconhecido";
      toast.error(`❌ Upload falhou: ${msg}`);
      return null;
    } finally {
      setUploading(false);
    }
  }

  // ── Selecionar arquivo ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Tipo inválido. Use JPG, PNG, GIF, WebP, MP4 ou MOV.");
      return;
    }
    setMediaFile(file);
    setMediaType(isVideo ? "video" : "image");
    setUploadDone(false);
    setUploadedHash("");
    setUploadedVid("");
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
        toast.success("✅ Mídia compatível: " + dims.width + "×" + dims.height + "px (" + dims.ratio + ")");
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
      APPLY_NOW:     "✅ Solicite agora",
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

  function getCreativeImage(creative: any, preferredFormat?: "feed" | "stories" | "square"): string {
    if (preferredFormat === "stories") return creative?.storyImageUrl || creative?.feedImageUrl || creative?.squareImageUrl || "";
    if (preferredFormat === "square") return creative?.squareImageUrl || creative?.feedImageUrl || creative?.storyImageUrl || "";
    return creative?.feedImageUrl || creative?.squareImageUrl || creative?.storyImageUrl || "";
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

  const adSets    = campaign ? parseJson((campaign as any).adSets) : null;
  const creatives = campaign ? parseJson((campaign as any).creatives) : null;
  const funnel    = campaign ? parseJson((campaign as any).conversionFunnel) : null;
  const plan      = campaign ? parseJson((campaign as any).executionPlan) : null;
  const extra     = campaign ? parseJson((campaign as any).aiResponse) : null;
  const metrics      = extra?.metrics      || null;
  const glossary     = extra?.glossary     || null;
  const suggestedName = extra?.campaignName || null;
  const hooks        = extra?.hooks        || null;
  const abTests      = extra?.abTests      || null;
  const tracking     = extra?.tracking     || null;
  const optimization = extra?.optimization || null;
  const scaling      = extra?.scaling      || null;

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

  return (
    <Layout>
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
                success:    { label: "✅ Publicado",    bg: "#dcfce7", color: "#166534" },
                error:      { label: "❌ Erro",         bg: "#fee2e2", color: "#dc2626" },
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, fontSize: 12 }}>
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
        const statusIcon  = (s: string) => s === "good" ? "✅" : s === "warning" ? "⚠️" : s === "danger" ? "🔴" : "📊";

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "CPL estimado",    value: cpl    ? `R$ ${parseFloat(String(cpl).replace(/[^0-9.,]/g,"").replace(",",".")).toFixed(0)}` : "—", status: cplStatus,   icon: "🎯" },
                { label: "CTR estimado",    value: ctr    ? `${parseFloat(String(ctr).replace(/[^0-9.,]/g,"").replace(",",".")).toFixed(2)}%`    : "—", status: ctrStatus,   icon: "📉" },
                { label: "Leads/mês est.", value: leads  ? `${Math.round(parseFloat(String(leads).replace(/[^0-9.,]/g,"").replace(",",".")))}`   : "—", status: leadsStatus, icon: "🔥" },
                { label: "Budget/mês",      value: budget ? `R$ ${budget.toLocaleString("pt-BR")}`                                                     : "—", status: "neutral",  icon: "💰" },
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
                {actionUrgency === "alta" ? "🚨" : actionUrgency === "média" ? "⚡" : "✅"}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Budget diário",  value: budgetDaily ? `R$ ${budgetDaily.toLocaleString("pt-BR")}` : "—", sub: "por dia de veiculação", icon: "📅", accent: "#16a34a", bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)" },
          { label: "Budget mensal",  value: c.suggestedBudgetMonthly ? `R$ ${c.suggestedBudgetMonthly.toLocaleString("pt-BR")}` : "—", sub: "investimento total", icon: "💰", accent: "#2563eb", bg: "linear-gradient(135deg,#eff6ff,#dbeafe)" },
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
                        {updateAdSetMutation.isLoading ? "Salvando..." : "✅ Salvar"}
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
              return (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", marginBottom: 14, background: i === 0 ? "var(--green-l)" : "white" }}>
                {editingCreative === i ? (
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
                        {updateCreativeMutation.isLoading ? "Salvando..." : "✅ Salvar"}
                      </button>
                      <button onClick={() => { setEditingCreative(null); setEditDraft({}); }} className="btn btn-sm btn-ghost">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: creativeImage ? "220px 1fr" : "1fr", gap: 16, alignItems: "start" }}>
                      <div>
                        {creativeImage ? (
                          <img src={creativeImage} alt={cr.headline || `Criativo ${i + 1}`} style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb", objectFit: "cover", aspectRatio: creativeFormat === "stories" ? "9 / 16" : creativeFormat === "square" ? "1 / 1" : "4 / 5" }} />
                        ) : (
                          <div style={{ width: "100%", borderRadius: 12, border: "1px dashed #cbd5e1", background: "#f8fafc", aspectRatio: creativeFormat === "stories" ? "9 / 16" : creativeFormat === "square" ? "1 / 1" : "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 12, fontWeight: 700, textAlign: "center", padding: 16 }}>
                            Sem imagem gerada ainda
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => regenerateCreativeImageMutation.mutate({ campaignId: id, creativeIndex: i, format: creativeFormat })}
                            disabled={regenerateCreativeImageMutation.isLoading}
                            style={{ fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                            🖼️ {creativeImage ? "Regenerar imagem" : "Gerar imagem"}
                          </button>
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#f8fafc", color: "#475569", borderRadius: 999, padding: "6px 10px" }}>
                            {creativeFormat === "stories" ? "Stories 9:16" : creativeFormat === "square" ? "Square 1:1" : "Feed 4:5"}
                          </span>
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
                            style={{ fontSize: 11, color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}>
                            ✏️ Editar
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
                              {cr.complianceRisk === "Baixo" ? "✅ Risco baixo" : cr.complianceRisk === "Médio" ? "⚠️ Risco médio" : "❌ Risco alto"}
                            </span>
                          )}
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
                      <AdPreviewPanel
                        creative={{ ...cr, format: creativeFormat === "stories" ? "stories" : creativeFormat === "square" ? "image" : "image" }}
                        platform={(campaign as any)?.platform || "meta"}
                        objective={(campaign as any)?.objective}
                        clientName={(clientProfile as any)?.companyName}
                        mediaPreview={creativeFormat === "stories" ? (cr.storyImageUrl || creativeImage) : creativeImage}
                      />
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
              { icon: "💰", label: "Ajustar orçamento",    action: "Revise o budget conforme CPL real pós-lançamento", color: "#d97706" },
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

        {/* Plano de execução */}
        {plan && (
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--black)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📋</span> Plano de execução
            </p>
            {Array.isArray(plan) ? plan.map((step: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, background: "var(--navy)", color: "white", padding: "3px 8px", borderRadius: 6, height: "fit-content", whiteSpace: "nowrap" }}>
                  {step.week || step.day || `Fase ${i + 1}`}
                </span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--black)", marginBottom: 2 }}>{step.title || step.action}</p>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>{step.description || step.detail}</p>
                </div>
              </div>
            )) : <p style={{ fontSize: 13, color: "var(--body)", whiteSpace: "pre-wrap" }}>{JSON.stringify(plan, null, 2)}</p>}
          </div>
        )}

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
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green-dk)", marginBottom: 8 }}>✅ Campanha publicada no Meta Ads!</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
            {publishResult.campaignId && <p style={{ fontSize: 12, color: "var(--muted)" }}>Campaign ID: <strong>{publishResult.campaignId}</strong></p>}
            {publishResult.adSetId    && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ad Set ID: <strong>{publishResult.adSetId}</strong></p>}
            {publishResult.adId       && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ad ID: <strong>{publishResult.adId}</strong></p>}
          </div>
          <a href="https://business.facebook.com/adsmanager" target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: "#1877f2", fontWeight: 700 }}>Ver no Gerenciador de Anúncios →</a>
        </div>
      )}

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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
            {[
              { key: "estimatedCPC",  label: "CPC",   icon: "🖱️", bg: "#eff6ff",        fg: "#1e40af" },
              { key: "estimatedCPL",  label: "CPL",   icon: "🎯", bg: "var(--green-l)", fg: "var(--green-dk)" },
              { key: "estimatedCPM",  label: "CPM",   icon: "👁",  bg: "#f5f3ff",        fg: "#5b21b6" },
              { key: "estimatedCTR",  label: "CTR",   icon: "📈", bg: "#fef2f2",        fg: "#991b1b" },
              { key: "expectedROAS",  label: "ROAS",  icon: "💹", bg: "var(--green-l)", fg: "var(--green-dk)" },
              { key: "breakEvenROAS", label: "Break-even", icon: "⚖️", bg: "#fff7ed",  fg: "#9a3412" },
              { key: "estimatedCPA",  label: "CPA",   icon: "💸", bg: "#fff7ed",        fg: "#9a3412" },
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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
              <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 80px", gap: 10, alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
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
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(74,222,128,.15)", border: "1px solid rgba(74,222,128,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🚀</div>
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
              {complianceResult.score === "safe" ? "✅" : complianceResult.score === "warning" ? "⚠️" : "❌"}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 960, boxShadow: "0 24px 80px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", maxHeight: "95vh", overflow: "hidden" }}>

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
            <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

              {/* COLUNA ESQUERDA — configurações */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", borderRight: "1px solid var(--border)", minWidth: 0 }}>

                {/* Placement Selector */}
                <PlacementSelector
                  platform={(c.platform || "meta").toLowerCase()}
                  objective={c.objective}
                  hasVideo={mediaType === "video"}
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

                {/* Seleção de ad set */}
                {Array.isArray(adSets) && adSets.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Conjunto de anúncios</label>
                    <select className="input" style={{ width: "100%" }} value={adSetIndex} onChange={e => setAdSetIndex(Number(e.target.value))}>
                      {adSets.map((s: any, i: number) => <option key={i} value={i}>{s.name || `Conjunto ${i + 1}`}</option>)}
                    </select>
                  </div>
                )}

                {/* Página do Facebook */}
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Página do Facebook *</label>
                {loadingPages ? (
                  <div style={{ fontSize: 13, color: "var(--muted)", padding: "10px 0", marginBottom: 14 }}>⏳ Buscando suas páginas...</div>
                ) : pages.length > 0 ? (
                  <div style={{ marginBottom: 14 }}>
                    <select className="input" style={{ width: "100%", marginBottom: 4 }} value={pageId} onChange={e => setPageId(e.target.value)}>
                      <option value="">Selecione uma página...</option>
                      {pages.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                    </select>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>Páginas carregadas automaticamente da sua conta.</p>
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
                                O formulário de leads foi configurado na etapa de construção da campanha. URL de destino é opcional.
                              </p>
                            </div>
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
                        <input
                          className="input"
                          placeholder="https://seusite.com.br/pagina-de-vendas"
                          value={linkUrl}
                          onChange={e => setLinkUrl(e.target.value)}
                          style={{
                            width: "100%",
                            borderColor: isRequired && !linkUrl.trim() ? "#ef4444" : undefined,
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* COLUNA DIREITA — mídia + botões */}
              <div style={{ width: 340, flexShrink: 0, overflowY: "auto", padding: "20px 24px", background: "#fafafa", display: "flex", flexDirection: "column" }}>

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
                        onClick={() => setMediaMode(m.key as any)}
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
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                            {mediaFiles.map((file, idx) => (
                              <div key={idx} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1", background: "#f1f5f9" }}>
                                {mediaPreviews[idx] && (
                                  <img src={mediaPreviews[idx]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                                {featuredIndex === idx && (
                                  <div style={{ position: "absolute", top: 4, left: 4, background: "#1877f2", color: "white",
                                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>⭐ Destaque</div>
                                )}
                                {uploadedHashes[idx] && (
                                  <div style={{ position: "absolute", bottom: 4, right: 4, background: "#15803d", color: "white",
                                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>✅</div>
                                )}
                                {uploadingIndex === idx && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
                                    display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11 }}>⏳</div>
                                )}
                                <button onClick={e => {
                                  e.stopPropagation();
                                  const newFiles    = mediaFiles.filter((_: any, i: number) => i !== idx);
                                  const newPreviews = mediaPreviews.filter((_: any, i: number) => i !== idx);
                                  const newHashes   = uploadedHashes.filter((_: any, i: number) => i !== idx);
                                  setMediaFiles(newFiles);
                                  setMediaPreviews(newPreviews);
                                  setUploadedHashes(newHashes);
                                  if (featuredIndex === idx) { setFeaturedIndex(0); setUploadedHash(""); setUploadDone(false); }
                                  else if (featuredIndex > idx) { handleSetFeatured(featuredIndex - 1); }
                                }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.6)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                              </div>
                            ))}
                            {mediaFiles.length < 5 && (
                              <label htmlFor="meta-media-input-multi" style={{
                                borderRadius: 8, border: "2px dashed var(--border)", background: "white",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", aspectRatio: "1", fontSize: 20, color: "var(--muted)",
                              }}>
                                +
                                <input id="meta-media-input-multi" type="file" multiple
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov"
                                  style={{ display: "none" }}
                                  onChange={e => {
                                    const files = Array.from(e.target.files || []) as File[];
                                    const remaining = 5 - mediaFiles.length;
                                    const toAdd = files.slice(0, remaining);
                                    const newFiles    = [...mediaFiles,    ...toAdd];
                                    const newPreviews = [...mediaPreviews, ...toAdd.map(() => "")];
                                    const newHashes   = [...uploadedHashes,...toAdd.map(() => "")];
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
                                {mediaFiles.length >= 2 ? `📸 Carrossel com ${mediaFiles.length} fotos` : "📸 Imagem única"}
                                {" — "}clique na imagem para definir o destaque
                              </p>
                              <button
                                onClick={async () => {
                                  const newHashes = [...uploadedHashes];
                                  for (let i = 0; i < mediaFiles.length; i++) {
                                    if (!newHashes[i]) {
                                      setUploadingIndex(i);
                                      const hash = await handleUploadMedia(mediaFiles[i]);
                                      if (hash) {
                                        newHashes[i] = hash;
                                        setUploadedHashes([...newHashes]);
                                        // Primeira foto é o destaque
                                        if (i === featuredIndex) {
                                          setUploadedHash(hash);
                                          setUploadDone(true);
                                        }
                                      }
                                    }
                                  }
                                  setUploadingIndex(null);
                                  const allDone = newHashes.filter(Boolean).length === mediaFiles.length;
                                  if (allDone) toast.success(`✅ ${mediaFiles.length} foto(s) enviadas para a Meta!`);
                                }}
                                disabled={uploading || mediaFiles.every((_: any, i: number) => !!uploadedHashes[i])}
                                style={{
                                  width: "100%", padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  background: uploadDone ? "#dcfce7" : "#1877f2",
                                  color: uploadDone ? "#166534" : "white", border: "none",
                                }}>
                                {uploading ? "⏳ Enviando..." : uploadDone ? "✅ Enviado para Meta!" : `📤 Enviar ${mediaFiles.length} foto(s) para Meta`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <label htmlFor="meta-media-input-multi" style={{ cursor: "pointer" }}>
                          <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center" }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--body)", margin: "0 0 4px" }}>Clique para adicionar fotos</p>
                            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>JPG, PNG, MP4 · máx 4MB · até 5 fotos</p>
                          </div>
                          <input id="meta-media-input-multi" type="file" multiple
                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/mov"
                            style={{ display: "none" }}
                            onChange={e => {
                              const files = Array.from(e.target.files || []) as File[];
                              const toAdd = files.slice(0, 5);
                              setMediaFiles(toAdd);
                              setMediaPreviews(toAdd.map(() => ""));
                              setUploadedHashes(toAdd.map(() => ""));
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

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Botões */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <button onClick={handlePublish} disabled={publishing}
                    className="btn-publish"
                    style={{ width: "100%", background: publishing ? "#93c5fd" : "#1877f2", color: "white", fontWeight: 800, fontSize: 14, padding: "13px", borderRadius: 12, border: "none", cursor: publishing ? "not-allowed" : "pointer", transition: "all .2s" }}>
                    {publishing ? "⏳ Publicando..." : "📘 Publicar no Meta Ads"}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 960, boxShadow: "0 24px 80px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", maxHeight: "95vh", overflow: "hidden" }}>

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
                  <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
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
              <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

                {/* COLUNA ESQUERDA — configurações */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", borderRight: "1px solid var(--border)", minWidth: 0 }}>

                  {/* Página do Facebook */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                      Página do Facebook *
                    </label>
                    {organicPageId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10 }}>
                        <span style={{ fontSize: 16 }}>✅</span>
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
                <div style={{ width: 340, flexShrink: 0, overflowY: "auto", padding: "20px 24px", background: "#fafafa", display: "flex", flexDirection: "column" }}>

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
                                toast.success("✅ Imagem pronta para o post!");
                              } catch { toast.error("❌ Erro ao processar imagem"); }
                              setOrganicUploading(false);
                            }}
                              style={{ flex: 1, padding: "7px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: organicUploading ? "#93c5fd" : "#1877f2", color: "white", border: "none", cursor: "pointer" }}>
                              {organicUploading ? "⏳ Processando..." : "✅ Usar esta imagem"}
                            </button>
                          ) : (
                            <div style={{ flex: 1, padding: "7px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #86efac", fontSize: 12, fontWeight: 700, color: "#16a34a", textAlign: "center" }}>
                              ✅ Imagem pronta
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
    </Layout>
  );
}

