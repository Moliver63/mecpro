import { initTRPC, TRPCError } from "@trpc/server";
import { log } from "../logger";
import superjson from "superjson";
import type { Context } from "./context";
import { z } from "zod";
import * as db from "../db";
import { getDb, getPool } from "../db";
import { and, eq, max, min, or } from "drizzle-orm";
import { apiIntegrations as integrations, userAlertConfigs } from "../schema";
import { SignJWT } from "jose";
import { ENV } from "./env";
import { executarConsulta, consultarProcessoPorCNJ } from "../consultaService";
import { adminIntelligenceRouter } from "./adminIntelligenceRouter";
import { vslRouter } from "./vslRouter";
import { scoreCreative } from "../creativeScoringEngine";
import { generateAdImage, getImageGenerationDiagnostics, type CreativeImageFormat, type ImageProvider } from "../imageGeneration";
import {
  updateCreativeInputSchema,
  updateCreativeImageInputSchema,
  regenerateCreativeImageInputSchema,
  uploadImageToMetaInputSchema,
  uploadVideoToMetaInputSchema,
  publishToMetaInputSchema,
  mergeCreativeWithProjectedLegacy,
  buildPublishMediaFromCreative,
  type CampaignCreative,
  type CreativeFormat,
} from "../../shared/campaignCreative.schema";
import {
  syncCreativeTextToV2,
  syncCreativeImageToV2,
  syncCreativePublishMediaToV2,
} from "../../shared/campaignCreative.sync";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
// -- Helpers de data ---------------------------------------------------------
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function today(): string { return new Date().toISOString().split("T")[0]; }

// -- TikTok Ads API helper ----------------------------------------------------
async function tikTokPost<T>(path: string, body: unknown, accessToken: string): Promise<T> {
  const url = `https://business-api.tiktok.com/open_api/v1.3/${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Access-Token": accessToken },
    body: JSON.stringify(body),
  });
  const data: any = await resp.json();
  if (data.code !== 0) throw new Error(`TikTok API [${path}]: ${data.message || JSON.stringify(data)}`);
  return data.data as T;
}

// ── buildAdCopy: extrai copy direcionado dos criativos da campanha ──────────
// Usa hook + headline + copy + cta dos criativos gerados pela IA
// em vez de cair no texto de estratégia interna (c.strategy)
function buildAdCopy(campaign: any, opts: {
  maxMessage?: number;
  maxHeadline?: number;
  maxDescription?: number;
  placement?: "feed" | "stories" | "reels";
  objective?: string;
} = {}) {
  const {
    maxMessage     = 2000,
    maxHeadline    = 255,
    maxDescription = 125,
    placement      = "feed",
    objective      = campaign?.objective || "traffic",
  } = opts;

  let creatives: any[] = [];
  let hooks_: any[] = [];
  let copies_: any[] = [];
  try { creatives = JSON.parse(campaign.creatives || "[]"); } catch {}
  try {
    const aiResp = JSON.parse(campaign.aiResponse || "{}");
    hooks_ = aiResp?.hooks || [];
    copies_ = aiResp?.copies || [];
  } catch {}

  const normalizePlacement = (value: string) => String(value || "").toLowerCase();
  const scoreValue = (creative: any) => Number(creative?.finalScore || creative?.ctrEstimate || 0);
  const formatOf = (creative: any) => normalizePlacement(creative?.format || creative?.type || creative?.orientation || "");
  const isStoriesLike = (creative: any) => /(story|stories|reels|9:16)/i.test(formatOf(creative));
  const isReelsLike = (creative: any) => /(reels)/i.test(formatOf(creative));
  const isFeedLike = (creative: any) => !isStoriesLike(creative) || /(feed|4:5|1:1|square|carousel|image)/i.test(formatOf(creative));

  const pickBest = (matcher: (creative: any) => boolean, fallback?: any) => {
    const pool = creatives.filter(matcher);
    return (pool.sort((a, b) => scoreValue(b) - scoreValue(a))[0]) || fallback || creatives[0] || null;
  };

  const feedCreative = pickBest((creative) => isFeedLike(creative));
  const storiesCreative = pickBest((creative) => isStoriesLike(creative), feedCreative);
  const reelsCreative = pickBest((creative) => isReelsLike(creative), storiesCreative || feedCreative);
  const selectedCreative = placement === "stories"
    ? storiesCreative
    : placement === "reels"
      ? reelsCreative
      : feedCreative;

  const fallbackHook = Array.isArray(hooks_) && hooks_[0]
    ? String(hooks_[0]?.text || hooks_[0]).slice(0, 150)
    : "";
  const hook = (selectedCreative?.hook || fallbackHook || "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .slice(0, 150);

  const objectiveLabels: Record<string, string> = {
    leads: "Cadastre-se",
    sales: "Comprar agora",
    traffic: "Saiba mais",
    branding: "Ver mais",
    engagement: "Fale no WhatsApp",
  };

  const META_CTA_MAP: Record<string, string> = {
    "saiba mais": "LEARN_MORE",
    "learn more": "LEARN_MORE",
    "cadastre-se": "SIGN_UP",
    "cadastrar grátis": "SIGN_UP",
    "cadastrar gratis": "SIGN_UP",
    "receber material": "SIGN_UP",
    "quero meu guia grátis": "SIGN_UP",
    "quero meu guia gratis": "SIGN_UP",
    "comprar agora": "BUY_NOW",
    "garantir desconto": "GET_OFFER",
    "ver oferta": "SHOP_NOW",
    "solicitar orçamento": "GET_QUOTE",
    "pedir orçamento": "GET_QUOTE",
    "fale conosco": "CONTACT_US",
    "fale no whatsapp": "WHATSAPP_MESSAGE",
    "whatsapp": "WHATSAPP_MESSAGE",
    "agendar": "BOOK_NOW",
    "baixar": "DOWNLOAD",
    "assinar": "SUBSCRIBE",
  };

  const normalizeMetaCta = (raw: string, currentObjective: string) => {
    const clean = String(raw || objectiveLabels[currentObjective] || "Saiba mais")
      .trim()
      .toLowerCase();
    const direct = META_CTA_MAP[clean];
    if (direct) return direct;
    if (/whats/.test(clean)) return "WHATSAPP_MESSAGE";
    if (/compr|oferta|desconto/.test(clean)) return currentObjective === "sales" ? "BUY_NOW" : "LEARN_MORE";
    if (/cadast|guia|ebook|material|inscri/.test(clean)) return "SIGN_UP";
    if (/orcamento|quote/.test(clean)) return "GET_QUOTE";
    if (/agend/.test(clean)) return "BOOK_NOW";
    if (/mensagem/.test(clean)) return "MESSAGE_PAGE";
    if (/contato/.test(clean)) return "CONTACT_US";
    if (currentObjective === "engagement") return "WHATSAPP_MESSAGE";
    if (currentObjective === "leads") return "SIGN_UP";
    if (currentObjective === "sales") return "BUY_NOW";
    return "LEARN_MORE";
  };

  const buildAngle = (creative: any) => creative?.angle || creative?.type || creative?.funnelStage || "performance";
  const ctrEstimate = clampNumber(
    0.7 +
    (String(selectedCreative?.hook || "").length > 20 ? 0.3 : 0) +
    (selectedCreative?.finalScore ? Number(selectedCreative.finalScore) / 100 : 0.2),
    0.8,
    3.8,
  );

  const feedHeadline = (selectedCreative?.headline || selectedCreative?.title || campaign.name || "")
    .trim()
    .slice(0, maxHeadline);
  const feedCopyRaw = String(selectedCreative?.copy || selectedCreative?.description || "").trim();
  const fallbackCopy = Array.isArray(copies_) && copies_[0]
    ? String(copies_[0]?.primaryText || copies_[0]?.headline || "")
    : "";
  const feedCopy = (feedCopyRaw || fallbackCopy).slice(0, maxDescription);
  const feedMessage = [hook, feedCopyRaw || fallbackCopy]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, maxMessage) || String(campaign.name || "").slice(0, maxMessage);
  const feedCta = normalizeMetaCta(selectedCreative?.cta, objective);
  const feedAngle = buildAngle(selectedCreative);

  const storiesBase = storiesCreative || selectedCreative || feedCreative;
  const storyTexts = [
    String(storiesBase?.hook || hook || "").trim(),
    String(storiesBase?.headline || feedHeadline || "").trim(),
    String(storiesBase?.copy || feedCopy || objectiveLabels[objective] || "").trim(),
  ].filter(Boolean);

  const fitStoryLine = (text: string) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "Saiba mais hoje";
    if (clean.length <= 40) return clean;
    return clean.slice(0, 37).trimEnd() + "...";
  };

  const storiesScript = [0, 1, 2].map((index) => fitStoryLine(storyTexts[index] || storyTexts[storyTexts.length - 1] || hook || feedHeadline));
  const storiesCta = normalizeMetaCta(storiesBase?.cta, objective);
  const storiesHook = String(storiesBase?.hook || hook || feedHeadline).slice(0, 120);
  const storiesAngle = buildAngle(storiesBase);

  const googleHeadlines = [
    feedHeadline.slice(0, 30),
    fitStoryLine(storiesScript[0]).slice(0, 30),
    String(objectiveLabels[objective] || selectedCreative?.cta || "Saiba mais").slice(0, 30),
  ].filter(Boolean);

  const googleDescriptions = [
    (feedCopyRaw || fallbackCopy || feedHeadline).slice(0, 90),
    `${storiesScript.join(" | ")}`.slice(0, 90),
  ].filter(Boolean);

  const hasRealCopy = !!selectedCreative;

  return {
    feed: {
      creative: feedCreative,
      message: feedMessage,
      headline: feedHeadline,
      copy: feedCopy,
      hook,
      cta: feedCta,
      hasRealCopy,
      angle: feedAngle,
      ctrEstimate,
    },
    stories: {
      creative: storiesCreative || reelsCreative || feedCreative,
      script: storiesScript,
      hook: storiesHook,
      cta: storiesCta,
      hasRealCopy: !!storiesBase,
      angle: storiesAngle,
    },
    reels: {
      creative: reelsCreative || storiesCreative || feedCreative,
      hook: String(reelsCreative?.hook || storiesHook || hook).slice(0, 120),
      cta: normalizeMetaCta(reelsCreative?.cta || storiesBase?.cta, objective),
      angle: buildAngle(reelsCreative || storiesBase),
    },
    googleHeadlines,
    googleDescriptions,
    hasRealCopy,
    message: feedMessage,
    headline: feedHeadline,
    copy: feedCopy,
    hook,
    ctaRaw: feedCta,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}


// -- TikTok OAuth + Research API helpers --------------------------------------

// Gera URL de autorização OAuth do TikTok
function getTikTokAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_key:    process.env.TIKTOK_CLIENT_KEY || "",
    scope:         "user.info.profile,user.info.stats,video.list",
    response_type: "code",
    redirect_uri:  redirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

// Busca perfil + vídeos de um usuário TikTok via API oficial
async function fetchTikTokProfile(username: string, accessToken: string): Promise<{
  profile: any; videos: any[]; stats: any;
}> {
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // 1. Busca info do perfil
  let profile: any = null;
  try {
    const profileRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
      { headers, signal: AbortSignal.timeout(10000) }
    );
    const profileData: any = await profileRes.json();
    if (!profileData.error?.code || profileData.error.code === "ok") {
      profile = profileData.data?.user;
    }
  } catch {}

  // 2. Busca vídeos públicos
  let videos: any[] = [];
  try {
    const videoRes = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ max_count: 20 }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const videoData: any = await videoRes.json();
    if (!videoData.error?.code || videoData.error.code === "ok") {
      videos = videoData.data?.videos || [];
    }
  } catch {}

  return { profile, videos, stats: profile };
}

// -- Google Ads helpers -------------------------------------------------------
async function getGoogleAccessToken(integration: {
  accessToken?: string | null;
  refreshToken?: string | null;
  appId?: string | null;
  appSecret?: string | null;
}): Promise<string> {
  const refreshToken = integration.refreshToken;
  const clientId     = integration.appId;
  const clientSecret = integration.appSecret;
  if (!refreshToken || !clientId || !clientSecret) {
    if (integration.accessToken) return integration.accessToken;
    throw new Error("Credenciais Google incompletas (refreshToken, clientId ou clientSecret ausentes)");
  }
  const params = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const data: any = await resp.json();
  if (!data.access_token) throw new Error("Google OAuth falhou: " + JSON.stringify(data));
  return data.access_token;
}

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23";

function buildGoogleAdsUrl(customerId: string, path: string): string {
  const cleanId = String(customerId || "").replace(/\D/g, "");
  return `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanId}/${path}`;
}

// ── Google Ads API via biblioteca oficial (gRPC) ────────────────────────────
async function getGoogleAdsClient(integration: {
  refreshToken?: string | null;
  appId?: string | null;
  appSecret?: string | null;
  developerToken?: string | null;
}) {
  const { GoogleAdsApi } = await import("google-ads-api");
  const clientId     = integration.appId     || process.env.GOOGLE_CLIENT_ID     || process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret = integration.appSecret || process.env.GOOGLE_CLIENT_SECRET  || process.env.GOOGLE_ADS_CLIENT_SECRET || "";
  const devToken     = (integration as any).developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
  const refreshToken = integration.refreshToken || "";

  const client = new GoogleAdsApi({
    client_id:     clientId,
    client_secret: clientSecret,
    developer_token: devToken,
  });

  return { client, refreshToken, devToken };
}

async function googleAdsPost<T>(
  path: string,
  body: unknown,
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId?: string
): Promise<T> {
  const cleanId    = customerId.replace(/\D/g, "");
  const cleanLogin = (loginCustomerId ?? "").replace(/\D/g, "");
  const url = buildGoogleAdsUrl(cleanId, path);
  log.info("google", "googleAdsPost request", { url, cleanId, cleanLogin: cleanLogin || "(none)", devTokenPrefix: developerToken.slice(0,8) });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   `Bearer ${accessToken}`,
      "developer-token": developerToken,
      ...(cleanLogin ? { "login-customer-id": cleanLogin } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP ${resp.status}`);
    throw new Error(`Google Ads API error [${path}] HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  return await resp.json() as T;
}

function shouldFallbackGoogleQueryError(message: string): boolean {
  return message.includes("UNRECOGNIZED_FIELD") ||
    message.includes("INVALID_ARGUMENT") ||
    message.includes("REQUESTED_METRICS_FOR_MANAGER");
}

function getTikTokRuntimeConfig(integration?: any) {
  const accessToken = String(integration?.accessToken ?? process.env.TIKTOK_ACCESS_TOKEN ?? "");
  const accountId = String(integration?.accountId ?? process.env.TIKTOK_ADVERTISER_ID ?? "");
  return {
    accessToken,
    accountId,
    configured: !!(accessToken && accountId),
    source: integration?.accessToken && integration?.accountId ? "database" : (accessToken && accountId ? "env" : "missing"),
  };
}

async function resolveGoogleAdsRuntimeContext(integration: any) {
  const accessToken = await getGoogleAccessToken(integration as any);
  const developerToken = String((integration as any).developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "");
  const configuredCustomerId = String((integration as any).accountId ?? "").replace(/\D/g, "");
  const configuredLoginCustomerId = String((integration as any).loginCustomerId ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "");
  if (!developerToken || !configuredCustomerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Developer Token ou Customer ID ausentes" });
  }

  let customerId = configuredCustomerId;
  let loginCustomerId = configuredLoginCustomerId || undefined;

  try {
    const identity = await googleAdsPost<any>(
      "googleAds:search",
      { query: "SELECT customer.id, customer.descriptive_name, customer.manager FROM customer LIMIT 1" },
      accessToken,
      developerToken,
      customerId,
      loginCustomerId,
    );

    const isManager = Boolean(identity.results?.[0]?.customer?.manager);
    if (!isManager) {
      return { accessToken, developerToken, customerId, loginCustomerId, isManager: false, childCustomerIds: [] as string[] };
    }

    const hierarchy = await googleAdsPost<any>(
      "googleAds:search",
      {
        query: "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.manager = FALSE ORDER BY customer_client.level, customer_client.id LIMIT 50",
      },
      accessToken,
      developerToken,
      customerId,
      loginCustomerId || customerId,
    );

    const childCustomerIds = (hierarchy.results || [])
      .map((row: any) => String(row.customerClient?.id ?? row.customer_client?.id ?? "").replace(/\D/g, ""))
      .filter(Boolean);

    if (childCustomerIds[0]) {
      return {
        accessToken,
        developerToken,
        customerId: childCustomerIds[0],
        loginCustomerId: customerId,
        isManager: true,
        managerCustomerId: customerId,
        childCustomerIds,
      };
    }

    return {
      accessToken,
      developerToken,
      customerId,
      loginCustomerId: loginCustomerId || customerId,
      isManager: true,
      managerCustomerId: customerId,
      childCustomerIds,
    };
  } catch (error: any) {
    log.warn("google", "resolveGoogleAdsRuntimeContext fallback", {
      customerId,
      preview: String(error?.message || "").slice(0, 200),
    });
    return { accessToken, developerToken, customerId, loginCustomerId, isManager: false, childCustomerIds: [] as string[] };
  }
}



export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "superadmin"].includes(ctx.user.role))
    throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// -- Superadmin-only --------------------------------------------------------
export const superadminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "superadmin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin pode executar esta ação" });
  return next({ ctx: { user: ctx.user } });
});

// -- Procedures por perfil (admin com perfil específico OU superadmin) ------
export const marketingProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const allowed = ctx.user.role === "superadmin" ||
    (["admin","superadmin"].includes(ctx.user.role) && (ctx.user as any).profile === "marketing");
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil Marketing" });
  return next({ ctx: { user: ctx.user } });
});

export const financeiroProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const allowed = ctx.user.role === "superadmin" ||
    (["admin","superadmin"].includes(ctx.user.role) && (ctx.user as any).profile === "financeiro");
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil Financeiro" });
  return next({ ctx: { user: ctx.user } });
});

export const rhProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const allowed = ctx.user.role === "superadmin" ||
    (["admin","superadmin"].includes(ctx.user.role) && (ctx.user as any).profile === "rh");
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao perfil RH" });
  return next({ ctx: { user: ctx.user } });
});

// ============ AUTH ROUTER ============
const authRouter = router({
  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2) }))
    .mutation(async ({ input }) => {
      log.auth("register", "Attempt", { email: input.email });
      const user = await db.registerUser(input.email, input.password, input.name);
      log.auth("register", "User created", { userId: user.id });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        const verifyToken = await db.createEmailVerificationToken(user.id);
        const { sendVerificationEmail } = await import("../email");
        const result = await sendVerificationEmail(user.email, user.name ?? "Usuário", verifyToken);
        log.email("register", "Verification email sent", { email: user.email, id: (result as any)?.data?.id });
      } catch (e: any) {
        log.error("register", "Email send failed", { message: e.message, email: user.email });
      }
      const { passwordHash, ...safeUser } = user as any;
      return { ...safeUser, requiresVerification: true };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      log.auth("login", "Attempt", { email: input.email });
      const user = await db.loginUser(input.email, input.password);
      log.auth("login", "Success", { userId: user.id, role: (user as any).role });
      const token = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d")
        .sign(new TextEncoder().encode(ENV.JWT_SECRET));
      ctx.res.cookie("token", token, { httpOnly: true, secure: ENV.NODE_ENV === "production", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
      const { passwordHash, ...safeUser } = user;
      return safeUser;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie("token");
    return { success: true };
  }),
});

// ============ PROJECTS ROUTER ============
const projectsRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.getProjectsByUserId(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getProjectById(input.id)),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(2), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const check = await db.checkPlanLimit(ctx.user.id, "projects");
      if (!check.allowed) throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
      return db.createProject({
        name: input.name,
        description: input.description,
        userId: ctx.user.id,
      } as any);
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), status: z.string().optional() }))
    .mutation(({ input }) => { const { id, ...data } = input; return db.updateProject(id, data as any); }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteProject(input.id)),
});

// ============ CLIENT PROFILE ROUTER ============
const clientProfileRouter = router({
  get: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ input }) => db.getClientProfileByProjectId(input.projectId)),
  upsert: protectedProcedure
    .input(z.object({
      projectId: z.number(), companyName: z.string(), niche: z.string(), productService: z.string(),
      targetAudience: z.string().optional(), mainPain: z.string().optional(), desiredTransformation: z.string().optional(),
      uniqueValueProposition: z.string().optional(), mainObjections: z.string().optional(),
      campaignObjective: z.enum(["leads", "sales", "branding", "traffic", "engagement"]).optional(),
      monthlyBudget: z.number().optional(), websiteUrl: z.string().optional(), socialLinks: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const websiteUrl = (() => {
        const raw = String(input.websiteUrl || "").trim();
        if (!raw) return undefined;
        if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
        return raw;
      })();
      return db.upsertClientProfile({ ...input, websiteUrl } as any);
    }),
});

// ============ COMPETITORS ROUTER ============
const competitorsRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ input }) => db.getCompetitorsByProjectId(input.projectId)),

  // -- Estima gasto mensal do concorrente em trafego pago --
  estimateSpend: protectedProcedure
    .input(z.object({ competitorId: z.number(), projectId: z.number() }))
    .query(async ({ input }) => {
      const { estimateCompetitorSpend } = await import('../ai.js');
      const ads     = await db.getAdsByCompetitorId(input.competitorId);
      if (!ads || ads.length === 0) return {
        monthlyMin: 0, monthlyMax: 0, monthlyMid: 0, confidence: 'baixa',
        methodology: 'Sem anuncios suficientes para estimar.',
        breakdown: { activeAds: 0, avgDaysRunning: 0, dominantFormat: '-', impressionRange: '-', cpmUsed: [0,0], estimatedImpressions: [0,0] },
      };
      const profile = await db.getClientProfileByProjectId(input.projectId);
      const niche   = (profile as any)?.niche || 'default';
      return estimateCompetitorSpend(ads, niche);
    }),

  // -- Verifica se um @handle do Instagram existe e retorna dados públicos --
  verifyInstagram: protectedProcedure
    .input(z.object({ handle: z.string() }))
    .mutation(async ({ input }) => {
      const raw    = input.handle.replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/$/, "").trim();
      if (!raw) throw new Error("Handle inválido");

      // Tenta buscar o perfil público via endpoint oembed do Instagram (sem token)
      // Fallback 1: oembed oficial
      // Fallback 2: scraping mínimo via user agent mobile
      const oembedUrl = `https://www.instagram.com/oembed?url=https://www.instagram.com/${raw}/&format=json`;
      const profileUrl = `https://www.instagram.com/${raw}/?__a=1&__d=dis`;

      type IgProfile = {
        found:    boolean;
        handle:   string;
        name?:    string;
        bio?:     string;
        avatar?:  string;
        posts?:   number;
        followers?: string;
        verified?: boolean;
        url:      string;
        source:   string;
      };

      // Tentativa 1: oembed (mais confiável, não requer token)
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const res  = await fetch(oembedUrl, {
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MECPro/1.0)" },
        });
        if (res.ok) {
          const data = await res.json() as any;
          const result: IgProfile = {
            found:   true,
            handle:  `@${raw}`,
            name:    data.author_name || raw,
            avatar:  data.thumbnail_url || undefined,
            url:     `https://www.instagram.com/${raw}/`,
            source:  "oembed",
          };
          return result;
        }
      } catch { /* fallback */ }

      // Tentativa 2: perfil público JSON (funciona em alguns casos)
      try {
        const ctrl2 = new AbortController();
        setTimeout(() => ctrl2.abort(), 8000);
        const res2 = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${raw}`, {
          signal: ctrl2.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
            "x-ig-app-id": "936619743392459",
            "Accept": "application/json",
          },
        });
        if (res2.ok) {
          const data2 = await res2.json() as any;
          const user  = data2?.data?.user;
          if (user) {
            const result: IgProfile = {
              found:     true,
              handle:    `@${raw}`,
              name:      user.full_name || raw,
              bio:       user.biography || undefined,
              avatar:    user.profile_pic_url_hd || user.profile_pic_url || undefined,
              posts:     user.edge_owner_to_timeline_media?.count,
              followers: user.edge_followed_by?.count > 1000
                ? `${(user.edge_followed_by.count / 1000).toFixed(1)}k`
                : String(user.edge_followed_by?.count || "?"),
              verified:  user.is_verified,
              url:       `https://www.instagram.com/${raw}/`,
              source:    "profile_api",
            };
            return result;
          }
        }
      } catch { /* fallback */ }

      // Tentativa 3: confirma existência via HEAD request
      try {
        const ctrl3 = new AbortController();
        setTimeout(() => ctrl3.abort(), 6000);
        const res3 = await fetch(`https://www.instagram.com/${raw}/`, {
          method: "HEAD",
          signal: ctrl3.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
        });
        if (res3.status === 200) {
          return {
            found:   true,
            handle:  `@${raw}`,
            name:    raw,
            url:     `https://www.instagram.com/${raw}/`,
            source:  "exists",
          };
        }
        if (res3.status === 404) {
          return { found: false, handle: `@${raw}`, url: `https://www.instagram.com/${raw}/`, source: "not_found" };
        }
      } catch { /* ignora */ }

      // Não conseguiu verificar — retorna como incerto
      return {
        found:   null,
        handle:  `@${raw}`,
        url:     `https://www.instagram.com/${raw}/`,
        source:  "unverified",
      };
    }),

  create: protectedProcedure
    .input(z.object({
      projectId:       z.number(),
      name:            z.string().min(1, "Nome obrigatório").max(255),
      websiteUrl:      z.string().optional(),
      facebookPageUrl: z.string().optional(),
      facebookPageId:  z.string().optional(),
      instagramUrl:    z.string().optional(),
      tiktokUrl:       z.string().optional(),
      googleAdsQuery:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const check = await db.checkPlanLimit(ctx.user.id, "competitors", { projectId: input.projectId });
      if (!check.allowed) throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
      // Sanitiza: converte strings vazias em undefined para não salvar lixo
      const clean = {
        projectId:       input.projectId,
        name:            input.name.trim(),
        websiteUrl:      (() => {
          let w = input.websiteUrl?.trim() || "";
          if (!w) return undefined;
          if (!w.startsWith("http")) w = "https://" + w.replace(/^www\./, "www.");
          return w;
        })(),
        facebookPageUrl: input.facebookPageUrl?.trim() || undefined,
        facebookPageId:  input.facebookPageId?.trim()  || undefined,
        instagramUrl:    input.instagramUrl?.trim()    || undefined,
        tiktokUrl:       input.tiktokUrl?.trim()       || undefined,
        googleAdsQuery:  input.googleAdsQuery?.trim()  || undefined,
      };
      return db.createCompetitor(clean as any);
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCompetitor(input.id)),
  analyze: protectedProcedure
    .input(z.object({
      competitorId: z.number(),
      projectId:    z.number(),
      force:        z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      // Se force=true, limpa ads estimados/SEO antes de reanalisar
      if (input.force) {
        const existing = await db.getScrapedAdsByCompetitor(input.competitorId);
        const NON_REAL = new Set(["estimated", "estimated_ai", "seo_analysis", "website_scraping"]);
        const toDelete = existing.filter((a: any) => {
          try {
            const s = JSON.parse((a as any).rawData || "{}").source || "";
            return NON_REAL.has(s) || s.startsWith("estimated");
          } catch { return false; }
        });
        for (const ad of toDelete) {
          try { await db.deleteScrapedAd((ad as any).id); } catch {}
        }
      }
      const { analyzeCompetitor } = await import("../ai");
      return analyzeCompetitor(input.competitorId, input.projectId);
    }),

  // -- Reanalisa forçando nova coleta (limpa dados estimados) --

  // -- MECPro Analyzer — análise de anúncio por input manual ----------------
  // Não depende de API Meta, HF ou quota externa — usa Gemini direto
  analyzeAdInput: protectedProcedure
    .input(z.object({
      input:        z.string().min(1),
      nicho:        z.string().optional(),
      localizacao:  z.string().optional(),
      publico:      z.string().optional(),
      projectId:    z.number().optional(),
      competitorId: z.number().optional(), // se fornecido, usa os anúncios já coletados
    }))
    .mutation(async ({ input, ctx }) => {
      const { analyzeAdInput } = await import("../ai");

      // Se tem competitorId, busca os anúncios já coletados no banco
      let existingAds: any[] = [];
      if (input.competitorId) {
        existingAds = await db.getScrapedAdsByCompetitor(input.competitorId);
      }

      return analyzeAdInput({
        input:        input.input,
        nicho:        input.nicho,
        localizacao:  input.localizacao,
        publico:      input.publico,
        projectId:    input.projectId,
        userId:       ctx.user.id,
        existingAds,  // passa os anúncios coletados para análise real
      });
    }),

  // -- TikTok OAuth -- gera URL de autorização ---------------------------------
  getTikTokAuthUrl: protectedProcedure
    .input(z.object({ redirectUri: z.string() }))
    .query(({ ctx, input }) => {
      const state = `mecpro_${(ctx as any).user?.id}_${Date.now()}`;
      const url = getTikTokAuthUrl(input.redirectUri, state);
      return { url, state };
    }),

  // -- TikTok OAuth -- troca code por access token ------------------------------
  exchangeTikTokCode: protectedProcedure
    .input(z.object({ code: z.string(), redirectUri: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key:    process.env.TIKTOK_CLIENT_KEY    || "",
          client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
          code:          input.code,
          grant_type:    "authorization_code",
          redirect_uri:  input.redirectUri,
        }),
      });
      const data: any = await res.json();
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: data.error_description || data.error });

      // Salva token na integração
      await db.upsertApiIntegration((ctx as any).user.id, "tiktok", {
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresAt:    new Date(Date.now() + (data.expires_in || 86400) * 1000),
        openId:       data.open_id,
      });

      return { success: true, openId: data.open_id };
    }),

  // -- TikTok API -- busca perfil + vídeos de concorrente via API oficial -----
  fetchTikTokCompetitor: protectedProcedure
    .input(z.object({ competitorId: z.number(), projectId: z.number(), tiktokHandle: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Busca token TikTok do usuário
      const integration = await db.getApiIntegration((ctx as any).user.id, "tiktok").catch(() => null);
      const accessToken = (integration as any)?.accessToken;

      if (!accessToken) {
        return {
          success: false,
          message: "❌ Conecte sua conta TikTok em Configurações → Integrações para usar esta função.",
          needsAuth: true,
        };
      }

      const { profile, videos } = await fetchTikTokProfile(input.tiktokHandle, accessToken);

      // Salva vídeos como anúncios do concorrente
      let saved = 0;
      for (const video of videos.slice(0, 20)) {
        try {
          await db.createScrapedAd({
            competitorId: input.competitorId,
            projectId:    input.projectId,
            platform:     "tiktok",
            adId:         `tt_${video.id}`,
            adType:       "video",
            headline:     video.title || video.video_description || input.tiktokHandle,
            bodyText:     video.video_description || null,
            cta:          null,
            startDate:    video.create_time ? new Date(video.create_time * 1000) : null,
            isActive:     1,
            rawData:      JSON.stringify({
              source:       "tiktok_api_official",
              videoId:      video.id,
              coverUrl:     video.cover_image_url,
              shareUrl:     video.share_url,
              viewCount:    video.view_count,
              likeCount:    video.like_count,
              commentCount: video.comment_count,
              shareCount:   video.share_count,
              duration:     video.duration,
              profile: profile ? {
                displayName:   profile.display_name,
                followerCount: profile.follower_count,
                likesCount:    profile.likes_count,
                videoCount:    profile.video_count,
                isVerified:    profile.is_verified,
                avatarUrl:     profile.avatar_url,
              } : null,
            }).slice(0, 2000),
          } as any);
          saved++;
        } catch {}
      }

      return {
        success: true,
        profile,
        videosFound: videos.length,
        videosSaved: saved,
        message: saved > 0
          ? `✅ ${saved} vídeo(s) de @${input.tiktokHandle} coletados via TikTok API Oficial`
          : "⚠️ Nenhum vídeo encontrado para este perfil.",
      };
    }),

  // -- Buscar anúncios TikTok de concorrente --------------------------------
  analyzeTikTok: protectedProcedure
    .input(z.object({ competitorId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      const competitor = await db.getCompetitorById(input.competitorId);
      if (!competitor) throw new TRPCError({ code: "NOT_FOUND", message: "Concorrente não encontrado" });

      const compName   = (competitor as any).name || "";
      const websiteUrl = (competitor as any).websiteUrl || "";

      // Try TikTok Creative Center API (public endpoint — no auth needed)
      const searchQuery = encodeURIComponent(compName);
      const tccUrl = `https://www.tiktok.com/api/commercial/search/ad/?keyword=${searchQuery}&period=7&page=1&limit=20&country_code=BR&industry_id=0`;

      let tiktokAds: any[] = [];
      try {
        const resp = await fetch(tccUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MECPro/1.0)",
            "Referer": "https://ads.tiktok.com/business/creativecenter/",
          }
        });
        if (resp.ok) {
          const data: any = await resp.json();
          tiktokAds = (data?.data?.ads || []).slice(0, 15);
        }
      } catch (e) {
        log.warn("ai", "TikTok Creative Center fetch failed, using keyword approach", { compName });
      }

      // Fallback: TikTok Hashtag/Keyword search via public Creative Center
      if (tiktokAds.length === 0 && websiteUrl) {
        try {
          const domainMatch = websiteUrl.match(/([a-z0-9-]+)\.[a-z]{2,}/i);
          const keyword     = domainMatch ? domainMatch[1] : compName.split(" ")[0];
          const fallbackUrl = `https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list?period=7&page=1&page_size=20&order_by=like&country_code=BR&keyword=${encodeURIComponent(keyword)}`;
          const resp2 = await fetch(fallbackUrl, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://ads.tiktok.com/" }
          });
          if (resp2.ok) {
            const data2: any = await resp2.json();
            tiktokAds = (data2?.data?.materials || []).slice(0, 10);
          }
        } catch {}
      }

      // Build standardized ad objects
      const standardizedAds = tiktokAds.map((ad: any) => ({
        platform:    "tiktok",
        adId:        ad.id || ad.material_id || String(Math.random()),
        headline:    ad.ad_title || ad.video_info?.title || compName,
        copy:        ad.ad_text  || ad.video_info?.caption || "",
        cta:         ad.call_to_action || "LEARN_MORE",
        format:      "VIDEO",
        status:      "ACTIVE",
        startDate:   ad.first_show_date  || new Date().toISOString().split("T")[0],
        videoUrl:    ad.video_info?.vid_url_with_watermark || ad.vid_url || "",
        coverUrl:    ad.video_info?.cover || ad.cover || "",
        source:      tiktokAds.length > 0 ? "tiktok_creative_center" : "estimated",
        likeCount:   ad.like_count  || 0,
        shareCount:  ad.share_count || 0,
        viewCount:   ad.video_info?.play_count || 0,
      }));

      // Save to scrapedAds table (reusing existing structure)
      let savedCount = 0;
      for (const ad of standardizedAds) {
        try {
          await db.createScrapedAd({
            competitorId:  input.competitorId,
            platform:      "tiktok",
            adId:          ad.adId,
            headline:      ad.headline,
            copy:          ad.copy,
            cta:           ad.cta,
            format:        ad.format,
            status:        ad.status,
            startDate:     ad.startDate ? new Date(ad.startDate) : null,
            rawData:       JSON.stringify({ ...ad, source: ad.source }),
          } as any);
          savedCount++;
        } catch {}
      }

      // Generate AI insight for TikTok data
      let tiktokInsight = "";
      if (standardizedAds.length > 0) {
        const ctaFreq: Record<string,number> = {};
        standardizedAds.forEach(a => { ctaFreq[a.cta] = (ctaFreq[a.cta]||0)+1; });
        const topCta = Object.entries(ctaFreq).sort((a,b)=>b[1]-a[1])[0]?.[0] || "LEARN_MORE";
        const avgViews = standardizedAds.reduce((s,a)=>s+(a.viewCount||0),0) / standardizedAds.length;
        tiktokInsight = [
          `🎵 TikTok: ${standardizedAds.length} anúncio(s) encontrado(s) para "${compName}"`,
          `📌 CTA mais usado: ${topCta}`,
          `👀 Média de views: ${Math.round(avgViews).toLocaleString()}`,
          `📱 Formato dominante: VIDEO`,
          `🔍 Fonte: ${standardizedAds[0]?.source || "estimado"}`,
        ].join("\n");
      } else {
        tiktokInsight = `🎵 TikTok: Nenhum anúncio público encontrado para "${compName}". Considere buscar manualmente em ads.tiktok.com/creative_radar.`;
      }

      // Append TikTok insight to existing aiInsights
      const existing = (competitor as any).aiInsights || "";
      const updatedInsights = existing
        ? existing + "\n\n" + tiktokInsight
        : tiktokInsight;

      await db.updateCompetitor(input.competitorId, { aiInsights: updatedInsights } as any);

      return {
        success:     true,
        adsFound:    standardizedAds.length,
        savedCount,
        insight:     tiktokInsight,
        ads:         standardizedAds.slice(0, 5),
        source:      standardizedAds[0]?.source || "not_found",
      };
    }),


  reanalyze: protectedProcedure
    .input(z.object({ competitorId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Limpa todos os anúncios existentes (estimados ou não) para forçar re-coleta
      await db.deleteScrapedAdsByCompetitor(input.competitorId);
      const { analyzeCompetitor } = await import("../ai");
      return analyzeCompetitor(input.competitorId, input.projectId);
    }),

  // -- Atualiza campos do concorrente (pageId, URL, etc.) --
  update: protectedProcedure
    .input(z.object({
      id:              z.number(),
      name:            z.string().min(1).optional(),
      facebookPageId:  z.string().nullable().optional(),
      facebookPageUrl: z.string().nullable().optional(),
      instagramUrl:    z.string().nullable().optional(),
      tiktokUrl:       z.string().nullable().optional(),
      googleAdsQuery:  z.string().nullable().optional(),
      googleAdsUrl:    z.string().nullable().optional(),
      websiteUrl:      z.string().nullable().optional(),
      notes:           z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...raw } = input;
      const data = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])
      );
      return db.updateCompetitor(id, data as any);
    }),

  // -- Buscar anúncios/posts de uma página pelo Page ID ----------------------
  fetchAdsByPageId: protectedProcedure
    .input(z.object({
      competitorId: z.number(),
      projectId:    z.number(),
      pageId:       z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      }
      const token = (integration as any).accessToken as string;
      const results: any[] = [];

      // 1. Ads Archive (requer permissão Ads Library)
      try {
        const url = "https://graph.facebook.com/v20.0/ads_archive?" +
          "access_token=" + token +
          "&search_page_ids=" + input.pageId +
          "&ad_reached_countries=BR&ad_active_status=ACTIVE" +
          "&fields=id,ad_creative_bodies,ad_creative_link_titles,page_name,page_id,impressions,spend&limit=50";
        const adsRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const adsData: any = await adsRes.json();
        if (!adsData.error && adsData.data?.length > 0) {
          results.push(...adsData.data.map((ad: any) => ({
            source: "ads_archive",
            headline: ad.ad_creative_link_titles?.[0] || null,
            body: ad.ad_creative_bodies?.[0] || null,
            pageName: ad.page_name,
          })));
        }
        log.info("meta", "fetchAdsByPageId ads_archive", { count: results.length, error: adsData.error?.message });
      } catch {}

      // 2. Ads Library pública com Page ID (não precisa de permissão especial)
      if (results.length === 0) {
        try {
          const UA_LIST = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          ];
          const adsLibUrl = "https://www.facebook.com/ads/library/async/search_ads/?" +
            new URLSearchParams({
              q: "",
              count: "30",
              active_status: "active",
              ad_type: "all",
              "countries[0]": "BR",
              search_type: "page",
              view_all_page_id: input.pageId,
            }).toString();

          for (const ua of UA_LIST) {
            const libRes = await fetch(adsLibUrl, {
              headers: {
                "User-Agent": ua,
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "pt-BR,pt;q=0.9",
                "Referer": "https://www.facebook.com/ads/library/",
                "X-Requested-With": "XMLHttpRequest",
              },
              signal: AbortSignal.timeout(10000),
            });
            if (!libRes.ok) continue;
            const text = await libRes.text();
            if (!text || text.length < 50) continue;

            // Tenta parsear JSON do Facebook (tem prefixo for(;;);)
            try {
              const clean = text.replace(/^for\s*\(;;\);/, "").trim();
              const data = JSON.parse(clean);
              const cards = data?.payload?.results || data?.data?.ad_cards || data?.results || [];
              for (const card of (Array.isArray(cards) ? cards : []).slice(0, 20)) {
                const snapshot = card?.snapshot || card?.ad_snapshot || card;
                const headline = snapshot?.title || snapshot?.link_title || snapshot?.caption || null;
                const body = snapshot?.body?.markup?.__html?.replace(/<[^>]+>/g, "") || snapshot?.body_text || null;
                if (headline || body) {
                  results.push({
                    source: "ads_library_public",
                    headline,
                    body,
                    cta: snapshot?.cta_text || null,
                    pageId: card?.page_id || input.pageId,
                    pageName: card?.page_name || null,
                  });
                }
              }
              if (results.length > 0) break;
            } catch {}

            // Fallback regex se JSON falhar
            const pageIdMatches = [...text.matchAll(/"page_id"\s*:\s*"?(\d{6,})"?/g)];
            const headlineMatches = [...text.matchAll(/"(?:title|link_title|caption)"\s*:\s*"([^"]{5,})"/g)];
            const bodyMatches = [...text.matchAll(/"(?:body_text|message)"\s*:\s*"([^"]{10,})"/g)];
            if (headlineMatches.length > 0 || bodyMatches.length > 0) {
              const max = Math.max(headlineMatches.length, bodyMatches.length);
              for (let i = 0; i < Math.min(max, 10); i++) {
                results.push({
                  source: "ads_library_public",
                  headline: headlineMatches[i]?.[1] || null,
                  body: bodyMatches[i]?.[1] || null,
                  pageId: pageIdMatches[0]?.[1] || input.pageId,
                });
              }
              if (results.length > 0) break;
            }
          }
          log.info("meta", "fetchAdsByPageId ads_library_public", { pageId: input.pageId, count: results.length });
        } catch (e: any) {
          log.warn("meta", "fetchAdsByPageId ads_library_public falhou", { message: e.message });
        }
      }

      // 3. Posts públicos via Graph API (requer pages_read_engagement)
      if (results.length === 0) {
        try {
          const url = "https://graph.facebook.com/v20.0/" + input.pageId + "/posts?" +
            "fields=message,story,created_time,permalink_url,attachments{title,description}&limit=20" +
            "&access_token=" + token;
          const postsRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
          const postsData: any = await postsRes.json();
          if (!postsData.error && postsData.data?.length > 0) {
            results.push(...postsData.data.map((p: any) => ({
              source: "page_posts",
              headline: p.attachments?.data?.[0]?.title || null,
              body: p.message || p.story || null,
              createdTime: p.created_time,
              permalink: p.permalink_url,
            })));
          }
          log.info("meta", "fetchAdsByPageId page_posts", { count: postsData.data?.length || 0, error: postsData.error?.message });
        } catch {}
      }

      // 3. Info pública da página
      let pageInfo: any = null;
      try {
        const url = "https://graph.facebook.com/v20.0/" + input.pageId +
          "?fields=name,about,description,fan_count,website,category&access_token=" + token;
        const pageRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const pageData: any = await pageRes.json();
        if (!pageData.error) pageInfo = pageData;
      } catch {}

      // Salva no banco
      let saved = 0;
      for (const r of results) {
        if (!r.headline && !r.body) continue;
        try {
          await db.createScrapedAd({
            competitorId: input.competitorId,
            projectId: input.projectId,
            platform: "meta",
            adId: "pageid_" + input.pageId + "_" + Date.now() + "_" + saved,
            adType: "image",
            headline: r.headline,
            bodyText: r.body,
            cta: null,
            startDate: r.createdTime ? new Date(r.createdTime) : null,
            isActive: 1,
            rawData: JSON.stringify({ ...r, source: r.source }).slice(0, 2000),
          } as any);
          saved++;
        } catch {}
      }

      return {
        success: true,
        pageInfo,
        adsFound: results.length,
        adsSaved: saved,
        source: results[0]?.source || "none",
        message: saved > 0
          ? "Coletados " + saved + " item(s) da página " + (pageInfo?.name || input.pageId)
          : "Nenhum dado encontrado. Verifique permissões do token Meta.",
      };
    }),

  // -- Descobrir Page ID do Facebook a partir do Instagram (v2) -------------
  discoverPageId: protectedProcedure
    .input(z.object({
      instagramHandle: z.string(),
      companyName:     z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const raw = input.instagramHandle
        .replace(/^@/, "")
        .replace(/.*instagram\.com\//, "")
        .replace(/\/+$/, "")
        .trim()
        .toLowerCase();

      if (!raw) throw new TRPCError({ code: "BAD_REQUEST", message: "Handle inválido." });

      const rawSimple   = raw.split(".")[0];
      const companySlug = input.companyName?.toLowerCase().replace(/[^a-z0-9]/g, "") || rawSimple;

      const results: { method: string; pageId: string | null; pageName: string | null; confidence: string }[] = [];
      const tried:   string[] = [];

      log.info("ai", "discoverPageId v2 iniciado", { raw, rawSimple, companySlug });

      // Busca token Meta do usuário
      let token: string | null = null;
      try {
        const integration = await db.getApiIntegration(ctx.user.id, "meta").catch(() => null);
        token = (integration as any)?.accessToken || null;
      } catch {}

      // ── ESTRATÉGIA 1: Graph API — resolve handle como página (requer token) ──
      if (token) {
        const handles = [...new Set([raw, rawSimple, companySlug])].filter(Boolean);
        for (const handle of handles) {
          if (results.length > 0) break;
          tried.push(`graph_handle_${handle}`);
          try {
            const url  = `https://graph.facebook.com/v20.0/${encodeURIComponent(handle)}?fields=id,name,username&access_token=${token}`;
            const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const data: any = await res.json();
            if (!data.error && data.id && /^\d+$/.test(data.id)) {
              results.push({ method: "graph_direct_handle", pageId: data.id, pageName: data.name || handle, confidence: "high" });
              log.info("ai", "discoverPageId Estratégia 1 OK", { handle, pageId: data.id });
              break;
            } else {
              log.info("ai", "discoverPageId Estratégia 1 sem resultado", { handle, error: data.error?.message });
            }
          } catch (e: any) {
            log.info("ai", "discoverPageId Estratégia 1 erro", { handle, message: e?.message?.slice(0, 80) });
          }
        }
      } else {
        log.info("ai", "discoverPageId Estratégia 1 pulada — sem token Meta");
      }

      // ── ESTRATÉGIA 2: Instagram oEmbed público ──
      if (results.length === 0) {
        tried.push("ig_oembed");
        try {
          const oembedUrl = `https://www.instagram.com/oembed?url=https://www.instagram.com/${raw}/&format=json`;
          const oembedRes = await fetch(oembedUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
            signal: AbortSignal.timeout(8000),
          });
          if (!oembedRes.ok) {
            log.info("ai", "discoverPageId Estratégia 2 HTTP falhou", { status: oembedRes.status });
          } else {
            const oembedData: any = await oembedRes.json();
            if (!oembedData.error && oembedData.author_name && token) {
              const fbUrl  = `https://graph.facebook.com/v20.0/${encodeURIComponent(oembedData.author_name)}?fields=id,name&access_token=${token}`;
              const fbRes  = await fetch(fbUrl, { signal: AbortSignal.timeout(8000) });
              const fbData: any = await fbRes.json();
              if (!fbData.error && fbData.id && /^\d+$/.test(fbData.id)) {
                results.push({ method: "ig_oembed_fb_page", pageId: fbData.id, pageName: fbData.name || oembedData.author_name, confidence: "high" });
                log.info("ai", "discoverPageId Estratégia 2 OK", { author: oembedData.author_name, pageId: fbData.id });
              }
            } else {
              log.info("ai", "discoverPageId Estratégia 2 sem author_name ou token", { hasAuthor: !!oembedData.author_name, hasToken: !!token });
            }
          }
        } catch (e: any) {
          log.info("ai", "discoverPageId Estratégia 2 erro", { message: e?.message?.slice(0, 80) });
        }
      }

      // ── ESTRATÉGIA 2.5: Ads Library — busca page_id por nome/handle ──
      if (token && results.length === 0) {
        tried.push("ads_library_search");
        const searchTerms = [...new Set([raw, rawSimple, companySlug, input.companyName?.toLowerCase().replace(/[^a-z0-9 ]/g, "") || ""])].filter(Boolean).slice(0, 3);
        for (const term of searchTerms) {
          if (results.length > 0) break;
          try {
            const adsUrl = `https://graph.facebook.com/v20.0/ads_archive?access_token=${token}&search_terms=${encodeURIComponent(term)}&ad_reached_countries=BR&ad_type=ALL&fields=page_id,page_name&limit=5`;
            const adsRes = await fetch(adsUrl, { signal: AbortSignal.timeout(8000) });
            const adsData: any = await adsRes.json();
            if (!adsData.error && Array.isArray(adsData.data) && adsData.data.length > 0) {
              // Pega o page_id mais relevante — prioriza match exato no nome
              const match = adsData.data.find((a: any) => {
                const pname = (a.page_name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                return pname === companySlug || pname === rawSimple || pname.includes(rawSimple);
              }) || adsData.data[0];
              if (match?.page_id && /^\d+$/.test(String(match.page_id))) {
                results.push({ method: "ads_library", pageId: String(match.page_id), pageName: match.page_name || term, confidence: "high" });
                log.info("ai", "discoverPageId Estratégia 2.5 OK", { term, pageId: match.page_id, pageName: match.page_name });
                break;
              }
            } else {
              log.info("ai", "discoverPageId Estratégia 2.5 sem resultado", { term, error: adsData.error?.message });
            }
          } catch (e: any) {
            log.info("ai", "discoverPageId Estratégia 2.5 erro", { term, message: e?.message?.slice(0, 80) });
          }
        }
      }

      // ── ESTRATÉGIA 3: Minhas páginas — token do usuário (match exato) ──
      if (token && results.length === 0) {
        tried.push("my_pages");
        try {
          const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?limit=50&access_token=${token}`;
          const pagesRes = await fetch(pagesUrl, { signal: AbortSignal.timeout(8000) });
          const pagesData: any = await pagesRes.json();
          if (!pagesData.error && Array.isArray(pagesData.data)) {
            const pages = pagesData.data;
            // Match exato ou parcial no slug da página
            const pageNames = pages.map((p: any) => ({ id: p.id, name: p.name, slug: (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "") }));
            log.info("ai", "discoverPageId Estratégia 3 páginas disponíveis", { pages: pageNames.map(p => p.name) });

            const exactMatch = pageNames.find(p =>
              p.slug === raw || p.slug === rawSimple || p.slug === companySlug || p.id === raw
            );
            // Match parcial: nome da página contém o handle ou vice-versa
            const partialMatch = !exactMatch && pageNames.find(p =>
              p.slug.includes(rawSimple) || rawSimple.includes(p.slug) ||
              p.slug.includes(companySlug) || companySlug.includes(p.slug)
            );
            const match = exactMatch || partialMatch;
            if (match) {
              const conf = exactMatch ? "high" : "medium";
              results.push({ method: "my_pages_exact", pageId: match.id, pageName: match.name, confidence: conf });
              log.info("ai", "discoverPageId Estratégia 3 OK", { pageId: match.id, name: match.name, exact: !!exactMatch });
            } else {
              log.info("ai", "discoverPageId Estratégia 3 sem match", { pagesCount: pages.length, slugs: pageNames.map(p => p.slug), handles: [raw, rawSimple, companySlug] });
            }
          } else {
            log.info("ai", "discoverPageId Estratégia 3 erro API", { error: pagesData.error?.message });
          }
        } catch (e: any) {
          log.info("ai", "discoverPageId Estratégia 3 erro", { message: e?.message?.slice(0, 80) });
        }
      }

      // ── ESTRATÉGIA 3.5: Graph API pages/search — busca por nome ──
      if (token && results.length === 0) {
        tried.push("graph_pages_search");
        const searchTerms = [...new Set([raw, input.companyName || ""])].filter(Boolean).slice(0, 2);
        for (const term of searchTerms) {
          if (results.length > 0) break;
          try {
            const url = `https://graph.facebook.com/v20.0/pages/search?q=${encodeURIComponent(term)}&fields=id,name,username&access_token=${token}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const d: any = await res.json();
            if (!d.error && Array.isArray(d.data) && d.data.length > 0) {
              // Prioriza match mais próximo pelo nome
              const termSlug = term.toLowerCase().replace(/[^a-z0-9]/g, "");
              const best = d.data.find((p: any) => {
                const s = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                return s === termSlug || s.includes(termSlug) || termSlug.includes(s);
              }) || d.data[0];
              if (best?.id && /^\d+$/.test(String(best.id))) {
                results.push({ method: "graph_pages_search", pageId: String(best.id), pageName: best.name || term, confidence: "medium" });
                log.info("ai", "discoverPageId Estratégia 3.5 OK", { term, pageId: best.id, name: best.name });
                break;
              }
            } else {
              log.info("ai", "discoverPageId Estratégia 3.5 sem resultado", { term, error: d.error?.message });
            }
          } catch (e: any) {
            log.info("ai", "discoverPageId Estratégia 3.5 erro", { term, message: e?.message?.slice(0, 80) });
          }
        }
      }

      // ── ESTRATÉGIA 4: Graph API search por slug variations ──
      if (token && results.length === 0) {
        tried.push("graph_search_slugs");
        const slugs = [...new Set([
          raw,
          rawSimple,
          companySlug,
          raw.replace(/[._-]/g, ""),
          raw.replace(/[._]/g, "-"),
        ])].filter(Boolean).slice(0, 4);

        for (const slug of slugs) {
          if (results.length > 0) break;
          try {
            const url  = `https://graph.facebook.com/v20.0/${encodeURIComponent(slug)}?fields=id,name&access_token=${token}`;
            const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
            const data: any = await res.json();
            if (!data.error && data.id && /^\d+$/.test(data.id)) {
              results.push({ method: "graph_slug_var", pageId: data.id, pageName: data.name || slug, confidence: "medium" });
              log.info("ai", "discoverPageId Estratégia 4 OK", { slug, pageId: data.id });
            }
          } catch {}
        }
        if (results.length === 0) {
          log.info("ai", "discoverPageId Estratégia 4 sem resultado", { slugsTried: slugs });
        }
      }

      // ── ESTRATÉGIA 5: Gemini — temperatura 0, regras rígidas ──
      if (results.length === 0) {
        tried.push("gemini");
        try {
          const geminiPrompt = `Você é especialista em marketing digital brasileiro.
Dado o handle de Instagram/Facebook: "${raw}"
Nome da empresa (se souber): "${input.companyName || raw}"

Retorne APENAS um JSON sem markdown:
{"pageId":"NUMERO_10A16_DIGITOS_OU_null","pageName":"NOME_OU_null","confidence":"high|medium|low","reason":"explicação"}

REGRAS:
- pageId deve ser um número REAL de 10-16 dígitos que você conhece com CERTEZA ABSOLUTA
- Se tiver qualquer dúvida, retorne null para pageId
- Nunca invente números`;

          const { gemini } = await import("../ai");
          const raw_resp = await gemini(geminiPrompt, { temperature: 0 });
          const clean    = raw_resp.replace(/\`\`\`json|\`\`\`/g, "").trim();
          const parsed   = JSON.parse(clean);

          log.info("ai", "discoverPageId gemini resultado", {
            raw,
            pageId:     parsed?.pageId,
            confidence: parsed?.confidence,
            reason:     parsed?.reason?.slice(0, 100),
          });

          if (parsed?.pageId && /^\d{10,16}$/.test(String(parsed.pageId))) {
            results.push({
              method:     "gemini",
              pageId:     String(parsed.pageId),
              pageName:   parsed.pageName || input.companyName || raw,
              confidence: parsed.confidence === "high" ? "high" : "low",
            });
          }
        } catch (e: any) {
          log.info("ai", "discoverPageId Estratégia 5 erro", { message: e?.message?.slice(0, 80) });
        }
      }

      const best = results.find(r => r.confidence === "high")   ||
                   results.find(r => r.confidence === "medium") ||
                   results[0] || null;

      log.info("ai", "discoverPageId v2 resultado", {
        handle: raw, found: !!best?.pageId,
        method: best?.method, pageId: best?.pageId,
        strategiesTried: tried.length,
        allMethods: tried,
        resultsFound: results.length,
      });

      return {
        found:           !!best?.pageId,
        pageId:          best?.pageId    || null,
        pageName:        best?.pageName  || null,
        method:          best?.method    || null,
        confidence:      best?.confidence || null,
        allResults:      results,
        instagramHandle: `@${raw}`,
      };
    })
});

// ============ MARKET ROUTER ============
const marketRouter = router({
  get: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ input }) => db.getMarketAnalysis(input.projectId)),
  generate: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      const { generateMarketAnalysis } = await import("../ai");
      return generateMarketAnalysis(input.projectId);
    }),
});

// ============ CAMPAIGNS ROUTER ============
const campaignsRouter = router({
  list: protectedProcedure.input(z.object({ projectId: z.number() })).query(({ input }) => db.getCampaignsByProjectId(input.projectId)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getCampaignById(input.id)),
  create: protectedProcedure
    .input(z.object({ projectId: z.number(), name: z.string(), objective: z.string().optional(), platform: z.string() }))
    .mutation(({ input }) => db.createCampaign(input as any)),

  // -- Intelligent Matching Engine -------------------------------------------
  matchScore: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      objective: z.string(),
      platform:  z.string(),
      budget:    z.number(),
      duration:  z.number(),
    }))
    .mutation(async ({ input }) => {
      const { computeMatchScore } = await import("../matchingEngine.js");
      return computeMatchScore({
        projectId: input.projectId,
        objective: input.objective,
        platform: input.platform,
        budget: input.budget,
        duration: input.duration,
      });
    }),

  // -- Edição manual de criativo ---------------------------------------------
  updateCreative: protectedProcedure
    .input(updateCreativeInputSchema)
    .mutation(async ({ input }) => {
      const campaign = await db.getCampaignById(input.campaignId) as any;
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const creatives = JSON.parse(campaign.creatives || "[]") as CampaignCreative[];
      if (!creatives[input.index]) throw new TRPCError({ code: "BAD_REQUEST", message: "Criativo não encontrado" });
      const currentCreative = (creatives[input.index] ?? {}) as CampaignCreative;
      const nextCreative: CampaignCreative = {
        ...currentCreative,
        ...(input.headline !== undefined ? { headline: input.headline } : {}),
        ...(input.copy !== undefined ? { copy: input.copy } : {}),
        ...(input.cta !== undefined ? { cta: input.cta } : {}),
        ...(input.hook !== undefined ? { hook: input.hook } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
      };
      Object.assign(nextCreative, scoreCreative(nextCreative));
      nextCreative._edited = true;
      creatives[input.index] = syncCreativeTextToV2(nextCreative);
      await db.updateCampaignField(input.campaignId, "creatives", JSON.stringify(creatives));
      return { ok: true, creatives };
    }),

  updateCreativeImage: protectedProcedure
    .input(updateCreativeImageInputSchema)
    .mutation(async ({ input }) => {
      if (!input.imageUrl && !input.imageHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe imageUrl ou imageHash para atualizar a imagem do criativo." });
      }

      const campaign = await db.getCampaignById(input.campaignId) as any;
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });

      const creatives = JSON.parse(campaign.creatives || "[]") as CampaignCreative[];
      const creative = creatives[input.creativeIndex] as CampaignCreative;
      if (!creative) throw new TRPCError({ code: "BAD_REQUEST", message: "Criativo não encontrado" });

      const urlKey = input.format === "stories"
        ? "storyImageUrl"
        : input.format === "square"
          ? "squareImageUrl"
          : "feedImageUrl";
      const hashKey = input.format === "stories"
        ? "storyImageHash"
        : input.format === "square"
          ? "squareImageHash"
          : "feedImageHash";

      if (input.imageUrl) creative[urlKey] = input.imageUrl;
      if (input.imageHash) creative[hashKey] = input.imageHash;
      creative.imageUpdatedAt = new Date().toISOString();
      creative.imageProviderUsed = input.imageHash ? "meta_manual_upload" : "manual_url";
      creative.imageGenerationReason = null;
      creative.imageGenerationWarnings = [];
      creative.manualImageOverride = true;

      creatives[input.creativeIndex] = syncCreativeImageToV2(creative, input.format, {
        imageUrl: input.imageUrl ?? null,
        imageHash: input.imageHash ?? null,
      });

      await db.updateCampaignField(input.campaignId, "creatives", JSON.stringify(creatives));
      return { ok: true, creative: creatives[input.creativeIndex], imageUrl: creative[urlKey] || null, imageHash: creative[hashKey] || null };
    }),

  regenerateCreativeImage: protectedProcedure
    .input(regenerateCreativeImageInputSchema)
    .mutation(async ({ input }) => {
      const campaign = await db.getCampaignById(input.campaignId) as any;
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });

      const creatives = JSON.parse(campaign.creatives || "[]") as CampaignCreative[];
      const creative = creatives[input.creativeIndex] as CampaignCreative;
      if (!creative) throw new TRPCError({ code: "BAD_REQUEST", message: "Criativo não encontrado" });

      const provider = ((process.env.IMAGE_PROVIDER || "mock").toLowerCase() as ImageProvider);
      const apiKey = provider === "heygen"
        ? process.env.HEYGEN_API_KEY || ""
        : provider === "huggingface"
          ? process.env.HUGGINGFACE_API_KEY || ""
          : "";
      const normalizedProvider: ImageProvider = provider === "huggingface" || provider === "heygen" ? provider : "mock";
      const diagnostics = getImageGenerationDiagnostics(normalizedProvider);
      const imageUrl = await generateAdImage(
        creative,
        campaign.name || "segmento geral",
        campaign.objective || "traffic",
        { provider: normalizedProvider, apiKey },
        input.format as CreativeImageFormat,
      );

      if (!imageUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar imagem" });

      if (input.format === "stories") creatives[input.creativeIndex].storyImageUrl = imageUrl;
      if (input.format === "feed") creatives[input.creativeIndex].feedImageUrl = imageUrl;
      if (input.format === "square") creatives[input.creativeIndex].squareImageUrl = imageUrl;
      creatives[input.creativeIndex].imageUpdatedAt = new Date().toISOString();
      creatives[input.creativeIndex].imageProviderUsed = diagnostics.provider;
      creatives[input.creativeIndex].imageGenerationReason = diagnostics.reason;
      creatives[input.creativeIndex].imageGenerationWarnings = diagnostics.warnings;

      creatives[input.creativeIndex] = syncCreativeImageToV2(creatives[input.creativeIndex], input.format, {
        imageUrl,
        imageHash: null,
      });

      await db.updateCampaignField(input.campaignId, "creatives", JSON.stringify(creatives));
      return { ok: true, imageUrl, format: input.format, creative: creatives[input.creativeIndex], diagnostics };
    }),

  // -- Edição manual de conjunto de anúncios --------------------------------
  updateAdSet: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      index:      z.number(),
      name:       z.string().optional(),
      audience:   z.string().optional(),
      budget:     z.string().optional(),
      objective:  z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const campaign = await db.getCampaignById(input.campaignId) as any;
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const adSets = JSON.parse(campaign.adSets || "[]");
      if (!adSets[input.index]) throw new TRPCError({ code: "BAD_REQUEST", message: "Conjunto não encontrado" });
      if (input.name      !== undefined) adSets[input.index].name      = input.name;
      if (input.audience  !== undefined) adSets[input.index].audience  = input.audience;
      if (input.budget    !== undefined) adSets[input.index].budget    = input.budget;
      if (input.objective !== undefined) adSets[input.index].objective = input.objective;
      adSets[input.index]._edited = true;
      await db.updateCampaignField(input.campaignId, "adSets", JSON.stringify(adSets));
      return { ok: true, adSets };
    }),

  // -- Regenerar parte específica da campanha -------------------------------
  regeneratePart: protectedProcedure
    .input(z.object({
      campaignId:  z.number(),
      projectId:   z.number(),
      part:        z.enum(["creatives", "adSets", "hooks", "abTests", "copies"]),
      extraContext: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const campaign = await db.getCampaignById(input.campaignId) as any;
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const { generateCampaignPart } = await import("../ai");
      const result = await generateCampaignPart({
        campaignId:   input.campaignId,
        projectId:    input.projectId,
        part:         input.part,
        campaign,
        extraContext: input.extraContext,
      });
      return result;
    }),

  generate: protectedProcedure
    .input(z.object({
      projectId:       z.number(),
      name:            z.string(),
      objective:       z.string(),
      platform:        z.string(),
      budget:          z.number(),
      duration:        z.number(),
      extraContext:    z.string().optional(),
      // Segmentação do CampaignBuilder
      ageMin:          z.number().min(13).max(65).optional(),
      ageMax:          z.number().min(18).max(65).optional(),
      regions:         z.array(z.string()).optional(),
      countries:       z.array(z.string()).optional(),
      locationMode:    z.enum(["brasil","paises","raio"]).optional(),
      geoCity:         z.string().optional(),
      geoRadius:       z.number().optional(),
      mediaFormat:     z.string().optional(),
      audienceProfile: z.string().optional(),
      leadForm:        z.any().optional(),
      segment:         z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const check = await db.checkPlanLimit(ctx.user.id, "campaigns", { projectId: input.projectId });
      if (!check.allowed) throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
      const { generateCampaign } = await import("../ai");
      // Consolida contexto de segmentação no extraContext
      const segmentContext = [
        input.extraContext || "",
        (input.regions?.length)   ? "Regioes: " + input.regions.join(", ")                         : "",
        (input.countries?.length) ? "Paises: "  + input.countries.join(", ")                       : "",
        input.geoCity             ? "Raio de "  + (input.geoRadius || 15) + "km em " + input.geoCity : "",
        (input.ageMin && input.ageMax) ? "Faixa etaria: " + input.ageMin + "-" + input.ageMax + " anos" : "",
        (input.mediaFormat && input.mediaFormat !== "mixed") ? "Formato de midia: " + input.mediaFormat : "",
        (input.audienceProfile && input.audienceProfile !== "geral") ? "Perfil do publico: " + input.audienceProfile : "",
        input.segment ? "Segmento: " + input.segment : "",
      ].filter(Boolean).join(". ");
      return generateCampaign({
        projectId:    input.projectId,
        name:         input.name,
        objective:    input.objective,
        platform:     input.platform,
        budget:       input.budget,
        duration:     input.duration,
        extraContext: segmentContext,
        ageMin:       input.ageMin,
        ageMax:       input.ageMax,
        regions:      input.regions,
        countries:    input.countries,
        locationMode: input.locationMode,
        geoCity:      input.geoCity,
        geoRadius:    input.geoRadius,
        mediaFormat:  input.mediaFormat,
        leadForm:     input.leadForm,
      } as any);
    }),

  publishToMeta: protectedProcedure
    .input(publishToMetaInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Verificar se plano permite integração Meta
      const metaCheck = await db.checkPlanLimit(ctx.user.id, "meta");
      if (!metaCheck.allowed) throw new TRPCError({ code: "FORBIDDEN", message: metaCheck.reason });

      function normalizeAccountId(id: string) {
        return id.startsWith("act_") ? id : `act_${id}`;
      }
      function toOutcomeObjective(obj: string) {
        switch ((obj || "").toLowerCase()) {
          case "leads":      return "OUTCOME_LEADS";
          case "sales":      return "OUTCOME_SALES";
          case "engagement": return "OUTCOME_ENGAGEMENT";
          case "branding":   return "OUTCOME_AWARENESS";
          case "traffic":    return "OUTCOME_TRAFFIC";
          default:           return "OUTCOME_TRAFFIC";
        }
      }
      function toOptimizationGoal(obj: string, dest: string, pixelId?: string) {
        const o = (obj || "").toLowerCase();
        if (o === "leads")      return "LEAD_GENERATION";
        // OUTCOME_SALES: com pixel → OFFSITE_CONVERSIONS; sem pixel → LANDING_PAGE_VIEWS
        if (o === "sales")      return pixelId ? "OFFSITE_CONVERSIONS" : "LANDING_PAGE_VIEWS";
        if (o === "engagement") return "ENGAGED_USERS";  // POST_ENGAGEMENT causa erro 2490408
        if (o === "branding")   return "REACH";
        if (o === "traffic")    return "LINK_CLICKS";
        return "LINK_CLICKS";
      }

      // Para OUTCOME_SALES sem pixel, usamos OUTCOME_TRAFFIC internamente
      // pois OUTCOME_SALES + LANDING_PAGE_VIEWS pode ainda falhar sem URL válida
      function resolveObjectiveAndGoal(obj: string, pixelId?: string, hasUrl?: boolean): { campaignObj: string; optimizationGoal: string } {
        const o = (obj || "").toLowerCase();
        if (o === "sales" && !pixelId) {
          // Sem pixel: usa OUTCOME_TRAFFIC + LANDING_PAGE_VIEWS (sempre funciona)
          return { campaignObj: "OUTCOME_TRAFFIC", optimizationGoal: "LANDING_PAGE_VIEWS" };
        }
        return {
          campaignObj: toOutcomeObjective(obj),
          optimizationGoal: toOptimizationGoal(obj, "", pixelId),
        };
      }
      function toBillingEvent(obj: string) {
        const o = (obj || "").toLowerCase();
        // billing_event IMPRESSIONS para todos (POST_ENGAGEMENT causa erro Meta 1815117)
        return "IMPRESSIONS";
        if (o === "branding")   return "IMPRESSIONS";
        if (o === "leads")      return "IMPRESSIONS";      // Lead Generation usa IMPRESSIONS
        return "IMPRESSIONS";
      }
      function normalizeDestinationUrl(raw?: string | null): string | undefined {
        const value = String(raw || "").trim();
        if (!value) return undefined;

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
          if (!["http:", "https:"].includes(url.protocol)) return undefined;
          return url.toString();
        } catch {
          return undefined;
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
      const BR_STATE_NAMES: Record<string, string> = {
        AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
        DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
        MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
        PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
        RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
        SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
      };
      async function resolveBrazilRegionKeys(userToken: string, ufs: string[]): Promise<number[]> {
        const uniqueUfs = [...new Set((ufs || []).map((uf) => String(uf || "").trim().toUpperCase()).filter(Boolean))];
        if (uniqueUfs.length === 0) return [];

        const results = await Promise.all(uniqueUfs.map(async (uf) => {
          const stateName = BR_STATE_NAMES[uf];
          if (!stateName) return null;
          const params = new URLSearchParams({
            type: "adgeolocation",
            q: stateName,
            access_token: userToken,
          });
          params.set("location_types", '["region"]');
          params.set("countries", '["BR"]');

          const res = await fetch(`https://graph.facebook.com/v19.0/search?${params.toString()}`, {
            signal: AbortSignal.timeout(10000),
          });
          const data: any = await res.json().catch(() => ({}));
          if (!res.ok || data?.error) {
            log.warn("meta", "Falha ao resolver regiao BR", { uf, message: data?.error?.message || `HTTP ${res.status}` });
            return null;
          }

          const exact = (data?.data || []).find((item: any) => {
            const itemName = String(item?.name || "").trim().toLowerCase();
            const itemType = String(item?.type || "").trim().toLowerCase();
            const countryCode = String(item?.country_code || item?.country || "").trim().toUpperCase();
            return itemType === "region" && itemName === stateName.trim().toLowerCase() && (!countryCode || countryCode === "BR");
          }) || (data?.data || []).find((item: any) => String(item?.type || "").trim().toLowerCase() === "region");

          const numericKey = Number(exact?.key);
          return Number.isFinite(numericKey) ? numericKey : null;
        }));

        return results.filter((value): value is number => Number.isFinite(value));
      }
      function resolveAutoDestination(profile: any, options?: { preferWhatsApp?: boolean }): { url?: string; source?: string } {
        const website = normalizeDestinationUrl(profile?.websiteUrl);

        const rawSocial = String(profile?.socialLinks || "").trim();
        let social: any = {};
        try { social = JSON.parse(rawSocial || "{}"); } catch {}

        const textSource = rawSocial;
        let whatsappUrl: string | undefined;
        const whatsappCandidates = [
          social?.whatsappUrl,
          social?.whatsapp,
          textSource.match(/https?:\/\/wa\.me\/[^\s,;]+/i)?.[0],
          textSource.match(/https?:\/\/api\.whatsapp\.com\/[^\s,;]+/i)?.[0],
          textSource.match(/(?:whatsapp|telefone|fone|celular|contato)\s*[:\-]?\s*(\+?\d[\d\s()\-]{7,})/i)?.[1],
          textSource.match(/(\+?\d[\d\s()\-]{7,})/)?.[1],
        ].filter(Boolean);
        for (const candidate of whatsappCandidates) {
          const whatsapp = /^https?:\/\//i.test(String(candidate))
            ? normalizeDestinationUrl(String(candidate))
            : normalizeDestinationUrl(`https://wa.me/${String(candidate).replace(/\D/g, "")}`);
          if (whatsapp) {
            whatsappUrl = whatsapp;
            break;
          }
        }

        if (options?.preferWhatsApp && whatsappUrl) return { url: whatsappUrl, source: "whatsapp" };
        if (website) return { url: website, source: "websiteUrl" };
        if (whatsappUrl) return { url: whatsappUrl, source: "whatsapp" };

        const instagramCandidates = [
          social?.instagramUrl,
          social?.instagram,
          textSource.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s,;]+/i)?.[0],
          textSource.match(/instagram\s*[:\-]?\s*@?([a-z0-9._]+)/i)?.[1],
          textSource.match(/@([a-z0-9._]{3,})/i)?.[1],
        ].filter(Boolean);
        for (const candidate of instagramCandidates) {
          const instagram = /^https?:\/\//i.test(String(candidate))
            ? normalizeDestinationUrl(String(candidate))
            : normalizeDestinationUrl(`https://instagram.com/${String(candidate).replace(/^@/, "")}`);
          if (instagram) return { url: instagram, source: "instagram" };
        }

        const facebookPage = normalizeDestinationUrl(profile?.facebookPageUrl);
        if (facebookPage) return { url: facebookPage, source: "facebookPageUrl" };

        return {};
      }
      async function metaPost<T>(path: string, body: Record<string, any>, tag: string): Promise<T> {
        const res = await fetch(`https://graph.facebook.com/v19.0/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          const rawMessage = data?.error?.message || `HTTP ${res.status}`;
          const userMessage = data?.error?.error_user_msg || "";
          const msg = userMessage || rawMessage;
          log.error("meta", tag, {
            status: res.status,
            message: rawMessage,
            error_code: data?.error?.code,
            error_subcode: data?.error?.error_subcode,
            error_user_msg: data?.error?.error_user_msg,
            fbtrace_id: data?.error?.fbtrace_id,
            full_error: JSON.stringify(data?.error),
          });
          // Mensagens de erro amigáveis para erros conhecidos
          const subcode = data?.error?.error_subcode;
          const errorCode = data?.error?.code;
          let friendlyMsg = msg;

          if (subcode === 1487246) {
            friendlyMsg = "O número de WhatsApp informado não está vinculado à sua conta Meta Business. Acesse business.facebook.com → Configurações → Contas do WhatsApp e vincule o número antes de publicar.";
          } else if (subcode === 1443050 || msg.includes("video_id") || msg.includes("link_data")) {
            friendlyMsg = "Erro no formato do criativo de vídeo. O vídeo foi enviado corretamente mas houve conflito na estrutura do anúncio. Tente publicar novamente — o sistema foi corrigido.";
          } else if (errorCode === 100 && msg.includes("Invalid parameter")) {
            friendlyMsg = `Parâmetro inválido na Meta API: ${userMessage || rawMessage}`;
          }

          throw new TRPCError({ code: "BAD_REQUEST", message: `Meta ${tag}: ${friendlyMsg}` });
        }
        return data as T;
      }

      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada. Acesse Configurações → Meta Ads." });
      }
      const token     = (integration as any).accessToken as string;
      const accountId = normalizeAccountId((integration as any).adAccountId as string || "");
      if (accountId === "act_") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ID da conta de anúncios não configurado." });
      }

      const campaign = await db.getCampaignById(input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
      const clientProfile = await db.getClientProfile(input.projectId);
      log.info("meta", "clientProfile debug", {
        projectId: input.projectId,
        hasProfile: !!clientProfile,
        websiteUrl: (clientProfile as any)?.websiteUrl || null,
        socialLinks: (clientProfile as any)?.socialLinks ? "present" : null,
        linkUrl: input.linkUrl || null,
      });
      const c = campaign as any;

      // Marca como processing antes de iniciar
      await db.updateCampaign(input.campaignId, { publishStatus: "processing" } as any);

      function parseJson(s: string | null) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
      try {
      const adSets    = parseJson(c.adSets);
      const creatives = parseJson(c.creatives);
      const extra     = parseJson(c.aiResponse);
      const adSet     = Array.isArray(adSets) ? (adSets[input.adSetIndex] ?? adSets[0]) : null;
      const creativeList = Array.isArray(creatives) ? creatives as CampaignCreative[] : [];
      const manualPlacements = input.placementMode === "manual" ? (input.placements || []) : [];
      const storyLikePlacements = manualPlacements.filter((placement: string) => /(story|reels)/i.test(placement));
      const placementKey: "feed" | "stories" | "reels" = storyLikePlacements.length > 0 && storyLikePlacements.length === manualPlacements.length
        ? (storyLikePlacements.some((placement: string) => /reels/i.test(placement)) ? "reels" : "stories")
        : "feed";
      const objective = c.objective || "traffic";
      const adCopy = buildAdCopy(c, { placement: placementKey, objective });
      const creative = placementKey === "stories"
        ? (adCopy as any).stories?.creative || creativeList[0]
        : placementKey === "reels"
          ? (adCopy as any).reels?.creative || (adCopy as any).stories?.creative || creativeList[0]
          : (adCopy as any).feed?.creative || creativeList[0];
      const creativeScore = creative?.finalScore ? {
        hookStrength: creative.hookStrength,
        clarity: creative.clarity,
        urgency: creative.urgency,
        specificity: creative.specificity,
        complianceRisk: creative.complianceRisk,
        finalScore: creative.finalScore,
        recommendations: creative.recommendations || [],
      } : scoreCreative(creative || {});
      const publishWarnings: string[] = [];
      if ((creativeScore?.finalScore || 0) < 60) {
        publishWarnings.push(`Criativo com score ${creativeScore.finalScore}/100. Revise antes de escalar.`);
      }
      const selectedCreativeRaw = creative as CampaignCreative | null;
      const selectedCreative = selectedCreativeRaw
        ? mergeCreativeWithProjectedLegacy(selectedCreativeRaw)
        : null;
      const preferredCreativeFormat: CreativeFormat = placementKey === "stories" || placementKey === "reels"
        ? "stories"
        : "feed";
      const fallbackPublishMedia = selectedCreative
        ? buildPublishMediaFromCreative(selectedCreative, preferredCreativeFormat)
        : null;
      const selectedGeneratedImageUrl = placementKey === "stories" || placementKey === "reels"
        ? selectedCreative?.storyImageUrl || null
        : selectedCreative?.feedImageUrl || selectedCreative?.squareImageUrl || selectedCreative?.storyImageUrl;
      const selectedMessage = placementKey === "stories" || placementKey === "reels"
        ? (((adCopy as any).stories?.script || []).join("\n") || adCopy.message)
        : adCopy.feed.message;
      const selectedHeadline = placementKey === "stories" || placementKey === "reels"
        ? ((adCopy as any).stories?.hook || adCopy.feed.headline || c.name)
        : adCopy.feed.headline;
      const selectedDescription = placementKey === "stories" || placementKey === "reels"
        ? (((adCopy as any).stories?.script || [])[2] || adCopy.feed.copy || "")
        : adCopy.feed.copy;
      log.info("meta", "adCopy gerado", {
        hasRealCopy: adCopy.hasRealCopy,
        placementKey,
        messagePreview: selectedMessage.slice(0, 60),
        headline: selectedHeadline.slice(0, 40),
        creativeScore: creativeScore?.finalScore || null,
      });
      const budgetDaily = c.suggestedBudgetDaily ?? Math.round((c.suggestedBudgetMonthly ?? 1000) / 30);
      const endTime = new Date(Date.now() + (c.durationDays ?? 30) * 24 * 60 * 60 * 1000).toISOString();
      const { campaignObj: resolvedCampaignObj, optimizationGoal: resolvedOptGoal } = resolveObjectiveAndGoal(objective, input.pixelId);
      const dest = input.destination;
      const preferredCtaText = placementKey === "stories" || placementKey === "reels"
        ? String((adCopy as any).stories?.cta || adCopy.feed.cta || "")
        : String(adCopy.feed.cta || "");
      const preferWhatsAppDestination = /whats/i.test(preferredCtaText) || ["engagement", "leads"].includes(String(objective || "").toLowerCase());
      const manualLink = dest === "lead_form" ? undefined : normalizeDestinationUrl(input.linkUrl);
      const autoDestination = dest === "lead_form" ? {} : resolveAutoDestination(clientProfile, { preferWhatsApp: preferWhatsAppDestination });
      const pageFallback = dest === "lead_form" || !input.pageId ? undefined : normalizeDestinationUrl(`https://www.facebook.com/${input.pageId}`);
      const effectiveLink = manualLink || autoDestination.url || pageFallback;
      const destinationSource = manualLink
        ? "input.linkUrl"
        : autoDestination.source || (pageFallback ? "pageId_facebook_page" : undefined);
      const whatsappDestination = dest === "lead_form" ? {} : extractWhatsAppDetails(effectiveLink);
      let isWhatsAppDestination = !!whatsappDestination.link;

      // ── Validação prévia: verifica se número WhatsApp está vinculado na conta ──
      if (isWhatsAppDestination && whatsappDestination.phone && input.pageId) {
        try {
          const waCheckRes = await fetch(
            `https://graph.facebook.com/v19.0/${input.pageId}?fields=whatsapp_connected_id&access_token=${token}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const waCheckData: any = await waCheckRes.json().catch(() => ({}));
          const connectedPhone = waCheckData?.whatsapp_connected_id
            ? String(waCheckData.whatsapp_connected_id).replace(/\D/g, "")
            : null;
          const requestedPhone = whatsappDestination.phone.replace(/\D/g, "");

          if (connectedPhone && !requestedPhone.endsWith(connectedPhone) && !connectedPhone.endsWith(requestedPhone)) {
            log.warn("meta", "WhatsApp não vinculado — fallback para website", {
              requested: requestedPhone, connected: connectedPhone, pageId: input.pageId,
            });
            // Fallback: usa site do cliente ou página do Facebook
            isWhatsAppDestination = false;
            (whatsappDestination as any).link = null;
          } else if (!connectedPhone) {
            log.warn("meta", "Página sem WhatsApp vinculado — fallback para website", { pageId: input.pageId });
            isWhatsAppDestination = false;
            (whatsappDestination as any).link = null;
          }
        } catch {
          // Se verificação falhar, tenta publicar mesmo assim
          log.warn("meta", "Falha ao verificar WhatsApp — tentando publicar com WhatsApp");
        }
      }

      const finalLink = isWhatsAppDestination
        ? whatsappDestination.link!
        : (effectiveLink || `https://www.facebook.com/${input.pageId}`);
      const adSetOptimizationGoal = isWhatsAppDestination && String(objective || "").toLowerCase() === "engagement"
        ? "CONVERSATIONS"
        : resolvedOptGoal;
      const resolvedBrazilRegionKeys = input.locationMode === "brasil" && (input.regions?.length || 0) > 0
        ? await resolveBrazilRegionKeys(token, input.regions || [])
        : [];

      // 1. Campaign
      const campaignObjective = resolvedCampaignObj;
      const campaignName = (extra?.campaignName || c.name)
        .slice(0, 100)
        .replace(/_/g, " ")
        .replace(/[^\w\s\-áéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      log.info("meta", "Campaign payload debug", {
        accountId,
        objective: campaignObjective,
        name: campaignName,
        tokenPrefix: token.slice(0, 20)
      });

      const campData = await metaPost<any>(`${accountId}/campaigns`, {
        name:                  campaignName,
        objective:             campaignObjective,
        status:                "PAUSED",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
        access_token:          token,
      }, "Campaign");
      const metaCampaignId = campData.id;

      // 2. Ad Set
      const adSetName = (adSet?.name || `${c.name} — Conjunto 1`)
        .slice(0, 100)
        .replace(/_/g, " ")
        .replace(/[^\w\s\-áéíóúàèìòùâêîôûãõçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const adSetData = await metaPost<any>(`${accountId}/adsets`, {
        name:              adSetName,
        campaign_id:       metaCampaignId,
        billing_event:     toBillingEvent(objective),
        optimization_goal: adSetOptimizationGoal,
        bid_strategy:      "LOWEST_COST_WITHOUT_CAP",
        daily_budget:      budgetDaily * 100,
        end_time:          endTime,
        ...(isWhatsAppDestination ? { destination_type: "WHATSAPP" } : {}),
        targeting: {
          age_min: input.ageMin ?? 18,
          age_max: input.ageMax ?? 65,
          targeting_automation: { advantage_audience: 0 },
          geo_locations: (() => {
            const mode = input.locationMode || (input.regions?.length ? "brasil" : "brasil");
            // Modo: países internacionais
            if (mode === "paises" && input.countries && input.countries.length > 0) {
              return { countries: input.countries };
            }
            // Modo: raio por cidade (custom_locations)
            if (mode === "raio" && input.geoCity) {
              return {
                custom_locations: [{
                  address_string: input.geoCity,
                  radius:         input.geoRadius || 15,
                  distance_unit:  "kilometer",
                }],
              };
            }
            // Modo: estados do Brasil
            if (input.regions && input.regions.length > 0) {
              if (resolvedBrazilRegionKeys.length === 0) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `Não foi possível resolver os estados selecionados (${input.regions.join(", ")}) para o targeting da Meta.`,
                });
              }
              return { regions: resolvedBrazilRegionKeys.map((key) => ({ key })) };
            }
            // Padrão: Brasil todo
            return { countries: ["BR"] };
          })(),
          // Placements selecionados pelo usuário (adapter Meta)
          ...((): object => {
            if (!input.placements || input.placements.length === 0 || input.placementMode === "auto") {
              // Auto: Advantage+ Placements (Meta escolhe)
              // device_platforms obrigatorio para evitar erro #1885366
              return { device_platforms: ["mobile", "desktop"] };
            }
            // Manual: mapeia IDs internos → publisher_platforms + positions Meta API
            const fbPositions:  string[] = [];
            const igPositions:  string[] = [];
            const audNetPositions: string[] = [];
            const publishers   = new Set<string>();

            const PLACEMENT_MAP: Record<string, { pub: string; pos: string }> = {
              fb_feed:         { pub: "facebook",         pos: "feed" },
              fb_story:        { pub: "facebook",         pos: "story" },
              fb_reels:        { pub: "facebook",         pos: "reels" },
              fb_instream:     { pub: "facebook",         pos: "instream_video" },
              fb_marketplace:  { pub: "facebook",         pos: "marketplace" },
              fb_search:       { pub: "facebook",         pos: "search" },
              fb_right_column: { pub: "facebook",         pos: "right_hand_column" },
              fb_audience_net: { pub: "audience_network", pos: "classic" },
              ig_feed:         { pub: "instagram",        pos: "stream" },
              ig_story:        { pub: "instagram",        pos: "story" },
              ig_reels:        { pub: "instagram",        pos: "reels" },
              ig_explore:      { pub: "instagram",        pos: "explore" },
              ig_shop:         { pub: "instagram",        pos: "shop" },
            };

            input.placements!.forEach(id => {
              const map = PLACEMENT_MAP[id];
              if (!map) return;
              publishers.add(map.pub);
              if (map.pub === "facebook")         fbPositions.push(map.pos);
              if (map.pub === "instagram")        igPositions.push(map.pos);
              if (map.pub === "audience_network") audNetPositions.push(map.pos);
            });

            if (publishers.size === 0) return {};

            return {
              publisher_platforms:             Array.from(publishers),
              ...(fbPositions.length  > 0 ? { facebook_positions:         fbPositions }  : {}),
              ...(igPositions.length  > 0 ? { instagram_positions:        igPositions }  : {}),
              ...(audNetPositions.length > 0 ? { audience_network_positions: audNetPositions } : {}),
            };
          })(),
        },
        // promoted_object obrigatório para OUTCOME_LEADS e OUTCOME_SALES
        ...((["leads","sales","engagement"].includes(objective) || isWhatsAppDestination) && input.pageId ? {
          promoted_object: isWhatsAppDestination
            ? {
                page_id: input.pageId,
                ...(whatsappDestination.phone ? { whatsapp_phone_number: whatsappDestination.phone } : {}),
              }
            : input.pixelId && objective === "sales"
              ? { page_id: input.pageId, pixel_id: input.pixelId, custom_event_type: "PURCHASE" }
              : { page_id: input.pageId }
        } : {}),
        status:            "PAUSED",
        access_token:      token,
      }, "AdSet");
      const metaAdSetId = adSetData.id;

      // 3. Ad Creative
      const creativeName = `${c.name} — Criativo`.slice(0, 100);
      const VALID_CTAS = ["LEARN_MORE","SIGN_UP","CONTACT_US","APPLY_NOW","GET_QUOTE","BOOK_NOW","SHOP_NOW","SUBSCRIBE","DOWNLOAD","WATCH_VIDEO","CALL_NOW","WHATSAPP_MESSAGE","MESSAGE_PAGE","ORDER_NOW","GET_IN_TOUCH","INQUIRE_NOW","MAKE_AN_APPOINTMENT","ASK_ABOUT_SERVICES","BOOK_A_CONSULTATION","GET_A_QUOTE","BUY_NOW","GET_OFFER"];
      const baseCtaType = VALID_CTAS.includes(preferredCtaText) ? preferredCtaText : "LEARN_MORE";
      const ctaType = isWhatsAppDestination ? "WHATSAPP_MESSAGE" : baseCtaType;
      const ctaValue = isWhatsAppDestination ? { app_destination: "WHATSAPP" } : { link: finalLink };
      const selectedGeneratedImageHash = placementKey === "stories" || placementKey === "reels"
        ? selectedCreative?.storyImageHash || null
        : selectedCreative?.feedImageHash || selectedCreative?.squareImageHash || selectedCreative?.storyImageHash;
      const effectiveVideoId = input.videoId ?? fallbackPublishMedia?.videoId ?? null;
      const effectiveImageHashes = input.imageHashes?.length && input.imageHashes.length >= 2
        ? input.imageHashes
        : fallbackPublishMedia?.imageHashes ?? null;
      const effectiveImageUrls = input.imageUrls?.length && input.imageUrls.length >= 2
        ? input.imageUrls
        : fallbackPublishMedia?.imageUrls ?? null;
      const hasExplicitUploadedMedia = !!input.videoId || !!input.imageHash || !!input.imageUrl || !!(input.imageHashes?.length) || !!(input.imageUrls?.length);
      const hasDedicatedStoryMedia = !!selectedCreative?.storyImageHash || !!selectedCreative?.storyImageUrl;
      const effectiveImageHash = input.imageHash ?? (!effectiveImageHashes && !effectiveVideoId
        ? ((placementKey === "stories" || placementKey === "reels")
            ? (selectedGeneratedImageHash ?? null)
            : (fallbackPublishMedia?.imageHash ?? selectedGeneratedImageHash ?? null))
        : null);
      const effectiveImageUrl = input.imageUrl ?? (!effectiveImageHashes && !effectiveImageHash && !effectiveVideoId
        ? ((placementKey === "stories" || placementKey === "reels")
            ? (selectedGeneratedImageUrl ?? null)
            : (fallbackPublishMedia?.imageUrl ?? selectedGeneratedImageUrl ?? null))
        : null);
      const resolvedImageHash = effectiveImageHash;
      const resolvedImageUrl = effectiveImageUrl;

      // Stories/Reels sem mídia dedicada: publica com mídia de feed disponível
      // (aviso no frontend — não bloqueia)
      if ((placementKey === "stories" || placementKey === "reels") && !hasExplicitUploadedMedia && !hasDedicatedStoryMedia && !effectiveVideoId) {
        log.warn("meta", "Stories/Reels sem mídia 9:16 dedicada — usando mídia de feed como fallback", {
          campaignId: input.campaignId, placementKey,
          hasImage: !!(resolvedImageHash || resolvedImageUrl),
        });
        // Continua sem lançar erro
      }

      if (!effectiveVideoId && !effectiveImageHash && !effectiveImageUrl && !(effectiveImageHashes?.length) && !(effectiveImageUrls?.length)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nenhuma mídia disponível para publicação. Faça upload de imagem/vídeo ou gere um criativo com mídia válida.",
        });
      }

      // Monta link_data ou lead_gen_data dependendo do destino
      let storySpec: any;
      let carouselHashes: string[] | null = null;
      let carouselUrls: string[] | null = null;
      let isCarousel = false;

      function validateMetaImageUrl(url: string) {
        const blockedDomains = ["google.com", "googleapis.com", "gstatic.com", "googleusercontent.com",
          "facebook.com", "fbcdn.net", "localhost", "127.0.0.1"];
        const urlLower = url.toLowerCase();
        const isBlocked = blockedDomains.some(d => urlLower.includes(d));
        const isValidHttps = urlLower.startsWith("https://");
        if (isBlocked || !isValidHttps) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `URL de imagem inválida: "${url}". Use uma imagem hospedada em HTTPS no seu próprio domínio.`
          });
        }
      }
      if (dest === "lead_form" && input.leadGenFormId) {
        storySpec = {
          page_id: input.pageId,
          lead_gen_data: {
            lead_gen_form_id: input.leadGenFormId,
            call_to_action:   { type: ctaType },
            message:          selectedMessage,
            name:             selectedHeadline,
            ...(resolvedImageHash ? { image_hash: resolvedImageHash } : resolvedImageUrl ? { picture: resolvedImageUrl } : {}),
          },
        };
      } else {
        // Objetivos que NAO precisam de URL externa
        const noLinkRequired = [
          "OUTCOME_AWARENESS",
          "OUTCOME_LEADS",
          "OUTCOME_ENGAGEMENT",
        ].includes(campaignObjective);

        if (!effectiveLink && !noLinkRequired) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Destino do anuncio nao encontrado. Informe o campo 'linkUrl' ou cadastre site, WhatsApp, Instagram ou URL da pagina do Facebook no Perfil do Cliente.",
          });
        }

        if (effectiveLink) {
          let resolvedHost: string | undefined;
          try { resolvedHost = new URL(effectiveLink).hostname; } catch {}
          log.info("meta", "Resolved ad destination", {
            campaignId: input.campaignId,
            projectId: input.projectId,
            pageId: input.pageId,
            source: destinationSource,
            host: resolvedHost,
          });
        }

        if (isWhatsAppDestination) {
          log.info("meta", "Click-to-WhatsApp ativado", {
            campaignId: input.campaignId,
            projectId: input.projectId,
            pageId: input.pageId,
            source: destinationSource,
            phone: whatsappDestination.phone || null,
            optimizationGoal: adSetOptimizationGoal,
          });
        }

        // Decide formato: carrossel (2-10 fotos) ou imagem simples
        carouselHashes = (effectiveImageHashes && effectiveImageHashes.length >= 2)
          ? effectiveImageHashes.slice(0, 10)   // Meta permite no máximo 10 cards
          : null;
        carouselUrls = (!carouselHashes && effectiveImageUrls && effectiveImageUrls.length >= 2)
          ? effectiveImageUrls.slice(0, 10)
          : null;
        isCarousel = !!(carouselHashes || carouselUrls);

        if (isCarousel) {
          // -- Formato Carrossel (2-10 fotos) -----------------------------
          // Regras Meta: cada card tem link, imagem, título e CTA próprios
          const items = carouselHashes || carouselUrls || [];
          const child_attachments = items.map((item: string, idx: number) => ({
            link:           finalLink,
            name:           `${selectedHeadline} ${idx > 0 ? `(${idx + 1})` : ""}`.trim(),
            description:    idx === 0 ? selectedDescription : "",
            call_to_action: { type: ctaType, value: ctaValue },
            ...(carouselHashes
              ? { image_hash: item }
              : { picture:    item }),
          }));

          storySpec = {
            page_id: input.pageId,
            link_data: {
              link:               finalLink,
              message:            selectedMessage,
              child_attachments,
              // multi_share_end_card: false — remove card final de perfil automático
              multi_share_end_card: false,
              multi_share_optimized: false, // mantém ordem das fotos
            },
          };
          log.info("meta", "Criativo carrossel", { cards: child_attachments.length, pageId: input.pageId });
        } else {
          // -- Formato vídeo (video_data) ou imagem simples (link_data) ------
          // A Meta exige estruturas DIFERENTES para vídeo vs imagem:
          // Vídeo → object_story_spec.video_data
          // Imagem → object_story_spec.link_data (com image_hash ou picture)
          if (effectiveVideoId) {
            storySpec = {
              page_id: input.pageId,
              video_data: {
                video_id:       effectiveVideoId,
                message:        selectedMessage,
                title:          selectedHeadline,
                call_to_action: {
                  type:  ctaType,
                  value: ctaValue,
                },
              },
            };
            log.info("meta", "Criativo vídeo via video_data", { videoId: effectiveVideoId, pageId: input.pageId });
          } else {
            storySpec = {
              page_id: input.pageId,
              link_data: {
                message:        selectedMessage,
                name:           selectedHeadline,
                link:           finalLink,
                call_to_action: {
                  type: noLinkRequired && !effectiveLink && !isWhatsAppDestination ? "LEARN_MORE" : ctaType,
                  ...(noLinkRequired && !effectiveLink && !isWhatsAppDestination ? {} : { value: ctaValue }),
                },
                ...(resolvedImageHash
                  ? { image_hash: resolvedImageHash }
                  : resolvedImageUrl
                    ? { picture: resolvedImageUrl }
                    : {}),
              },
            };
          }
        }
      }

      const creativeBody: any = {
        name:              creativeName,
        object_story_spec: storySpec,
        access_token:      token,
      };

      // Injeta pixel_id quando fornecido
      if (input.pixelId) {
        creativeBody.degrees_of_freedom_spec = {
          creative_features_spec: {
            standard_enhancements: { enroll_status: "OPT_OUT" },
          },
        };
        // tracking_spec para o pixel
        creativeBody.tracking_specs = [{
          "action.type": ["offsite_conversion"],
          "fb_pixel":    [input.pixelId],
        }];
      }

      // Validar apenas URLs realmente enviadas como picture para a Meta
      if (dest === "lead_form" && !resolvedImageHash && resolvedImageUrl) {
        validateMetaImageUrl(resolvedImageUrl);
      }
      if (carouselUrls?.length) {
        carouselUrls.forEach(validateMetaImageUrl);
      }
      if (!isCarousel && !effectiveVideoId && !resolvedImageHash && dest !== "lead_form" && resolvedImageUrl) {
        validateMetaImageUrl(resolvedImageUrl);
      }

      if (selectedCreativeRaw) {
        const inferredCreativeIndex = creativeList.findIndex((item) => item === selectedCreativeRaw);
        const creativeIndex = typeof input.creativeIndex === "number"
          ? input.creativeIndex
          : inferredCreativeIndex >= 0
            ? inferredCreativeIndex
            : 0;
        if (creativeList[creativeIndex]) {
          creativeList[creativeIndex] = syncCreativePublishMediaToV2(selectedCreativeRaw, {
            imageHash: effectiveImageHash,
            imageUrl: effectiveImageUrl,
            imageHashes: effectiveImageHashes,
            imageUrls: effectiveImageUrls,
            videoId: effectiveVideoId,
          });
          await db.updateCampaignField(input.campaignId, "creatives", JSON.stringify(creativeList));
        }
      }

      const creativeData = await metaPost<any>(`${accountId}/adcreatives`, creativeBody, "Creative");
      const metaCreativeId = creativeData.id;

      // 4. Ad
      const adData = await metaPost<any>(`${accountId}/ads`, {
        name:         `${c.name} — Anúncio 1`.slice(0, 100),
        adset_id:     metaAdSetId,
        creative:     { creative_id: metaCreativeId },
        status:       "PAUSED",
        access_token: token,
      }, "Ad");

      // Salva IDs e status de publicação na campanha
      await db.updateCampaign(input.campaignId, {
        publishStatus:  "success",
        publishedAt:    new Date(),
        publishError:   null as any,
        metaCampaignId,
        metaAdSetId,
        metaCreativeId,
        metaAdId:       adData.id,
      } as any);

      return {
        campaignId: metaCampaignId,
        adSetId:    metaAdSetId,
        creativeId: metaCreativeId,
        adId:       adData.id,
        status:     "PAUSED",
        warnings: publishWarnings,
        creativeScore,
        placementUsed: placementKey,
      };

      } catch (err: any) {
        // Salva erro e marca como falha
        await db.updateCampaign(input.campaignId, {
          publishStatus: "error",
          publishError:  err.message || "Erro desconhecido",
        } as any).catch(() => {});
        if (process.env.SENTRY_DSN) {
          try { require('@sentry/node').captureException(err); } catch {}
        }
        throw err;
      }
    }),

  // -- Valida compliance Meta antes de publicar ---------------------------


  publishToTikTok: protectedProcedure
    .input(z.object({
      campaignId:   z.number(),
      projectId:    z.number(),
      campaignName: z.string(),
      objective:    z.string().default("TRAFFIC"),
      budgetType:   z.enum(["DAILY", "LIFETIME"]).default("DAILY"),
      budget:       z.number(),
      startDate:    z.string(),
      endDate:      z.string().optional(),
      placements:   z.array(z.string()).default(["PLACEMENT_TIKTOK"]),
      ageMin:       z.number().default(18),
      ageMax:       z.number().default(55),
      gender:       z.string().default("ALL"),
      locations:    z.array(z.string()).default(["BR"]),
      interests:    z.array(z.string()).default([]),
      ads:          z.array(z.object({
        videoUrl:       z.string(),
        coverImageUrl:  z.string().optional(),
        adText:         z.string(),
        callToAction:   z.string().default("LEARN_MORE"),
        landingPageUrl: z.string(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "tiktok"), eq(integrations.isActive, 1)));
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada" });

      const token       = integration.accessToken ?? "";
      const advertiserId = integration.accountId  ?? "";
      if (!token || !advertiserId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Token ou Advertiser ID ausentes" });

      // 1. Create Campaign
      const campaignData: any = await tikTokPost("campaign/create/", {
        advertiser_id:  advertiserId,
        campaign_name:  input.campaignName,
        objective_type: input.objective,
        budget_mode:    input.budgetType === "DAILY" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
        budget:         input.budget,
        operation_status: "DISABLE",
      }, token);
      const tiktokCampaignId = campaignData.campaign_id as string;

      // 2. Create Ad Group
      const adGroupData: any = await tikTokPost("adgroup/create/", {
        advertiser_id:    advertiserId,
        campaign_id:      tiktokCampaignId,
        adgroup_name:     `AdGroup-${input.campaignName}`,
        placement_type:   "PLACEMENT_TYPE_NORMAL",
        placements:       input.placements,
        location_ids:     input.locations,
        age:              [{ min: input.ageMin, max: input.ageMax }],
        gender:           input.gender === "ALL" ? "GENDER_UNLIMITED" : input.gender === "MALE" ? "GENDER_MALE" : "GENDER_FEMALE",
        budget_mode:      input.budgetType === "DAILY" ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
        budget:           input.budget,
        schedule_type:    "SCHEDULE_START_END",
        schedule_start_time: input.startDate,
        ...(input.endDate ? { schedule_end_time: input.endDate } : {}),
        optimization_goal: input.objective === "CONVERSIONS" ? "CONVERT" : "CLICK",
        operation_status: "ENABLE",
        ...(input.interests.length > 0 ? { interest_category_ids: input.interests } : {}),
      }, token);
      const tiktokAdGroupId = adGroupData.adgroup_id as string;

      // 3. Create Ads
      const adIds: string[] = [];
      for (const ad of input.ads) {
        if (!ad.videoUrl) continue;
        const adData: any = await tikTokPost("ad/create/", {
          advertiser_id: advertiserId,
          adgroup_id:    tiktokAdGroupId,
          creatives: [{
            ad_name:          `Ad-${input.campaignName}-${Date.now()}`,
            ad_format:        "SINGLE_VIDEO",
            video_id:         ad.videoUrl,
            ...(ad.coverImageUrl ? { image_id: ad.coverImageUrl } : {}),
            ad_text:          ad.adText,
            call_to_action:   ad.callToAction,
            landing_page_url: ad.landingPageUrl,
          }],
          operation_status: "DISABLE",
        }, token);
        if (adData?.ad_ids?.[0]) adIds.push(adData.ad_ids[0]);
      }

      return {
        success: true,
        tiktokCampaignId,
        tiktokAdGroupId,
        tiktokAdIds: adIds,
        message: `Campanha TikTok "${input.campaignName}" criada (ID: ${tiktokCampaignId})`,
      };
    }),

  publishToGoogle: protectedProcedure
    .input(z.object({
      campaignId:          z.number(),
      projectId:           z.number(),
      campaignName:        z.string(),
      campaignType:        z.string().default("SEARCH"),
      biddingStrategy:     z.string().default("MAXIMIZE_CONVERSIONS"),
      targetCpa:           z.number().optional(),
      targetRoas:          z.number().optional(),
      dailyBudgetMicros:   z.number(),
      startDate:           z.string(),            // YYYYMMDD
      endDate:             z.string().optional(),
      locations:           z.array(z.string()).default(["BR"]),
      languages:           z.array(z.string()).default(["pt"]),
      devices:             z.array(z.string()).default(["MOBILE","DESKTOP"]),
      keywords:            z.array(z.string()).default([]),
      negativeKeywords:    z.array(z.string()).default([]),
      ads:                 z.array(z.object({
        headlines:    z.array(z.string()),
        descriptions: z.array(z.string()),
        finalUrl:     z.string(),
        imagePath:    z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Verificar se plano permite Google Ads (premium+)
      const googleCheck = await db.checkPlanLimit(userId, "google");
      if (!googleCheck.allowed) throw new TRPCError({ code: "FORBIDDEN", message: googleCheck.reason });

      if (input.campaignType !== "SEARCH") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A publicação Google desta tela está validada apenas para campanhas Search. Para Display, Video ou Performance Max é necessário um fluxo dedicado de assets visuais (1:1 e 1.91:1) antes do publish.",
        });
      }

      // 1. Get Google Ads integration
      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "google"), eq(integrations.isActive, 1)));
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });

      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      if (runtime.isManager && !runtime.childCustomerIds?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O Customer ID Google configurado é uma conta gerente (MCC) sem conta cliente elegível. Informe um Customer ID de anunciante ou configure GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
        });
      }

      // Marca como processando
      await (db as any).updateCampaign?.(input.campaignId, { publishStatus: "processing" }).catch(() => {});

      // 2. Create Budget via gRPC (google-ads-api)
      let budgetOp: any;
      try {
        const { client, refreshToken } = await getGoogleAdsClient(integration as any);
        const customer = client.Customer({
          customer_id: runtime.customerId,
          refresh_token: refreshToken,
          ...(runtime.loginCustomerId ? { login_customer_id: runtime.loginCustomerId } : {}),
        });
        budgetOp = await customer.campaignBudgets.create([{
          name:            `Budget-${input.campaignName}-${Date.now()}`,
          amount_micros:   input.dailyBudgetMicros,
          delivery_method: 2, // STANDARD
        }]);
        log.info("google", "budget created via gRPC", { budgetOp });
      } catch (grpcErr: any) {
        log.warn("google", "gRPC failed, trying REST", { error: grpcErr.message });
        budgetOp = await googleAdsPost<any>(
          "campaignBudgets:mutate",
          { operations: [{ create: {
            name:           `Budget-${input.campaignName}-${Date.now()}`,
            amountMicros:   input.dailyBudgetMicros,
            deliveryMethod: "STANDARD",
          }}]},
          runtime.accessToken, runtime.developerToken, runtime.customerId, runtime.loginCustomerId
        );
      }
      const budgetResourceName = budgetOp.results?.[0]?.resource_name ?? budgetOp.results?.[0]?.resourceName ?? "";

      // 3. Build bidding strategy config
      const biddingConfig: Record<string, any> = {};
      if (input.biddingStrategy === "TARGET_CPA" && input.targetCpa) {
        biddingConfig.targetCpa = { targetCpaMicros: Math.round(input.targetCpa * 1_000_000) };
      } else if (input.biddingStrategy === "TARGET_ROAS" && input.targetRoas) {
        biddingConfig.targetRoas = { targetRoas: input.targetRoas };
      } else if (input.biddingStrategy === "MAXIMIZE_CONVERSIONS") {
        biddingConfig.maximizeConversions = {};
      } else {
        biddingConfig.maximizeClicks = {};
      }

      // Cria cliente gRPC para operações restantes usando o mesmo contexto resolvido do REST
      const { client: gClient, refreshToken: gRefresh } = await getGoogleAdsClient(integration as any);
      log.info("google", "gRPC customer setup", {
        configuredCustomerId: String((integration.accountId ?? "")).replace(/-/g, "").trim(),
        usingCustomerId: runtime.customerId,
        loginCustomerId: runtime.loginCustomerId || "(none)",
        managerCustomerId: runtime.managerCustomerId || "(none)",
        isManager: runtime.isManager,
      });
      const gCustomer = gClient.Customer({
        customer_id: runtime.customerId,
        refresh_token: gRefresh,
        ...(runtime.loginCustomerId ? { login_customer_id: runtime.loginCustomerId } : {}),
      });

      // 4. Create Campaign via gRPC
      const buildGoogleCampaignCreate = (name: string) => ({
        name,
        status: 2, // PAUSED
        advertising_channel_type: input.campaignType === "DISPLAY" ? 3 : 2,
        campaign_budget: budgetResourceName,
        start_date: input.startDate,
        ...(input.endDate ? { end_date: input.endDate } : {}),
        contains_eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING", // obrigatório desde EU PAR; boolean false não satisfaz o enum exigido
        ...(input.biddingStrategy === "TARGET_CPA" && input.targetCpa
          ? { bidding_strategy_type: "MAXIMIZE_CONVERSIONS", maximize_conversions: { target_cpa_micros: Math.round(input.targetCpa * 1_000_000) } }
          : input.biddingStrategy === "TARGET_ROAS" && input.targetRoas
          ? { bidding_strategy_type: "MAXIMIZE_CONVERSION_VALUE", maximize_conversion_value: { target_roas: input.targetRoas } }
          : input.biddingStrategy === "MAXIMIZE_CONVERSIONS"
          ? { bidding_strategy_type: "MAXIMIZE_CONVERSIONS", maximize_conversions: {} }
          : { bidding_strategy_type: "TARGET_SPEND", target_spend: {} }
        ),
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: input.campaignType === "DISPLAY",
          target_partner_search_network: false,
        },
      });

      let effectiveCampaignName = input.campaignName;
      let effectiveAdGroupName = `AdGroup-${input.campaignName}`;
      let campaignOp: any;
      try {
        campaignOp = await gCustomer.campaigns.create([buildGoogleCampaignCreate(effectiveCampaignName)]);
        log.info("google", "campaign created via gRPC", { result: JSON.stringify(campaignOp).slice(0,200), effectiveCampaignName });
      } catch (campErr: any) {
        const detailsText = typeof campErr?.details === "string"
          ? campErr.details
          : JSON.stringify(campErr?.errors || campErr?.details || []).slice(0, 500);
        const duplicateName = detailsText.includes("DUPLICATE_CAMPAIGN_NAME") || String(campErr?.message || "").includes("DUPLICATE_CAMPAIGN_NAME");
        if (duplicateName) {
          const suffix = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(-10);
          effectiveCampaignName = `${input.campaignName}-${suffix}`.slice(0, 255);
          effectiveAdGroupName = `AdGroup-${effectiveCampaignName}`.slice(0, 255);
          log.warn("google", "campaign duplicate name retry", { originalName: input.campaignName, retriedName: effectiveCampaignName });
          campaignOp = await gCustomer.campaigns.create([buildGoogleCampaignCreate(effectiveCampaignName)]);
          log.info("google", "campaign created via gRPC after retry", { result: JSON.stringify(campaignOp).slice(0,200), effectiveCampaignName });
        } else {
          log.error("google", "campaign gRPC FAILED", {
            message: campErr.message,
            code: campErr.code,
            details: JSON.stringify(campErr.errors || campErr.details || []).slice(0, 500),
            budgetResourceName,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Erro ao criar campanha Google: ${campErr?.message || detailsText || "falha desconhecida"}`,
          });
        }
      }
      const campaignResourceName = campaignOp.results?.[0]?.resource_name ?? campaignOp.results?.[0]?.resourceName ?? "";
      log.info("google", "campaign created via gRPC", { campaignResourceName, effectiveCampaignName });

      // 5. Create Ad Group via gRPC
      const adGroupOp = await gCustomer.adGroups.create([{
        name: effectiveAdGroupName,
        campaign: campaignResourceName,
        status:   2, // ENABLED
        type:     input.campaignType === "DISPLAY" ? 17 : 2, // DISPLAY_STANDARD=17, SEARCH_STANDARD=2
      }]);
      const adGroupResourceName = adGroupOp.results?.[0]?.resource_name ?? adGroupOp.results?.[0]?.resourceName ?? "";
      log.info("google", "adGroup created via gRPC", { adGroupResourceName });

      // 6. Add Keywords via gRPC (Search only)
      const keywordWarnings: string[] = [];
      if (input.campaignType === "SEARCH" && input.keywords.length > 0) {
        const normalizeKeyword = (rawKeyword: string) => {
          const raw = String(rawKeyword ?? "").trim();
          const isExact = raw.startsWith("[") && raw.endsWith("]");
          const isPhrase = raw.startsWith("\"") && raw.endsWith("\"");
          const cleanedText = raw
            .replace(/^\[/, "")
            .replace(/\]$/, "")
            .replace(/^"/, "")
            .replace(/"$/, "")
            .replace(/\+/g, "")
            .replace(/[—–-]+/g, " ")
            .replace(/[^ -\p{L}\p{N}\s]/gu, " ")
            .replace(/[%]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          const wordCount = cleanedText ? cleanedText.split(/\s+/).length : 0;
          if (!cleanedText || wordCount > 10) return null;
          return {
            ad_group: adGroupResourceName,
            keyword: {
              text: cleanedText,
              match_type: isExact ? 2 : isPhrase ? 3 : 4, // EXACT=2, PHRASE=3, BROAD=4
            },
            status: 2,
          };
        };

        const seenKeywords = new Set<string>();
        const kwOps = input.keywords
          .map((kw: string) => ({ raw: kw, op: normalizeKeyword(kw) }))
          .filter(({ raw, op }) => {
            if (!op) {
              keywordWarnings.push(`Keyword descartada: ${String(raw ?? "").slice(0, 80)}`);
              return false;
            }
            const dedupeKey = `${op.keyword.match_type}:${op.keyword.text.toLowerCase()}`;
            if (seenKeywords.has(dedupeKey)) return false;
            seenKeywords.add(dedupeKey);
            return true;
          })
          .map(({ op }) => op as any);

        if (kwOps.length > 0) {
          let keywordCreatedCount = 0;
          for (const kwOp of kwOps) {
            try {
              await gCustomer.adGroupCriteria.create([kwOp]);
              keywordCreatedCount += 1;
            } catch (kwErr: any) {
              const detailsText = typeof kwErr?.details === "string"
                ? kwErr.details
                : JSON.stringify(kwErr?.errors || kwErr?.details || []).slice(0, 500);
              log.error("google", "keyword gRPC FAILED", {
                message: kwErr?.message,
                code: kwErr?.code,
                details: detailsText,
                keyword: kwOp.keyword?.text,
                match_type: kwOp.keyword?.match_type,
              });
              keywordWarnings.push(`Keyword não publicada: ${kwOp.keyword?.text} — ${kwErr?.message || detailsText || "falha desconhecida"}`);
            }
          }
          log.info("google", "keywords created via gRPC", { count: keywordCreatedCount, attempted: kwOps.length });
        } else {
          keywordWarnings.push("Nenhuma palavra-chave válida após normalização.");
          log.warn("google", "nenhuma keyword válida para criar", { originalCount: input.keywords.length });
        }
      }

      // 7. Create Ads
      const normalizeAssetTexts = (values: string[] | undefined, maxChars: number, maxItems: number) => {
        const seen = new Set<string>();
        const cleaned: Array<{ text: string }> = [];
        for (const raw of values ?? []) {
          const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
          if (!text) continue;
          const key = text.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          cleaned.push({ text });
          if (cleaned.length >= maxItems) break;
        }
        return cleaned;
      };

      const adResults: string[] = [];
      const adErrors: string[] = [];
      const extractId = (name: string) => name.split("/").pop() ?? name;
      const googleCampaignId = extractId(campaignResourceName);
      const googleAdGroupId  = extractId(adGroupResourceName);

      for (const [index, ad] of input.ads.entries()) {
        const headlines = normalizeAssetTexts(ad.headlines, 30, 15);
        const descriptions = normalizeAssetTexts(ad.descriptions, 90, 4);

        // Google Ads exige 3–15 headlines e 2–4 descriptions para RSA.
        for (const pad of ["Saiba mais", "Entre em contato", "Solicite agora", "Fale com nossa equipe"]) {
          if (headlines.length >= 3) break;
          if (!headlines.some((h) => h.text.toLowerCase() === pad.toLowerCase())) headlines.push({ text: pad.slice(0, 30) });
        }
        for (const pad of ["Entre em contato e saiba mais.", "Solicite agora e conheça nossas soluções.", "Fale com nossa equipe especializada.", "Descubra como podemos ajudar."]) {
          if (descriptions.length >= 2) break;
          if (!descriptions.some((d) => d.text.toLowerCase() === pad.toLowerCase())) descriptions.push({ text: pad.slice(0, 90) });
        }

        let finalUrl = "";
        try {
          const parsed = new URL(String(ad.finalUrl ?? "").trim());
          if (!/^https?:$/.test(parsed.protocol)) throw new Error("invalid_protocol");
          finalUrl = parsed.toString();
        } catch {
          log.warn("google", "Anúncio sem finalUrl válida — pulando", { index: index + 1, finalUrl: ad.finalUrl });
          adErrors.push(`Anúncio ${index + 1}: finalUrl inválida`);
          continue;
        }

        try {
          const adOp = await gCustomer.adGroupAds.create([{
            ad_group: adGroupResourceName,
            status:   3, // PAUSED
            ad: {
              responsive_search_ad: { headlines, descriptions },
              final_urls: [finalUrl],
            },
          }]);
          adResults.push(adOp.results?.[0]?.resource_name ?? adOp.results?.[0]?.resourceName ?? "");
          log.info("google", "ad created via gRPC", {
            index: index + 1,
            resource: adResults[adResults.length - 1],
            headlinesCount: headlines.length,
            descriptionsCount: descriptions.length,
          });
        } catch (adErr: any) {
          const detailsText = typeof adErr?.details === "string"
            ? adErr.details
            : JSON.stringify(adErr?.errors || adErr?.details || []).slice(0, 500);
          log.error("google", "ad gRPC FAILED", {
            index: index + 1,
            message: adErr?.message,
            code: adErr?.code,
            details: detailsText,
            headlinesCount: headlines.length,
            descriptionsCount: descriptions.length,
            finalUrl,
          });
          adErrors.push(`Anúncio ${index + 1}: ${adErr?.message || detailsText || "falha desconhecida"}`);
          continue;
        }
      }

      if (adResults.length === 0) {
        const firstError = adErrors[0] || "Verifique headlines, descriptions e URL final.";
        await (db as any).updateCampaign?.(input.campaignId, {
          publishStatus: "error",
          publishError: firstError,
          googleCampaignId,
          googleAdGroupId,
        }).catch(() => {});
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nenhum anúncio válido para publicar no Google Ads. ${firstError}`,
        });
      }

      const publishWarnings = [...keywordWarnings, ...adErrors];
      if (publishWarnings.length > 0) {
        log.warn("google", "publishToGoogle concluído com falhas parciais", {
          googleCampaignId,
          googleAdGroupId,
          createdAds: adResults.length,
          failedAds: adErrors.length,
          keywordWarnings: keywordWarnings.length,
          firstWarning: publishWarnings[0],
        });
      }

      // Persiste sucesso
      await (db as any).updateCampaign?.(input.campaignId, {
        publishStatus: "success",
        publishedAt: new Date(),
        publishError: publishWarnings[0] ?? null,
        googleCampaignId,
        googleAdGroupId,
      }).catch(() => {});

      return {
        success: true,
        googleCampaignId,
        googleAdGroupId,
        googleAdIds: adResults.map(extractId),
        budgetResourceName,
        warnings: publishWarnings,
        message: `Campanha "${effectiveCampaignName}" criada no Google Ads (ID: ${googleCampaignId})`,
      };
    }),

  validateCompliance: protectedProcedure
    .input(z.object({
      texts: z.array(z.string()), // headline, copy, cta juntos
    }))
    .mutation(async ({ input }) => {
      const { validateMetaCompliance } = await import("../ai");
      const combined = input.texts.join(" ");
      const result   = validateMetaCompliance(combined);
      return result;
    }),
});

// ============ PLANS ROUTER ============
const plansRouter = router({
  list: publicProcedure.query(() => db.getAllPlans()),
  getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(({ input }) => db.getPlanBySlug(input.slug)),
});

// ============ ADMIN ROUTER ============
const adminRouter = router({
  // Usuários
  users:          adminProcedure.query(() => db.getAllUsers()),
  suspendUser:    adminProcedure.input(z.object({ userId: z.number(), reason: z.string().optional() })).mutation(({ input }) => db.suspendUser(input.userId, input.reason)),
  unsuspendUser:  adminProcedure.input(z.object({ userId: z.number() })).mutation(({ input }) => db.unsuspendUser(input.userId)),
  deleteUser:     adminProcedure.input(z.object({ userId: z.number() })).mutation(({ input }) => db.deleteUser(input.userId)),
  updateUserPlan: adminProcedure
    .input(z.object({ userId: z.number(), plan: z.enum(["free","basic","premium","vip"]) }))
    .mutation(({ input, ctx }) => {
      // Superadmin pode alterar qualquer usuário inclusive ele mesmo
      // Admin comum só pode alterar usuários (não outros admins/superadmins)
      if (ctx.user.role !== "superadmin" && input.userId === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas superadmin pode alterar o próprio plano." });
      }
      return db.updateUserPlan(input.userId, input.plan);
    }),
  // Projetos
  projects:       adminProcedure.query(() => db.getAllProjects()),
  // Admins
  admins:         adminProcedure.query(() => db.listAllAdmins()),
  promoteToAdmin: adminProcedure.input(z.object({ userId: z.number() })).mutation(({ input, ctx }) => db.promoteToAdmin(input.userId, ctx.user.id)),
  demoteFromAdmin:adminProcedure.input(z.object({ userId: z.number() })).mutation(({ input, ctx }) => db.demoteFromAdmin(input.userId, ctx.user.id)),
  createInvite:   adminProcedure.input(z.object({ email: z.string().email(), role: z.enum(["admin","superadmin"]) })).mutation(({ input, ctx }) => db.createAdminInvite(input.email, input.role, ctx.user.id)),
  listInvites:    adminProcedure.query(() => db.listAdminInvites()),
  deleteInvite:   adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteInvite(input.id)),
  // Planos
  listPlans:      adminProcedure.query(() => db.getAllPlansAdmin()),
  upsertPlan:     adminProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string(),
    slug: z.string(),
    description: z.string().optional().nullable(),
    price: z.number(),
    billingInterval: z.enum(["month", "year"]),
    maxProjects: z.number().optional().nullable(),
    maxCompetitors: z.number().optional().nullable(),
    hasAiAnalysis: z.number().optional(),
    hasMetaIntegration: z.number().optional(),
    hasGoogleIntegration: z.number().optional(),
    hasExportPdf: z.number().optional(),
    hasExportXlsx: z.number().optional(),
    stripePriceId: z.string().optional().nullable(),
    isActive: z.number().optional(),
  })).mutation(({ input }) => db.upsertPlan(input)),
  deletePlan:     adminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deletePlan(input.id)),
  // Assinaturas
  subscriptions:  adminProcedure.query(() => db.getAllSubscriptions()),
  // Financeiro
  payments:       adminProcedure.query(() => db.getAllPayments()),
  // Analytics
  stats:          adminProcedure.query(() => db.getAdminStats()),
  // Moderação / Auditoria
  auditLogs:      adminProcedure.query(() => db.getAuditLogs()),
  // Configurações
  getSettings:    adminProcedure.query(() => db.getAdminSettings()),
  saveSettings:   superadminProcedure.input(z.object({ key: z.string(), value: z.string() })).mutation(({ input }) => db.saveAdminSetting(input.key, input.value)),

  // -- Perfis (Superadmin-only) ---------------------------------------------
  setUserProfile: adminProcedure
    .input(z.object({
      userId: z.number(),
      profile: z.enum(["marketing","financeiro","rh"]).nullable(),
    }))
    .mutation(({ input, ctx }) => {
      if (ctx.user.role !== "superadmin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin pode atribuir perfis" });
      return db.updateUserProfile(input.userId, input.profile, ctx.user.id);
    }),

  // -- Plan Requests (Superadmin-only via adminRouter) -----------------------
  listPlanRequests: adminProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin")
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin" });
    return db.getAllPlanRequests();
  }),
  pendingPlanRequests: adminProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin")
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin" });
    return db.getPendingPlanRequests();
  }),
  approvePlanRequest: adminProcedure
    .input(z.object({ requestId: z.number(), note: z.string().optional() }))
    .mutation(({ input, ctx }) => {
      if (ctx.user.role !== "superadmin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin" });
      return db.approvePlanRequest(input.requestId, ctx.user.id, input.note);
    }),
  rejectPlanRequest: adminProcedure
    .input(z.object({ requestId: z.number(), note: z.string() }))
    .mutation(({ input, ctx }) => {
      if (ctx.user.role !== "superadmin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Superadmin" });
      return db.rejectPlanRequest(input.requestId, ctx.user.id, input.note);
    }),
});

// ============ PLAN CHANGE REQUESTS ROUTER ============
const planRequestsRouter = router({
  // Financeiro: solicitar mudança de plano
  request: financeiroProcedure
    .input(z.object({
      targetUserId: z.number(),
      requestedPlan: z.enum(["free","basic","premium","vip"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const users_ = await db.getAllUsers();
      const target = (users_ as any[]).find((u) => u.id === input.targetUserId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      const req = await db.createPlanChangeRequest({
        requestedByUserId: ctx.user.id,
        targetUserId: input.targetUserId,
        currentPlan: target.plan,
        requestedPlan: input.requestedPlan,
        reason: input.reason,
      });
      // Notificar todos os superadmins
      const superadminIds = await db.getSuperadminIds();
      for (const sid of superadminIds) {
        await db.createNotification({
          userId: sid,
          title: "⚠️ Solicitação de mudança de plano",
          message: `Perfil Financeiro solicitou alteração de plano do usuário #${input.targetUserId} para "${input.requestedPlan}". Motivo: ${input.reason ?? "Não informado"}`,
          type: "warning",
          actionUrl: "/admin/plan-requests",
        });
      }
      return req;
    }),

  list:    superadminProcedure.query(() => db.getAllPlanRequests()),
  pending: superadminProcedure.query(() => db.getPendingPlanRequests()),
  approve: superadminProcedure
    .input(z.object({ requestId: z.number(), note: z.string().optional() }))
    .mutation(({ input, ctx }) => db.approvePlanRequest(input.requestId, ctx.user.id, input.note)),
  reject: superadminProcedure
    .input(z.object({ requestId: z.number(), note: z.string() }))
    .mutation(({ input, ctx }) => db.rejectPlanRequest(input.requestId, ctx.user.id, input.note)),
});

// ============ NOTIFICATIONS ROUTER ============
const notificationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.getNotificationsByUserId(ctx.user.id)),
  markRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.markNotificationRead(input.id)),
});

// ============ INTEGRATIONS ROUTER ============
const integrationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => db.listApiIntegrations(ctx.user.id)),

  // ── Salvar e validar WhatsApp na conta Meta ──────────────────────────────
  saveWhatsApp: protectedProcedure
    .input(z.object({
      phone:  z.string().min(6),
      pageId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado. Acesse Configurações → Meta Ads primeiro." });

      const token = (integration as any).accessToken as string;

      // Normaliza número: remove tudo exceto dígitos, garante código do país BR
      const digits = input.phone.replace(/\D/g, "");
      const fullDigits = digits.startsWith("55") ? digits : `55${digits}`;
      const waUrl = `https://wa.me/${fullDigits}`;

      // Valida vínculo na Meta se pageId fornecido
      let linked = false;
      let linkedPageName = "";
      if (input.pageId) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${input.pageId}?fields=whatsapp_connected_id,name&access_token=${token}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const pageData: any = await res.json();
          const connectedPhone = pageData?.whatsapp_connected_id
            ? String(pageData.whatsapp_connected_id).replace(/\D/g, "")
            : null;
          linked = !!(connectedPhone && (
            fullDigits.endsWith(connectedPhone) || connectedPhone.endsWith(fullDigits.slice(-8))
          ));
          linkedPageName = pageData?.name || "";
        } catch {}
      }

      // Salva na integração Meta do usuário
      await db.upsertApiIntegration({
        userId: ctx.user.id,
        provider: "meta",
        whatsappPhone: `+${fullDigits}`,
      } as any);

      log.info("server", "WhatsApp salvo", {
        userId: ctx.user.id, phone: `+${fullDigits}`, linked, linkedPageName,
      });

      return {
        saved:   true,
        phone:   `+${fullDigits}`,
        waUrl,
        linked,
        linkedPageName,
        warning: !linked && input.pageId
          ? `Número salvo, mas não está vinculado à página "${linkedPageName || input.pageId}" no Meta Business Manager.`
          : !input.pageId
            ? "Número salvo. Selecione uma página para verificar o vínculo."
            : null,
      };
    }),



  upsertTikTok: protectedProcedure
    .input(z.object({
      appId:       z.string().optional(),
      appSecret:   z.string().optional(),
      accessToken: z.string(),
      advertiserId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const _drz2 = await getDb();
      const [existing] = await _drz2!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "tiktok")));

      if (existing) {
        await _drz2!.update(integrations).set({
          accessToken:  input.accessToken,
          appId:        input.appId || null,
          appSecret:    input.appSecret || null,
          accountId:    input.advertiserId,
          isActive:     1,
          tokenExpiry:  expiry,
          updatedAt:    new Date(),
        }).where(eq(integrations.id, existing.id));
      } else {
        await _drz2!.insert(integrations).values({
          userId,
          provider:    "tiktok",
          accessToken: input.accessToken,
          appId:       input.appId || null,
          appSecret:   input.appSecret || null,
          accountId:   input.advertiserId,
          isActive:    1,
          tokenExpiry: expiry,
        });
      }
      return { success: true };
    }),

  testTikTok: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "tiktok"), eq(integrations.isActive, 1)));
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não encontrada. Defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID ou salve a integração no banco." });
      const resp = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/user/info/?advertiser_id=${tikTokConfig.accountId}`,
        { headers: { "Access-Token": tikTokConfig.accessToken } }
      );
      const data: any = await resp.json();
      if (data.code !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: data.message });
      return { name: data.data?.email || `Advertiser ${integration.accountId}`, accountId: integration.accountId };
    }),

  upsertGoogle: protectedProcedure
    .input(z.object({
      clientId:       z.string().optional(),
      clientSecret:   z.string().optional(),
      developerToken: z.string(),
      customerId:     z.string(),
      refreshToken:   z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const expiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const _drz2 = await getDb();
      const [existing] = await _drz2!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "google")));

      if (existing) {
        await _drz2!.update(integrations).set({
          accessToken:    input.refreshToken,
          refreshToken:   input.refreshToken,
          appId:          input.clientId || null,
          appSecret:      input.clientSecret || null,
          developerToken: input.developerToken,
          accountId:      input.customerId,
          isActive:       1,
          tokenExpiry:    expiry,
          updatedAt:      new Date(),
        }).where(eq(integrations.id, existing.id));
      } else {
        await _drz2!.insert(integrations).values({
          userId,
          provider:       "google",
          accessToken:    input.refreshToken,
          refreshToken:   input.refreshToken,
          appId:          input.clientId || null,
          appSecret:      input.clientSecret || null,
          developerToken: input.developerToken,
          accountId:      input.customerId,
          isActive:       1,
          tokenExpiry:    expiry,
        });
      }
      return { success: true };
    }),

  testGoogle: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx }) => {
      const userId = (ctx as any).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(
          eq(integrations.userId, userId),
          eq(integrations.provider, "google"),
          eq(integrations.isActive, 1)
        ));
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google não encontrada" });

      const customerId = String(integration.accountId ?? "").replace(/\D/g, "");
      const devToken   = String((integration as any).developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "");

      if (!devToken) throw new TRPCError({ code: "BAD_REQUEST", message: "Developer Token não configurado" });
      if (!customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Customer ID não configurado" });

      // Valida obtendo access token — se falhar, credenciais OAuth inválidas
      let accessToken: string;
      try {
        accessToken = await getGoogleAccessToken(integration as any);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `OAuth inválido: ${e.message}` });
      }

      log.info("google", "testGoogle OK", { customerId, devTokenPrefix: devToken.slice(0,8), hasToken: !!accessToken });

      // Tenta validar via API mas não falha se der 404
      try {
        const resp = await fetch(
          buildGoogleAdsUrl(customerId, "googleAds:search"),
          {
            method: "POST",
            headers: {
              "Authorization":      `Bearer ${accessToken}`,
              "developer-token":    devToken,
              "login-customer-id":  customerId,
              "Content-Type":       "application/json",
            },
            body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1" }),
            signal: AbortSignal.timeout(10000),
          }
        );
        const text = await resp.text();
        log.info("google", "testGoogle API", { status: resp.status, body: text.slice(0, 200) });

        if (resp.ok) {
          const data = JSON.parse(text);
          const name = data.results?.[0]?.customer?.descriptiveName || `Google Ads ${customerId}`;
          return { name: `${name} ✅`, accountId: integration.accountId };
        }

        if (resp.status === 401) throw new TRPCError({ code: "BAD_REQUEST", message: "Token OAuth expirado ou inválido" });
        if (resp.status === 403) throw new TRPCError({ code: "BAD_REQUEST", message: "Sem permissão — verifique Developer Token e Customer ID" });

        if (resp.status === 404) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Endpoint Google Ads não encontrado (${GOOGLE_ADS_API_VERSION}). Verifique a versão da API e o Customer ID.` });
        }

        // outros status não determinísticos — aceita como parcialmente válido se OAuth respondeu
        log.warn("google", "testGoogle API não disponível mas credenciais OK", { status: resp.status });
        return { name: `Google Ads MCC ${customerId} ✅ (credenciais válidas)`, accountId: integration.accountId };

      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        // Erro de rede — aceita se token foi obtido com sucesso
        log.warn("google", "testGoogle network error", { error: e.message });
        return { name: `Google Ads MCC ${customerId} ✅ (offline)`, accountId: integration.accountId };
      }
    }),










  upsertMeta: protectedProcedure
    .input(z.object({
      accessToken:  z.string().min(10),
      adAccountId:  z.string().min(5),
      appId:        z.string().optional(),
      appSecret:    z.string().optional(),
    }))
    .mutation(({ input, ctx }) => db.upsertApiIntegration({
      userId:      ctx.user.id,
      provider:    "meta",
      accessToken: input.accessToken,
      adAccountId: input.adAccountId,
      appId:       input.appId,
      appSecret:   input.appSecret,
      isActive:    1,
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 dias
    })),

  delete: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(({ input, ctx }) => db.deleteApiIntegration(ctx.user.id, input.provider)),

  testMeta: protectedProcedure
    .mutation(async ({ ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) {
        throw new Error("Integração Meta não configurada");
      }
      const token     = (integration as any).accessToken as string;
      const accountId = (integration as any).adAccountId as string;
      const expiresAt = (integration as any).tokenExpiresAt;

      // 1. Testa identidade do token
      const meRes  = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${token}&fields=id,name`);
      const meData = await meRes.json() as any;
      if (meData.error) throw new Error(`Token inválido: ${meData.error.message} (code ${meData.error.code})`);

      // 2. Testa permissões do token
      const permRes  = await fetch(`https://graph.facebook.com/v20.0/me/permissions?access_token=${token}`);
      const permData = await permRes.json() as any;
      const perms: string[] = (permData.data || [])
        .filter((p: any) => p.status === "granted")
        .map((p: any) => p.permission as string);

      const hasAdsRead    = perms.includes("ads_read");
      const hasAdsLibrary = perms.includes("ads_library");
      const hasPageRead   = perms.includes("pages_read_engagement") || perms.includes("pages_show_list");

      // 3. Testa Ads Library API diretamente com um page ID conhecido
      const testPageId = "248724168983172"; // Gaya Fitness Club (do usuário)
      const adsRes  = await fetch(
        `https://graph.facebook.com/v20.0/ads_archive?` +
        `access_token=${token}&search_page_ids=${testPageId}` +
        `&ad_reached_countries=BR&ad_active_status=ACTIVE&fields=id,page_name&limit=3`
      );
      const adsData = await adsRes.json() as any;
      const adsLibraryOk = !adsData.error && Array.isArray(adsData.data);
      const adsFound     = adsData.data?.length || 0;
      const adsError     = adsData.error ? `code ${adsData.error.code}: ${adsData.error.message}` : null;

      return {
        ok:           true,
        name:         meData.name,
        adAccountId:  accountId,
        tokenExpiry:  expiresAt ? new Date(expiresAt).toLocaleDateString("pt-BR") : "sem validade registrada",
        tokenExpired: expiresAt ? new Date() > new Date(expiresAt) : false,
        permissions: {
          ads_read:    hasAdsRead,
          ads_library: hasAdsLibrary,
          pages_read:  hasPageRead,
          all:         perms,
        },
        adsLibraryTest: {
          ok:       adsLibraryOk,
          pageId:   testPageId,
          found:    adsFound,
          error:    adsError,
        },
      };
    }),

  exchangeToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) throw new Error("Integração Meta não configurada.");
      const shortToken = (integration as any).accessToken as string;
      const appId      = (integration as any).appId as string;
      const appSecret  = (integration as any).appSecret as string;
      if (!appId || !appSecret) throw new Error("App ID e App Secret são necessários. Configure-os em Configurações → Meta Ads.");
      const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
      const res  = await fetch(url);
      const data = await res.json() as any;
      if (data.error) throw new Error(`Meta: ${data.error.message}`);
      if (!data.access_token) throw new Error("Token longo não retornado pela Meta.");
      const expiresIn = data.expires_in || 5184000;
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
      await db.upsertApiIntegration({
        userId: ctx.user.id, provider: "meta",
        accessToken: data.access_token,
        adAccountId: (integration as any).adAccountId,
        appId, appSecret, isActive: 1, tokenExpiresAt,
      });
      log.info("meta", "Token longo gerado", { userId: ctx.user.id, expiresAt: tokenExpiresAt.toISOString() });
      return { ok: true, expiresAt: tokenExpiresAt.toISOString(), expiresInDays: Math.floor(expiresIn / 86400) };
    }),

  // -- Upload de imagem → retorna image_hash real para uso em criativos ------
  uploadImageToMeta: protectedProcedure
    .input(uploadImageToMetaInputSchema)
    .mutation(async ({ input, ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada. Acesse Configurações → Meta Ads." });

      const token     = (integration as any).accessToken as string;
      const accountId = (integration as any).adAccountId as string;
      if (!accountId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "ID da conta de anúncios não configurado." });
      const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

      log.info("meta", "uploadImageToMeta iniciado", {
        userId: ctx.user.id,
        fileName: input.fileName,
        base64Length: input.imageBase64?.length || 0,
        hasPrefix: input.imageBase64?.startsWith("data:") || false,
        accountId: act,
      });

      // Remove prefixo data:image/...;base64, se presente (erro comum do frontend)
      const base64Clean = input.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

      // Valida tamanho: Meta aceita até ~4MB em base64
      const sizeBytes = Math.ceil(base64Clean.length * 0.75);
      if (sizeBytes > 4 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Imagem muito grande (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). O limite é 4MB. Reduza o tamanho da imagem antes de fazer upload.`,
        });
      }

      if (!base64Clean || base64Clean.length < 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dados da imagem inválidos ou corrompidos." });
      }

      let data: any = {};
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/${act}/adimages`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bytes:        base64Clean,
            name:         input.fileName,
            access_token: token,
          }),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          const metaMsg  = data?.error?.message || `HTTP ${res.status}`;
          const metaCode = data?.error?.code ? ` (código ${data.error.code})` : "";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Falha no upload da imagem: ${metaMsg}${metaCode}`,
          });
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro de rede ao enviar imagem para Meta: ${err?.message || "Erro desconhecido"}`,
        });
      }

      // A API retorna { images: { [filename]: { hash, url } } }
      const images = data.images as Record<string, { hash: string; url: string }> | undefined;
      if (!images || Object.keys(images).length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Meta não retornou nenhuma imagem após o upload." });
      }
      const first = Object.values(images)[0];
      if (!first?.hash) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "image_hash não retornado pela Meta. Tente novamente." });
      }

      log.info("meta", "Image uploaded OK", { userId: ctx.user.id, hash: first.hash, fileName: input.fileName });
      return { hash: first.hash, url: first.url };
    }),

  uploadVideoToMeta: protectedProcedure
    .input(uploadVideoToMetaInputSchema)
    .mutation(async ({ input, ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada. Acesse Configurações → Meta Ads." });

      const token     = (integration as any).accessToken as string;
      const accountId = (integration as any).adAccountId as string;
      if (!accountId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "ID da conta de anúncios não configurado." });
      const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

      // Remove qualquer prefixo data:*/*;base64, independente do tipo MIME
      const base64Clean = input.videoBase64.replace(/^data:[a-zA-Z0-9.+/-]+;base64,/, "").trim();
      const sizeBytes = Math.ceil(base64Clean.length * 0.75);
      if (sizeBytes > 200 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Arquivo muito grande (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). O limite é 200MB.`,
        });
      }
      if (!base64Clean || base64Clean.length < 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dados do arquivo inválidos ou corrompidos." });
      }

      // Normaliza o mimeType — áudio é enviado como vídeo para a Meta
      const effectiveMime = input.mimeType?.startsWith("audio/")
        ? "video/mp4"   // Meta não aceita audio/* diretamente — converte para video/mp4
        : (input.mimeType || "video/mp4");

      // Normaliza extensão do arquivo
      const effectiveFileName = (() => {
        const name = input.fileName || "ad_video.mp4";
        if (input.mimeType?.startsWith("audio/") && !name.match(/\.mp4$/i)) {
          return name.replace(/\.[^.]+$/, "") + ".mp4";
        }
        return name;
      })();

      log.info("meta", "uploadVideoToMeta iniciado", {
        userId: ctx.user.id,
        fileName: effectiveFileName,
        mimeType: effectiveMime,
        originalMime: input.mimeType,
        sizeMB: (sizeBytes / 1024 / 1024).toFixed(1),
        accountId: act,
      });

      try {
        const bytes = Buffer.from(base64Clean, "base64");
        const form = new FormData();
        form.append("access_token", token);
        form.append("source", new Blob([bytes], { type: effectiveMime }), effectiveFileName);

        const res = await fetch(`https://graph.facebook.com/v19.0/${act}/advideos`, {
          method: "POST",
          body: form as any,
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) {
          const metaMsg  = data?.error?.message || `HTTP ${res.status}`;
          const metaCode = data?.error?.code ? ` (código ${data.error.code})` : "";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Falha no upload do vídeo: ${metaMsg}${metaCode}`,
          });
        }
        if (!data?.id) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "video_id não retornado pela Meta. Tente novamente." });
        }

        log.info("meta", "Video uploaded OK", { userId: ctx.user.id, videoId: data.id, fileName: input.fileName });
        return { videoId: data.id as string };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro de rede ao enviar vídeo para Meta: ${err?.message || "Erro desconhecido"}`,
        });
      }
    }),



  // ── Buscar WhatsApp vinculado à página do Facebook ──────────────────────────
  getPageWhatsApp: protectedProcedure
    .input(z.object({ pageId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;

      // Tenta múltiplos campos que podem conter o número WhatsApp
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${input.pageId}?fields=whatsapp_connected_id,phone_number,phone&access_token=${token}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data: any = await res.json();
      if (data.error) return { found: false, phone: null, waUrl: null };

      const rawPhone = data.whatsapp_connected_id || data.phone_number || data.phone;
      if (!rawPhone) return { found: false, phone: null, waUrl: null };

      const digits = String(rawPhone).replace(/\D/g, "");
      if (digits.length < 8) return { found: false, phone: null, waUrl: null };

      // Garante código do país (55 para Brasil se não tiver)
      const fullDigits = digits.startsWith("55") ? digits : `55${digits}`;
      return {
        found:  true,
        phone:  `+${fullDigits}`,
        waUrl:  `https://wa.me/${fullDigits}`,
      };
    }),

  // ── Post Orgânico na Página do Facebook ────────────────────────────────────
  publishOrganicPost: protectedProcedure
    .input(z.object({
      pageId:     z.string().min(3),
      message:    z.string().min(1).max(63206),   // limite Meta
      imageBase64: z.string().optional(),          // base64 da imagem para upload direto via /photos
      imageUrl:    z.string().optional(),           // ou URL pública da imagem
      linkUrl:    z.string().optional(),           // link para incluir no post
      scheduled:  z.boolean().default(false),
      scheduleAt: z.number().optional(),           // Unix timestamp (futuro)
    }))
    .mutation(async ({ input, ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada. Acesse Configurações → Meta Ads." });

      const userToken = (integration as any).accessToken as string;

      let pageToken = userToken; // fallback

      try {
        const accountsRes  = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${userToken}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const accountsData: any = await accountsRes.json();
        if (!accountsData.error && accountsData.data?.length > 0) {
          const page = accountsData.data.find((p: any) => String(p.id) === String(input.pageId));
          if (page?.access_token) {
            pageToken = page.access_token;
            log.info("meta", "publishOrganicPost page token OK via /me/accounts", { pageId: input.pageId });
          } else {
            const pageNames = accountsData.data.map((p: any) => `${p.name} (${p.id})`).join(", ");
            log.warn("meta", "publishOrganicPost page not found in accounts", {
              pageId: input.pageId,
              available: pageNames,
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Página ${input.pageId} não encontrada nas suas páginas. Páginas disponíveis: ${pageNames || "nenhuma"}. Verifique se você é administrador desta página.`,
            });
          }
        } else if (accountsData.error) {
          log.warn("meta", "publishOrganicPost /me/accounts erro", { error: accountsData.error.message });
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        log.warn("meta", "publishOrganicPost falha ao buscar page token", { message: e?.message });
      }

      const payload: Record<string, any> = {
        message:      input.message,
        access_token: pageToken,
      };

      if (input.linkUrl?.trim())  payload.link = input.linkUrl.trim();

      if (input.scheduled && input.scheduleAt) {
        payload.published              = false;
        payload.scheduled_publish_time = input.scheduleAt;
      }

      if (input.imageBase64) {
        try {
          const base64Clean = input.imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

          const photoRes = await fetch(`https://graph.facebook.com/v19.0/${input.pageId}/photos`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source:       base64Clean,
              published:    false,
              access_token: pageToken,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const photoData: any = await photoRes.json().catch(() => ({}));

          if (!photoRes.ok || photoData?.error) {
            log.warn("meta", "publishOrganicPost photo upload falhou", {
              error:  photoData?.error?.message,
              code:   photoData?.error?.code,
              status: photoRes.status,
            });
          } else if (photoData?.id) {
            payload.attached_media = JSON.stringify([{ media_fbid: photoData.id }]);
            log.info("meta", "publishOrganicPost photo upload OK", { photoId: photoData.id });
          }
        } catch (photoErr: any) {
          log.warn("meta", "publishOrganicPost photo upload erro", { message: photoErr?.message });
        }
      } else if (input.imageUrl?.trim()) {
        payload.link = input.imageUrl.trim();
      }

      const postEndpoint = `https://graph.facebook.com/v19.0/${input.pageId}/feed`;

      log.info("meta", "publishOrganicPost iniciado", {
        userId:    ctx.user.id,
        pageId:    input.pageId,
        hasLink:   !!input.linkUrl,
        scheduled: input.scheduled,
        endpoint:  postEndpoint,
      });

      const res  = await fetch(postEndpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(15000),
      });
      const data: any = await res.json().catch(() => ({}));

      if (!res.ok || data?.error) {
        const msg  = data?.error?.message || `HTTP ${res.status}`;
        const code = data?.error?.code    ? ` (código ${data.error.code})` : "";
        const tips: Record<number, string> = {
          200: " \n\n🔧 SOLUÇÃO: Acesse developers.facebook.com → seu App → Permissions → solicite 'pages_manage_posts' e 'pages_read_engagement' com Advanced Access.",
          190: " \n\n🔧 SOLUÇÃO: Token expirado. Reconecte sua conta Meta em Configurações → Integrações.",
          10:  " \n\n🔧 SOLUÇÃO: O app não tem permissão para esta ação. Verifique as permissões em developers.facebook.com.",
          100: " \n\n🔧 SOLUÇÃO: Parâmetro inválido. Verifique se o Page ID está correto.",
        };
        const tip = tips[data?.error?.code] || "";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Falha ao publicar post: ${msg}${code}${tip}`,
        });
      }

      log.info("meta", "publishOrganicPost OK", {
        userId: ctx.user.id,
        pageId: input.pageId,
        postId: data.id || data.post_id,
      });

      const postId = (data.id || data.post_id || "") as string;
      return {
        success: true,
        postId,
        postUrl: postId ? `https://www.facebook.com/${postId.replace("_", "/posts/")}` : null,
        message: "✅ Post publicado com sucesso na sua Página!",
      };
    }),

  // ── Recebe anúncios coletados pelo browser do cliente ──────────────────────
  submitClientAds: protectedProcedure
    .input(z.object({
      competitorId: z.number(),
      projectId:    z.number(),
      ads: z.array(z.object({
        adId:      z.string().optional(),
        headline:  z.string().optional(),
        bodyText:  z.string().optional(),
        imageUrl:  z.string().optional(),
        videoUrl:  z.string().optional(),
        cta:       z.string().optional(),
        pageId:    z.string().optional(),
        pageName:  z.string().optional(),
        isActive:  z.boolean().default(true),
        startDate: z.string().optional(),
        rawData:   z.string().optional(),
      })),
      source: z.string().default("client_browser"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.ads.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum anúncio para salvar." });
      }
      if (input.ads.length > 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Máximo de 100 anúncios por envio." });
      }

      let saved = 0;
      let skipped = 0;

      for (const ad of input.ads) {
        if (!ad.headline && !ad.bodyText && !ad.imageUrl) { skipped++; continue; }

        const adId = ad.adId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        try {
          await db.createScrapedAd({
            competitorId: input.competitorId,
            projectId:    input.projectId,
            platform:     "meta",
            adId,
            adType:       ad.videoUrl ? "video" : ad.imageUrl ? "image" : "text",
            headline:     ad.headline  || null,
            bodyText:     ad.bodyText  || null,
            imageUrl:     ad.imageUrl  || null,
            videoUrl:     ad.videoUrl  || null,
            cta:          ad.cta       || null,
            isActive:     ad.isActive ? 1 : 0,
            startDate:    ad.startDate ? new Date(ad.startDate) : null,
            rawData:      ad.rawData   || JSON.stringify({
              source:   input.source,
              pageId:   ad.pageId   || null,
              pageName: ad.pageName || null,
              collectedBy: "client_browser",
              collectedAt: new Date().toISOString(),
            }),
          });
          saved++;
        } catch (e: any) {
          if (!e?.message?.includes("unique") && !e?.message?.includes("duplicate")) {
            log.warn("meta", "submitClientAds: erro ao salvar ad", { adId, message: e?.message });
          } else {
            skipped++;
          }
        }
      }

      log.info("meta", "submitClientAds OK", {
        userId:       ctx.user.id,
        competitorId: input.competitorId,
        saved, skipped,
        source:       input.source,
      });

      return {
        success: true,
        saved,
        skipped,
        message: `✅ ${saved} anúncio(s) salvos com sucesso!`,
      };
    }),

  // -- Criar Lead Form na Meta automaticamente --------------------------------
  createLeadForm: protectedProcedure
    .input(z.object({
      pageId:           z.string().trim().min(1, "Selecione uma página do Facebook antes de listar/criar formulários."),
      name:             z.string().trim().min(1),
      fields:           z.array(z.string()).default(["FULL_NAME", "EMAIL", "PHONE"]),
      customQuestion:   z.string().optional(),
      thankYouMessage:  z.string().optional(),
      privacyUrl:       z.string().trim().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada." });
      const token = (integration as any).accessToken as string;

      let pageToken = token;
      try {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${token}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const accountsData: any = await accountsRes.json().catch(() => ({}));
        const page = (accountsData?.data || []).find((item: any) => String(item?.id) === String(input.pageId));
        if (page?.access_token) {
          pageToken = page.access_token;
        } else if (accountsData?.error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao obter token da página: ${accountsData.error.message}` });
        } else {
          const availablePages = Array.isArray(accountsData?.data)
            ? accountsData.data.map((item: any) => `${item?.name || "Sem nome"} (${item?.id || "sem-id"})`).join(", ")
            : "";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: availablePages
              ? `A página ${input.pageId} não retornou Page Access Token. Verifique se ela está vinculada ao usuário/admin no Business Manager. Páginas encontradas: ${availablePages}`
              : `A página ${input.pageId} não retornou Page Access Token. Verifique permissões de administrador da página e da conta Meta.`,
          });
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao obter token da página: ${e?.message || "falha desconhecida"}` });
      }

      // Monta os campos do formulário
      const questions = input.fields.map(f => ({ type: f }));
      if (input.customQuestion?.trim()) {
        questions.push({ type: "CUSTOM", label: input.customQuestion.trim() } as any);
      }

      const body: any = {
        name:             input.name,
        questions,
        privacy_policy:   { url: input.privacyUrl },
        thank_you_page:   {
          title: "Obrigado!",
          body:  input.thankYouMessage || "Em breve nossa equipe entrará em contato.",
        },
        locale: "pt_BR",
      };

      const res = await fetch(
        `https://graph.facebook.com/v19.0/${input.pageId}/leadgen_forms`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ ...body, access_token: pageToken }),
        }
      );
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.error)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao criar formulário: ${data?.error?.error_user_msg || data?.error?.message || `HTTP ${res.status}`}` });

      log.info("meta", "createLeadForm OK", { pageId: input.pageId, formId: data.id });
      return { id: data.id, name: input.name };
    }),

  // -- Lista Lead Forms de uma Página ----------------------------------------
  listLeadForms: protectedProcedure
    .input(z.object({ pageId: z.string().trim().default("") }))
    .query(async ({ input, ctx }) => {
      // Retorna lista vazia silenciosamente se pageId não foi selecionado ainda
      if (!input.pageId) return [];
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada." });
      const token = (integration as any).accessToken as string;

      let pageToken = token;
      try {
        const accountsRes = await fetch(
          `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${token}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const accountsData: any = await accountsRes.json().catch(() => ({}));
        const page = (accountsData?.data || []).find((item: any) => String(item?.id) === String(input.pageId));
        if (page?.access_token) {
          pageToken = page.access_token;
        } else if (accountsData?.error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao obter token da página: ${accountsData.error.message}` });
        } else {
          const availablePages = Array.isArray(accountsData?.data)
            ? accountsData.data.map((item: any) => `${item?.name || "Sem nome"} (${item?.id || "sem-id"})`).join(", ")
            : "";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: availablePages
              ? `A página ${input.pageId} não retornou Page Access Token. Verifique se ela está vinculada ao usuário/admin no Business Manager. Páginas encontradas: ${availablePages}`
              : `A página ${input.pageId} não retornou Page Access Token. Verifique permissões de administrador da página e da conta Meta.`,
          });
        }
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao obter token da página: ${e?.message || "falha desconhecida"}` });
      }

      const res = await fetch(
        `https://graph.facebook.com/v19.0/${input.pageId}/leadgen_forms?fields=id,name,status,leads_count&access_token=${pageToken}`
      );
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.error)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Meta leadgen_forms: ${data?.error?.error_user_msg || data?.error?.message || `HTTP ${res.status}`}` });

      return (data.data ?? []) as Array<{ id: string; name: string; status: string; leads_count?: number }>;
    }),
});

// ============ CONSULTAS ROUTER ============
const consultasRouter = router({
  // ── Busca unificada Escavador: CPF / CNPJ / Nome ─────────────────────────
  escavadorSearch: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      // FIX: caminho corrigido de "../../consultaService.js" para "../consultaService"
      const { consultarEscavadorUnificado } = await import("../consultaService");
      return await consultarEscavadorUnificado(input.query, ctx.user.id);
    }),

  buscar: protectedProcedure
    .input(z.object({ documento: z.string(), tipo: z.enum(["cpf", "cnpj"]) }))
    .mutation(async ({ input, ctx }) => {
      // executarConsulta imported statically at top of file
      const resultado = await executarConsulta({
        documento: input.documento,
        tipo:      input.tipo,
        userId:    ctx.user.id,
      });

      // Mapeia DadosCNPJ (camelCase do service) → snake_case esperado pelo Consultas.tsx
      const cnpjSnake = resultado.cnpj ? {
        razao_social:          resultado.cnpj.razaoSocial,
        nome_fantasia:         resultado.cnpj.nomeFantasia,
        situacao_cadastral:    resultado.cnpj.situacao,
        porte:                 resultado.cnpj.porte,
        capital_social:        resultado.cnpj.capitalSocial,
        data_inicio_atividade: resultado.cnpj.dataAbertura,
        cnae_fiscal_descricao: resultado.cnpj.cnae,
        email:                 resultado.cnpj.email,
        telefone:              resultado.cnpj.telefone,
        logradouro:            resultado.cnpj.logradouro,
        numero:                resultado.cnpj.numero,
        bairro:                resultado.cnpj.bairro,
        municipio:             resultado.cnpj.municipio,
        uf:                    resultado.cnpj.uf,
        cep:                   resultado.cnpj.cep,
        qsa:                   resultado.cnpj.qsa ?? [],
        fonte:                 resultado.cnpj.fonte,
      } : null;

      return {
        documento:            resultado.documento,
        tipo:                 resultado.tipo,
        cnpj:                 cnpjSnake,
        processos:            resultado.processos,
        totalProcessos:       resultado.totalProcessos,
        fontes:               resultado.fontes,
        tribunaisOk:          resultado.tribunaisOk ?? [],
        sancoesCEIS:          resultado.sancoesCEIS  ?? [],
        sancoesCNEP:          resultado.sancoesCNEP  ?? [],
        simplesNacional:      resultado.simplesNacional ?? null,
        fonteUsada:           resultado.fonteUsada,
        // Escavador
        escavadorNome:        resultado.escavadorNome,
        escavadorNascimento:  resultado.escavadorNascimento,
        escavadorSocios:      resultado.escavadorSocios,
        escavadorProcessos:   resultado.escavadorProcessos,
      };
    }),
  // Busca processo por número CNJ via Escavador API v2
  buscarPorCNJ: protectedProcedure
    .input(z.object({ numeroCNJ: z.string().min(5) }))
    .mutation(async ({ input }) => {
      const resultado = await consultarProcessoPorCNJ(input.numeroCNJ);
      if (!resultado) {
        return {
          encontrado: false,
          processo: null,
          movimentacoes: [],
          fonte: "Escavador",
          mensagem: "Processo não encontrado no Escavador. Verifique o número CNJ.",
        };
      }
      return {
        encontrado: true,
        processo: resultado.processo,
        movimentacoes: resultado.movimentacoes,
        fonte: resultado.fonte,
        mensagem: `Processo encontrado — ${resultado.movimentacoes.length} movimentação(ões)`,
      };
    }),

  list: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(({ ctx, input }) => db.getConsultasByUserId(ctx.user.id, input.limit)),
  count: protectedProcedure
    .query(({ ctx }) => db.countConsultasByUserId(ctx.user.id)),
});

// ============ SUBSCRIPTIONS ROUTER ============
const subscriptionsRouter = router({
  createCheckout: protectedProcedure
    .input(z.object({
      planSlug: z.enum(["basic", "premium", "vip"]),
      billing:  z.enum(["monthly", "yearly"]).default("monthly"),
    }))
    .mutation(async ({ input, ctx }) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe não configurado. Contate o suporte." });

      const { getStripePriceId, isPlanStripeConfigured } = await import("../stripe-config");
      if (!isPlanStripeConfigured(input.planSlug)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Plano "${input.planSlug}" sem priceId configurado. Verifique STRIPE_PRICE_${input.planSlug.toUpperCase()} no Render.` });
      }
      const priceId = getStripePriceId(input.planSlug)!;

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

      const user = ctx.user;
      const appUrl = process.env.APP_URL || "https://mecpro-ai.onrender.com";

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: user.email,
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/billing`,
        metadata: { user_id: String(user.id), plan_slug: input.planSlug, billing: input.billing },
        locale: "pt-BR",
      });

      log.info("stripe", "Checkout session criada", { userId: user.id, planSlug: input.planSlug, sessionId: session.id });
      return { url: session.url };
    }),

  portalSession: protectedProcedure
    .mutation(async ({ ctx }) => {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Stripe não configurado." });
      const user = ctx.user as any;
      if (!user.stripeCustomerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Sem assinatura ativa para gerenciar." });
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
      const appUrl = process.env.APP_URL || "https://mecpro-ai.onrender.com";
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl}/my-subscription`,
      });
      return { url: portal.url };
    }),
});

// ============ META CAMPAIGNS ROUTER ============
const metaCampaignsRouter = router({
  list: protectedProcedure
    .mutation(async ({ ctx }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta Meta não conectada. Acesse Configurações → Meta Ads." });
      }
      const token = (integration as any).accessToken as string;
      const rawAccountId = (integration as any).adAccountId as string;
      if (!rawAccountId) throw new TRPCError({ code: "BAD_REQUEST", message: "ID da conta de anúncios não configurado." });
      const act = rawAccountId.startsWith("act_") ? rawAccountId : `act_${rawAccountId}`;

      const fields = "id,name,objective,status,created_time,updated_time,daily_budget,lifetime_budget,insights{impressions,clicks,spend,cpc,cpm,ctr}";
      const res = await fetch(`https://graph.facebook.com/v19.0/${act}/campaigns?fields=${fields}&limit=100&access_token=${token}`);
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });

      const mecproIds = new Set<string>();
      try {
        const projects = await db.getProjectsByUserId(ctx.user.id);
        for (const p of projects) {
          const camps = await db.getCampaignsByProjectId(p.id);
          for (const c of camps) {
            const directMetaId = String((c as any).metaCampaignId || "").trim();
            if (directMetaId) mecproIds.add(directMetaId);
            try {
              const parsed = JSON.parse((c as any).aiResponse || "{}");
              const nestedId = String(parsed?.metaCampaignId || parsed?.campaignId || "").trim();
              if (nestedId) mecproIds.add(nestedId);
            } catch {}
          }
        }
      } catch {}

      const campaigns = (data.data || []).map((c: any) => ({
        ...c,
        source: mecproIds.has(String(c.id)) ? "mecpro" : "facebook",
      }));

      return {
        campaigns,
        total: campaigns.length,
        mecproCount: campaigns.filter((c: any) => c.source === "mecpro").length,
        facebookCount: campaigns.filter((c: any) => c.source === "facebook").length,
      };
    }),
  // -- Deletar campanha na Meta --
  delete: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${input.campaignId}?access_token=${token}`,
        { method: "DELETE" }
      );
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });
      return { success: true };
    }),

  // -- Atualizar status (ACTIVE / PAUSED) --
  updateStatus: protectedProcedure
    .input(z.object({ campaignId: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;
      const res = await fetch(`https://graph.facebook.com/v19.0/${input.campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: input.status, access_token: token }),
      });
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });
      return { success: true };
    }),

  // -- Renomear campanha --
  rename: protectedProcedure
    .input(z.object({ campaignId: z.string(), name: z.string().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;
      const res = await fetch(`https://graph.facebook.com/v19.0/${input.campaignId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name, access_token: token }),
      });
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });
      return { success: true };
    }),

  // -- Atualizar placements de um ad set via Meta API --
  updateAdSetPlacements: protectedProcedure
    .input(z.object({
      adSetId:       z.string(),
      placements:    z.array(z.string()),
      placementMode: z.enum(["auto", "manual"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;

      const PLACEMENT_MAP: Record<string, { pub: string; pos: string }> = {
        fb_feed:         { pub: "facebook",         pos: "feed" },
        fb_story:        { pub: "facebook",         pos: "story" },
        fb_reels:        { pub: "facebook",         pos: "reels" },
        fb_instream:     { pub: "facebook",         pos: "instream_video" },
        fb_marketplace:  { pub: "facebook",         pos: "marketplace" },
        fb_search:       { pub: "facebook",         pos: "search" },
        fb_right_column: { pub: "facebook",         pos: "right_hand_column" },
        fb_audience_net: { pub: "audience_network", pos: "classic" },
        ig_feed:         { pub: "instagram",        pos: "stream" },
        ig_story:        { pub: "instagram",        pos: "story" },
        ig_reels:        { pub: "instagram",        pos: "reels" },
        ig_explore:      { pub: "instagram",        pos: "explore" },
        ig_shop:         { pub: "instagram",        pos: "shop" },
      };

      async function resolveBrazilRegionKeysForUpdate(userToken: string, ufs: string[]): Promise<number[]> {
        const BR_STATE_NAMES: Record<string, string> = {
          AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
          ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
          PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
          RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
        };
        const uniqueUfs = [...new Set((ufs || []).map((uf) => String(uf || "").trim().toUpperCase()).filter(Boolean))];
        if (uniqueUfs.length === 0) return [];
        const results = await Promise.all(uniqueUfs.map(async (uf) => {
          const stateName = BR_STATE_NAMES[uf];
          if (!stateName) return null;
          const params = new URLSearchParams({ type: "adgeolocation", q: stateName, access_token: userToken });
          params.set("location_types", '["region"]');
          params.set("countries", '["BR"]');
          const res = await fetch(`https://graph.facebook.com/v19.0/search?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
          const data: any = await res.json().catch(() => ({}));
          if (!res.ok || data?.error) return null;
          const exact = (data?.data || []).find((item: any) => {
            const itemName = String(item?.name || "").trim().toLowerCase();
            const itemType = String(item?.type || "").trim().toLowerCase();
            const countryCode = String(item?.country_code || item?.country || "").trim().toUpperCase();
            return itemType === "region" && itemName === stateName.trim().toLowerCase() && (!countryCode || countryCode === "BR");
          }) || (data?.data || []).find((item: any) => String(item?.type || "").trim().toLowerCase() === "region");
          const numericKey = Number(exact?.key);
          return Number.isFinite(numericKey) ? numericKey : null;
        }));
        return results.filter((value): value is number => Number.isFinite(value));
      }

      const resolvedRegionKeys = input.regions?.length ? await resolveBrazilRegionKeysForUpdate(token, input.regions) : [];
      let targetingUpdate: any = {};

      if (input.placementMode === "auto" || input.placements.length === 0) {
        targetingUpdate = {
          targeting: {
            age_min: input.ageMin ?? 18,
            age_max: input.ageMax ?? 65,
            targeting_automation: { advantage_audience: 0 },
            geo_locations: resolvedRegionKeys.length
              ? { regions: resolvedRegionKeys.map((key) => ({ key })) }
              : { countries: input.countries?.length ? input.countries : ["BR"] },
            device_platforms: ["mobile", "desktop"],
          }
        };
      } else {
        const publishers  = new Set<string>();
        const fbPos:  string[] = [];
        const igPos:  string[] = [];
        const audPos: string[] = [];

        input.placements.forEach(id => {
          const map = PLACEMENT_MAP[id];
          if (!map) return;
          publishers.add(map.pub);
          if (map.pub === "facebook")         fbPos.push(map.pos);
          if (map.pub === "instagram")        igPos.push(map.pos);
          if (map.pub === "audience_network") audPos.push(map.pos);
        });

        targetingUpdate = {
          targeting: {
            age_min: input.ageMin ?? 18,
            age_max: input.ageMax ?? 65,
            targeting_automation: { advantage_audience: 0 },
            geo_locations: resolvedRegionKeys.length
              ? { regions: resolvedRegionKeys.map((key) => ({ key })) }
              : input.countries?.length
              ? { countries: input.countries }
              : { countries: ["BR"] },
            publisher_platforms:             Array.from(publishers),
            ...(fbPos.length  > 0 ? { facebook_positions:          fbPos }  : {}),
            ...(igPos.length  > 0 ? { instagram_positions:         igPos }  : {}),
            ...(audPos.length > 0 ? { audience_network_positions:  audPos } : {}),
          }
        };
      }

      const res = await fetch(`https://graph.facebook.com/v19.0/${input.adSetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...targetingUpdate, access_token: token }),
      });
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });
      return { success: true, adSetId: input.adSetId };
    }),

  // -- Buscar adsets + anúncios de uma campanha (detalhes) --
  details: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;

      const adsetFields = "id,name,status,daily_budget,optimization_goal,targeting,promoted_object,insights{impressions,clicks,spend,cpc,cpm,ctr,reach}";
      const adsetRes = await fetch(
        `https://graph.facebook.com/v19.0/${input.campaignId}/adsets?fields=${adsetFields}&access_token=${token}`
      );
      const adsetData = await adsetRes.json() as any;
      if (adsetData.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${adsetData.error.message}` });

      const adFields = "id,name,status,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec{link_data{link,call_to_action},video_data{call_to_action}},call_to_action{type,value{link}},link_url,object_url},insights{impressions,clicks,spend,cpc,ctr}";
      const adRes = await fetch(
        `https://graph.facebook.com/v19.0/${input.campaignId}/ads?fields=${adFields}&access_token=${token}`
      );
      const adData = await adRes.json() as any;

      return {
        adSets: adsetData.data || [],
        ads: adData.data || [],
      };
    }),

  // -- Atualizar orçamento diário do primeiro Ad Set --
  updateBudget: protectedProcedure
    .input(z.object({ adSetId: z.string(), dailyBudget: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;
      const res = await fetch(`https://graph.facebook.com/v19.0/${input.adSetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_budget: Math.round(input.dailyBudget * 100), access_token: token }),
      });
      const data = await res.json() as any;
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: `Meta: ${data.error.message}` });
      return { success: true };
    }),

  // -- Ação em massa (pausar / excluir) --
  bulkAction: protectedProcedure
    .input(z.object({
      campaignIds: z.array(z.string()).min(1),
      action: z.enum(["PAUSE", "DELETE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta não conectado." });
      const token = (integration as any).accessToken as string;
      const status = input.action === "PAUSE" ? "PAUSED" : "DELETED";
      const results = await Promise.allSettled(
        input.campaignIds.map(id =>
          fetch(`https://graph.facebook.com/v19.0/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, access_token: token }),
          }).then(r => r.json())
        )
      );
      const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any).error));
      return { success: true, total: input.campaignIds.length, failed: failed.length };
    }),

});

const tiktokBulkRouter = router({
  // -- Ação em massa TikTok (pausar / excluir) --
  bulkAction: protectedProcedure
    .input(z.object({
      campaignIds: z.array(z.string()).min(1),
      action: z.enum(["PAUSE", "DELETE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "tiktok");
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured)
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada." });
      const token = tikTokConfig.accessToken;
      const advertiserId = tikTokConfig.accountId;
      const status = input.action === "PAUSE" ? "DISABLE" : "DELETE";
      const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/status/update/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Access-Token": token },
        body: JSON.stringify({ advertiser_id: advertiserId, campaign_ids: input.campaignIds, operation_status: status }),
      });
      const resData: any = await res.json();
      if (resData.code !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: resData.message || "TikTok bulk action falhou" });
      return { success: true, total: input.campaignIds.length, failed: 0 };
    }),
});

// ============ APP ROUTER ============

// ------------------------------------------------------------------------------
// TIKTOK VIDEO AI ROUTER
// ------------------------------------------------------------------------------
const tiktokVideoRouter = router({
  generate: protectedProcedure
    .input(z.object({
      format:      z.string(),
      tone:        z.string(),
      product:     z.string(),
      audience:    z.string().default(""),
      cta:         z.string().default(""),
      campaignId:  z.number().default(0),
      projectId:   z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { gemini } = await import("../ai");

      const formatLabels: Record<string,string> = {
        product_demo:     "Demo de produto (30s)",
        testimonial:      "Depoimento/Prova social (45s)",
        tutorial:         "Tutorial How-to (60s)",
        hook_offer:       "Hook + Oferta irresistível (15s)",
        behind_scenes:    "Bastidores (30s)",
        problem_solution: "Problema→Solução (45s)",
        ugc_style:        "Estilo UGC (30s)",
        trending_sound:   "Trend/Som viral (15s)",
      };

      const toneLabels: Record<string,string> = {
        urgente:     "Urgente/FOMO",
        emocional:   "Emocional/Inspirador",
        humoristico: "Humorístico",
        educativo:   "Educativo/Informativo",
        exclusivo:   "Exclusivo/Premium",
        desafio:     "Desafio/Competição",
      };

      const durations: Record<string,string> = {
        product_demo:"30s", testimonial:"45s", tutorial:"60s",
        hook_offer:"15s", behind_scenes:"30s", problem_solution:"45s",
        ugc_style:"30s", trending_sound:"15s",
      };

      const sceneCount = parseInt(durations[input.format] || "30") / 5;

      const prompt = `Você é um especialista em marketing de vídeo viral para TikTok, com profundo conhecimento do algoritmo TikTok em 2026.

Crie um ROTEIRO COMPLETO e DETALHADO para um vídeo TikTok com as seguintes especificações:

PRODUTO/SERVIÇO: ${input.product}
PÚBLICO-ALVO: ${input.audience || "Empreendedores e profissionais de marketing"}
FORMATO: ${formatLabels[input.format] || input.format}
TOM/ESTILO: ${toneLabels[input.tone] || input.tone}
DURAÇÃO: ${durations[input.format] || "30s"}
CTA DESEJADO: ${input.cta || "Acesse o link na bio"}
PAÍS: Brasil (PT-BR)

REGRAS:
- Hook nos primeiros 3 segundos DEVE parar o scroll
- Ratio 9:16 (vertical)
- Texto na tela: máximo 6 palavras por cena
- Narração natural, linguagem conversacional
- Música deve combinar com o tom
- Hashtags relevantes e com volume de busca real no Brasil

Retorne APENAS um JSON válido sem markdown:
{
  "title": "título do vídeo",
  "totalDuration": "${durations[input.format] || "30s"}",
  "hook": "frase exata do hook (primeiros 3s)",
  "format": "${input.format}",
  "ratio": "9:16",
  "targetEmotion": "emoção principal que o vídeo deve provocar",
  "scenes": [
    {
      "scene": 1,
      "duration": "3s",
      "visual": "descrição detalhada do que aparece na tela",
      "text": "texto sobreposto na tela (máx 6 palavras)",
      "voiceover": "narração exata desta cena",
      "musicMood": "mood da música (ex: energético, emocional)",
      "transition": "tipo de transição para próxima cena"
    }
  ],
  "hashtags": ["#hashtag1","#hashtag2","#hashtag3","#hashtag4","#hashtag5","#hashtag6","#hashtag7","#hashtag8"],
  "bestPostTime": "melhor horário para postar no Brasil",
  "viralTip": "dica específica para viralizar este vídeo no TikTok BR",
  "cta": "call-to-action final do vídeo"
}

Crie exatamente ${Math.max(3, Math.round(sceneCount))} cenas no array scenes.`;

      const raw = await (gemini as any)(prompt, { temperature: 0.75 });
      let parsed: any;
      try {
        const clean = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR",
          message: "IA retornou formato inválido. Tente novamente." });
      }

      return { success: true, script: parsed };
    }),
});


// ------------------------------------------------------------------------------
// ALERTS & WEEKLY REPORT ROUTER
// ------------------------------------------------------------------------------
const alertsRouter = router({

  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      const _aDrz = await getDb();
      const rows = _aDrz ? await _aDrz.select().from(userAlertConfigs)
        .where(eq(userAlertConfigs.userId, ctx.user.id)) : [];
      if (rows.length === 0) return null;
      const r = rows[0] as any;
      return {
        cpcMax:              r.cpcMax            ?? 5,
        cplMax:              r.cplMax            ?? 30,
        cpmMax:              r.cpmMax            ?? 20,
        ctrMin:              r.ctrMin            ?? 0.01,
        spendDailyMax:       r.spendDailyMax     ?? 200,
        weeklyReportEnabled: r.weeklyReportEnabled === 1,
        weeklyReportDay:     r.weeklyReportDay   ?? 1,
        weeklyReportHour:    r.weeklyReportHour  ?? 9,
        alertEmail:          r.alertEmail        ?? "",
        platforms:           r.platforms ? JSON.parse(r.platforms) : ["meta","google","tiktok"],
      };
    } catch { return null; }
  }),

  save: protectedProcedure
    .input(z.object({
      cpcMax:              z.number().default(5),
      cplMax:              z.number().default(30),
      cpmMax:              z.number().default(20),
      ctrMin:              z.number().default(0.01),
      spendDailyMax:       z.number().default(200),
      weeklyReportEnabled: z.boolean().default(true),
      weeklyReportDay:     z.number().min(0).max(6).default(1),
      weeklyReportHour:    z.number().min(0).max(23).default(9),
      alertEmail:          z.string().email().optional().or(z.literal("")),
      platforms:           z.array(z.string()).default(["meta","google","tiktok"]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const _aSave = await getDb();
        const rows = _aSave ? await _aSave.select().from(userAlertConfigs)
          .where(eq(userAlertConfigs.userId, ctx.user.id)) : [];
        const data = {
          cpcMax:              input.cpcMax,
          cplMax:              input.cplMax,
          cpmMax:              input.cpmMax,
          ctrMin:              input.ctrMin,
          spendDailyMax:       input.spendDailyMax,
          weeklyReportEnabled: input.weeklyReportEnabled ? 1 : 0,
          weeklyReportDay:     input.weeklyReportDay,
          weeklyReportHour:    input.weeklyReportHour,
          alertEmail:          input.alertEmail || null,
          platforms:           JSON.stringify(input.platforms),
          updatedAt:           new Date(),
        } as any;
        if (rows.length > 0) {
          const _aSave2 = await getDb();
          if (_aSave2) await _aSave2.update(userAlertConfigs).set(data)
            .where(eq(userAlertConfigs.userId, ctx.user.id));
        } else {
          const _aDrz3 = await getDb();
        if (_aDrz3) await _aDrz3.insert(userAlertConfigs).values({ ...data, userId: ctx.user.id });
        }
      } catch (e: any) {
        // table may not exist yet — silently skip
        log.warn("alerts", "userAlertConfigs not ready yet:", e.message);
      }
      return { success: true };
    }),

  sendTestReport: protectedProcedure
    .mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      const { sendWeeklyReport } = await import("../email");
      await sendWeeklyReport((user as any).email, (user as any).name || "usuário", {
        meta:   { campaigns: 3, spend: 1250.50, impressions: 45000, clicks: 890, cpc: 1.40, ctr: 0.0198 },
        google: { campaigns: 2, spend: 680.00,  impressions: 22000, clicks: 540, cpc: 1.26, ctr: 0.0245 },
        tiktok: { campaigns: 1, spend: 320.00,  impressions: 85000, clicks: 1200, cpc: 0.27, ctr: 0.0141 },
        period: "últimos 7 dias (relatório de teste)",
        generatedAt: new Date().toISOString(),
      });
      return { success: true };
    }),

  checkAndAlert: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Called periodically — checks thresholds and fires notifications
      try {
        const _aSave = await getDb();
        const rows = _aSave ? await _aSave.select().from(userAlertConfigs)
          .where(eq(userAlertConfigs.userId, ctx.user.id)) : [];
        if (rows.length === 0) return { alerts: [] };
        const cfg = rows[0] as any;
        const platforms: string[] = cfg.platforms ? JSON.parse(cfg.platforms) : ["meta"];
        const alerts: string[] = [];

        // Meta check
        if (platforms.includes("meta")) {
          try {
            const integration = await db.getApiIntegration(ctx.user.id, "meta");
            if (integration && (integration as any).accessToken) {
              const token  = (integration as any).accessToken;
              const act    = ((integration as any).adAccountId || "").replace(/^(?!act_)/,"act_");
              const fields = "insights{cpc,cpm,ctr,spend}";
              const res    = await fetch(`https://graph.facebook.com/v19.0/${act}/campaigns?fields=${fields}&limit=20&access_token=${token}`);
              const data: any = await res.json();
              if (!data.error) {
                for (const c of (data.data || [])) {
                  const ins = c.insights?.data?.[0];
                  if (!ins) continue;
                  const cpc = Number(ins.cpc || 0) * 100;
                  const cpm = Number(ins.cpm || 0) * 100;
                  const ctr = Number(ins.ctr || 0);
                  if (cfg.cpcMax && cpc > cfg.cpcMax) alerts.push(`📘 Meta — Campanha "${c.name}": CPC R$ ${cpc.toFixed(2)} > limite R$ ${cfg.cpcMax}`);
                  if (cfg.cpmMax && cpm > cfg.cpmMax) alerts.push(`📘 Meta — Campanha "${c.name}": CPM R$ ${cpm.toFixed(2)} > limite R$ ${cfg.cpmMax}`);
                  if (cfg.ctrMin && ctr < cfg.ctrMin) alerts.push(`📘 Meta — Campanha "${c.name}": CTR ${(ctr*100).toFixed(2)}% < mínimo ${(cfg.ctrMin*100).toFixed(2)}%`);
                }
              }
            }
          } catch {}
        }

        // Create in-app notifications for triggered alerts
        for (const msg of alerts.slice(0, 5)) {
          try {
            await db.createNotification({
              userId: ctx.user.id,
              title:  "⚠️ Alerta de performance",
              message: msg,
              type:    "alert",
              actionUrl: "/unified-dashboard",
            } as any);
          } catch {}
        }

        return { alerts, count: alerts.length };
      } catch (e: any) {
        return { alerts: [], count: 0 };
      }
    }),
});

// ============ ACADEMY ROUTER ============
const academyRouter = router({
  // Marcar aula como concluída
  completeLesson: protectedProcedure
    .input(z.object({ courseSlug: z.string(), lessonId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return db.markLessonComplete((ctx as any).user.id, input.courseSlug, input.lessonId);
    }),

  // Buscar progresso de um curso específico
  getCourseProgress: protectedProcedure
    .input(z.object({ courseSlug: z.string() }))
    .query(async ({ input, ctx }) => {
      return db.getLessonProgress((ctx as any).user.id, input.courseSlug);
    }),

  // Buscar progresso de todos os cursos do usuário
  getAllProgress: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getAllLessonProgress((ctx as any).user.id);
    }),
});

const googleCampaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d"]).default("30d") }).optional())
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      if (runtime.isManager && !runtime.childCustomerIds?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O Customer ID Google configurado é uma conta gerente (MCC) sem conta cliente elegível. Informe um Customer ID de anunciante ou configure GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
        });
      }

      const period = input?.period ?? "30d";
      const since = daysAgo(period === "7d" ? 7 : period === "90d" ? 90 : 30);
      const listQuery = "SELECT campaign.id, campaign.name, campaign.status FROM campaign ORDER BY campaign.id DESC LIMIT 100";
      const data = await googleAdsPost<any>(
        "googleAds:search",
        { query: listQuery },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );

      const metricsById = new Map<string, any>();
      try {
        const metricsData = await googleAdsPost<any>(
          "googleAds:search",
          {
            query: `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${since}' AND '${today()}' LIMIT 100`,
          },
          runtime.accessToken,
          runtime.developerToken,
          runtime.customerId,
          runtime.loginCustomerId,
        );
        for (const row of metricsData.results || []) {
          metricsById.set(String(row.campaign?.id || ""), row.metrics || {});
        }
      } catch (error: any) {
        const message = String(error?.message || "");
        if (!shouldFallbackGoogleQueryError(message)) throw error;
        log.warn("google", "googleCampaigns.list metrics fallback", {
          customerId: runtime.customerId,
          loginCustomerId: runtime.loginCustomerId || "(none)",
          reason: message.slice(0, 200),
        });
      }

      const campaigns = (data.results || []).map((row: any) => {
        const metrics = metricsById.get(String(row.campaign?.id || "")) || {};
        const impressions = Number(metrics.impressions || 0);
        const clicks = Number(metrics.clicks || 0);
        const costMicros = Number(metrics.costMicros ?? metrics.cost_micros ?? 0);
        return {
          id: String(row.campaign?.id || ""),
          name: row.campaign?.name || "Campanha Google",
          status: String(row.campaign?.status || "UNKNOWN"),
          channelType: "SEARCH",
          startDate: null,
          endDate: null,
          budgetMicros: 0,
          metrics: {
            impressions,
            clicks,
            costMicros,
            averageCpc: clicks > 0 ? costMicros / clicks : 0,
            averageCpm: impressions > 0 ? (costMicros / impressions) * 1000 : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          },
        };
      });

      return {
        campaigns,
        total: campaigns.length,
        googleContext: runtime.isManager
          ? {
              managerCustomerId: runtime.managerCustomerId,
              childCustomerIds: runtime.childCustomerIds,
              usingCustomerId: runtime.customerId,
            }
          : null,
      };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), status: z.enum(["ENABLED", "PAUSED", "REMOVED"]) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      const resourceName = `customers/${runtime.customerId}/campaigns/${input.campaignId}`;
      const operations = input.status === "REMOVED"
        ? [{ remove: resourceName }]
        : [{ update: { resourceName, status: input.status }, updateMask: "status" }];
      await googleAdsPost<any>(
        "campaigns:mutate",
        { operations },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );
      return {
        success: true,
        campaignId: input.campaignId,
        status: input.status,
        operation: input.status === "REMOVED" ? "remove" : "update",
      };
    }),

  rename: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), name: z.string().trim().min(2).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      const resourceName = `customers/${runtime.customerId}/campaigns/${input.campaignId}`;
      await googleAdsPost<any>(
        "campaigns:mutate",
        { operations: [{ update: { resourceName, name: input.name }, updateMask: "name" }] },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );
      return { success: true };
    }),

  updateBudget: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), dailyBudget: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);

      const budgetLookup = await googleAdsPost<any>(
        "googleAds:search",
        { query: `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${input.campaignId} LIMIT 1` },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );
      const budgetResourceName = String(budgetLookup.results?.[0]?.campaign?.campaignBudget || budgetLookup.results?.[0]?.campaign?.campaign_budget || "");
      if (!budgetResourceName) throw new TRPCError({ code: "BAD_REQUEST", message: "Budget da campanha não encontrado no Google Ads" });

      await googleAdsPost<any>(
        "campaignBudgets:mutate",
        { operations: [{ update: { resourceName: budgetResourceName, amountMicros: Math.round(input.dailyBudget * 1_000_000) }, updateMask: "amount_micros" }] },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );
      return { success: true, budgetResourceName };
    }),

  details: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), period: z.enum(["7d", "30d", "90d"]).default("30d") }).optional())
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      const period = input?.period ?? "30d";
      const since = daysAgo(period === "7d" ? 7 : period === "90d" ? 90 : 30);

      const adGroups = await googleAdsPost<any>(
        "googleAds:search",
        { query: `SELECT ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr FROM ad_group WHERE campaign.id = ${input?.campaignId} AND segments.date BETWEEN '${since}' AND '${today()}' LIMIT 100` },
        runtime.accessToken,
        runtime.developerToken,
        runtime.customerId,
        runtime.loginCustomerId,
      );

      let ads: any[] = [];
      try {
        const adsData = await googleAdsPost<any>(
          "googleAds:search",
          { query: `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${input?.campaignId} LIMIT 100` },
          runtime.accessToken,
          runtime.developerToken,
          runtime.customerId,
          runtime.loginCustomerId,
        );
        ads = adsData.results || [];
      } catch (error: any) {
        log.warn("google", "details ads query failed", { campaignId: input?.campaignId, error: error.message });
      }

      return { adGroups: adGroups.results || [], ads };
    }),

  // -- Ação em massa (pausar / remover) --
  bulkAction: protectedProcedure
    .input(z.object({
      campaignIds: z.array(z.string()).min(1),
      action: z.enum(["PAUSE", "DELETE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "google");
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google Ads não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      const status = input.action === "PAUSE" ? "PAUSED" : "REMOVED";
      const operations = input.campaignIds.map(id => ({
        update: { resourceName: `customers/${runtime.customerId}/campaigns/${id}`, status },
        updateMask: { paths: ["status"] },
      }));
      const res = await fetch(
        `https://googleads.googleapis.com/v17/customers/${runtime.customerId}/campaigns:mutate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${runtime.accessToken}`,
            "developer-token": runtime.developerToken,
            "login-customer-id": runtime.loginCustomerId,
          },
          body: JSON.stringify({ operations }),
        }
      );
      const resData: any = await res.json();
      if (!res.ok || resData.error) throw new TRPCError({ code: "BAD_REQUEST", message: resData.error?.message || `Google HTTP ${res.status}` });
      return { success: true, total: input.campaignIds.length, failed: 0 };
    }),
});

const tiktokCampaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d"]).default("30d") }).optional())
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "tiktok");
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada. Salve access token + advertiser ID nas Configurações ou defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID no ambiente." });
      }
      const token = tikTokConfig.accessToken;
      const advertiserId = tikTokConfig.accountId;
      const listResp = await fetch(`https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&page_size=100`, {
        headers: { "Access-Token": token },
      });
      const listData: any = await listResp.json().catch(() => ({}));
      if (!listResp.ok || listData.code !== 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: listData.message || `TikTok HTTP ${listResp.status}` });
      }

      const period = input?.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const reportResp = await fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`, {
        method: "POST",
        headers: { "Access-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          report_type: "BASIC",
          dimensions: ["campaign_id"],
          metrics: ["spend", "impressions", "clicks", "cpc", "cpm", "ctr"],
          start_date: daysAgo(days),
          end_date: today(),
          page_size: 100,
        }),
      });
      const reportData: any = await reportResp.json().catch(() => ({}));
      const metricsById = new Map<string, any>();
      if (reportResp.ok && reportData.code === 0) {
        for (const row of reportData.data?.list || []) metricsById.set(String(row.dimensions?.campaign_id || row.campaign_id || ""), row.metrics || {});
      }

      const campaigns = (listData.data?.list || []).map((c: any) => ({
        id: String(c.campaign_id || c.id || ""),
        name: c.campaign_name || c.name || "Campanha TikTok",
        status: String(c.operation_status || c.secondary_status || c.status || "DISABLE"),
        objective: c.objective_type || c.objective || "TRAFFIC",
        budget: Number(c.budget || 0),
        budgetMode: c.budget_mode || null,
        createTime: c.create_time || null,
        metrics: (() => {
          const m = metricsById.get(String(c.campaign_id || c.id || "")) || {};
          return {
            spend: Number(m.spend || 0),
            impressions: Number(m.impressions || 0),
            clicks: Number(m.clicks || 0),
            cpc: Number(m.cpc || 0),
            cpm: Number(m.cpm || 0),
            ctr: Number(m.ctr || 0),
          };
        })(),
      }));

      return { campaigns, total: campaigns.length };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), status: z.enum(["ENABLE", "DISABLE", "DELETE"]) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "tiktok");
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada. Salve access token + advertiser ID nas Configurações ou defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID no ambiente." });
      }
      await tikTokPost<any>("campaign/status/update/", {
        advertiser_id: tikTokConfig.accountId,
        campaign_ids: [input.campaignId],
        operation_status: input.status,
      }, tikTokConfig.accessToken);
      return { success: true };
    }),

  rename: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), name: z.string().trim().min(2).max(512) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "tiktok");
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada. Salve access token + advertiser ID nas Configurações ou defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID no ambiente." });
      }
      await tikTokPost<any>("campaign/update/", {
        advertiser_id: tikTokConfig.accountId,
        campaign_id: input.campaignId,
        campaign_name: input.name,
      }, tikTokConfig.accessToken);
      return { success: true };
    }),

  updateBudget: protectedProcedure
    .input(z.object({ campaignId: z.string().min(1), budget: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "tiktok");
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada. Salve access token + advertiser ID nas Configurações ou defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID no ambiente." });
      }
      await tikTokPost<any>("campaign/update/", {
        advertiser_id: tikTokConfig.accountId,
        campaign_id: input.campaignId,
        budget: input.budget,
      }, tikTokConfig.accessToken);
      return { success: true };
    }),
});

// ------------------------------------------------------------------------------
// UNIFIED DASHBOARD ROUTER — métricas consolidadas Meta + Google + TikTok
// ------------------------------------------------------------------------------

const unifiedRouter = router({

  metaMetrics: protectedProcedure
    .input(z.object({ period: z.enum(["7d","30d","90d"]).default("30d") }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integração Meta não configurada" });
      }
      const token    = (integration as any).accessToken as string;
      const rawAccId = (integration as any).adAccountId as string;
      if (!rawAccId) throw new TRPCError({ code: "BAD_REQUEST", message: "Ad Account ID Meta não configurado" });
      const act    = rawAccId.startsWith("act_") ? rawAccId : `act_${rawAccId}`;
      const days   = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
      const since  = daysAgo(days);
      const fields = `id,name,status,insights.time_range({"since":"${since}","until":"${today()}"}){impressions,clicks,spend,cpc,cpm,ctr,actions}`;
      const res    = await fetch(`https://graph.facebook.com/v19.0/${act}/campaigns?fields=${encodeURIComponent(fields)}&limit=1000&access_token=${token}`);
      const data: any = await res.json();
      if (data.error) throw new TRPCError({ code: "BAD_REQUEST", message: data.error.message });
      const camps = (data.data || []) as any[];
      let spend=0, impressions=0, clicks=0;
      camps.forEach((c: any) => {
        const ins = c.insights?.data?.[0];
        if (ins) { spend+=Number(ins.spend||0)*100; impressions+=Number(ins.impressions||0); clicks+=Number(ins.clicks||0); }
      });
      const cpc = clicks  > 0 ? spend/clicks  : 0;
      const cpm = impressions > 0 ? (spend/impressions)*1000 : 0;
      const ctr = impressions > 0 ? clicks/impressions : 0;
      return { campaigns: camps.length, spend, impressions, clicks, cpc, cpm, ctr, roas: 0 };
    }),

  googleMetrics: protectedProcedure
    .input(z.object({ period: z.enum(["7d","30d","90d"]).default("30d") }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "google"), eq(integrations.isActive, 1)));
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integração Google não configurada" });
      const runtime = await resolveGoogleAdsRuntimeContext(integration as any);
      if (runtime.isManager && !runtime.childCustomerIds?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O Customer ID Google configurado é uma conta gerente (MCC) sem conta cliente elegível. Informe um Customer ID de anunciante ou configure GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
        });
      }
      const days    = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
      const since   = daysAgo(days);
      const gaQuery = `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${since}' AND '${today()}' LIMIT 100`;
      const googleUrl = buildGoogleAdsUrl(runtime.customerId.replace(/-/g,""), "googleAds:search");
      let resp = await fetch(googleUrl, {
        method: "POST",
        headers: {
          "Authorization":      `Bearer ${runtime.accessToken}`,
          "developer-token":    runtime.developerToken,
          "Content-Type":       "application/json",
          ...(runtime.loginCustomerId ? { "login-customer-id": runtime.loginCustomerId.replace(/-/g, "") } : {}),
        },
        body: JSON.stringify({ query: gaQuery }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => `HTTP ${resp.status}`);
        const shouldFallback = shouldFallbackGoogleQueryError(text);
        if (!shouldFallback) {
          const isHtml = text.trim().startsWith("<");
          log.warn("google", "googleMetrics HTTP error", {
            status: resp.status,
            isHtml,
            preview: text.slice(0, 200),
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: isHtml
              ? `Google Ads API retornou erro HTTP ${resp.status}. Verifique se o Developer Token tem Basic Access em ads.google.com → API Center.`
              : `Google Ads API erro: ${text.slice(0, 300)}`,
          });
        }

        log.warn("google", "googleMetrics fallback query", { customerId: runtime.customerId, loginCustomerId: runtime.loginCustomerId || "(none)", preview: text.slice(0, 200) });
        resp = await fetch(googleUrl, {
          method: "POST",
          headers: {
            "Authorization":      `Bearer ${runtime.accessToken}`,
            "developer-token":    runtime.developerToken,
            "Content-Type":       "application/json",
            ...(runtime.loginCustomerId ? { "login-customer-id": runtime.loginCustomerId.replace(/-/g, "") } : {}),
          },
          body: JSON.stringify({ query: "SELECT campaign.id FROM campaign LIMIT 100" }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
          const fallbackText = await resp.text().catch(() => `HTTP ${resp.status}`);
          throw new TRPCError({ code: "BAD_REQUEST", message: `Google Ads API erro: ${fallbackText.slice(0, 300)}` });
        }
      }

      const data: any = await resp.json().catch(() => ({}));
      if (data.error) {
        log.warn("google", "googleMetrics API error", { error: data.error });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Google Ads: ${data.error?.message || JSON.stringify(data.error)}`,
        });
      }

      const rows = data.results || [];
      let spend=0, impressions=0, clicks=0;
      rows.forEach((r: any) => {
        const micros = Number(r.metrics?.costMicros ?? r.metrics?.cost_micros ?? 0);
        spend       += micros / 1_000_000;
        impressions += Number(r.metrics?.impressions || 0);
        clicks      += Number(r.metrics?.clicks || 0);
      });
      const cpc = clicks > 0 ? spend/clicks : 0;
      const cpm = impressions > 0 ? (spend/impressions)*1000 : 0;
      const ctr = impressions > 0 ? clicks/impressions : 0;
      return { campaigns: rows.length, spend, impressions, clicks, cpc, cpm, ctr };
    }),

  tiktokMetrics: protectedProcedure
    .input(z.object({ period: z.enum(["7d","30d","90d"]).default("30d") }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx as any).user?.id;
      const _drz = await getDb();
      const [integration] = await _drz!.select().from(integrations)
        .where(and(eq(integrations.userId, userId), eq(integrations.provider, "tiktok"), eq(integrations.isActive, 1)));
      const tikTokConfig = getTikTokRuntimeConfig(integration as any);
      if (!tikTokConfig.configured) throw new TRPCError({ code: "NOT_FOUND", message: "Integração TikTok não configurada. Salve access token + advertiser ID nas Configurações ou defina TIKTOK_ACCESS_TOKEN e TIKTOK_ADVERTISER_ID no ambiente." });
      const token        = tikTokConfig.accessToken;
      const advertiserId = tikTokConfig.accountId;
      const days = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
      const listResp = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${advertiserId}&page_size=100`,
        { headers: { "Access-Token": token } }
      );
      const listData: any = await listResp.json();
      if (listData.code !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: listData.message });
      const camps = (listData.data?.list || []) as any[];
      const reportResp = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`, {
          method: "POST",
          headers: { "Access-Token": token, "Content-Type": "application/json" },
          body: JSON.stringify({
            advertiser_id: advertiserId,
            report_type:   "BASIC",
            dimensions:    ["campaign_id"],
            metrics:       ["spend","impressions","clicks","cpc","cpm","ctr"],
            start_date:    daysAgo(days),
            end_date:      today(),
            page_size:     100,
          }),
        }
      );
      const reportData: any = await reportResp.json();
      let spend=0, impressions=0, clicks=0;
      if (reportData.code === 0) {
        (reportData.data?.list || []).forEach((r: any) => {
          spend       += Number(r.metrics?.spend       || 0) * 100;
          impressions += Number(r.metrics?.impressions || 0);
          clicks      += Number(r.metrics?.clicks      || 0);
        });
      }
      const cpc = clicks > 0 ? spend/clicks : 0;
      const cpm = impressions > 0 ? (spend/impressions)*1000 : 0;
      const ctr = impressions > 0 ? clicks/impressions : 0;
      return { campaigns: camps.length, spend, impressions, clicks, cpc, cpm, ctr };
    }),

  // ── Saldo e billing de cada plataforma ────────────────────────────────────
  billing: protectedProcedure
    .query(async ({ ctx }) => {
      const results: Record<string, any> = {};

      // ── META BILLING ──────────────────────────────────────────────────────
      try {
        const metaInt = await db.getApiIntegration(ctx.user.id, "meta");
        const token   = (metaInt as any)?.accessToken;
        const rawAct  = (metaInt as any)?.adAccountId;
        if (token && rawAct) {
          const act = rawAct.startsWith("act_") ? rawAct : `act_${rawAct}`;
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${act}?fields=balance,amount_spent,spend_cap,currency,account_status,funding_source_details,min_daily_budget&access_token=${token}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const d: any = await res.json();
          if (!d.error) {
            const balance    = Number(d.balance    || 0) / 100;
            const spent      = Number(d.amount_spent || 0) / 100;
            const cap        = Number(d.spend_cap   || 0) / 100;
            const remaining  = cap > 0 ? cap - spent : null;
            const dailyAvg   = spent > 0 ? spent / 30 : 0;
            const daysLeft   = (remaining && dailyAvg > 0) ? Math.floor(remaining / dailyAvg) : null;
            results.meta = {
              connected:   true,
              balance,
              spent,
              cap:         cap > 0 ? cap : null,
              remaining,
              currency:    d.currency || "BRL",
              status:      d.account_status,
              daysLeft,
              dailyAvg,
              fundingType: d.funding_source_details?.type || null,
              rechargeUrl: `https://business.facebook.com/billing/manage/?act=${rawAct.replace("act_","")}`,
              alert:       daysLeft !== null && daysLeft <= 5 ? "critical"
                         : daysLeft !== null && daysLeft <= 10 ? "warning" : null,
            };
          } else {
            results.meta = { connected: true, error: d.error.message };
          }
        } else {
          results.meta = { connected: false };
        }
      } catch (e: any) {
        results.meta = { connected: true, error: e.message };
      }

      // ── GOOGLE BILLING ────────────────────────────────────────────────────
      try {
        const gInt = await db.getApiIntegration(ctx.user.id, "google");
        if ((gInt as any)?.accessToken && (gInt as any)?.accountId) {
          const customerId = String((gInt as any).accountId).replace(/-/g, "");
          const runtime = await resolveGoogleAdsRuntimeContext(gInt as any);
          if (!runtime.isManager) {
            const query = `SELECT customer.descriptive_name, customer.currency_code, billing_setup.status, billing_setup.payments_account, customer_client.status FROM billing_setup WHERE billing_setup.status = 'APPROVED' LIMIT 1`;
            try {
              const billingRes = await googleAdsPost(
                `customers/${customerId}/googleAds:search`,
                { query },
                gInt as any
              ) as any;
              const row = billingRes?.results?.[0];
              results.google = {
                connected:   true,
                currency:    row?.customer?.currencyCode || "BRL",
                status:      row?.billingSetup?.status || "UNKNOWN",
                rechargeUrl: `https://ads.google.com/aw/billing/summary?ocid=${customerId}`,
                alert:       null,
              };
            } catch {
              results.google = {
                connected: true,
                rechargeUrl: `https://ads.google.com/aw/billing/summary`,
                alert: null,
              };
            }
          } else {
            results.google = { connected: true, isManager: true, rechargeUrl: `https://ads.google.com/aw/billing/summary` };
          }
        } else {
          results.google = { connected: false };
        }
      } catch (e: any) {
        results.google = { connected: true, error: e.message };
      }

      // ── TIKTOK BILLING ────────────────────────────────────────────────────
      try {
        const ttInt = await db.getApiIntegration(ctx.user.id, "tiktok");
        const ttToken = (ttInt as any)?.accessToken;
        const ttAdvId = (ttInt as any)?.accountId;
        if (ttToken && ttAdvId) {
          const res = await fetch(
            `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${ttAdvId}"]&fields=["balance","currency","status","name"]`,
            { headers: { "Access-Token": ttToken }, signal: AbortSignal.timeout(8000) }
          );
          const d: any = await res.json();
          const info = d?.data?.list?.[0];
          if (info) {
            const balance  = Number(info.balance || 0);
            const dailyAvg = 0; // TikTok não expõe spent diretamente neste endpoint
            results.tiktok = {
              connected:   true,
              balance,
              currency:    info.currency || "BRL",
              status:      info.status,
              rechargeUrl: `https://ads.tiktok.com/i18n/finance/home`,
              alert:       balance < 50 ? "warning" : null,
            };
          } else {
            results.tiktok = { connected: true, rechargeUrl: "https://ads.tiktok.com/i18n/finance/home" };
          }
        } else {
          results.tiktok = { connected: false };
        }
      } catch (e: any) {
        results.tiktok = { connected: true, error: e.message };
      }

      return results;
    }),
});

// ─── Autonomous Agent Router ─────────────────────────────────────────────────
const autonomousAgentRouter = router({

  // Roda o agente para uma campanha específica
  runForCampaign: protectedProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { runAgentForCampaign } = await import("../autonomousAgent.js");
      const decision = await runAgentForCampaign(input.campaignId, ctx.user.id);
      if (!decision) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada ou sem dados publicados." });
      return decision;
    }),

  // Roda o agente para todas as campanhas de um projeto
  runForProject: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { runAgentForProject } = await import("../autonomousAgent.js");
      const decisions = await runAgentForProject(input.projectId, ctx.user.id);
      return {
        total:     decisions.length,
        decisions: decisions.map(d => ({
          campaignId: d.campaignId,
          action:     d.action,
          score:      d.score,
          reason:     d.reason,
          executed:   d.executed,
          llmUsed:    d.llmUsed,
          metrics:    d.metrics ? {
            ctr:   +d.metrics.ctr.toFixed(2),
            cpc:   +d.metrics.cpc.toFixed(2),
            spend: +d.metrics.spend.toFixed(2),
          } : null,
        })),
        summary: {
          paused:    decisions.filter(d => d.action === "pause_campaign").length,
          scaled:    decisions.filter(d => d.action === "scale_budget").length,
          adjusted:  decisions.filter(d => d.action === "adjust_budget").length,
          creatives: decisions.filter(d => d.action === "suggest_creative").length,
          executed:  decisions.filter(d => d.executed).length,
        },
      };
    }),

  // Status do agente (modo atual, LLM principal)
  status: protectedProcedure
    .query(async () => {
      const { getLLMMode } = await import("../ai.js");
      return {
        mode:          process.env.AUTONOMOUS_AGENT_MODE || "observe",
        llmPrincipal:  getLLMMode() === "on" ? "gemini" : "groq",
        claudeEnabled: !!process.env.ANTHROPIC_API_KEY,
        groqEnabled:   !!process.env.GROQ_API_KEY,
        thresholds: {
          pause:  Number(process.env.AGENT_PAUSE_THRESHOLD  || 35),
          scale:  Number(process.env.AGENT_SCALE_THRESHOLD  || 78),
        },
      };
    }),
});

// ─── LLM Toggle Router ────────────────────────────────────────────────────────
const llmToggleRouter = router({

  // Retorna o estado atual do toggle
  getMode: protectedProcedure
    .query(async () => {
      const { getLLMMode } = await import("../ai.js");
      const mode = getLLMMode();
      return {
        mode,
        label:     mode === "on" ? "🟢 IA Categoria A (máxima qualidade)" : "🟡 IA Categoria B (econômica)",
        principal: mode === "on" ? "IA Categoria A" : "IA Categoria B",
        groqConfigured: !!process.env.GROQ_API_KEY,
        geminiConfigured: !!process.env.GEMINI_API_KEY,
      };
    }),

  // Alterna o modo (só admin/superadmin)
  setMode: protectedProcedure
    .input(z.object({ mode: z.enum(["on", "off"]) }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "superadmin"].includes((ctx.user as any)?.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admins podem alterar o modo LLM." });
      }
      const { setLLMMode } = await import("../ai.js");
      setLLMMode(input.mode);
      // Persiste no banco para sobreviver a reinicializações
      await db.saveAdminSetting("llm_mode", input.mode);
      log.info("server", `LLM Mode alterado por admin ${ctx.user.id}`, { mode: input.mode });
      return {
        success: true,
        mode:    input.mode,
        label:   input.mode === "on" ? "🟢 IA Categoria A (máxima qualidade)" : "🟡 IA Categoria B (econômica)",
      };
    }),
});

// ─── Media Budget Router ─────────────────────────────────────────────────────
const mediaBudgetRouter = router({

  // Retorna saldo e histórico do cliente
  getBalance: protectedProcedure
    .query(async ({ ctx }) => {
      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Saldo atual
      const balRes = await pool.query(
        `SELECT balance, "totalDeposited", "totalFees" FROM media_balance WHERE "userId" = $1`,
        [ctx.user.id]
      );
      const balance = balRes.rows[0] || { balance: 0, totalDeposited: 0, totalFees: 0 };

      // Histórico de depósitos (últimos 20)
      const histRes = await pool.query(
        `SELECT id, amount, "feePercent", "feeAmount", "netAmount", type, status, method, notes, "createdAt", "approvedAt"
         FROM media_budget WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
        [ctx.user.id]
      );

      return {
        balance:        Math.round(Number(balance.balance)) / 100,
        totalDeposited: Math.round(Number(balance.totalDeposited)) / 100,
        totalFees:      Math.round(Number(balance.totalFees)) / 100,
        history:        histRes.rows.map(r => ({
          id:         r.id,
          amount:     Number(r.amount) / 100,
          feePercent: r.feePercent,
          feeAmount:  Number(r.feeAmount) / 100,
          netAmount:  Number(r.netAmount) / 100,
          type:       r.type,
          status:     r.status,
          method:     r.method,
          notes:      r.notes,
          createdAt:  r.createdAt,
          approvedAt: r.approvedAt,
        })),
      };
    }),

  // Solicitar depósito via Pix — integrado com Asaas (QR Code real)
  requestPixDeposit: protectedProcedure
    .input(z.object({
      amount:   z.number().min(50).max(100000),
      cpfCnpj: z.string().min(11).max(18).optional(),
      notes:    z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const asaasKey = process.env.ASAAS_API_KEY;
      if (!asaasKey) throw new TRPCError({ code: "BAD_REQUEST", message: "Pagamento Pix não configurado. Contate o suporte." });

      const amountCents = Math.round(input.amount * 100);
      const feePercent  = 10;
      const feeAmount   = Math.round(amountCents * feePercent / 100);
      const netAmount   = amountCents - feeAmount;

      // 1. Busca ou cria cliente no Asaas
      const userRes = await db.getUserById(ctx.user.id) as any;
      let asaasCustomerId: string;

      try {
        // Tenta buscar cliente existente por email
        const searchRes = await fetch(
          `https://api.asaas.com/v3/customers?email=${encodeURIComponent(userRes.email)}&limit=1`,
          { headers: { access_token: asaasKey }, signal: AbortSignal.timeout(10000) }
        );
        const searchData: any = await searchRes.json();
        const cleanCpf = input.cpfCnpj?.replace(/\D/g, "") || "";
        if (!cleanCpf || cleanCpf.length < 11) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "CPF ou CNPJ inválido. Informe corretamente para gerar o Pix." });
        }

        if (searchData.data?.[0]?.id) {
          asaasCustomerId = searchData.data[0].id;
          // Atualiza CPF no cliente existente (pode não ter sido cadastrado antes)
          await fetch(`https://api.asaas.com/v3/customers/${asaasCustomerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", access_token: asaasKey },
            body: JSON.stringify({ cpfCnpj: cleanCpf }),
            signal: AbortSignal.timeout(8000),
          });
        } else {
          // Cria novo cliente no Asaas
          const createRes = await fetch("https://api.asaas.com/v3/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json", access_token: asaasKey },
            body: JSON.stringify({
              name:              userRes.name || userRes.email,
              email:             userRes.email,
              cpfCnpj:           cleanCpf,
              externalReference: String(ctx.user.id),
              notificationDisabled: true,
            }),
            signal: AbortSignal.timeout(10000),
          });
          const createData: any = await createRes.json();
          if (!createData.id) throw new Error(createData.errors?.[0]?.description || "Erro ao criar cliente no Asaas");
          asaasCustomerId = createData.id;
        }
      } catch (e: any) {
        log.warn("media-budget", "Asaas customer error", { message: e.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao configurar pagamento: ${e.message}` });
      }

      // 2. Cria cobrança Pix no Asaas
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const dueDateStr = dueDate.toISOString().split("T")[0]; // YYYY-MM-DD
      let asaasPayment: any;

      try {
        const payRes = await fetch("https://api.asaas.com/v3/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: asaasKey },
          body: JSON.stringify({
            customer:         asaasCustomerId,
            billingType:      "PIX",
            value:            input.amount,
            dueDate:          dueDateStr,
            description:      `MECPro — Recarga de verba de mídia${input.notes ? ": " + input.notes : ""}`,
            externalReference: `mecpro_uid_${ctx.user.id}`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        asaasPayment = await payRes.json();
        if (!asaasPayment.id) throw new Error(asaasPayment.errors?.[0]?.description || "Erro ao criar cobrança");
      } catch (e: any) {
        log.warn("media-budget", "Asaas payment error", { message: e.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao gerar Pix: ${e.message}` });
      }

      // 3. Busca QR Code do Pix
      let pixQrCode = "";
      let pixPayload = "";
      try {
        const qrRes = await fetch(
          `https://api.asaas.com/v3/payments/${asaasPayment.id}/pixQrCode`,
          { headers: { access_token: asaasKey }, signal: AbortSignal.timeout(10000) }
        );
        const qrData: any = await qrRes.json();
        pixQrCode  = qrData.encodedImage || "";  // base64 da imagem
        pixPayload = qrData.payload || "";        // copia e cola
      } catch {
        log.warn("media-budget", "Asaas QR code error — usando fallback");
      }

      // 4. Registra no banco
      const insertRes = await pool.query(
        `INSERT INTO media_budget ("userId", amount, "feePercent", "feeAmount", "netAmount",
          type, status, method, "pixPayload", "pixExpiry", notes, "stripeId")
         VALUES ($1, $2, $3, $4, $5, 'deposit', 'pending', 'pix', $6, $7, $8, $9)
         RETURNING id, "createdAt"`,
        [ctx.user.id, amountCents, feePercent, feeAmount, netAmount,
         pixPayload, dueDate, input.notes || null, asaasPayment.id]
      );

      log.info("media-budget", "Cobrança Pix criada no Asaas", {
        userId: ctx.user.id, asaasId: asaasPayment.id, amount: input.amount,
      });

      return {
        id:         insertRes.rows[0].id,
        asaasId:    asaasPayment.id,
        amount:     input.amount,
        feePercent,
        feeAmount:  feeAmount / 100,
        netAmount:  netAmount / 100,
        pixPayload,
        pixQrCode,
        pixExpiry:  dueDate,
        instructions: `Escaneie o QR Code ou copie o código Pix abaixo. Assim que o pagamento for confirmado, R$ ${(netAmount/100).toFixed(2)} serão creditados automaticamente no seu saldo (taxa de gestão de ${feePercent}% deduzida).`,
      };
    }),

  // Solicitar depósito via Stripe (cartão)
  requestCardDeposit: protectedProcedure
    .input(z.object({
      amount: z.number().min(50).max(100000),
      notes:  z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!stripe) throw new TRPCError({ code: "BAD_REQUEST", message: "Pagamento por cartão não configurado." });

      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const amountCents = Math.round(input.amount * 100);
      const feePercent  = 10;
      const feeAmount   = Math.round(amountCents * feePercent / 100);
      const netAmount   = amountCents - feeAmount;

      // Cria PaymentIntent no Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount:   amountCents,
        currency: "brl",
        metadata: { userId: String(ctx.user.id), type: "media_budget", feePercent: String(feePercent) },
        description: `MECPro — Recarga de verba de mídia (R$ ${(amountCents/100).toFixed(2)})`,
      });

      // Registra no banco como pendente
      await pool.query(
        `INSERT INTO media_budget ("userId", amount, "feePercent", "feeAmount", "netAmount", type, status, method, "stripeId", notes)
         VALUES ($1, $2, $3, $4, $5, 'deposit', 'pending', 'card', $6, $7)`,
        [ctx.user.id, amountCents, feePercent, feeAmount, netAmount, paymentIntent.id, input.notes || null]
      );

      return {
        clientSecret: paymentIntent.client_secret,
        amount:       input.amount,
        feePercent,
        feeAmount:    feeAmount / 100,
        netAmount:    netAmount / 100,
      };
    }),

  // ── Calcular rateio inteligente de verba por campanha ───────────────────────
  calcDistribution: protectedProcedure
    .input(z.object({
      amount:   z.number().min(1),         // valor total a distribuir (R$)
      period:   z.enum(["7d","30d","90d"]).default("30d"),
      overrides: z.record(z.string(), z.number()).optional(), // metaCampaignId -> valor manual
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getApiIntegration(ctx.user.id, "meta");
      if (!integration || !(integration as any).accessToken)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Meta Ads não conectado." });

      const token  = (integration as any).accessToken as string;
      const rawAct = (integration as any).adAccountId as string;
      if (!rawAct) throw new TRPCError({ code: "BAD_REQUEST", message: "Ad Account ID não configurado. Configure em Integrações → Meta Ads." });

      const act   = rawAct.startsWith("act_") ? rawAct : `act_${rawAct}`;
      const days  = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
      const since = daysAgo(days);

      log.info("media-budget", "Buscando campanhas Meta para rateio", {
        userId: ctx.user.id, act, since, until: today(), period: input.period,
      });

      // Busca campanhas com métricas — sem filtro de status (pega ACTIVE e PAUSED)
      const fields = `id,name,status,insights.time_range({"since":"${since}","until":"${today()}"}){impressions,clicks,spend,cpc,cpm,ctr,actions}`;
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${act}/campaigns?fields=${encodeURIComponent(fields)}&limit=500&access_token=${token}`,
        { signal: AbortSignal.timeout(20000) }
      );
      const raw: any = await res.json();

      if (raw.error) {
        log.warn("media-budget", "Meta API erro no rateio", { error: raw.error.message, code: raw.error.code });
        throw new TRPCError({ code: "BAD_REQUEST", message: `Meta API: ${raw.error.message}` });
      }

      const camps = (raw.data || []) as any[];

      log.info("media-budget", "Campanhas Meta retornadas", {
        total: camps.length,
        active: camps.filter((c: any) => c.status === "ACTIVE").length,
        withInsights: camps.filter((c: any) => c.insights?.data?.[0]).length,
        statuses: [...new Set(camps.map((c: any) => c.status))],
      });

      // Se nenhuma campanha tem insights via campaign-level, busca via account-level insights
      const campsWithInsights = camps.filter((c: any) => c.insights?.data?.[0]);
      let insightsByCampaign: Record<string, any> = {};

      if (campsWithInsights.length === 0 && camps.length > 0) {
        log.info("media-budget", "Sem insights no nível campanha — buscando via account insights breakdown");
        try {
          const acctInsightsRes = await fetch(
            `https://graph.facebook.com/v19.0/${act}/insights?fields=campaign_id,campaign_name,impressions,clicks,spend,ctr,cpm,cpc,actions&time_range={"since":"${since}","until":"${today()}"}&level=campaign&limit=500&access_token=${token}`,
            { signal: AbortSignal.timeout(15000) }
          );
          const acctData: any = await acctInsightsRes.json();
          if (!acctData.error && acctData.data?.length > 0) {
            log.info("media-budget", "Insights via account level OK", {
              count: acctData.data.length,
              campaignIds: acctData.data.map((x: any) => x.campaign_id),
              campIds: camps.map((c: any) => c.id),
            });
            acctData.data.forEach((ins: any) => {
              // Asaas pode retornar campaign_id como string ou número — normaliza
              insightsByCampaign[String(ins.campaign_id)] = ins;
            });
          } else {
            log.warn("media-budget", "Account insights também vazio", { error: acctData.error?.message });
          }
        } catch (e: any) {
          log.warn("media-budget", "Erro ao buscar account insights", { message: e.message });
        }
      }

      // Inclui todas as campanhas (ACTIVE e PAUSED) — usa insights de qualquer fonte
      const scored = camps
        .filter((c: any) => {
          const hasDirectInsights = c.insights?.data?.[0];
          const hasAccountInsights = insightsByCampaign[String(c.id)];
          return hasDirectInsights || hasAccountInsights;
        })
        .map((c: any) => {
          // Usa insights diretos ou do account-level
          const ins = c.insights?.data?.[0] || insightsByCampaign[String(c.id)];
          return { ...c, _ins: ins };
        })
        .filter((c: any) => c._ins)
        .map((c: any) => {
          const ins = c._ins;
          const clicks      = Number(ins.clicks      || 0);
          const impressions = Number(ins.impressions  || 0);
          const spend       = Number(ins.spend        || 0);
          const ctr         = Number(ins.ctr          || 0);

          // Detecta melhor métrica automaticamente
          const actions = ins.actions || [];
          const waClicks   = actions.find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value || 0;
          const leads      = actions.find((a: any) => a.action_type === "lead")?.value || 0;
          const purchases  = actions.find((a: any) => a.action_type === "purchase")?.value || 0;

          // Score composto — normalizado por gasto (ROAS de resultado)
          let primaryMetric = "ctr";
          let primaryValue  = ctr;
          let score         = ctr * 10;

          if (Number(waClicks) > 0) {
            primaryMetric = "whatsapp";
            primaryValue  = spend > 0 ? Number(waClicks) / spend * 100 : 0; // cliques WA por R$100
            score = primaryValue * 15; // WA tem peso maior
          } else if (Number(leads) > 0) {
            primaryMetric = "leads";
            primaryValue  = spend > 0 ? Number(leads) / spend * 100 : 0; // leads por R$100
            score = primaryValue * 12;
          } else if (Number(purchases) > 0) {
            primaryMetric = "roas";
            primaryValue  = spend > 0 ? Number(purchases) / spend : 0;
            score = primaryValue * 20;
          }

          return {
            id:            c.id,
            name:          c.name,
            status:        c.status,
            primaryMetric,
            primaryValue:  +primaryValue.toFixed(4),
            score:         +score.toFixed(2),
            spend:         +spend.toFixed(2),
            clicks,
            impressions,
            ctr:           +ctr.toFixed(3),
            waClicks:      Number(waClicks),
            leads:         Number(leads),
          };
        })
        .filter((c: any) => c.score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      if (scored.length === 0) {
        return { campaigns: [], totalAmount: input.amount, hasOverrides: false };
      }

      // Aplica overrides manuais
      const overrides = input.overrides || {};
      const totalOverride = Object.values(overrides).reduce((s: number, v: any) => s + Number(v), 0);
      const remainingAmount = Math.max(0, input.amount - totalOverride);

      // Distribui restante proporcionalmente por score (com bônus para top performer)
      const scoredWithoutOverrides = scored.filter((c: any) => !overrides[c.id]);
      const totalScore = scoredWithoutOverrides.reduce((s: any, c: any) => s + c.score, 0);

      const distribution = scored.map((c: any, i: number) => {
        if (overrides[c.id] !== undefined) {
          return {
            ...c,
            allocation:    +Number(overrides[c.id]).toFixed(2),
            allocationPct: totalOverride > 0 ? +(Number(overrides[c.id]) / input.amount * 100).toFixed(1) : 0,
            isManual:      true,
            rank:          i + 1,
          };
        }

        // Peso exponencial — top performer recebe mais
        const expScore  = Math.pow(c.score, 1.5);
        const totalExp  = scoredWithoutOverrides.reduce((s: any, x: any) => s + Math.pow(x.score, 1.5), 0);
        const allocation = totalScore > 0 ? (expScore / totalExp) * remainingAmount : remainingAmount / scoredWithoutOverrides.length;

        return {
          ...c,
          allocation:    +allocation.toFixed(2),
          allocationPct: +(allocation / input.amount * 100).toFixed(1),
          isManual:      false,
          rank:          i + 1,
        };
      });

      return {
        campaigns:    distribution,
        totalAmount:  input.amount,
        distributed:  +distribution.reduce((s: any, c: any) => s + c.allocation, 0).toFixed(2),
        hasOverrides: Object.keys(overrides).length > 0,
        period:       input.period,
      };
    }),

  // Admin: listar todos os depósitos pendentes
  adminListPending: protectedProcedure
    .query(async ({ ctx }) => {
      if (!["admin", "superadmin"].includes((ctx.user as any)?.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admins." });
      }
      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const res = await pool.query(`
        SELECT mb.*, u.email, u.name
        FROM media_budget mb
        JOIN users u ON u.id = mb."userId"
        WHERE mb.status = 'pending'
        ORDER BY mb."createdAt" DESC
      `);

      return res.rows.map(r => ({
        id:        r.id,
        userId:    r.userId,
        email:     r.email,
        name:      r.name,
        amount:    Number(r.amount) / 100,
        netAmount: Number(r.netAmount) / 100,
        feeAmount: Number(r.feeAmount) / 100,
        method:    r.method,
        notes:     r.notes,
        createdAt: r.createdAt,
        pixPayload: r.pixPayload,
      }));
    }),

  // Admin: aprovar depósito e creditar saldo
  adminApprove: protectedProcedure
    .input(z.object({ depositId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "superadmin"].includes((ctx.user as any)?.role || "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admins." });
      }
      const pool = await getPool();
      if (!pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Busca o depósito
      const depRes = await pool.query(
        `SELECT * FROM media_budget WHERE id = $1 AND status = 'pending'`,
        [input.depositId]
      );
      if (!depRes.rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Depósito não encontrado ou já aprovado." });
      }
      const dep = depRes.rows[0];

      // Marca como aprovado
      await pool.query(
        `UPDATE media_budget SET status = 'approved', "approvedAt" = NOW(), "approvedBy" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [ctx.user.id, input.depositId]
      );

      // Credita saldo líquido no cliente
      await pool.query(`
        INSERT INTO media_balance ("userId", balance, "totalDeposited", "totalFees")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("userId") DO UPDATE SET
          balance = media_balance.balance + $2,
          "totalDeposited" = media_balance."totalDeposited" + $3,
          "totalFees" = media_balance."totalFees" + $4,
          "updatedAt" = NOW()
      `, [dep.userId, dep.netAmount, dep.amount, dep.feeAmount]);

      log.info("media-budget", "Depósito aprovado pelo admin", {
        depositId: input.depositId, userId: dep.userId,
        netAmount: Number(dep.netAmount) / 100,
      });

      return { success: true, creditedAmount: Number(dep.netAmount) / 100 };
    }),
});

export const appRouter = router({
  auth: authRouter,
  projects: projectsRouter,
  integrations: integrationsRouter,
  clientProfile: clientProfileRouter,
  competitors: competitorsRouter,
  market:        marketRouter,
  marketAnalysis: marketRouter, // alias para compatibilidade com clientes legados
  campaigns: campaignsRouter,
  plans: plansRouter,
  admin: adminRouter,
  planRequests: planRequestsRouter,
  metaCampaigns: metaCampaignsRouter,
  googleCampaigns: googleCampaignsRouter,
  tiktokCampaigns: tiktokCampaignsRouter,
  tiktokBulk: tiktokBulkRouter,
  agent: autonomousAgentRouter,
  llm: llmToggleRouter,
  mediaBudget: mediaBudgetRouter,
  unified: unifiedRouter,
  tiktokVideo: tiktokVideoRouter,
  alerts: alertsRouter,
  subscriptions: subscriptionsRouter,
  notifications: notificationsRouter,
  consultas: consultasRouter,
  academy: academyRouter,
  intelligence:   adminIntelligenceRouter,
  vsl:            vslRouter,   // ← ADICIONAR ESTA LINHA
});

export type AppRouter = typeof appRouter;


// gRPC full migration complete
// bidding strategy fix
