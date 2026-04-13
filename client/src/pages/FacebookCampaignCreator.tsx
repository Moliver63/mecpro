import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Constantes ──────────────────────────────────────────────────────────────
const FB_OBJECTIVES = [
  { value: "AWARENESS",          label: "Reconhecimento de Marca",  icon: "📢", desc: "Mostre seu negócio para mais pessoas" },
  { value: "TRAFFIC",            label: "Tráfego",                  icon: "🌐", desc: "Direcione pessoas para seu site ou app" },
  { value: "ENGAGEMENT",         label: "Engajamento",              icon: "❤️", desc: "Curtidas, comentários, compartilhamentos" },
  { value: "LEADS",              label: "Geração de Leads",         icon: "🎯", desc: "Formulários de captura nativos do Facebook" },
  { value: "APP_PROMOTION",      label: "Promoção de App",          icon: "📱", desc: "Instações e eventos de aplicativo" },
  { value: "SALES",              label: "Vendas",                   icon: "💰", desc: "Conversões, catálogo, WhatsApp" },
  { value: "VIDEO_VIEWS",        label: "Visualizações de Vídeo",   icon: "▶️", desc: "Maximize o alcance do seu conteúdo em vídeo" },
];

const AD_FORMATS = [
  { value: "IMAGE",    label: "Imagem Única",  icon: "🖼️",  desc: "Uma imagem com texto e CTA", specs: "1200×628px, max 30MB, JPG/PNG" },
  { value: "VIDEO",    label: "Vídeo",         icon: "🎬",  desc: "Vídeo com até 241 minutos",   specs: "1080×1080px recomendado, max 4GB, MP4/MOV" },
  { value: "CAROUSEL", label: "Carrossel",     icon: "🎠",  desc: "2‑10 cards com imagens/vídeo",specs: "1080×1080px por card, até 10 cards" },
  { value: "STORIES",  label: "Stories/Reels", icon: "📸",  desc: "Formato vertical imersivo",    specs: "1080×1920px, max 4GB para vídeo" },
  { value: "COLLECTION",label: "Coleção",      icon: "🛍️", desc: "Imagem/vídeo principal + catálogo", specs: "1200×628px principal + catálogo de produtos" },
];

const CTA_OPTIONS = [
  "LEARN_MORE","SHOP_NOW","SIGN_UP","CONTACT_US","GET_OFFER",
  "DOWNLOAD","BOOK_NOW","SUBSCRIBE","WATCH_MORE","SEND_MESSAGE","WHATSAPP_MESSAGE",
];
const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Saiba Mais", SHOP_NOW: "Comprar Agora", SIGN_UP: "Cadastre-se",
  CONTACT_US: "Entre em Contato", GET_OFFER: "Obter Oferta", DOWNLOAD: "Baixar",
  BOOK_NOW: "Reservar Agora", SUBSCRIBE: "Inscrever-se", WATCH_MORE: "Ver Mais",
  SEND_MESSAGE: "Enviar Mensagem", WHATSAPP_MESSAGE: "Fale no WhatsApp",
};

const PLACEMENTS = [
  { key: "fb_feed",      label: "Feed Facebook",     icon: "📘", ratio: "1.91:1" },
  { key: "ig_feed",      label: "Feed Instagram",    icon: "📸", ratio: "1:1" },
  { key: "fb_stories",   label: "Stories Facebook",  icon: "📖", ratio: "9:16" },
  { key: "ig_stories",   label: "Stories Instagram", icon: "🎞️", ratio: "9:16" },
  { key: "ig_reels",     label: "Reels",             icon: "🎬", ratio: "9:16" },
  { key: "fb_right",     label: "Coluna Direita FB", icon: "🔲", ratio: "1.91:1" },
  { key: "audience_net", label: "Audience Network",  icon: "🌐", ratio: "1.91:1" },
];

const GENDERS = [{ value: "ALL", label: "Todos" }, { value: "MALE", label: "Masculino" }, { value: "FEMALE", label: "Feminino" }];

const STEPS = [
  { id: 1, label: "Conta & Páginas",      icon: "🔑" },
  { id: 2, label: "Campanha",             icon: "📢" },
  { id: 3, label: "Conjunto de Anúncios", icon: "🎯" },
  { id: 4, label: "Criativo",             icon: "🎨" },
  { id: 5, label: "Preview",              icon: "👁️" },
  { id: 6, label: "Publicar",             icon: "🚀" },
];

// ─── UTM Builder ─────────────────────────────────────────────────────────────
function buildUtmUrl(url: string, campaign: string, medium = "paid_social", source = "facebook") {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", medium);
    u.searchParams.set("utm_campaign", campaign.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "mecpro_campaign");
    return u.toString();
  } catch { return url; }
}

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

function extractWhatsAppDetails(raw?: string | null): { phone?: string; link?: string } {
  const normalized = normalizeDestinationUrl(raw);
  const fallbackDigits = String(raw || "").replace(/\D/g, "");
  const buildLink = (phone?: string, text?: string | null) => {
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (text) params.set("text", text);
    const query = params.toString();
    return `https://api.whatsapp.com/send${query ? `?${query}` : ""}`;
  };

  if (normalized) {
    try {
      const url = new URL(normalized);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      const isWhatsAppHost = host === "wa.me" || host.endsWith("whatsapp.com");
      if (isWhatsAppHost) {
        const phone = url.searchParams.get("phone")?.replace(/\D/g, "")
          || url.pathname.replace(/\//g, "").replace(/\D/g, "")
          || fallbackDigits
          || undefined;
        const text = url.searchParams.get("text");
        return { phone, link: buildLink(phone, text) };
      }
    } catch {}
  }

  if (fallbackDigits.length >= 8) {
    return { phone: fallbackDigits, link: buildLink(fallbackDigits) };
  }

  return {};
}

function resolveAutoDestination(profile: any, options?: { preferWhatsApp?: boolean }): string {
  const website = normalizeDestinationUrl(profile?.websiteUrl);

  let social: any = {};
  try { social = JSON.parse(profile?.socialLinks || "{}"); } catch {}

  const whatsappRaw = social?.whatsappUrl || social?.whatsapp;
  const whatsapp = whatsappRaw
    ? (/^https?:\/\//i.test(String(whatsappRaw))
      ? normalizeDestinationUrl(String(whatsappRaw))
      : normalizeDestinationUrl(`https://wa.me/${String(whatsappRaw).replace(/\D/g, "")}`))
    : "";

  if (options?.preferWhatsApp && whatsapp) return whatsapp;
  if (website) return website;
  if (whatsapp) return whatsapp;

  const instagramRaw = social?.instagramUrl || social?.instagram;
  if (instagramRaw) {
    const instagram = /^https?:\/\//i.test(String(instagramRaw))
      ? normalizeDestinationUrl(String(instagramRaw))
      : normalizeDestinationUrl(`https://instagram.com/${String(instagramRaw).replace(/^@/, "")}`);
    if (instagram) return instagram;
  }

  return "";
}

function getDestinationHostname(url?: string | null): string {
  const normalized = normalizeDestinationUrl(url);
  if (!normalized) return "perfil-do-cliente";
  try {
    return new URL(normalized).hostname;
  } catch {
    return "perfil-do-cliente";
  }
}

// ─── Media validation ────────────────────────────────────────────────────────
function validateMedia(file: File, format: string): string | null {
  const MB = 1024 * 1024;
  if (format === "IMAGE") {
    if (!["image/jpeg","image/png","image/gif"].includes(file.type))
      return "Formato inválido. Use JPG ou PNG.";
    if (file.size > 30 * MB) return "Imagem muito grande (max 30MB).";
  } else if (format === "VIDEO") {
    if (!file.type.startsWith("video/")) return "Arquivo deve ser um vídeo.";
    if (file.size > 4096 * MB) return "Vídeo muito grande (max 4GB).";
  } else if (format === "CAROUSEL") {
    if (!["image/jpeg","image/png"].includes(file.type)) return "Carrossel: use JPG ou PNG.";
    if (file.size > 30 * MB) return "Imagem muito grande (max 30MB).";
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function FacebookCampaignCreator() {
  const { id: projectId } = useParams<{ id: string }>();
  const projectIdNumber = Number(projectId || 0);
  const [, setLocation] = useLocation();

  // Meta integration
  const { data: integrations = [] } = trpc.integrations.list.useQuery() as any;
  const { data: clientProfile } = (trpc as any).clientProfile?.get?.useQuery?.({ projectId: projectIdNumber }, { enabled: !!projectIdNumber }) ?? { data: null };
  const metaInteg = (integrations as any[]).find((i: any) => i.provider === "meta");

  const [step, setStep] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);

  // Step 1 - Account
  const [account, setAccount] = useState({
    adAccountId: metaInteg?.adAccountId ?? "",
    fbPageId: "",
    igAccountId: "",
    pixelId: "",
    accessToken: metaInteg?.accessToken ?? "",
    destination: "website" as "website" | "lead_form",
    leadGenFormId: "",
    linkUrl: "",
  });

  // Estado de upload de imagem
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageHash, setImageHash]           = useState<string | null>(null);
  const [imageHashUrl, setImageHashUrl]     = useState<string | null>(null);

  // Step 2 - Campaign
  const [campaign, setCampaign] = useState({
    name: "",
    objective: "LEADS",
    budget: 50,
    budgetType: "DAILY" as "DAILY" | "LIFETIME",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    status: "PAUSED" as "PAUSED" | "ACTIVE",
  });

  // Step 3 - Ad Set
  const [adSet, setAdSet] = useState({
    name: "",
    ageMin: 18,
    ageMax: 65,
    gender: "ALL",
    geoLocations: ["BR"],
    interests: [] as string[],
    placements: ["fb_feed", "ig_feed"] as string[],
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
  });
  const [interestInput, setInterestInput] = useState("");

  // Step 4 - Creative
  const [creative, setCreative] = useState({
    format: "IMAGE" as string,
    primaryText: "",
    headline: "",
    description: "",
    destUrl: "",
    callToAction: "LEARN_MORE",
    mediaFiles: [] as File[],
    mediaPreviewUrls: [] as string[],
    carouselCards: [{ title: "", description: "", url: "", imageFile: null as File | null, imagePreview: "" }],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Computed
  const preferWhatsAppAuto = campaign.objective === "ENGAGEMENT"
    || campaign.objective === "LEADS"
    || creative.callToAction === "WHATSAPP_MESSAGE";
  const autoDestinationUrl = resolveAutoDestination(clientProfile, { preferWhatsApp: preferWhatsAppAuto });
  const rawDestinationUrl = normalizeDestinationUrl(account.linkUrl) || normalizeDestinationUrl(creative.destUrl) || autoDestinationUrl;
  const whatsappDestination = extractWhatsAppDetails(rawDestinationUrl);
  const effectiveDestinationUrl = whatsappDestination.link || rawDestinationUrl;
  const effectiveCallToAction = account.destination === "lead_form"
    ? creative.callToAction
    : (whatsappDestination.link ? "WHATSAPP_MESSAGE" : creative.callToAction);
  const utmUrl = whatsappDestination.link ? "" : buildUtmUrl(effectiveDestinationUrl, campaign.name);
  const isStep1Valid = account.adAccountId && account.fbPageId && account.accessToken;
  const isStep2Valid = campaign.name && campaign.budget > 0;
  const isStep3Valid = adSet.name && adSet.ageMin < adSet.ageMax;
  const isStep4Valid = !!(creative.primaryText && creative.headline && (account.destination === "lead_form" || effectiveDestinationUrl));

  // ── File upload handler ──
  function handleFileUpload(files: FileList | null) {
    if (!files) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    Array.from(files).forEach(file => {
      const err = validateMedia(file, creative.format);
      if (err) { toast.error(err); return; }
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    });
    setCreative(c => ({
      ...c,
      mediaFiles: [...c.mediaFiles, ...newFiles],
      mediaPreviewUrls: [...c.mediaPreviewUrls, ...newPreviews],
    }));
  }

  // ── Upload de imagem para Meta (retorna image_hash) ──
  const uploadImageMutation = trpc.integrations.uploadImageToMeta.useMutation();

  async function uploadImageToFacebook(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl  = e.target?.result as string;
          // Remove prefixo "data:image/...;base64,"
          const base64   = dataUrl.split(",")[1];
          const fileName = file.name || "ad_image.jpg";
          setUploadingImage(true);
          const result = await uploadImageMutation.mutateAsync({ imageBase64: base64, fileName });
          setImageHash(result.hash);
          setImageHashUrl(result.url);
          toast.success(`✅ Imagem enviada! Hash: ${result.hash.slice(0, 12)}...`);
          resolve(result.hash);
        } catch (err: any) {
          toast.error(`❌ Erro no upload da imagem: ${err.message}`);
          reject(err);
        } finally {
          setUploadingImage(false);
        }
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  // ── Publish ──
  async function handlePublish() {
    if (!account.accessToken || !account.adAccountId) {
      toast.error("Configure a conta Meta em Integrações primeiro.");
      return;
    }
    if (account.destination !== "lead_form" && !effectiveDestinationUrl) {
      toast.error("Cadastre o site, WhatsApp ou Instagram no Perfil do Cliente para definir automaticamente o destino do anúncio.");
      return;
    }
    setPublishing(true);
    try {
      const BASE  = "https://graph.facebook.com/v19.0";
      const TOKEN = account.accessToken;
      const ACT   = account.adAccountId.startsWith("act_") ? account.adAccountId : `act_${account.adAccountId}`;

      // ── Etapa 1: Upload da imagem → obtém image_hash ──────────────────────
      let finalImageHash: string | undefined = imageHash ?? undefined;
      if (!finalImageHash && creative.mediaFiles.length > 0) {
        toast.info("📤 Fazendo upload da imagem...");
        finalImageHash = await uploadImageToFacebook(creative.mediaFiles[0]);
      }

      // ── Etapa 2: Criar Campanha ────────────────────────────────────────────
      const OUTCOME_MAP: Record<string, string> = {
        AWARENESS: "OUTCOME_AWARENESS", TRAFFIC: "OUTCOME_TRAFFIC",
        ENGAGEMENT: "OUTCOME_ENGAGEMENT", LEADS: "OUTCOME_LEADS",
        APP_PROMOTION: "OUTCOME_APP_PROMOTION", SALES: "OUTCOME_SALES",
        VIDEO_VIEWS: "OUTCOME_VIDEO_VIEWS",
      };
      const campRes = await fetch(`${BASE}/${ACT}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:                  campaign.name,
          objective:             OUTCOME_MAP[campaign.objective] ?? "OUTCOME_TRAFFIC",
          status:                campaign.status,
          special_ad_categories: [],
          access_token:          TOKEN,
        }),
      });
      const campData = await campRes.json();
      if (campData.error) throw new Error(`Campanha: ${campData.error.message}`);
      const campaignId = campData.id;

      // ── Etapa 3: Criar Conjunto de Anúncios (com interesses no flexible_spec) ──
      const adSetPayload: any = {
        name:              adSet.name,
        campaign_id:       campaignId,
        billing_event:     adSet.billingEvent,
        optimization_goal: whatsappDestination.link && campaign.objective === "ENGAGEMENT" ? "CONVERSATIONS" : adSet.optimizationGoal,
        bid_strategy:      "LOWEST_COST_WITHOUT_CAP",
        ...(whatsappDestination.link ? { destination_type: "WHATSAPP" } : {}),
        targeting: {
          age_min:       adSet.ageMin,
          age_max:       adSet.ageMax,
          geo_locations: { country_codes: adSet.geoLocations },
          ...(adSet.gender !== "ALL" && { genders: [adSet.gender === "MALE" ? 1 : 2] }),
          ...(adSet.interests.length > 0 && {
            flexible_spec: [{ interests: adSet.interests.map((i: string) => ({ name: i })) }],
          }),
        },
        status:       campaign.status,
        access_token: TOKEN,
      };
      if (campaign.budgetType === "DAILY") {
        adSetPayload.daily_budget = Math.round(campaign.budget * 100);
      } else {
        adSetPayload.lifetime_budget = Math.round(campaign.budget * 100);
        if (campaign.endDate) adSetPayload.end_time = new Date(campaign.endDate).toISOString();
      }
      if (account.fbPageId && ["LEADS", "SALES", "ENGAGEMENT"].includes(campaign.objective)) {
        adSetPayload.promoted_object = whatsappDestination.link
          ? {
              page_id: account.fbPageId,
              ...(whatsappDestination.phone ? { whatsapp_phone_number: whatsappDestination.phone } : {}),
            }
          : (account.pixelId && campaign.objective === "SALES"
            ? { page_id: account.fbPageId, pixel_id: account.pixelId, custom_event_type: "PURCHASE" }
            : { page_id: account.fbPageId });
      }
      const adSetRes = await fetch(`${BASE}/${ACT}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adSetPayload),
      });
      const adSetData = await adSetRes.json();
      if (adSetData.error) throw new Error(`Conjunto: ${adSetData.error.message}`);
      const adSetId = adSetData.id;

      // ── Etapa 4: Montar object_story_spec com image_hash ou lead_gen_data ──
      let storySpec: any;
      if (account.destination === "lead_form" && account.leadGenFormId) {
        storySpec = {
          page_id: account.fbPageId,
          lead_gen_data: {
            lead_gen_form_id: account.leadGenFormId,
            call_to_action:   { type: effectiveCallToAction },
            message:          creative.primaryText,
            name:             creative.headline,
            ...(finalImageHash
              ? { image_hash: finalImageHash }
              : creative.mediaPreviewUrls[0]
                ? { picture: creative.mediaPreviewUrls[0] }
                : {}),
          },
        };
      } else {
        storySpec = {
          page_id: account.fbPageId,
          link_data: {
            message:        creative.primaryText,
            name:           creative.headline,
            description:    creative.description,
            link:           utmUrl || effectiveDestinationUrl,
            call_to_action: whatsappDestination.link
              ? { type: effectiveCallToAction, value: { app_destination: "WHATSAPP" } }
              : { type: effectiveCallToAction, value: { link: utmUrl || effectiveDestinationUrl } },
            // Prioriza image_hash sobre URL direta
            ...(finalImageHash
              ? { image_hash: finalImageHash }
              : creative.mediaPreviewUrls[0]
                ? { picture: creative.mediaPreviewUrls[0] }
                : {}),
          },
        };
      }

      // ── Etapa 5: Criar Criativo (com pixel_id opcional) ───────────────────
      const creativePayload: any = {
        name:              `${campaign.name} — Criativo`,
        object_story_spec: storySpec,
        access_token:      TOKEN,
      };
      if (account.pixelId) {
        creativePayload.tracking_specs = [{
          "action.type": ["offsite_conversion"],
          "fb_pixel":    [account.pixelId],
        }];
      }
      const creativeRes = await fetch(`${BASE}/${ACT}/adcreatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creativePayload),
      });
      const creativeData = await creativeRes.json();
      if (creativeData.error) throw new Error(`Criativo: ${creativeData.error.message}`);
      const creativeId = creativeData.id;

      // ── Etapa 6: Criar Anúncio Final ──────────────────────────────────────
      const adRes = await fetch(`${BASE}/${ACT}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:         `${campaign.name} — Anúncio 1`,
          adset_id:     adSetId,
          creative:     { creative_id: creativeId },
          status:       campaign.status,
          access_token: TOKEN,
        }),
      });
      const adData = await adRes.json();
      if (adData.error) throw new Error(`Anúncio: ${adData.error.message}`);

      setPublishResult({ campaignId, adSetId, creativeId, adId: adData.id, imageHash: finalImageHash });
      toast.success("🎉 Campanha publicada com sucesso no Facebook Ads!");
      setStep(6);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao publicar campanha");
    } finally {
      setPublishing(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────
  function StepIndicator() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28, overflowX: "auto", paddingBottom: 4 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
            <div
              onClick={() => { if (s.id < step) setStep(s.id); }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: s.id < step ? "pointer" : "default",
                opacity: s.id > step ? 0.4 : 1,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: step === s.id ? "#1877f2" : step > s.id ? "#16a34a" : "#e2e8f0",
                color: step >= s.id ? "#fff" : "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 16, transition: "all 0.2s",
              }}>
                {step > s.id ? "✓" : s.icon}
              </div>
              <span style={{ fontSize: 11, fontWeight: step === s.id ? 700 : 500, color: step === s.id ? "#1877f2" : "#6b7280", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ height: 2, width: 32, background: step > s.id ? "#16a34a" : "#e2e8f0", margin: "0 4px", marginBottom: 20, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // ─── STEP 1: Conta & Páginas ───────────────────────────────────────────────
  function renderStep1() {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🔑 Conta & Páginas</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Configure a conta de anúncio, página do Facebook e pixel</p>

        {!metaInteg && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
            ⚠️ Integração Meta não configurada.{" "}
            <button className="btn btn-xs btn-warning" onClick={() => setLocation("/settings/meta")}>Configurar agora</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Conta de Anúncio <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input input-sm w-full"
              placeholder="act_123456789"
              value={account.adAccountId}
              onChange={e => setAccount(a => ({ ...a, adAccountId: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Ex: act_123456789 (do Gerenciador de Anúncios)</div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              ID da Página do Facebook <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input input-sm w-full"
              placeholder="123456789"
              value={account.fbPageId}
              onChange={e => setAccount(a => ({ ...a, fbPageId: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>ID da Conta do Instagram</label>
            <input
              className="input input-sm w-full"
              placeholder="987654321 (opcional)"
              value={account.igAccountId}
              onChange={e => setAccount(a => ({ ...a, igAccountId: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>ID do Pixel do Facebook</label>
            <input
              className="input input-sm w-full"
              placeholder="111222333444 (opcional)"
              value={account.pixelId}
              onChange={e => setAccount(a => ({ ...a, pixelId: e.target.value }))}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Token de Acesso <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input input-sm w-full"
              type="password"
              placeholder="EAA... (token do Gerenciador de Negócios)"
              value={account.accessToken}
              onChange={e => setAccount(a => ({ ...a, accessToken: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Token gerenciado com segurança pelo MECPro. Acesse Integrações para atualizar.</div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Campanha ──────────────────────────────────────────────────────
  function renderStep2() {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📢 Nível 1 — Campanha</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Configure objetivo, orçamento e período da campanha</p>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Nome da Campanha *</label>
          <input className="input w-full" placeholder="Ex: Black Friday 2026 - Leads" value={campaign.name}
            onChange={e => setCampaign(c => ({ ...c, name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 10 }}>Objetivo *</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {FB_OBJECTIVES.map(obj => (
              <button
                key={obj.value}
                onClick={() => setCampaign(c => ({ ...c, objective: obj.value }))}
                style={{
                  padding: "12px 14px", borderRadius: 10, border: "2px solid",
                  borderColor: campaign.objective === obj.value ? "#1877f2" : "#e2e8f0",
                  background: campaign.objective === obj.value ? "#eff6ff" : "#fff",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{obj.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{obj.label}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{obj.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Tipo de Orçamento</label>
            <select className="select select-sm w-full" value={campaign.budgetType}
              onChange={e => setCampaign(c => ({ ...c, budgetType: e.target.value as any }))}>
              <option value="DAILY">Diário</option>
              <option value="LIFETIME">Total da campanha</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Orçamento (R$) *  {campaign.budgetType === "DAILY" ? "/dia" : "total"}
            </label>
            <input type="number" min={1} className="input input-sm w-full" value={campaign.budget}
              onChange={e => setCampaign(c => ({ ...c, budget: Number(e.target.value) }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Data de Início</label>
            <input type="date" className="input input-sm w-full" value={campaign.startDate}
              onChange={e => setCampaign(c => ({ ...c, startDate: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Data de Término</label>
            <input type="date" className="input input-sm w-full" value={campaign.endDate}
              onChange={e => setCampaign(c => ({ ...c, endDate: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {["PAUSED", "ACTIVE"].map(s => (
            <button key={s} onClick={() => setCampaign(c => ({ ...c, status: s as any }))}
              className={`btn btn-sm ${campaign.status === s ? "btn-primary" : "btn-outline"}`}>
              {s === "PAUSED" ? "⏸️ Iniciar pausada" : "▶️ Ativar imediatamente"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── STEP 3: Ad Set ────────────────────────────────────────────────────────
  function renderStep3() {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🎯 Nível 2 — Conjunto de Anúncios</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Defina o público-alvo e posicionamentos</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Nome do Conjunto *</label>
          <input className="input w-full" placeholder="Ex: Mulheres 25-45 SP - Interesses Marketing"
            value={adSet.name} onChange={e => setAdSet(a => ({ ...a, name: e.target.value }))} />
        </div>

        {/* Público */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1e293b" }}>👥 Público</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Gênero</label>
              <select className="select select-sm w-full" value={adSet.gender}
                onChange={e => setAdSet(a => ({ ...a, gender: e.target.value }))}>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Idade mínima</label>
              <input type="number" min={18} max={65} className="input input-sm w-full" value={adSet.ageMin}
                onChange={e => setAdSet(a => ({ ...a, ageMin: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Idade máxima</label>
              <input type="number" min={18} max={65} className="input input-sm w-full" value={adSet.ageMax}
                onChange={e => setAdSet(a => ({ ...a, ageMax: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Localização</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {adSet.geoLocations.map(loc => (
                <span key={loc} style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                  {loc}
                  <button onClick={() => setAdSet(a => ({ ...a, geoLocations: a.geoLocations.filter(l => l !== loc) }))}
                    style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}>×</button>
                </span>
              ))}
              <input
                className="input input-xs"
                placeholder="Adicionar país (ex: US)"
                style={{ width: 160 }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                    if (val && !adSet.geoLocations.includes(val)) {
                      setAdSet(a => ({ ...a, geoLocations: [...a.geoLocations, val] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Interesses</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="input input-sm flex-1" placeholder="Ex: Marketing Digital, Empreendedorismo..."
                value={interestInput} onChange={e => setInterestInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && interestInput.trim()) {
                    setAdSet(a => ({ ...a, interests: [...a.interests, interestInput.trim()] }));
                    setInterestInput("");
                  }
                }} />
              <button className="btn btn-sm btn-outline" onClick={() => {
                if (interestInput.trim()) {
                  setAdSet(a => ({ ...a, interests: [...a.interests, interestInput.trim()] }));
                  setInterestInput("");
                }
              }}>+ Adicionar</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {adSet.interests.map(interest => (
                <span key={interest} style={{ background: "#f3e8ff", color: "#7c3aed", borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>
                  {interest}
                  <button onClick={() => setAdSet(a => ({ ...a, interests: a.interests.filter(i => i !== interest) }))}
                    style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Posicionamentos */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e293b" }}>📍 Posicionamentos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {PLACEMENTS.map(pl => (
              <button
                key={pl.key}
                onClick={() => setAdSet(a => ({
                  ...a,
                  placements: a.placements.includes(pl.key)
                    ? a.placements.filter(p => p !== pl.key)
                    : [...a.placements, pl.key],
                }))}
                style={{
                  padding: "10px 12px", borderRadius: 8, border: "2px solid",
                  borderColor: adSet.placements.includes(pl.key) ? "#1877f2" : "#e2e8f0",
                  background: adSet.placements.includes(pl.key) ? "#eff6ff" : "#fff",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16 }}>{pl.icon}</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", marginTop: 4 }}>{pl.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{pl.ratio}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 4: Criativo ──────────────────────────────────────────────────────
  function renderStep4() {
    const selectedFormat = AD_FORMATS.find(f => f.value === creative.format);
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🎨 Nível 3 — Criativo do Anúncio</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Escolha o formato e preencha o conteúdo do anúncio</p>

        {/* Format selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 10 }}>Formato do Criativo *</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
            {AD_FORMATS.map(fmt => (
              <button key={fmt.value} onClick={() => setCreative(c => ({ ...c, format: fmt.value, mediaFiles: [], mediaPreviewUrls: [] }))}
                style={{
                  padding: "12px 14px", borderRadius: 10, border: "2px solid",
                  borderColor: creative.format === fmt.value ? "#1877f2" : "#e2e8f0",
                  background: creative.format === fmt.value ? "#eff6ff" : "#fff",
                  cursor: "pointer", textAlign: "left",
                }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{fmt.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{fmt.label}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{fmt.desc}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4, fontFamily: "monospace" }}>{fmt.specs}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Copy fields */}
        <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Texto Principal (Copy) * <span style={{ color: "#6b7280", fontWeight: 400 }}>max 125 char</span></label>
              <span style={{ fontSize: 12, color: creative.primaryText.length > 125 ? "#dc2626" : "#94a3b8" }}>{creative.primaryText.length}/125</span>
            </div>
            <textarea className="textarea w-full" rows={3} maxLength={125}
              placeholder="Texto que aparece acima do anúncio..."
              value={creative.primaryText} onChange={e => setCreative(c => ({ ...c, primaryText: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Título * <span style={{ color: "#94a3b8", fontWeight: 400 }}>max 40 char</span></label>
              <input className="input w-full" maxLength={40} placeholder="Título em negrito abaixo da imagem"
                value={creative.headline} onChange={e => setCreative(c => ({ ...c, headline: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Descrição <span style={{ color: "#94a3b8", fontWeight: 400 }}>max 30 char</span></label>
              <input className="input w-full" maxLength={30} placeholder="Texto secundário (opcional)"
                value={creative.description} onChange={e => setCreative(c => ({ ...c, description: e.target.value }))} />
            </div>
          </div>
          <div style={{ background: effectiveDestinationUrl ? "#f8fafc" : "#fff7ed", border: `1px solid ${effectiveDestinationUrl ? "#e2e8f0" : "#fdba74"}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
              Destino do anúncio definido automaticamente
            </div>
            {effectiveDestinationUrl ? (
              <>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6, wordBreak: "break-all" }}>
                  {effectiveDestinationUrl}
                </div>
                <div style={{ fontSize: 12, color: "#16a34a", background: "#f0fdf4", padding: "6px 10px", borderRadius: 6, wordBreak: "break-all" }}>
                  🔗 UTM automático: <span style={{ fontFamily: "monospace" }}>{utmUrl}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#9a3412" }}>
                Cadastre o site, WhatsApp ou Instagram no Perfil do Cliente para que o anúncio use um destino automático.
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Call-to-Action</label>
            <select className="select select-sm" style={{ width: 220 }} value={creative.callToAction}
              onChange={e => setCreative(c => ({ ...c, callToAction: e.target.value }))}>
              {CTA_OPTIONS.map(cta => <option key={cta} value={cta}>{CTA_LABELS[cta] ?? cta}</option>)}
            </select>
          </div>
        </div>

        {/* Media Upload */}
        <div style={{ border: "2px dashed #e2e8f0", borderRadius: 12, padding: "20px", textAlign: "center", cursor: "pointer" }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}>
          <input ref={fileInputRef} type="file" hidden
            accept={creative.format === "VIDEO" ? "video/*" : "image/*"}
            multiple={creative.format === "CAROUSEL"}
            onChange={e => handleFileUpload(e.target.files)} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>{selectedFormat?.icon ?? "📤"}</div>
          <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
            Arraste ou clique para fazer upload
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{selectedFormat?.specs}</div>
        </div>

        {creative.mediaPreviewUrls.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {creative.mediaPreviewUrls.map((url, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                {creative.format === "VIDEO" ? (
                  <video src={url} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8 }} controls />
                ) : (
                  <img src={url} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8 }} />
                )}
                <button
                  onClick={() => setCreative(c => ({
                    ...c,
                    mediaFiles: c.mediaFiles.filter((_, i) => i !== idx),
                    mediaPreviewUrls: c.mediaPreviewUrls.filter((_, i) => i !== idx),
                  }))}
                  style={{ position: "absolute", top: 4, right: 4, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── STEP 5: Preview ───────────────────────────────────────────────────────
  function renderStep5() {
    const selectedPlacements = PLACEMENTS.filter(pl => adSet.placements.includes(pl.key));
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>👁️ Preview por Posicionamento</h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Visualize como o anúncio aparecerá em cada posicionamento</p>

        {/* Resumo */}
        <div style={{ background: "#1a2744", color: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📊 Resumo da Campanha</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {[
              { label: "Campanha", value: campaign.name },
              { label: "Objetivo", value: FB_OBJECTIVES.find(o => o.value === campaign.objective)?.label ?? campaign.objective },
              { label: "Orçamento", value: `R$ ${campaign.budget}/${campaign.budgetType === "DAILY" ? "dia" : "total"}` },
              { label: "Público", value: `${adSet.ageMin}‑${adSet.ageMax} anos, ${adSet.gender === "ALL" ? "Todos" : adSet.gender}` },
              { label: "Formato", value: AD_FORMATS.find(f => f.value === creative.format)?.label ?? creative.format },
              { label: "CTA", value: CTA_LABELS[effectiveCallToAction] ?? effectiveCallToAction },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.value || "—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {selectedPlacements.map(pl => {
            const isVertical = pl.ratio === "9:16";
            return (
              <div key={pl.key} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "#f8fafc", padding: "10px 14px", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                  {pl.icon} {pl.label} ({pl.ratio})
                </div>
                <div style={{ padding: "12px 14px" }}>
                  {/* Simulated ad preview */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>F</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>Sua Página</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Patrocinado</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 10, lineHeight: 1.4 }}>
                    {creative.primaryText || "Texto do anúncio aparecerá aqui..."}
                  </div>
                  <div style={{
                    background: "#e2e8f0",
                    borderRadius: 8,
                    height: isVertical ? 200 : 130,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28, marginBottom: 10, overflow: "hidden",
                  }}>
                    {creative.mediaPreviewUrls[0] ? (
                      creative.format === "VIDEO" ? (
                        <video src={creative.mediaPreviewUrls[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <img src={creative.mediaPreviewUrls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )
                    ) : AD_FORMATS.find(f => f.value === creative.format)?.icon ?? "🖼️"}
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{getDestinationHostname(effectiveDestinationUrl)}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{creative.headline || "Título do anúncio"}</div>
                    {creative.description && <div style={{ fontSize: 11, color: "#6b7280" }}>{creative.description}</div>}
                  </div>
                  <button className="btn btn-sm btn-primary" style={{ marginTop: 10, width: "100%", background: "#1877f2", border: "none" }}>
                    {CTA_LABELS[effectiveCallToAction] ?? effectiveCallToAction}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── STEP 6: Resultado ─────────────────────────────────────────────────────
  function renderStep6() {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🚀</div>
        {publishResult ? (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#16a34a", marginBottom: 8 }}>Campanha publicada com sucesso!</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>A campanha foi criada no Facebook Ads Manager.</p>
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "16px 20px", maxWidth: 400, margin: "0 auto 20px", textAlign: "left" }}>
              {[
                { label: "ID da Campanha",        value: publishResult.campaignId },
                { label: "ID do Conjunto",        value: publishResult.adSetId },
                { label: "ID do Anúncio",         value: publishResult.adId },
                { label: "ID do Criativo",        value: publishResult.creativeId },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "#374151", fontWeight: 600 }}>{item.label}:</span>
                  <span style={{ fontFamily: "monospace", color: "#16a34a" }}>{item.value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${account.adAccountId}`}
                target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                📘 Ver no Ads Manager
              </a>
              <button className="btn btn-outline" onClick={() => { setStep(1); setPublishResult(null); }}>+ Nova Campanha</button>
              <button className="btn btn-ghost" onClick={() => setLocation(projectId ? `/projects/${projectId}` : "/meta-campaigns")}>
                Voltar ao Projeto
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Pronto para publicar!</h2>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>Revise as informações e clique em Publicar para criar a campanha no Facebook Ads.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-outline" onClick={() => setStep(5)}>← Revisar Preview</button>
              <button className="btn btn-primary" style={{ background: "#1877f2", border: "none", fontSize: 16, padding: "10px 28px" }}
                disabled={publishing} onClick={handlePublish}>
                {publishing ? "⏳ Publicando..." : "🚀 Publicar no Facebook Ads"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6][step - 1];
  const canProceed = [isStep1Valid, isStep2Valid, isStep3Valid, isStep4Valid, true, true][step - 1];

  return (
    <Layout>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation(projectId ? `/projects/${projectId}/campaign` : "/meta-campaigns")} style={{ paddingLeft: 0, marginBottom: 8 }}>
          ← {projectId ? "Módulo 4" : "Campanhas Meta"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📘</div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>
              Nova Campanha Facebook Ads
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Criador completo — Campanha → Conjunto → Anúncio (API v18)</p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator />

      {/* Step content */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "24px 28px", minHeight: 400, marginBottom: 20 }}>
        {stepContent?.()}
      </div>

      {/* Navigation */}
      {step < 6 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="btn btn-outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
            ← Anterior
          </button>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Passo {step} de {STEPS.length}</div>
          {step < 5 ? (
            <button
              className="btn btn-primary"
              disabled={!canProceed}
              onClick={() => setStep(s => s + 1)}
              title={!canProceed ? "Preencha os campos obrigatórios" : ""}
            >
              Próximo →
            </button>
          ) : (
            <button className="btn btn-primary" style={{ background: "#1877f2", border: "none" }}
              disabled={publishing} onClick={() => setStep(6)}>
              🚀 Ir para publicação
            </button>
          )}
        </div>
      )}
    </Layout>
  );
}
