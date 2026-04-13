import type {
  CampaignCreative,
  CreativeImageEditFormat,
  CreativeSystemV2,
} from "./campaignCreative.schema";

function emptyCreativeSystemV2(): CreativeSystemV2 {
  return {
    version: "2.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: null,
    assetLibrary: {
      assets: [],
      canvases: [],
      logos: [],
    },
    copyBank: {
      hooks: [],
      bodies: [],
      headlines: [],
      ctas: [],
      descriptions: [],
    },
    creativeVariants: [],
    channels: {},
    legacyProjection: null,
    compliance: null,
    recommendedActions: [],
  };
}

function ensureMetaChannel(v2: CreativeSystemV2) {
  if (!v2.channels) v2.channels = {} as any;
  if (!v2.channels.meta) {
    v2.channels.meta = {
      enabled: true,
      placements: {},
      publishDefaults: null,
    } as any;
  }
  if (!v2.channels.meta.placements) {
    v2.channels.meta.placements = {} as any;
  }
}

function ensureLegacyProjection(v2: CreativeSystemV2) {
  if (!v2.legacyProjection) {
    v2.legacyProjection = {
      format: null,
      imageUrl: null,
      imageHash: null,
      feedImageUrl: null,
      storyImageUrl: null,
      squareImageUrl: null,
      feedImageHash: null,
      storyImageHash: null,
      squareImageHash: null,
      publishMedia: null,
      featuredIndex: null,
      mediaMode: null,
    };
  }
}

export function ensureCreativeSystemV2(
  creative?: CampaignCreative | null,
): CreativeSystemV2 {
  const v2 = creative?.creativeSystemV2
    ? {
        ...creative.creativeSystemV2,
        updatedAt: new Date().toISOString(),
      }
    : emptyCreativeSystemV2();

  ensureMetaChannel(v2);
  ensureLegacyProjection(v2);
  return v2;
}

export function syncCreativeTextToV2(
  creative: CampaignCreative,
): CampaignCreative {
  const v2 = ensureCreativeSystemV2(creative);

  const headlineId = "legacy_headline_primary";
  const bodyId = "legacy_body_primary";
  const hookId = "legacy_hook_primary";
  const ctaId = "legacy_cta_primary";

  const upsert = (
    list: Array<{ id: string; text: string; intent?: string; language?: string }>,
    item: { id: string; text?: string | null; intent?: string | null },
  ) => {
    const text = item.text?.trim();
    if (!text) return list.filter((x) => x.id !== item.id);

    const idx = list.findIndex((x) => x.id === item.id);
    const next = {
      id: item.id,
      text,
      intent: item.intent ?? undefined,
      language: "pt-BR",
    };

    if (idx >= 0) {
      const copy = [...list];
      copy[idx] = next;
      return copy;
    }

    return [...list, next];
  };

  v2.copyBank.hooks = upsert(v2.copyBank.hooks as any, {
    id: hookId,
    text: creative.hook,
    intent: "hook",
  });

  v2.copyBank.bodies = upsert(v2.copyBank.bodies as any, {
    id: bodyId,
    text: creative.copy,
    intent: "body",
  });

  v2.copyBank.headlines = upsert(v2.copyBank.headlines as any, {
    id: headlineId,
    text: creative.headline,
    intent: "headline",
  });

  v2.copyBank.ctas = upsert(v2.copyBank.ctas as any, {
    id: ctaId,
    text: creative.cta,
    intent: "cta",
  });

  v2.legacyProjection = {
    ...v2.legacyProjection,
    format: creative.format ?? v2.legacyProjection?.format ?? null,
    imageUrl: creative.imageUrl ?? v2.legacyProjection?.imageUrl ?? null,
    imageHash: creative.imageHash ?? v2.legacyProjection?.imageHash ?? null,
    feedImageUrl: creative.feedImageUrl ?? v2.legacyProjection?.feedImageUrl ?? null,
    storyImageUrl: creative.storyImageUrl ?? v2.legacyProjection?.storyImageUrl ?? null,
    squareImageUrl: creative.squareImageUrl ?? v2.legacyProjection?.squareImageUrl ?? null,
    feedImageHash: creative.feedImageHash ?? v2.legacyProjection?.feedImageHash ?? null,
    storyImageHash: creative.storyImageHash ?? v2.legacyProjection?.storyImageHash ?? null,
    squareImageHash: creative.squareImageHash ?? v2.legacyProjection?.squareImageHash ?? null,
    publishMedia: creative.publishMedia ?? v2.legacyProjection?.publishMedia ?? null,
  };

  return {
    ...creative,
    creativeSystemV2: v2,
  };
}

export function syncCreativeImageToV2(
  creative: CampaignCreative,
  format: CreativeImageEditFormat,
  payload: {
    imageUrl?: string | null;
    imageHash?: string | null;
  },
): CampaignCreative {
  const v2 = ensureCreativeSystemV2(creative);
  const assetId = `legacy_${format}_primary`;
  const aspectRatio = format === "stories" ? "9:16" : format === "square" ? "1:1" : "4:5";

  const existingIdx = (v2.assetLibrary.assets || []).findIndex((a: any) => a.id === assetId);
  const nextAsset = {
    id: assetId,
    kind: "image",
    label: `${format} primary`,
    url: payload.imageUrl ?? null,
    previewUrl: payload.imageUrl ?? null,
    imageHash: payload.imageHash ?? null,
    videoId: null,
    aspectRatio,
    source: payload.imageHash ? "upload" : "manual_url",
  };

  if (existingIdx >= 0) {
    (v2.assetLibrary.assets as any[])[existingIdx] = {
      ...(v2.assetLibrary.assets as any[])[existingIdx],
      ...nextAsset,
    };
  } else {
    (v2.assetLibrary.assets as any[]).push(nextAsset);
  }

  if (format === "feed") {
    v2.legacyProjection = {
      ...v2.legacyProjection,
      feedImageUrl: payload.imageUrl ?? creative.feedImageUrl ?? null,
      feedImageHash: payload.imageHash ?? creative.feedImageHash ?? null,
      format: creative.format ?? "feed",
      publishMedia: payload.imageHash
        ? { imageHash: payload.imageHash }
        : payload.imageUrl
          ? { imageUrl: payload.imageUrl }
          : v2.legacyProjection?.publishMedia ?? null,
    };

    (v2.channels.meta as any).placements.feed = {
      id: "meta_feed_primary",
      variantType: "portrait_static",
      mediaType: "image",
      aspectRatio: "4:5",
      primaryAssetId: assetId,
      assetIds: [assetId],
      copyRefs: {
        hookIds: ["legacy_hook_primary"],
        bodyIds: ["legacy_body_primary"],
        headlineIds: ["legacy_headline_primary"],
        ctaIds: ["legacy_cta_primary"],
        descriptionIds: [],
      },
      legacyProjection: {
        format: "feed",
        feedImageUrl: payload.imageUrl ?? creative.feedImageUrl ?? null,
        feedImageHash: payload.imageHash ?? creative.feedImageHash ?? null,
        publishMedia: payload.imageHash
          ? { imageHash: payload.imageHash }
          : payload.imageUrl
            ? { imageUrl: payload.imageUrl }
            : null,
      },
    };
  }

  if (format === "stories") {
    v2.legacyProjection = {
      ...v2.legacyProjection,
      storyImageUrl: payload.imageUrl ?? creative.storyImageUrl ?? null,
      storyImageHash: payload.imageHash ?? creative.storyImageHash ?? null,
    };

    (v2.channels.meta as any).placements.stories = {
      id: "meta_stories_primary",
      variantType: "stories_3_screen",
      mediaType: "image",
      aspectRatio: "9:16",
      primaryAssetId: assetId,
      assetIds: [assetId],
      copyRefs: {
        hookIds: ["legacy_hook_primary"],
        bodyIds: [],
        headlineIds: [],
        ctaIds: ["legacy_cta_primary"],
        descriptionIds: [],
      },
      legacyProjection: {
        format: "stories",
        storyImageUrl: payload.imageUrl ?? creative.storyImageUrl ?? null,
        storyImageHash: payload.imageHash ?? creative.storyImageHash ?? null,
      },
    };

    (v2.channels.meta as any).placements.reels = {
      id: "meta_reels_primary",
      variantType: "reels_fast_cut",
      mediaType: "image",
      aspectRatio: "9:16",
      primaryAssetId: assetId,
      assetIds: [assetId],
      copyRefs: {
        hookIds: ["legacy_hook_primary"],
        bodyIds: [],
        headlineIds: [],
        ctaIds: ["legacy_cta_primary"],
        descriptionIds: [],
      },
      legacyProjection: {
        format: "reels",
        storyImageUrl: payload.imageUrl ?? creative.storyImageUrl ?? null,
        storyImageHash: payload.imageHash ?? creative.storyImageHash ?? null,
      },
    };
  }

  if (format === "square") {
    v2.legacyProjection = {
      ...v2.legacyProjection,
      squareImageUrl: payload.imageUrl ?? creative.squareImageUrl ?? null,
      squareImageHash: payload.imageHash ?? creative.squareImageHash ?? null,
    };
  }

  return {
    ...creative,
    creativeSystemV2: v2,
  };
}

export function syncCreativePublishMediaToV2(
  creative: CampaignCreative,
  publishMedia: {
    imageHash?: string | null;
    imageUrl?: string | null;
    imageHashes?: string[] | null;
    imageUrls?: string[] | null;
    videoId?: string | null;
  },
): CampaignCreative {
  const v2 = ensureCreativeSystemV2(creative);

  v2.legacyProjection = {
    ...v2.legacyProjection,
    publishMedia: {
      imageHash: publishMedia.imageHash ?? null,
      imageUrl: publishMedia.imageUrl ?? null,
      imageHashes: publishMedia.imageHashes ?? null,
      imageUrls: publishMedia.imageUrls ?? null,
      videoId: publishMedia.videoId ?? null,
    },
  };

  if (publishMedia.imageHashes?.length && publishMedia.imageHashes.length >= 2) {
    (v2.channels.meta as any).placements.carousel = {
      id: "meta_carousel_primary",
      variantType: "carousel_sequence",
      mediaType: "carousel",
      aspectRatio: "1:1",
      primaryAssetId: null,
      assetIds: [],
      cardAssetIds: publishMedia.imageHashes.map((_, idx) => `carousel_card_${idx}`),
      featuredIndex: 0,
      copyRefs: {
        hookIds: ["legacy_hook_primary"],
        bodyIds: ["legacy_body_primary"],
        headlineIds: ["legacy_headline_primary"],
        ctaIds: ["legacy_cta_primary"],
        descriptionIds: [],
      },
      legacyProjection: {
        format: "carousel",
        publishMedia: {
          imageHashes: publishMedia.imageHashes,
          imageUrls: publishMedia.imageUrls ?? null,
        },
        featuredIndex: 0,
      },
    };
  }

  return {
    ...creative,
    creativeSystemV2: v2,
  };
}
