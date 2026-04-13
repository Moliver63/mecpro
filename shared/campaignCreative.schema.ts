import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().trim().min(1).optional().nullable();
const httpsUrl = z.string().url().refine((v) => v.startsWith("https://"), {
  message: "URL deve ser https",
});
const optionalHttpsUrl = httpsUrl.optional().nullable();
const dateLike = z.union([z.string(), z.date()]).optional().nullable();

export const creativeFormatSchema = z.enum(["feed", "stories", "square", "horizontal", "reels", "carousel"]);
export type CreativeFormat = z.infer<typeof creativeFormatSchema>;

export const creativeImageEditFormatSchema = z.enum(["feed", "stories", "square"]);
export type CreativeImageEditFormat = z.infer<typeof creativeImageEditFormatSchema>;

export const mediaModeSchema = z.enum(["none", "url", "upload"]);
export const placementModeSchema = z.enum(["auto", "manual"]);
export const channelSchema = z.enum(["meta", "tiktok", "google"]);
export const mediaTypeSchema = z.enum(["image", "video", "carousel", "hybrid"]);
export const aspectRatioSchema = z.enum(["1:1", "4:5", "9:16", "16:9", "1.91:1", "3:4", "2:3", "auto"]);
export const assetKindSchema = z.enum(["image", "video", "logo", "audio", "template"]);
export const variantTypeSchema = z.enum([
  "feed_full_copy",
  "stories_3_screen",
  "reels_fast_cut",
  "vertical_short_video",
  "vertical_story_sequence",
  "square_static",
  "portrait_static",
  "landscape_static",
  "carousel_sequence",
]);

export const legacyPublishMediaSchema = z.object({
  imageUrl: optionalHttpsUrl,
  imageHash: optionalString,
  imageUrls: z.array(httpsUrl).min(2).max(10).optional().nullable(),
  imageHashes: z.array(nonEmptyString).min(2).max(10).optional().nullable(),
  videoId: optionalString,
}).superRefine((value, ctx) => {
  const hasVideo = !!value.videoId;
  const hasSingleImage = !!value.imageHash || !!value.imageUrl;
  const hasCarousel = (value.imageHashes?.length ?? 0) >= 2 || (value.imageUrls?.length ?? 0) >= 2;

  if (!hasVideo && !hasSingleImage && !hasCarousel) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe imageHash/imageUrl, imageHashes/imageUrls ou videoId" });
  }
  if (hasVideo && (hasSingleImage || hasCarousel)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Não misture vídeo com imagem única ou carrossel" });
  }
});
export type LegacyPublishMedia = z.infer<typeof legacyPublishMediaSchema>;

export const creativeAssetSchema = z.object({
  id: nonEmptyString,
  kind: assetKindSchema,
  label: optionalString,
  url: optionalHttpsUrl,
  previewUrl: optionalHttpsUrl,
  imageHash: optionalString,
  videoId: optionalString,
  mimeType: optionalString,
  fileName: optionalString,
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  aspectRatio: aspectRatioSchema.optional().nullable(),
  durationSec: z.number().positive().optional().nullable(),
  source: z.enum(["upload", "generated", "manual_url", "legacy_migrated"]).default("generated"),
  tags: z.array(nonEmptyString).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough();

export const canvasDefinitionSchema = z.object({
  id: nonEmptyString,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspectRatio: aspectRatioSchema,
  channel: channelSchema.optional().nullable(),
  placement: optionalString,
  safeZoneProfile: optionalString,
}).passthrough();

export const copyItemSchema = z.object({
  id: nonEmptyString,
  text: nonEmptyString,
  intent: z.enum(["hook", "body", "headline", "cta", "description"]).optional().nullable(),
  channel: channelSchema.optional().nullable(),
  placement: optionalString,
  language: z.string().default("pt-BR"),
}).passthrough();

export const copyBankSchema = z.object({
  hooks: z.array(copyItemSchema).default([]),
  bodies: z.array(copyItemSchema).default([]),
  headlines: z.array(copyItemSchema).default([]),
  ctas: z.array(copyItemSchema).default([]),
  descriptions: z.array(copyItemSchema).default([]),
}).passthrough();

export const placementCopyRefsSchema = z.object({
  hookIds: z.array(nonEmptyString).default([]),
  bodyIds: z.array(nonEmptyString).default([]),
  headlineIds: z.array(nonEmptyString).default([]),
  ctaIds: z.array(nonEmptyString).default([]),
  descriptionIds: z.array(nonEmptyString).default([]),
}).passthrough();

export const storyScreenSchema = z.object({
  screen: z.number().int().positive(),
  text: optionalString,
  assetId: optionalString,
  maxWords: z.number().int().positive().optional().nullable(),
  objective: optionalString,
}).passthrough();

export const legacyCreativeProjectionSchema = z.object({
  format: creativeFormatSchema.optional().nullable(),
  imageUrl: optionalHttpsUrl,
  imageHash: optionalString,
  feedImageUrl: optionalHttpsUrl,
  storyImageUrl: optionalHttpsUrl,
  squareImageUrl: optionalHttpsUrl,
  feedImageHash: optionalString,
  storyImageHash: optionalString,
  squareImageHash: optionalString,
  publishMedia: legacyPublishMediaSchema.optional().nullable(),
  featuredIndex: z.number().int().min(0).optional().nullable(),
  mediaMode: mediaModeSchema.optional().nullable(),
}).passthrough();
export type LegacyCreativeProjection = z.infer<typeof legacyCreativeProjectionSchema>;

export const basePlacementCreativeSchema = z.object({
  id: nonEmptyString,
  variantType: variantTypeSchema,
  mediaType: mediaTypeSchema,
  aspectRatio: aspectRatioSchema.optional().nullable(),
  primaryAssetId: optionalString,
  assetIds: z.array(nonEmptyString).default([]),
  storyScreens: z.array(storyScreenSchema).optional().nullable(),
  copyRefs: placementCopyRefsSchema.default({ hookIds: [], bodyIds: [], headlineIds: [], ctaIds: [], descriptionIds: [] }),
  durationSec: z.number().positive().optional().nullable(),
  estimatedCtrScore: z.number().min(0).max(100).optional().nullable(),
  estimatedConversionScore: z.number().min(0).max(100).optional().nullable(),
  notes: optionalString,
  legacyProjection: legacyCreativeProjectionSchema.optional().nullable(),
}).passthrough();

export const carouselPlacementCreativeSchema = basePlacementCreativeSchema.extend({
  mediaType: z.literal("carousel"),
  cardAssetIds: z.array(nonEmptyString).min(2).max(35),
  featuredIndex: z.number().int().min(0).optional().nullable(),
});

export const creativeStrategySchema = z.object({
  objective: optionalString,
  primaryGoal: optionalString,
  selectedStrategy: optionalString,
  recommendedMix: z.object({
    video: z.number().min(0).max(1).default(0.6),
    image: z.number().min(0).max(1).default(0.3),
    carousel: z.number().min(0).max(1).default(0.1),
  }).optional().nullable(),
  placementPriority: z.array(nonEmptyString).optional().nullable(),
  rationale: z.array(nonEmptyString).optional().nullable(),
  decisionRules: z.record(z.string(), z.string()).optional().nullable(),
}).passthrough();

export const metaChannelSchema = z.object({
  enabled: z.boolean().default(true),
  placements: z.object({
    feed: basePlacementCreativeSchema.optional().nullable(),
    stories: basePlacementCreativeSchema.optional().nullable(),
    reels: basePlacementCreativeSchema.optional().nullable(),
    carousel: carouselPlacementCreativeSchema.optional().nullable(),
  }).default({}),
  publishDefaults: z.object({
    pageId: optionalString,
    destination: optionalString,
    linkUrl: optionalHttpsUrl,
    placementMode: placementModeSchema.optional().nullable(),
  }).optional().nullable(),
}).passthrough();

export const tiktokChannelSchema = z.object({
  enabled: z.boolean().default(false),
  placements: z.object({
    inFeed: basePlacementCreativeSchema.optional().nullable(),
    story: basePlacementCreativeSchema.optional().nullable(),
    carousel: carouselPlacementCreativeSchema.optional().nullable(),
  }).default({}),
  publishDefaults: z.object({ landingPageUrl: optionalHttpsUrl, identityMode: optionalString }).optional().nullable(),
}).passthrough();

export const googleChannelSchema = z.object({
  enabled: z.boolean().default(false),
  placements: z.object({
    demandGen: basePlacementCreativeSchema.optional().nullable(),
    responsiveDisplay: basePlacementCreativeSchema.optional().nullable(),
    youtube: basePlacementCreativeSchema.optional().nullable(),
    shortsLike: basePlacementCreativeSchema.optional().nullable(),
  }).default({}),
  publishDefaults: z.object({ finalUrl: optionalHttpsUrl, businessName: optionalString }).optional().nullable(),
}).passthrough();

export const creativeSystemV2Schema = z.object({
  version: z.literal("2.0"),
  createdAt: dateLike,
  updatedAt: dateLike,
  strategy: creativeStrategySchema.optional().nullable(),
  assetLibrary: z.object({
    assets: z.array(creativeAssetSchema).default([]),
    canvases: z.array(canvasDefinitionSchema).default([]),
    logos: z.array(nonEmptyString).default([]),
  }).passthrough().default({ assets: [], canvases: [], logos: [] }),
  copyBank: copyBankSchema.default({ hooks: [], bodies: [], headlines: [], ctas: [], descriptions: [] }),
  creativeVariants: z.array(basePlacementCreativeSchema).default([]),
  channels: z.object({
    meta: metaChannelSchema.optional().nullable(),
    tiktok: tiktokChannelSchema.optional().nullable(),
    google: googleChannelSchema.optional().nullable(),
  }).default({}),
  legacyProjection: legacyCreativeProjectionSchema.optional().nullable(),
  compliance: z.object({
    status: optionalString,
    riskLevel: z.enum(["low", "medium", "high"]).optional().nullable(),
    issuesDetected: z.array(nonEmptyString).default([]),
    autoAdjustments: z.array(nonEmptyString).default([]),
    finalLanguageProfile: optionalString,
  }).passthrough().optional().nullable(),
  recommendedActions: z.array(z.object({
    priority: z.number().int().positive(),
    action: nonEmptyString,
    reason: optionalString,
    channel: channelSchema.optional().nullable(),
  }).passthrough()).default([]),
}).passthrough();
export type CreativeSystemV2 = z.infer<typeof creativeSystemV2Schema>;

export const campaignCreativeSchema = z.object({
  headline: optionalString,
  copy: optionalString,
  cta: optionalString,
  hook: optionalString,
  format: creativeFormatSchema.optional().nullable(),
  type: optionalString,
  orientation: optionalString,
  imageUrl: optionalHttpsUrl,
  imageHash: optionalString,
  feedImageUrl: optionalHttpsUrl,
  storyImageUrl: optionalHttpsUrl,
  squareImageUrl: optionalHttpsUrl,
  feedImageHash: optionalString,
  storyImageHash: optionalString,
  squareImageHash: optionalString,
  imageUpdatedAt: dateLike,
  imageProviderUsed: optionalString,
  imageGenerationReason: optionalString,
  imageGenerationWarnings: z.array(nonEmptyString).optional().nullable(),
  imageGenerationMode: optionalString,
  manualImageOverride: z.boolean().optional().nullable(),
  edited: z.boolean().optional().nullable(),
  _edited: z.boolean().optional().nullable(),
  creativeScore: z.number().optional().nullable(),
  finalScore: z.number().optional().nullable(),
  complianceRisk: optionalString,
  publishMedia: legacyPublishMediaSchema.optional().nullable(),
  creativeSystemV2: creativeSystemV2Schema.optional().nullable(),
}).passthrough();
export type CampaignCreative = z.infer<typeof campaignCreativeSchema>;

export const updateCreativeInputSchema = z.object({
  campaignId: z.number().int().positive(),
  index: z.number().int().min(0),
  headline: z.string().optional(),
  copy: z.string().optional(),
  cta: z.string().optional(),
  hook: z.string().optional(),
  format: z.string().optional(),
}).passthrough();

export const updateCreativeImageInputSchema = z.object({
  campaignId: z.number().int().positive(),
  creativeIndex: z.number().int().min(0),
  format: creativeImageEditFormatSchema,
  imageUrl: optionalHttpsUrl,
  imageHash: optionalString,
}).superRefine((value, ctx) => {
  if (!value.imageUrl && !value.imageHash) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe imageUrl ou imageHash" });
  }
});

export const regenerateCreativeImageInputSchema = z.object({
  campaignId: z.number().int().positive(),
  creativeIndex: z.number().int().min(0),
  format: creativeImageEditFormatSchema,
});

export const uploadImageToMetaInputSchema = z.object({
  imageBase64: nonEmptyString,
  fileName: z.string().trim().min(1).default("ad_image.jpg"),
});

export const uploadVideoToMetaInputSchema = z.object({
  videoBase64: nonEmptyString,
  fileName: z.string().trim().min(1).default("ad_video.mp4"),
  mimeType: z.string().trim().min(1).default("video/mp4"),
});

export const publishToMetaInputSchema = z.object({
  campaignId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  pageId: nonEmptyString,
  destination: z.enum(["website", "lead_form"]).default("website"),
  leadGenFormId: z.string().optional(),
  linkUrl: optionalHttpsUrl,
  imageUrl: optionalHttpsUrl,
  imageHash: optionalString,
  imageHashes: z.array(nonEmptyString).min(2).max(10).optional().nullable(),
  imageUrls: z.array(httpsUrl).min(2).max(10).optional().nullable(),
  videoId: optionalString,
  pixelId: optionalString,
  adSetIndex: z.number().int().min(0).default(0),
  creativeIndex: z.number().int().min(0).optional().nullable(),
  placementMode: placementModeSchema.optional().nullable(),
  placements: z.array(z.string()).optional().nullable(),
  ageMin: z.number().min(13).max(65).optional(),
  ageMax: z.number().min(18).max(65).optional(),
  regions: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  locationMode: z.enum(["brasil", "paises", "raio"]).optional(),
  geoCity: z.string().optional(),
  geoRadius: z.number().optional(),
}).passthrough().superRefine((value, ctx) => {
  const hasVideo = !!value.videoId;
  const hasSingleImage = !!value.imageHash || !!value.imageUrl;
  const hasCarousel = (value.imageHashes?.length ?? 0) >= 2 || (value.imageUrls?.length ?? 0) >= 2;
  if (!hasVideo && !hasSingleImage && !hasCarousel) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Publish precisa de imageHash/imageUrl, imageHashes/imageUrls ou videoId" });
  }
  if (hasVideo && (hasSingleImage || hasCarousel)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Não misture vídeo com imagem única ou carrossel no publish" });
  }
});
export type PublishToMetaInput = z.infer<typeof publishToMetaInputSchema>;

export function resolveLegacyImageUrlByFormat(
  creative: Pick<CampaignCreative, "feedImageUrl" | "storyImageUrl" | "squareImageUrl" | "imageUrl">,
  format?: CreativeFormat | null,
): string | null {
  if (format === "stories" || format === "reels") {
    return creative.storyImageUrl || creative.feedImageUrl || creative.squareImageUrl || creative.imageUrl || null;
  }
  if (format === "square") {
    return creative.squareImageUrl || creative.feedImageUrl || creative.storyImageUrl || creative.imageUrl || null;
  }
  return creative.feedImageUrl || creative.squareImageUrl || creative.storyImageUrl || creative.imageUrl || null;
}

export function resolveLegacyImageHashByFormat(
  creative: Pick<CampaignCreative, "feedImageHash" | "storyImageHash" | "squareImageHash" | "imageHash">,
  format?: CreativeFormat | null,
): string | null {
  if (format === "stories" || format === "reels") {
    return creative.storyImageHash || creative.feedImageHash || creative.squareImageHash || creative.imageHash || null;
  }
  if (format === "square") {
    return creative.squareImageHash || creative.feedImageHash || creative.storyImageHash || creative.imageHash || null;
  }
  return creative.feedImageHash || creative.squareImageHash || creative.storyImageHash || creative.imageHash || null;
}

export function projectCreativeSystemV2ToLegacyFields(
  creativeSystemV2?: CreativeSystemV2 | null,
): Partial<CampaignCreative> {
  const legacy = creativeSystemV2?.legacyProjection;
  if (!legacy) return {};
  return {
    format: legacy.format ?? undefined,
    imageUrl: legacy.imageUrl ?? undefined,
    imageHash: legacy.imageHash ?? undefined,
    feedImageUrl: legacy.feedImageUrl ?? undefined,
    storyImageUrl: legacy.storyImageUrl ?? undefined,
    squareImageUrl: legacy.squareImageUrl ?? undefined,
    feedImageHash: legacy.feedImageHash ?? undefined,
    storyImageHash: legacy.storyImageHash ?? undefined,
    squareImageHash: legacy.squareImageHash ?? undefined,
    publishMedia: legacy.publishMedia ?? undefined,
  };
}

export function buildPublishMediaFromCreative(
  creative: CampaignCreative,
  format?: CreativeFormat | null,
): LegacyPublishMedia | null {
  if (creative.publishMedia) return creative.publishMedia;
  if (creative.creativeSystemV2?.legacyProjection?.publishMedia) return creative.creativeSystemV2.legacyProjection.publishMedia;

  const imageHash = resolveLegacyImageHashByFormat(creative, format ?? creative.format);
  const imageUrl = resolveLegacyImageUrlByFormat(creative, format ?? creative.format);

  if (imageHash) return { imageHash };
  if (imageUrl) return { imageUrl };
  return null;
}

export function mergeCreativeWithProjectedLegacy(creative: CampaignCreative): CampaignCreative {
  const projected = projectCreativeSystemV2ToLegacyFields(creative.creativeSystemV2);
  return {
    ...creative,
    ...projected,
    publishMedia: creative.publishMedia ?? projected.publishMedia ?? creative.publishMedia,
  };
}
