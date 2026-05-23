import crypto from "crypto";
import { log } from "./logger";

export type ImageProvider = "huggingface" | "heygen" | "genspark" | "mock";
export type CreativeImageFormat = "feed" | "stories" | "square";

const IMAGE_CACHE = new Map<string, string>();
// API nova HuggingFace router: /v1/text-to-image
// FLUX.1-schnell: gratuito, rápido (4 steps), nova API
// SD 3.5 Large: alta qualidade, nova API
// SDXL Turbo: fallback rápido
// HF hf-inference não suporta mais modelos de imagem — desabilitado
const HF_MODELS: string[] = [];

// Cloudflare Workers AI — FLUX.1-schnell gratuito (10k neurons/dia)
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN  || "";
const CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
let _cfQuotaExhaustedUntil = 0; // timestamp ms — 0 = não esgotado
function getNextMidnightUTC(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime();
}

const FORMAT_DIMENSIONS: Record<CreativeImageFormat, { width: number; height: number; ratio: string; label: string }> = {
  feed: { width: 1080, height: 1350, ratio: "4:5", label: "Meta Feed" },
  stories: { width: 1080, height: 1920, ratio: "9:16", label: "Stories/Reels" },
  square: { width: 1080, height: 1080, ratio: "1:1", label: "Square Feed" },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toText(value: unknown): string {
  return String(value || "").trim();
}

function getCacheKey(
  creative: any,
  segment: string,
  objective: string,
  provider: ImageProvider,
  format: CreativeImageFormat,
) {
  return JSON.stringify({
    provider,
    format,
    objective,
    segment,
    headline: creative?.headline || "",
    hook: creative?.hook || "",
    copy: creative?.copy || "",
    type: creative?.type || "",
  });
}


// ── Pixabay Image Search ─────────────────────────────────────────────────────
// Licença CC0 / domínio público — uso comercial 100% livre, automação permitida
// 100 requests/minuto, cache 24h obrigatório pela API
// Chave: PIXABAY_API_KEY no Render
const _pixabayCache = new Map<string, { url: string; credit: string; ts: number }>();

async function searchPixabay(
  query: string,
  format: CreativeImageFormat,
  creativeIndex: number = 0,
): Promise<{ url: string; credit: string } | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;

  // Cache diferente por criativo — evita mesma imagem em todos
  const cacheKey = `${query}|${format}|${creativeIndex}`;
  const cached = _pixabayCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 86_400_000) return cached; // cache 24h

  try {
    const orientation = format === "stories" ? "vertical" : "horizontal";
    // Per_page=10 para ter variedade; pega foto na posição do criativo
    const params = new URLSearchParams({
      key,
      q:           query,
      image_type:  "photo",
      orientation,
      safesearch:  "true",
      order:       "popular",
      per_page:    "10",
      min_width:   "800",
      lang:        "en",
    });
    const url = `https://pixabay.com/api/?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      log.info("image-generation", "Pixabay error", { status: res.status });
      return null;
    }
    const data = await res.json() as any;
    const hits = data?.hits;
    if (!hits?.length) return null;

    // Pega foto na posição do criativo (0,1,2,3...) para variar entre criativos
    const idx    = creativeIndex % hits.length;
    const photo  = hits[idx];
    const imgUrl = photo?.largeImageURL || photo?.webformatURL?.replace("_640", "_1280");
    const credit = photo?.user ? `Foto: ${photo.user} / Pixabay` : "Pixabay";

    if (!imgUrl) return null;

    const result = { url: imgUrl, credit };
    _pixabayCache.set(cacheKey, { ...result, ts: Date.now() });
    log.info("image-generation", "Pixabay cache set", { query, format, idx, credit });
    return result;
  } catch (err: any) {
    log.info("image-generation", "Pixabay exception", { error: err?.message?.slice(0, 60) });
    return null;
  }
}

// Queries Pixabay por segmento — keywords em inglês para melhores resultados
const PIXABAY_QUERIES: Record<string, string> = {
  imoveis_venda:   "luxury apartment interior modern",
  imoveis_locacao: "apartment rental furnished modern",
  ecommerce:       "product photography studio white",
  servicos_locais: "professional service business local",
  infoprodutos:    "online learning laptop education",
  saude_estetica:  "fitness gym workout healthy lifestyle",
  academia:        "gym fitness training modern people",
  alimentacao:     "restaurant food delicious meal",
  moda_varejo:     "fashion clothing lifestyle style",
  b2b:             "office business meeting professional",
  automotivo:      "car mechanic garage automotive professional",
  outro:           "business professional modern clean",
};

// Mapas de palavras-chave: copyContext → termo visual em inglês
const COPY_TO_VISUAL: Array<[RegExp, string]> = [
  // Imóveis
  [/frente.?mar|mar|praia|beach|oceano|ocean/i,          "ocean view apartment luxury beachfront"],
  [/balneário|camboriu|floripa|florianópolis/i,           "luxury apartment Brazil beach city"],
  [/aparto|apto|apartamento/i,                           "modern apartment interior living room"],
  [/casa|home|residência/i,                              "modern house interior living room"],
  [/locação|alugar|aluguel|morar|morada/i,               "apartment rental keys handover furnished"],
  [/comprar|venda|vender|financi/i,                      "luxury real estate apartment sale"],
  [/lançamento|empreendimento|condomínio/i,              "luxury condominium building modern"],
  // Automotivo
  [/auto.el[eé]trica|eletrica.*auto|el[eé]trico.*veic|auto.*el[eé]tric/i, "car electric mechanic garage professional"],
  [/oficina|mecanica|mec[aâ]nico|automotiv|veicul|carro/i, "car mechanic garage automotive professional"],
  [/motor|motor.?veicul|injet[ao]/i,                     "car engine mechanic workshop"],
  // Alimentação
  [/pizza|pizz/i,                                        "delicious pizza restaurant closeup"],
  [/hamburguer|burger|lanche/i,                          "gourmet burger food photography"],
  [/sushi|japones/i,                                     "sushi japanese food restaurant"],
  [/delivery|entreg/i,                                   "food delivery packaging modern"],
  [/restaurante|cardápio/i,                              "restaurant interior warm lighting"],
  // Saúde/Estética/Fitness
  [/academia|fitness|gym|musculação|treino|personal/i,   "fitness gym workout training modern"],
  [/plano.anual|plano.mensal|assinatura|mensalidade/i,   "gym membership fitness people happy"],
  [/bem.estar|wellness|saúde.*corpo/i,                   "wellness healthy lifestyle active"],
  [/estética|estetica|beleza|beauty/i,                   "beauty salon aesthetic treatment professional"],
  [/clinica|clínica|médico|saúde/i,                      "modern clinic interior professional"],
  // Moda
  [/roupa|moda|fashion|vestuário/i,                      "fashion clothing lifestyle editorial"],
  [/calçado|sapato|tenis/i,                              "shoes fashion lifestyle modern"],
  // Tecnologia/B2B
  [/software|sistema|app|aplicativo/i,                   "SaaS software dashboard laptop business"],
  [/marketing|campanha|anuncio/i,                        "digital marketing professional laptop"],
  // Educação
  [/curso|treinamento|ensino|aprender/i,                 "online course education laptop learning"],
  [/mentoria|coach/i,                                    "coaching mentoring professional meeting"],
];

// Ângulos da copy → modificadores visuais
const ANGLE_VISUAL: Record<string, string> = {
  exclusividade:  "luxury exclusive premium sophisticated",
  urgencia:       "urgent limited time bold dynamic",
  prova_social:   "happy satisfied customer testimonial",
  transformacao:  "before after transformation success",
  autoridade:     "expert professional credible authority",
  oferta:         "special offer sale discount bold",
  dor:            "problem solution empathy relatable",
  educacao:       "informative clean professional knowledge",
};

// Tipos de criativo → modificadores visuais
const TYPE_VISUAL: Record<string, string> = {
  testimonial:    "happy customer testimonial smiling portrait",
  social_proof:   "group satisfied customers community success",
  authority:      "expert professional confident portrait",
  storytelling:   "narrative lifestyle real moment authentic",
  lead_magnet:    "free offer gift attractive compelling",
  direct_offer:   "product showcase offer pricing bold",
};

function getPixabayQuery(
  segment: string,
  creative: any,
  creativeIndex: number = 0,
  productContext?: { productName?: string; productService?: string; niche?: string; city?: string },
): string {
  // 1. Base do segmento
  const base = PIXABAY_QUERIES[segment] || PIXABAY_QUERIES["outro"] || "professional";

  // 2. Extrai texto da copy + dados do produto para palavras-chave visuais
  const productText = [
    toText(productContext?.productName    || ""),
    toText(productContext?.productService || ""),
    toText(productContext?.niche          || ""),
  ].join(" ").toLowerCase();

  const copyText = [
    toText(creative?.headline || ""),
    toText(creative?.hook     || ""),
    toText(creative?.copy     || ""),
    toText(creative?.angle    || ""),
    productText,
  ].join(" ").toLowerCase();

  // 3. Procura correspondência no copy para query visual específica
  for (const [pattern, visualQuery] of COPY_TO_VISUAL) {
    if (pattern.test(copyText)) {
      // Usa query específica do produto + modificador do tipo/ângulo
      const type  = toText(creative?.type  || "");
      const angle = toText(creative?.angle || "");
      const typeMod  = TYPE_VISUAL[type]   || "";
      const angleMod = ANGLE_VISUAL[angle] || "";
      // Varia levemente por índice (página diferente, não só hit diferente)
      const suffix = creativeIndex > 0 ? ` ${["modern", "professional", "authentic", "vibrant"][creativeIndex % 4]}` : "";
      return `${visualQuery}${suffix}`.trim();
    }
  }

  // 4. Fallback: variações por segmento + funil/ângulo
  const funnelVariations: Record<string, string[]> = {
    imoveis_venda:   [
      "luxury apartment interior natural light",
      "modern real estate living room design",
      "apartment building exterior contemporary",
      "real estate home kitchen modern",
    ],
    imoveis_locacao: [
      "apartment rental keys door modern",
      "furnished living room cozy rental",
      "modern bedroom apartment rental",
      "apartment building entrance welcoming",
    ],
    ecommerce:       [
      "product photography studio white clean",
      "e-commerce packaging unboxing lifestyle",
      "online shopping purchase lifestyle",
      "product flat lay creative composition",
    ],
    servicos_locais: [
      "professional team service smiling",
      "local business storefront clean modern",
      "customer service reception desk",
      "service professional working happy",
    ],
    infoprodutos:    [
      "laptop online course education desk",
      "student learning success digital",
      "webinar video call professional",
      "digital content creator workspace",
    ],
    saude_estetica:  [
      "fitness gym workout training modern",
      "healthy lifestyle active woman smiling",
      "gym equipment training professional",
      "wellness body transformation success",
    ],
    alimentacao:     [
      "delicious food photography restaurant",
      "chef cooking professional kitchen",
      "food delivery packaging modern",
      "cafe restaurant interior cozy",
    ],
    moda_varejo:     [
      "fashion model clothing lifestyle",
      "retail store display trendy",
      "outfit flat lay accessories modern",
      "fashion editorial photography vibrant",
    ],
    b2b:             [
      "business meeting office professional",
      "team collaboration modern office",
      "laptop dashboard analytics business",
      "handshake deal partnership professional",
    ],
    automotivo:      [
      "car mechanic garage professional",
      "automotive repair workshop tools",
      "car engine electrical diagnostic",
      "mechanic customer car service",
    ],
    outro:           [
      "professional business clean modern",
      "team working office success",
      "service lifestyle authentic",
      "modern workspace productive",
    ],
  };

  const variations = funnelVariations[segment] || funnelVariations["outro"]!;
  const angle = toText(creative?.angle || "");
  const type  = toText(creative?.type  || "");

  // Varia por índice
  let query = variations[creativeIndex % variations.length];

  // Adiciona modificador de tipo se disponível
  const typeMod = TYPE_VISUAL[type];
  if (typeMod && creativeIndex % 2 === 1) query = typeMod;

  // Adiciona modificador de ângulo
  const angleMod = ANGLE_VISUAL[angle];
  if (angleMod) query = `${query} ${angleMod.split(" ")[0]}`;

  return query;
}

// ── Pixabay VIDEO Search ──────────────────────────────────────────────────────
// Mesma licença CC0 — vídeos também são domínio público
// Endpoint: pixabay.com/api/videos/
const _pixabayVideoCache = new Map<string, { url: string; thumb: string; credit: string; ts: number }>();

export async function searchPixabayVideo(
  query: string,
  format: CreativeImageFormat,
): Promise<{ url: string; thumb: string; credit: string } | null> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;

  const cacheKey = `video|${query}|${format}`;
  const cached = _pixabayVideoCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 86_400_000) return cached; // cache 24h

  try {
    const params = new URLSearchParams({
      key,
      q:          query,
      video_type: "film",
      safesearch: "true",
      order:      "popular",
      per_page:   "5",
      min_width:  "1280",
    });
    const url = `https://pixabay.com/api/videos/?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      log.info("image-generation", "Pixabay video error", { status: res.status });
      return null;
    }
    const data = await res.json() as any;
    const hits = data?.hits;
    if (!hits?.length) return null;

    const video = hits[0];
    // Prefere medium (1920x1080) ou small (1280x720) conforme formato
    const stream = format === "stories"
      ? (video?.videos?.medium || video?.videos?.small)
      : (video?.videos?.large || video?.videos?.medium);

    const videoUrl = stream?.url;
    const thumb    = stream?.thumbnail || video?.videos?.medium?.thumbnail || "";
    const credit   = video?.user ? `Vídeo: ${video.user} / Pixabay` : "Pixabay";

    if (!videoUrl) return null;

    const result = { url: videoUrl, thumb, credit };
    _pixabayVideoCache.set(cacheKey, { ...result, ts: Date.now() });
    log.info("image-generation", "Pixabay video cache set", { query, format, credit });
    return result;
  } catch (err: any) {
    log.info("image-generation", "Pixabay video exception", { error: err?.message?.slice(0, 60) });
    return null;
  }
}

// Queries de vídeo por segmento
const PIXABAY_VIDEO_QUERIES: Record<string, string> = {
  imoveis_venda:   "luxury apartment interior tour",
  imoveis_locacao: "apartment modern interior walkthrough",
  ecommerce:       "product showcase commercial",
  servicos_locais: "professional service business",
  infoprodutos:    "online education learning digital",
  saude_estetica:  "wellness clinic beauty spa",
  alimentacao:     "restaurant food cooking delicious",
  moda_varejo:     "fashion style clothing lifestyle",
  b2b:             "business office meeting corporate",
  outro:           "business professional modern",
};

export function getPixabayVideoQuery(segment: string, creative: any): string {
  const base = PIXABAY_VIDEO_QUERIES[segment] || PIXABAY_VIDEO_QUERIES["outro"] || "professional";
  const niche = toText(creative?.niche || "");
  if (niche && niche.length > 3 && niche.length < 25) {
    return `${base} ${niche}`;
  }
  return base;
}


function inferPrompt(creative: any, segment: string, objective: string, format: CreativeImageFormat): string {
  const dim       = FORMAT_DIMENSIONS[format];
  const headline  = toText(creative?.headline);
  const hook      = toText(creative?.hook);
  const copy      = toText(creative?.copy);
  const pain      = toText(creative?.pain);
  const solution  = toText(creative?.solution);
  const angle     = toText(creative?.angle || "");
  const niche     = toText(segment || "");
  const crType    = toText(creative?.type || creative?.format || "");

  // ── Mapear segmento para contexto visual descritivo ──────────────────────
  // CRÍTICO: modelos de imagem não entendem "imoveis_locacao"
  // Precisam de descrição visual em inglês
  const SEGMENT_VISUAL: Record<string, string> = {
    imoveis_venda:   "luxury Brazilian apartment interior, modern living room, keys to new home, real estate photography, warm natural lighting",
    imoveis_locacao: "apartment keys handover scene, rental property tour, welcoming furnished living room, friendly landlord tenant interaction",
    ecommerce:       "professional product photography, clean white background, e-commerce flat lay, purchase intent composition, studio lighting",
    servicos_locais: "local Brazilian business storefront, professional service environment, smiling staff in uniform, clean modern interior",
    infoprodutos:    "online course setup, laptop with digital content, motivated student at clean desk, bright productive workspace",
    saude_estetica:  "modern Brazilian clinic interior, wellness spa atmosphere, professional healthcare setting, clean white medical environment",
    alimentacao:     "appetizing Brazilian food photography, restaurant warm ambiance, delivery packaging with steam, close-up food detail",
    moda_varejo:     "Brazilian fashion lifestyle photography, stylish clothing on model, retail store display, vibrant colors, editorial style",
    b2b:             "modern corporate office meeting room, professional Brazilian business environment, SaaS dashboard on laptop, handshake deal",
    outro:           "modern Brazilian professional environment, business context, clean contemporary setting",
  };
  const segmentVisual = SEGMENT_VISUAL[segment] || SEGMENT_VISUAL["outro"] || "";

  // Mapear ângulo para visual
  const angleToVisual: Record<string, string> = {
    exclusividade:   "luxury lifestyle, premium aesthetics, sophisticated atmosphere",
    urgencia:        "dynamic energy, bold colors, action-oriented composition",
    prova_social:    "people smiling, testimonial feel, trust and community",
    educacao:        "clean informative layout, professional setting, knowledge",
    oferta:          "sale atmosphere, value emphasis, bold offer presentation",
    transformacao:   "before-after concept, aspirational lifestyle, positive change",
    dor:             "relatable problem scenario, empathetic mood",
    autoridade:      "professional expert setting, credible environment",
  };
  const visualStyle = angleToVisual[angle] || "modern professional advertising, clean composition";

  // Mapear objetivo para mood
  const objToMood: Record<string, string> = {
    leads:    "welcoming, approachable, lead generation focused",
    sales:    "conversion-driven, product showcase, purchase intent",
    branding: "brand awareness, memorable visual identity",
    traffic:  "curiosity-inducing, click-worthy composition",
  };
  const mood = objToMood[objective] || "performance marketing";

  // Fix pessoa sem cabeça: sempre especificar composição completa
  const compositionFix = format === "stories"
    ? "full body portrait composition, person fully visible head to toe, centered frame, no cropping"
    : "upper body portrait or full scene, face and head always fully visible, no body cropping";

  // Fix texto: instrução máxima — colocada no INÍCIO e FIM do prompt para ter prioridade
  const noTextFix = "ABSOLUTELY NO TEXT. NO WORDS. NO LETTERS. NO NUMBERS. NO TYPOGRAPHY. NO WRITING. NO SIGNS. NO LOGOS. NO CAPTIONS. NO OVERLAYS. NO WATERMARKS. Pure clean photography only.";
  const noTextPrefix = "NO TEXT NO WORDS NO LETTERS — pure photography only —";

  const parts = [
    noTextPrefix, // NO INÍCIO — maior peso no modelo
    `Professional Brazilian advertising photograph, ${dim.label} format (${dim.ratio} ratio).`,
    `Visual style: ${visualStyle}.`,
    `Mood: ${mood}.`,
    segmentVisual ? `Scene context: ${segmentVisual}.` : (niche ? `Brazilian market context: ${niche}.` : ""),
    // hook/headline removidos — causam alucinação de texto no modelo de imagem
    pain     ? `Emotional context: ${pain.slice(0, 40)}.` : "",
    solution ? `Visual concept: ${solution.slice(0, 40)}.` : "",
    compositionFix,
    "Photorealistic, high-end production quality, cinematic lighting, sharp focus on subjects.",
    noTextFix,
    "Clean background with empty space in lower third for text overlay. No typography anywhere.",
    noTextFix, // repetido intencionalmente para reforçar — modelos de imagem ignoram restrições únicas
  ].filter(Boolean).join(" ");

  return parts;
}

function buildMockUrl(creative: any, objective: string, format: CreativeImageFormat): string {
  const dim = FORMAT_DIMENSIONS[format];
  const headline = (creative?.headline || creative?.hook || objective || "Criativo").slice(0, 54);
  const copy     = (creative?.copy || creative?.bodyText || "").slice(0, 80);
  const cta      = (creative?.cta || "Saiba Mais").slice(0, 30);
  const funnel   = creative?.funnelStage || "TOF";

  // Cores por funil
  const colors: Record<string, [string, string]> = {
    TOF: ["1877f2", "ffffff"],
    MOF: ["7c3aed", "ffffff"],
    BOF: ["059669", "ffffff"],
  };
  const [bg, fg] = colors[funnel] || colors.TOF;

  // Texto do card em múltiplas linhas via placehold.co
  const lines = [headline, copy.slice(0, 60), `→ ${cta}`]
    .filter(Boolean)
    .join("\n");
  const encoded = encodeURIComponent(lines);

  return `https://placehold.co/${dim.width}x${dim.height}/${bg}/${fg}/png?text=${encoded}&font=montserrat`;
}

// ── Flag de créditos esgotados por provider ──────────────────────────────────
// Setado quando recebemos 402 — evita novas tentativas pelo resto da sessão
const _providerExhausted: Record<string, number> = {};
const EXHAUSTED_TTL_MS = 24 * 60 * 60 * 1000; // 24h — reseta créditos no próximo dia

export function markProviderExhausted(provider: string) {
  _providerExhausted[provider] = Date.now();
  log.warn("image-generation", `Provider ${provider} marcado como sem créditos — ignorando por 24h`);
}

export function isProviderExhausted(provider: string): boolean {
  const ts = _providerExhausted[provider];
  if (!ts) return false;
  if (Date.now() - ts > EXHAUSTED_TTL_MS) {
    delete _providerExhausted[provider];
    log.info("image-generation", `Provider ${provider} — créditos possivelmente renovados, tentando novamente`);
    return false;
  }
  return true;
}

export type ImageGenerationDiagnostics = {
  provider: ImageProvider;
  canGenerateRealImages: boolean;
  storageReady: boolean;
  reason: string | null;
  warnings: string[];
};

export function getImageGenerationDiagnostics(providerInput?: string): ImageGenerationDiagnostics {
  const provider = String(providerInput || process.env.IMAGE_PROVIDER || "mock").toLowerCase();
  const normalizedProvider: ImageProvider = (
    provider === "huggingface" || provider === "heygen" || provider === "genspark"
  ) ? (provider as ImageProvider) : "mock";
  const hasHuggingFaceKey = !!String(process.env.HUGGINGFACE_API_KEY || "").trim();
  const hasGensparkKey = !!String(process.env.GENSPARK_API_KEY || "").trim();
  const hasHeygenKey = !!String(process.env.HEYGEN_API_KEY || "").trim();
  const storageReady = !!(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim()
    && String(process.env.CLOUDINARY_API_KEY || "").trim()
    && String(process.env.CLOUDINARY_API_SECRET || "").trim()
  );
  const warnings: string[] = [];
  let reason: string | null = null;

  if (normalizedProvider === "mock") {
    if (hasGensparkKey || hasHuggingFaceKey || hasHeygenKey) {
      reason = 'Há chave de provedor configurada, mas IMAGE_PROVIDER não está apontando para um provider válido (genspark, huggingface ou heygen).';
    } else {
      reason = 'IMAGE_PROVIDER não configurado. Defina IMAGE_PROVIDER e a chave correspondente para ativar geração real.';
    }
  } else if (normalizedProvider === "heygen") {
    reason = hasHeygenKey ? null : "HEYGEN_API_KEY não encontrada.";
  } else if (normalizedProvider === "genspark") {
    reason = hasGensparkKey ? null : "GENSPARK_API_KEY não encontrada.";
  } else if (!hasHuggingFaceKey) {
    reason = "HUGGINGFACE_API_KEY não encontrada. Verifique o nome exato da variável no Render (sem espaços).";
  } else if (!storageReady) {
    reason = null; // Funciona sem Cloudinary — salva como base64
  }

  if (normalizedProvider === "huggingface" && !hasHuggingFaceKey) {
    warnings.push("Defina HUGGINGFACE_API_KEY para habilitar a geração real.");
  }
  if (normalizedProvider === "huggingface" && !storageReady) {
    warnings.push("Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.");
  }
  if (normalizedProvider === "genspark" && !hasGensparkKey) {
    warnings.push("Defina GENSPARK_API_KEY para habilitar a geração real via Genspark.");
  }
  if (normalizedProvider === "heygen" && !hasHeygenKey) {
    warnings.push("Defina HEYGEN_API_KEY para habilitar a geração real via HeyGen.");
  }

  // Verifica se o provider está marcado como sem créditos
  const exhausted = isProviderExhausted(normalizedProvider);
  if (exhausted) {
    reason = `${normalizedProvider} sem créditos disponíveis (402). Recarregue os créditos para voltar a gerar imagens.`;
  }

  return {
    provider: normalizedProvider,
    storageReady,
    canGenerateRealImages:
      !exhausted
      && (
        (normalizedProvider === "huggingface" && hasHuggingFaceKey)
        || (normalizedProvider === "genspark" && hasGensparkKey)
        || (normalizedProvider === "heygen" && hasHeygenKey)
      ),
    reason,
    warnings,
  };
}

export async function uploadImageBufferToCloudinary(buffer: Buffer, fileName: string): Promise<string | null> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || "mecpro/generated-creatives";
  const signatureBase = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureBase).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), fileName);
  form.append("folder", folder);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30000),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.secure_url) {
    log.warn("image-generation", "Falha no upload Cloudinary", { status: res.status, error: data?.error?.message || null });
    return null;
  }

  return data.secure_url as string;
}

export async function uploadBase64ImageToCloudinary(base64Data: string, fileName: string): Promise<string | null> {
  const base64Clean = String(base64Data || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
  if (!base64Clean) return null;
  return uploadImageBufferToCloudinary(Buffer.from(base64Clean, "base64"), fileName);
}

async function generateWithHuggingFace(prompt: string, apiKey: string, format: CreativeImageFormat): Promise<string | null> {
  const dim = FORMAT_DIMENSIONS[format];

  for (const model of HF_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // FAL-AI endpoint via HF router (suporta FLUX sem precisar de créditos FAL direto)
        const apiUrl = model.includes("schnell")
          ? "https://router.huggingface.co/fal-ai/flux/schnell"
          : "https://router.huggingface.co/hf-inference/models/" + model + "/v1/text-to-image";

        // Payload adapta por modelo:
        // FLUX.1-schnell: sem guidance_scale, poucos steps
        // SD 3.5 / SDXL: com width/height e guidance
        const isFlux   = model.includes("FLUX") || model.includes("schnell");
        const isFalAi  = apiUrl.includes("fal-ai");
        const isTurbo  = model.includes("turbo");
        
        let params: Record<string, any>;
        if (isFalAi) {
          // FAL-AI via HF router: payload diferente
          params = {
            prompt,
            image_size: format === "stories" ? "portrait_16_9"
              : format === "square"  ? "square_hd"
              : "portrait_4_3",
            num_inference_steps: 4,
            num_images: 1,
            enable_safety_checker: false,
          };
        } else if (!isFlux) {
          params = { inputs: prompt, parameters: {
            width: Math.min(dim.width, 1024), height: Math.min(dim.height, 1024),
            num_inference_steps: isTurbo ? 4 : 28, guidance_scale: isTurbo ? 0 : 7,
          }};
        } else {
          params = { inputs: prompt, parameters: { num_inference_steps: 4 } };
        }

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            Accept: "image/jpeg,image/png,image/*",
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(90000),
        });

        if (res.status === 503) {
          log.warn("image-generation", "HF 503, retry agendado", { model, attempt, format });
          await sleep(1200 * attempt);
          continue;
        }

        if (!res.ok) {
          const preview = await res.text().catch(() => "");
          log.warn("image-generation", "HF retornou erro", { model, attempt, status: res.status, preview: preview.slice(0, 160) });

          // 402 = créditos esgotados no provider. É falha fatal para esta execução.
          if (res.status === 402 || /depleted your monthly included credits/i.test(preview)) {
            markProviderExhausted("huggingface");
            log.warn("image-generation", "HF sem créditos — interrompendo tentativas neste provider", { model, format });
            return null;
          }

          break;
        }

        const contentType = res.headers.get("content-type") || "";
        
        // FAL-AI retorna JSON com URL da imagem gerada
        if (isFalAi && contentType.includes("application/json")) {
          const falData: any = await res.json().catch(() => ({}));
          const falUrl = falData?.images?.[0]?.url || falData?.image?.url;
          if (falUrl) {
            // Faz download da imagem e upload para Cloudinary
            const imgRes = await fetch(falUrl, { signal: AbortSignal.timeout(20000) }).catch(() => null);
            if (imgRes?.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              const cloudUrl = await uploadImageBufferToCloudinary(buf, `flux_${format}_${Date.now()}.jpg`);
              if (cloudUrl) {
                log.info("image-generation", "HF FAL-AI → Cloudinary OK", { model, format, url: cloudUrl.slice(0, 60) });
                return cloudUrl;
              }
            }
          }
          break; // FAL-AI falhou
        }
        
        if (!contentType.includes("image")) {
          const preview = await res.text().catch(() => "");
          log.warn("image-generation", "HF retornou conteúdo não-imagem", { model, preview: preview.slice(0, 160) });
          break;
        }

        const arrayBuffer = await res.arrayBuffer();
        const hfBuffer = Buffer.from(arrayBuffer);
        // Upload para Cloudinary — URL estável necessária para Meta Ads
        const cloudUrl = await uploadImageBufferToCloudinary(hfBuffer, `hf_${format}_${Date.now()}.jpg`);
        if (cloudUrl) {
          log.info("image-generation", "HF → Cloudinary OK", { model, format, url: cloudUrl.slice(0, 60) });
          return cloudUrl;
        }
        return null; // sem Cloudinary, buffer não pode ser usado como URL
      } catch (error: any) {
        log.warn("image-generation", "Erro na geração HF", { model, attempt, error: error?.message, format });
        if (attempt < 3) await sleep(1200 * attempt);
      }
    }
  }

  return null;
}

// ── Banco de imagens aprovadas pelo RAG ──────────────────────────────────────
// Salva imagens validadas e reutiliza antes de gerar novas
import { Pool } from "pg";
const _imageDbPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function saveApprovedImage(opts: {
  cloudUrl: string; segment: string; format: string;
  query: string; provider: string; bytes: number;
}): Promise<void> {
  try {
    await _imageDbPool.query(
      `INSERT INTO approved_images (cloud_url, segment, format, query, provider, bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [opts.cloudUrl, opts.segment, opts.format, opts.query, opts.provider, opts.bytes]
    );
    log.info("image-generation", "💾 Imagem aprovada salva no banco", {
      segment: opts.segment, format: opts.format, provider: opts.provider,
    });
  } catch { /* silencioso */ }
}

async function getApprovedImage(
  segment: string, format: string, excludeUrl?: string
): Promise<string | null> {
  try {
    const res = await _imageDbPool.query(
      `SELECT id, cloud_url FROM approved_images
       WHERE segment = $1 AND format = $2
       ${excludeUrl ? "AND cloud_url != $3" : ""}
       ORDER BY usage_count ASC, RANDOM()
       LIMIT 5`,
      excludeUrl ? [segment, format, excludeUrl] : [segment, format]
    );
    if (!res.rows.length) return null;
    // Escolhe aleatoriamente entre as 5 menos usadas (diversidade)
    const row = res.rows[Math.floor(Math.random() * res.rows.length)];
    // Incrementa contador de uso
    await _imageDbPool.query(
      `UPDATE approved_images SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1`,
      [row.id]
    ).catch(() => {});
    log.info("image-generation", "♻️ Imagem reutilizada do banco", {
      segment, format, url: row.cloud_url.slice(0, 60),
    });
    return row.cloud_url;
  } catch { return null; }
}

async function countApprovedImages(segment: string, format: string): Promise<number> {
  try {
    const res = await _imageDbPool.query(
      "SELECT COUNT(*) as n FROM approved_images WHERE segment = $1 AND format = $2",
      [segment, format]
    );
    return parseInt(res.rows[0]?.n || "0");
  } catch { return 0; }
}

// ── RAG Anti-Alucinação: detecta texto em imagens geradas ───────────────────
// Método: analisa regiões de alto contraste e padrões de texto via API Vision
// Usa Google Vision API (gratuita 1000/mês) ou fallback por análise de pixels
async function imageHasHallucinatedText(buffer: Buffer): Promise<boolean> {
  // Método primário: Google Vision API (detect text)
  const googleKey = process.env.GOOGLE_API_KEY;
  if (googleKey && buffer.length > 0) {
    try {
      const b64 = buffer.toString("base64");
      const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${googleKey}`;
      const body = {
        requests: [{
          image: { content: b64 },
          features: [{ type: "TEXT_DETECTION", maxResults: 5 }],
        }],
      };
      const res = await fetch(visionUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data: any = await res.json();
        const texts = data?.responses?.[0]?.textAnnotations;
        if (texts && texts.length > 0) {
          // Texto detectado — verifica se é substancial (não apenas 1-2 chars)
          const fullText = texts[0]?.description || "";
          const hasSubstantialText = fullText.replace(/\s/g, "").length > 3;
          if (hasSubstantialText) {
            log.warn("image-generation", "RAG: texto detectado na imagem gerada", {
              textPreview: fullText.slice(0, 60),
              blocks: texts.length,
            });
            return true;
          }
        }
        return false; // sem texto detectado
      }
    } catch { /* fallback */ }
  }

  // Fallback: análise heurística por tamanho
  // Imagens com texto tendem a ter padrões específicos de bytes
  // (heurística simples — baixa precisão mas rápida)
  if (buffer.length < 50_000 && buffer.length > 5_000) {
    // Imagens muito pequenas frequentemente têm muito texto/artefato
    // Não é conclusivo — retorna false para não bloquear
  }
  return false;
}

// ── Cloudflare Workers AI ─────────────────────────────────────────────────
// Versão que retorna Buffer (para RAG check antes de upload)
async function generateWithCloudflareBuffer(
  prompt: string,
  format: CreativeImageFormat
): Promise<Buffer | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;
  if (_cfQuotaExhaustedUntil && Date.now() < _cfQuotaExhaustedUntil) return null;
  try {
    const dim = FORMAT_DIMENSIONS[format];
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_IMAGE_MODEL}`;
    const safePrompt = prompt.slice(0, 1900);
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: safePrompt,
        negative_prompt: "text, words, letters, numbers, typography, watermark, logo, sign, label, caption, title, heading, font, writing, inscription, subtitle, overlay text, printed text, handwriting, speech bubble, banner, poster text, advertising text, any readable text, titles, subtitles",
        width:  Math.min(dim.width,  1024),
        height: Math.min(dim.height, 1024),
        num_steps: 8,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log.warn("image-generation", "Cloudflare erro", { status: res.status, preview: err.slice(0, 100) });
      if (res.status === 429) {
        _cfQuotaExhaustedUntil = getNextMidnightUTC();
        log.warn("image-generation", "Cloudflare 429 — quota esgotada", { resetAt: new Date(_cfQuotaExhaustedUntil).toISOString() });
      }
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json: any = await res.json().catch(() => null);
      const b64 = json?.result?.image || json?.image || json?.result;
      if (typeof b64 === "string" && b64.length > 100) return Buffer.from(b64, "base64");
      return null;
    } else if (contentType.includes("image")) {
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
  } catch (e: any) {
    log.warn("image-generation", "Cloudflare exception", { error: e.message?.slice(0, 80) });
    return null;
  }
}

async function generateWithCloudflare(
  prompt: string,
  format: CreativeImageFormat
): Promise<string | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    log.warn("image-generation", "Cloudflare: CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_API_TOKEN não configurado");
    return null;
  }
  try {
    const dim = FORMAT_DIMENSIONS[format];
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_IMAGE_MODEL}`;

    const safePrompt = prompt.slice(0, 1900); // Cloudflare FLUX limit: 2048 chars on /prompt path
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body:   JSON.stringify({
        prompt: safePrompt,
        negative_prompt: "text, words, letters, numbers, typography, watermark, logo, sign, label, caption, title, heading, font, writing, inscription, subtitle, overlay text, printed text, handwriting, speech bubble, banner, poster text, advertising text, any readable text",
        width:  Math.min(dim.width,  1024),
        height: Math.min(dim.height, 1024),
        num_steps: 8,        // mais passos = maior qualidade e melhor aderência ao prompt
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log.warn("image-generation", "Cloudflare erro", { status: res.status, preview: err.slice(0, 100) });
      if (res.status === 429) {
        _cfQuotaExhaustedUntil = getNextMidnightUTC();
        log.warn("image-generation", "Cloudflare 429 — quota diária esgotada, fallback até meia-noite UTC", {
          resetAt: new Date(_cfQuotaExhaustedUntil).toISOString(),
        });
      }
      return null;
    }

    // Cloudflare pode retornar:
    // 1. JSON { result: { image: "base64..." } }  ← formato atual da REST API
    // 2. Binário image/png                         ← formato antigo / Workers binding
    const contentType = res.headers.get("content-type") || "";
    let buffer: Buffer | null = null;

    if (contentType.includes("application/json")) {
      // Formato JSON — extrai base64
      const json: any = await res.json().catch(() => null);
      const b64 = json?.result?.image || json?.image || json?.result;
      if (typeof b64 === "string" && b64.length > 100) {
        buffer = Buffer.from(b64, "base64");
        log.info("image-generation", "Cloudflare JSON base64 OK", { format, bytes: buffer.length });
      } else {
        log.warn("image-generation", "Cloudflare JSON sem imagem", { keys: Object.keys(json?.result || json || {}) });
        return null;
      }
    } else if (contentType.includes("image")) {
      // Formato binário
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      const txt = await res.text().catch(() => "");
      log.warn("image-generation", "Cloudflare formato desconhecido", { contentType, preview: txt.slice(0, 80) });
      return null;
    }

    if (!buffer || buffer.length < 1000) {
      log.warn("image-generation", "Cloudflare imagem muito pequena ou nula", { bytes: buffer?.length });
      return null;
    }

    // Upload para Cloudinary → URL estável para o Meta Ads
    const cloudUrl = await uploadImageBufferToCloudinary(buffer, `cf_flux_${format}_${Date.now()}.jpg`);
    if (cloudUrl) {
      log.info("image-generation", "Cloudflare → Cloudinary OK", { format, bytes: buffer.length, url: cloudUrl.slice(0, 60) });
      return cloudUrl;
    }
    return null;
  } catch (e: any) {
    log.warn("image-generation", "Cloudflare exception", { error: e.message?.slice(0, 80) });
    return null;
  }
}

async function generateWithHeyGen(creative: any, objective: string, format: CreativeImageFormat): Promise<string | null> {
  const apiKey = (process.env.HEYGEN_API_KEY || "").trim();
  if (!apiKey) {
    log.warn("image-generation", "HEYGEN_API_KEY nao configurada");
    return null;
  }

  const prompt = inferPrompt(creative, creative?.segment || creative?.niche || "", objective, format);

  // Aspect ratio baseado no formato
  const aspectMap: Record<CreativeImageFormat, string> = {
    feed:    "4:5",
    stories: "9:16",
    square:  "1:1",
  };
  const aspect = aspectMap[format] || "4:5";

  log.info("image-generation", "HeyGen: iniciando geracao", { format, aspect, promptLen: prompt.length });

  try {
    // Endpoint HeyGen text-to-image: tenta v2 primeiro, fallback v1
    const res = await fetch("https://api.heygen.com/v2/image.generate", {
      method:  "POST",
      headers: {
        "X-Api-Key":    apiKey,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspect,
        model:        "photo_real",
        resolution:   "1024x1024",
      }),
      signal: AbortSignal.timeout(120000),
    });

    const raw = await res.text().catch(() => "{}");
    log.info("image-generation", "HeyGen /v2/image.generate resposta", {
      status: res.status,
      preview: raw.slice(0, 200),
    });

    // 404 = endpoint não existe neste plano; 403 = sem permissão de imagem
    if (res.status === 404 || res.status === 403) {
      log.warn("image-generation", "HeyGen não suporta geração de imagem neste plano — pulando", { status: res.status });
      return null;
    }

    if (res.ok) {
      let data: any = {};
      try { data = JSON.parse(raw); } catch { /* raw inválido */ }

      // Resposta síncrona
      const directUrl = data?.data?.image_url || data?.data?.url
        || data?.image_url || data?.url;
      if (directUrl) {
        log.info("image-generation", "HeyGen OK (sincrono)", { url: (directUrl as string).slice(0, 80) });
        return directUrl as string;
      }

      // Resposta assíncrona — retorna job_id ou token
      const jobId = data?.data?.token || data?.data?.job_id || data?.data?.id
        || data?.token || data?.job_id || data?.id;

      if (jobId) {
        log.info("image-generation", "HeyGen job detectado, fazendo polling", { jobId });

        // Polling até 90s (18 tentativas × 5s)
        for (let i = 0; i < 18; i++) {
          await new Promise(r => setTimeout(r, 5000));

          const pollRes = await fetch("https://api.heygen.com/v1/image.generation/" + jobId, {
            headers: { "X-Api-Key": apiKey },
            signal:  AbortSignal.timeout(15000),
          }).catch(() => null);

          if (!pollRes) continue;

          const pollRaw = await pollRes.text().catch(() => "{}");
          let pollData: any = {};
          try { pollData = JSON.parse(pollRaw); } catch { /* continua */ }

          const status    = pollData?.data?.status || pollData?.status;
          const resultUrl = pollData?.data?.image_url || pollData?.data?.url || pollData?.url;

          log.info("image-generation", "HeyGen poll", { i: i + 1, status, hasUrl: !!resultUrl });

          if (resultUrl) {
            log.info("image-generation", "HeyGen job concluido", { url: (resultUrl as string).slice(0, 80) });
            return resultUrl as string;
          }

          if (status === "failed" || status === "error") {
            log.warn("image-generation", "HeyGen job falhou", { status, raw: pollRaw.slice(0, 200) });
            break;
          }
        }

        log.warn("image-generation", "HeyGen polling timeout após 90s", { jobId });
        return null;
      }

      log.warn("image-generation", "HeyGen: sem image_url nem job_id na resposta", {
        keys: Object.keys((data as any)?.data || data || {}).join(","),
      });
    } else {
      if (res.status === 402) markProviderExhausted("heygen");
    log.warn("image-generation", "HeyGen HTTP erro", { status: res.status, preview: raw.slice(0, 200) });
    }

  } catch (err: any) {
    log.warn("image-generation", "HeyGen exception", { error: err?.message?.slice(0, 120) });
  }

  return null;
}

// ── Pollinations.AI — geração gratuita sem API key ───────────────────────────
// Funciona via URL direta: https://image.pollinations.ai/prompt/{encoded}
const tryPollinations = async (prompt: string, format: CreativeImageFormat, attempt = 1): Promise<string | null> => {
  try {
    const dim = FORMAT_DIMENSIONS[format];
    const encoded = encodeURIComponent(prompt.slice(0, 500));
    const negativeEncoded = encodeURIComponent("text, words, letters, typography, writing, watermark, logo, sign, label, caption, title, heading, font");
    const seed = Date.now() + (attempt * 1000); // seed diferente por tentativa
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${dim.width}&height=${dim.height}&nologo=true&notext=true&enhance=true&model=flux&negative=${negativeEncoded}&seed=${seed}`;

    log.info("image-generation", `Pollinations.AI tentativa ${attempt}`, { format, seed });

    // Timeout 35s — Pollinations pode demorar 15-30s para gerar FLUX
    const getRes = await fetch(url, { signal: AbortSignal.timeout(35000) }).catch((e: any) => {
      log.warn("image-generation", `Pollinations timeout/erro tentativa ${attempt}`, { error: e.message?.slice(0, 60) });
      return null;
    });
    if (!getRes?.ok) {
      log.warn("image-generation", `Pollinations HTTP ${getRes?.status} tentativa ${attempt}`, { format });
      // Retry automático na tentativa 1
      if (attempt < 2) return tryPollinations(prompt, format, 2);
      return null;
    }

    const contentType = getRes.headers.get("content-type") || "";
    if (!contentType.includes("image")) {
      log.warn("image-generation", "Pollinations retornou não-imagem", { contentType });
      return null;
    }

    const arrayBuffer = await getRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return null; // imagem muito pequena = erro

    log.info("image-generation", "Pollinations.AI download OK", { format, bytes: buffer.length });

    // Tenta fazer upload para Cloudinary (URL estável que o Meta consegue acessar)
    const cloudUrl = await uploadImageBufferToCloudinary(buffer, `pollinations_${format}_${Date.now()}.jpg`);
    if (cloudUrl) {
      log.info("image-generation", "Pollinations → Cloudinary OK", { format, url: cloudUrl.slice(0, 60) });
      return cloudUrl;
    }

    // Sem Cloudinary: retorna a URL dinâmica mesmo (Meta pode ou não aceitar)
    log.info("image-generation", "Pollinations.AI OK (sem Cloudinary)", { format });
    return url;
  } catch (e: any) {
    log.warn("image-generation", "Pollinations.AI falhou", { error: e.message?.slice(0, 60) });
    return null;
  }
}

async function generateWithGenspark(
  creative: any,
  objective: string,
  format: CreativeImageFormat,
): Promise<string | null> {
  const apiKey = (process.env.GENSPARK_API_KEY || "").trim();
  if (!apiKey) return null;

  const prompt = inferPrompt(creative, creative?.segment || creative?.niche || "", objective, format);
  const dim    = FORMAT_DIMENSIONS[format];

  // Genspark usa API compatível com OpenAI para imagens
  // Endpoint: POST /v1/images/generations
  if (isProviderExhausted("genspark")) {
    log.info("image-generation", "Genspark marcado como sem créditos — pulando");
    return null;
  }
  try {
    log.info("image-generation", "Genspark: gerando imagem", { format });

    const res = await fetch("https://api.genspark.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        Accept:          "application/json",
      },
      body: JSON.stringify({
        prompt,
        model:   process.env.GENSPARK_IMAGE_MODEL || "genspark-image-auto",
        n:       1,
        size:    `${Math.min(dim.width, 1024)}x${Math.min(dim.height, 1024)}`,
        quality: "hd",
        style:   "natural",
      }),
      signal: AbortSignal.timeout(90000),
    });

    const raw = await res.text().catch(() => "{}");
    log.info("image-generation", "Genspark resposta", { status: res.status, preview: raw.slice(0, 300) });

    if (!res.ok) return null;

    let data: any = {};
    try { data = JSON.parse(raw); } catch { return null; }

    // Resposta DALL-E compatible: data[0].url ou data[0].b64_json
    const url    = data?.data?.[0]?.url;
    const b64    = data?.data?.[0]?.b64_json;

    if (url) {
      log.info("image-generation", "Genspark OK (url)", { url: (url as string).slice(0, 80) });
      return url as string;
    }
    if (b64) {
      const dataUrl = "data:image/png;base64," + b64;
      log.info("image-generation", "Genspark OK (b64)", { bytes: b64.length });
      return dataUrl;
    }

    log.warn("image-generation", "Genspark: sem url nem b64 na resposta", {
      keys: Object.keys(data?.data?.[0] || {}).join(","),
    });
  } catch (err: any) {
    log.warn("image-generation", "Genspark exception", { error: err?.message?.slice(0, 100) });
  }
  return null;
}


// ── Google Custom Search — imagens CC0/domínio público ───────────────────────
// 100 queries/dia grátis | só retorna imagens com licença livre
// Credenciais: GOOGLE_API_KEY + GOOGLE_CSE_ID (já no Render)
const _googleImageCache = new Map<string, { url: string; ts: number }>();

async function searchGoogleImages(
  query: string,
  format: CreativeImageFormat,
  creativeIndex: number = 0,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId  = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  const cacheKey = `google|${query}|${format}|${creativeIndex}`;
  const cached = _googleImageCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 86_400_000) return cached.url;

  try {
    const params = new URLSearchParams({
      key:        apiKey,
      cx:         cseId,
      q:          query,
      searchType: "image",
      rights:     "cc_publicdomain,cc_attribute,cc_sharealike", // só imagens livres
      imgType:    "photo",
      imgSize:    "large",
      safe:       "active",
      num:        "5",
      start:      String((creativeIndex % 3) * 3 + 1), // varia posição por criativo
    });

    const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!res.ok) {
      log.warn("image-generation", "Google Images error", { status: res.status });
      return null;
    }

    const data: any = await res.json();
    const items = data?.items;
    if (!items?.length) return null;

    const imgUrl = items[0]?.link;
    if (!imgUrl) return null;

    _googleImageCache.set(cacheKey, { url: imgUrl, ts: Date.now() });
    log.info("image-generation", "Google Images OK", {
      query, format, url: imgUrl.slice(0, 60),
    });
    return imgUrl;
  } catch (err: any) {
    log.warn("image-generation", "Google Images exception", { error: err?.message?.slice(0, 60) });
    return null;
  }
}

// ── Re-hospeda imagem externa no Cloudinary ──────────────────────────────────
// Necessário para Meta Ads: URLs externas (Pixabay, Pollinations) são bloqueadas
// por robots.txt ou headers de segurança — Meta não consegue baixar
async function reHostImageOnCloudinary(
  sourceUrl: string,
  format: CreativeImageFormat,
): Promise<string | null> {
  try {
    // Download da imagem
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "MecProAI/1.0 (ad-creative-generator)" },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 5000) return null; // muito pequena = erro

    const fileName = `pixabay-${format}-${Date.now()}.jpg`;
    const cloudUrl = await uploadImageBufferToCloudinary(buffer, fileName);
    if (cloudUrl) {
      log.info("image-generation", "Imagem re-hospedada no Cloudinary", { format, bytes: buffer.length, cloudUrl: cloudUrl.slice(0, 60) });
    }
    return cloudUrl;
  } catch (err: any) {
    log.warn("image-generation", "Falha ao re-hospedar imagem", { error: err?.message?.slice(0, 60) });
    return null;
  }
}

export async function generateAdImage(
  creative: any,
  segment: string,
  objective: string,
  config: { provider: ImageProvider; apiKey: string },
  format: CreativeImageFormat,
  productContext?: {
    productName?: string;
    productService?: string;
    niche?: string;
    city?: string;
  },
): Promise<string | null> {
  const provider = config?.provider || "mock";

  // Se o provider primário está esgotado, pula direto para Pollinations
  if (isProviderExhausted(provider)) {
    log.info("image-generation", `Provider ${provider} esgotado — Pollinations direto`, { format });
    const polUrl = await tryPollinations(inferPrompt(creative, segment, objective, format), format).catch((e: any) => {
      log.warn("image-generation", "Pollinations falhou no fallback direto", { error: e.message?.slice(0, 60) });
      return null;
    });
    if (polUrl) {
      log.info("image-generation", "✅ Pollinations.AI fallback direto OK", { format });
      return polUrl;
    }
    log.warn("image-generation", "Pollinations falhou — sem imagem gerada", { format });
    return null;
  }

  const cacheKey = getCacheKey(creative, segment, objective, provider, format);
  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached) return cached;

  const tryProvider = async (providerToTry: ImageProvider, apiKey?: string): Promise<string | null> => {
    if (providerToTry === "huggingface") {
      // Cloudflare FLUX com RAG anti-alucinação:
      // Gera imagem → verifica texto com Google Vision → descarta se tiver alucinação
      if (CF_ACCOUNT_ID && CF_API_TOKEN) {
        const MAX_CF_ATTEMPTS = 2; // tenta 2x antes de desistir
        for (let attempt = 1; attempt <= MAX_CF_ATTEMPTS; attempt++) {
          try {
            const cfBuffer = await generateWithCloudflareBuffer(
              inferPrompt(creative, segment, objective, format), format
            );
            if (cfBuffer && cfBuffer.length > 1000) {
              const hasText = await imageHasHallucinatedText(cfBuffer);
              if (!hasText) {
                // Imagem limpa — faz upload e usa
                const cfUrl = await uploadImageBufferToCloudinary(
                  cfBuffer, `cf_flux_${format}_${Date.now()}.jpg`
                );
                if (cfUrl) {
                  IMAGE_CACHE.set(cacheKey, cfUrl);
                  log.info("image-generation", `✅ Cloudflare FLUX OK (RAG passou, tentativa ${attempt})`, { format });
                  // RAG: valida imagem antes de salvar no banco
                  const ragResult = await runImageRAG(cfUrl, cfBuffer.length, {
                    segment: segment || "outro", format,
                    productName:    productContext?.productName,
                    productService: productContext?.productService,
                    niche:          productContext?.niche,
                  });
                  if (ragResult.validation_status === "approved") {
                    await saveApprovedImage({
                      cloudUrl: cfUrl, segment: segment || "outro", format,
                      query: ragResult.generated_tags.slice(0,3).join(","),
                      provider: "cloudflare", bytes: cfBuffer.length,
                    });
                    log.info("image-generation", "RAG aprovado — salvo na biblioteca", {
                      score: ragResult.scores.overall_score, tags: ragResult.generated_tags.slice(0,3),
                    });
                  } else {
                    log.warn("image-generation", `RAG ${ragResult.validation_status}`, {
                      rejection: ragResult.rejection_reason.slice(0,80),
                    });
                  }
                  return cfUrl;
                }
              } else {
                log.warn("image-generation", `RAG: imagem CF rejeitada (tentativa ${attempt}) — tentando novamente`, { format });
                // Na segunda tentativa, usa prompt mais agressivo sem texto
                if (attempt === MAX_CF_ATTEMPTS) {
                  log.warn("image-generation", "Cloudflare FLUX: 2 tentativas com alucinação → fallback Pixabay", { format });
                }
              }
            }
          } catch { /* continua */ }
        }
      }
      // HF hf-inference desabilitado — todos os modelos mortos
      return null;
    }

    // Genspark desabilitado — inacessível do Render.com
    // if (providerToTry === "genspark") { ... }

    if (providerToTry === "heygen") {
      // HeyGen desabilitado — endpoint /v2/image.generate retorna 404
      // return await generateWithHeyGen(creative, objective, format);
      return null;
    }

    return null;
  };

  try {
    const candidates: Array<{ provider: ImageProvider; apiKey: string }> = [];
    const pushCandidate = (providerToPush: ImageProvider, apiKey: string) => {
      if (!apiKey && providerToPush !== "mock") return;
      if (candidates.some((item) => item.provider === providerToPush)) return;
      candidates.push({ provider: providerToPush, apiKey });
    };

    // Primeiro tenta o provider configurado.
    pushCandidate(provider, config.apiKey || "");

    // Fallbacks — Genspark desabilitado (fetch failed do Render)
    // pushCandidate("genspark", ...); ← inacessível
    pushCandidate("huggingface", (process.env.HUGGINGFACE_API_KEY || "").trim());
    pushCandidate("heygen", (process.env.HEYGEN_API_KEY || "").trim());

    for (const candidate of candidates) {
      const url = await tryProvider(candidate.provider, candidate.apiKey);
      if (url) {
        if (candidate.provider !== provider) {
          log.warn("image-generation", "Fallback de provider aplicado", {
            requestedProvider: provider,
            fallbackProvider: candidate.provider,
            format,
          });
        }
        IMAGE_CACHE.set(cacheKey, url);
        return url;
      }
    }

    // Penúltima tentativa: Pixabay foto + vídeo (CC0 — licença comercial, automação permitida)
    // creativeIndex varia por criativo para garantir imagens diferentes
    const creativeIdx = typeof creative?.creativeIndex === "number" ? creative.creativeIndex : (creative?.index ?? 0);

    // ── Tenta reutilizar imagem aprovada do banco (evita regerar) ─────────────
    // Só reutiliza se tiver pelo menos 3 imagens no banco (garante diversidade)
    const dbCount = await countApprovedImages(segment || "outro", format);
    if (dbCount >= 3) {
      const cachedUrl = await getApprovedImage(segment || "outro", format, IMAGE_CACHE.get(cacheKey) || undefined);
      if (cachedUrl) {
        IMAGE_CACHE.set(cacheKey, cachedUrl);
        return cachedUrl;
      }
    }

    const pixabayQuery = getPixabayQuery(segment, creative, creativeIdx, productContext);
    // Tenta foto primeiro
    const pixabayResult = await searchPixabay(pixabayQuery, format, creativeIdx);
    if (pixabayResult) {
      // Meta não consegue acessar URLs do Pixabay (robots.txt bloqueia crawlers)
      // Solução: baixar e re-hospedar no Cloudinary antes de enviar para Meta
      const rehostedUrl = await reHostImageOnCloudinary(pixabayResult.url, format);
      const finalPixUrl = rehostedUrl || pixabayResult.url;
      IMAGE_CACHE.set(cacheKey, finalPixUrl);
      log.info("image-generation", "✅ Pixabay foto OK", {
        query: pixabayQuery, credit: pixabayResult.credit, format,
        rehosted: !!rehostedUrl,
      });
      // RAG: valida Pixabay antes de salvar
      const pixRag = await runImageRAG(finalPixUrl, 50_000, {
        segment: segment || "outro", format,
        productName:    productContext?.productName,
        productService: productContext?.productService,
        niche:          productContext?.niche,
      });
      if (pixRag.validation_status !== "rejected") {
        await saveApprovedImage({
          cloudUrl: finalPixUrl, segment: segment || "outro", format,
          query: pixabayQuery, provider: "pixabay", bytes: 0,
        });
      }
      return finalPixUrl;
    }
    // Se não achou foto, tenta vídeo (retorna thumbnail do vídeo como imagem)
    const pixabayVideoQuery = getPixabayVideoQuery(segment, creative);
    const pixabayVideo = await searchPixabayVideo(pixabayVideoQuery, format);
    if (pixabayVideo?.thumb) {
      const rehostedThumb = await reHostImageOnCloudinary(pixabayVideo.thumb, format);
      const finalThumbUrl = rehostedThumb || pixabayVideo.thumb;
      IMAGE_CACHE.set(cacheKey, finalThumbUrl);
      log.info("image-generation", "✅ Pixabay vídeo thumb OK", {
        query: pixabayVideoQuery, credit: pixabayVideo.credit, format,
        rehosted: !!rehostedThumb,
      });
      return finalThumbUrl;
    }

    // Tentativa Google Images (CC0, 100 req/dia — complemento do Pixabay)
    // Google: tenta query específica do produto se disponível
    const googleQuery = productContext?.productName
      ? `${productContext.productName} ${(PIXABAY_QUERIES[segment] || "professional")}`.slice(0, 80)
      : pixabayQuery;
    const googleUrl = await searchGoogleImages(googleQuery, format, creativeIdx);
    if (googleUrl) {
      const rehostedGoogle = await reHostImageOnCloudinary(googleUrl, format);
      const finalGoogleUrl = rehostedGoogle || googleUrl;
      IMAGE_CACHE.set(cacheKey, finalGoogleUrl);
      log.info("image-generation", "✅ Google Images OK", { query: pixabayQuery, format });
      return finalGoogleUrl;
    }

    // Última tentativa: Pollinations.AI (gratuito, sem API key)
    // Usa o mesmo prompt rico do inferPrompt (com nicho, copy, etc)
    log.info("image-generation", "Tentando Pollinations.AI (fallback principal)", { format });
    const pollinationsUrl = await tryPollinations(
      inferPrompt(creative, segment, objective, format),
      format
    ).catch((e: any) => {
      log.warn("image-generation", "Pollinations falhou no pipeline principal", { error: e.message?.slice(0, 60) });
      return null;
    });
    if (pollinationsUrl) {
      IMAGE_CACHE.set(cacheKey, pollinationsUrl);
      log.info("image-generation", "✅ Pollinations.AI como fallback final", { format });
      return pollinationsUrl;
    }

    const mockUrl = buildMockUrl(creative, objective, format);
    IMAGE_CACHE.set(cacheKey, mockUrl);
    return mockUrl;
  } catch (error: any) {
    log.error("image-generation", "Falha ao gerar imagem de anúncio", {
      error: error?.message,
      provider,
      format,
      objective,
    });
    const mockUrl = buildMockUrl(creative, objective, format);
    IMAGE_CACHE.set(cacheKey, mockUrl);
    return mockUrl;
  }
}

// ─────────────────────────────────────────────────────────────
// JSON2Video — Geração de Vídeo a partir de Imagem
// Free: 600 créditos (~10 min de vídeo), sem cartão
// Docs: https://json2video.com/docs/
// ─────────────────────────────────────────────────────────────
const J2V_API_KEY = process.env.JSON2VIDEO_API_KEY || "";

export async function generateVideoFromImage(
  imageUrl:  string,
  headline:  string,
  cta:       string,
  format:    "feed" | "stories" | "square",
  voiceText?: string,   // texto para narração (hook + copy)
): Promise<string | null> {
  if (!J2V_API_KEY) {
    log.warn("video-generation", "JSON2VIDEO_API_KEY não configurado");
    return null;
  }

  // JSON2Video resolutions: hd-portrait=1080x1920, sd-portrait=720x1280
  // square=1080x1080, hd-landscape=1920x1080, full-hd=1920x1080
  const resolution = format === "stories"
    ? "hd-portrait"   // 9:16 — 1080×1920 ideal para TikTok/Stories
    : format === "square"
    ? "square"        // 1:1 — 1080×1080 Instagram
    : "hd-portrait";  // 4:5 Meta feed — portrait HD

  const duration = 6; // 6 segundos — ideal para Meta e TikTok

  // Cena: imagem com zoom Ken Burns + texto overlay + CTA
  // Dimensões do vídeo = dimensões da imagem gerada
  // Isso evita barras pretas quando a imagem não tem o aspect ratio exato do canvas
  // feed=4:5 (1080×1350), stories=9:16 (1080×1920), square=1:1 (1080×1080)
  // IMPORTANTE: se só temos feedImageUrl (1080×1350), o vídeo deve ser 4:5 também
  const dims = format === "stories" ? { w: 1080, h: 1920 }
             : format === "square"  ? { w: 1080, h: 1080 }
             :                        { w: 1080, h: 1350 };
  // resolution "sd-portrait" = 720×1280, "hd-portrait" = 1080×1920
  // Para feed (4:5) usamos custom pois não há preset 4:5 no JSON2Video

  const ctaText   = cta     ? cta.toUpperCase()      : "";
  const titleText = headline ? headline.slice(0, 55) : "";

  // UMA cena única com imagem cover + textos sobrepostos
  const movie = {
    resolution: "custom",
    width:   dims.w,
    height:  dims.h,
    quality: "high",
    scenes: [{
      comment:  "ad",
      duration,
      elements: [
        // Imagem de fundo: fill=cover garante que preenche TODO o canvas
        {
          type:   "image",
          src:    imageUrl,
          x:      0,
          y:      0,
          width:  dims.w,
          height: dims.h,
          fill:   "cover",   // escala a imagem para preencher TODO o canvas sem barras
          "z-index": 0,
          zoom:   3,
          pan:    "right",
          duration,
        },

        // Headline
        ...(titleText ? [{
          type:    "text",
          style:   "001",
          text:    titleText,
          settings: {
            "font-size":   "44px",
            "font-weight": "bold",
            "color":       "#FFFFFF",
          },
          x:       40,
          y:       dims.h - 300,
          width:   dims.w - 80,
          duration,
        }] : []),
        // CTA
        ...(ctaText ? [{
          type:  "text",
          style: "001",
          text:  ctaText,
          settings: {
            "font-size":        "30px",
            "font-weight":      "bold",
            "color":            "#FFFFFF",
            "background-color": "#1877F2",
            "padding":          "10px 28px",
            "border-radius":    "28px",
          },
          x:       40,
          y:       dims.h - 150,
          width:   dims.w - 80,
          duration,
        }] : []),
        // Narração em voz PT-BR (Azure — gratuito em todos os planos)
        ...(voiceText ? [{
          type:  "voice",
          text:  voiceText.slice(0, 300),   // máx 300 chars para ~6s de fala
          voice: "pt-BR-FranciscaNeural",   // voz feminina natural PT-BR
          model: "azure",                   // grátis — não consome créditos
          volume: 1,
        }] : []),
      ],
    }],
  }
  try {
    // 1. Envia o job de renderização
    const createRes = await fetch("https://api.json2video.com/v2/movies", {
      method:  "POST",
      headers: { "x-api-key": J2V_API_KEY, "Content-Type": "application/json" },
      body:    JSON.stringify(movie),
      signal:  AbortSignal.timeout(15000),
    });

    const createData: any = await createRes.json();
    if (!createData?.project) {
      log.warn("video-generation", "JSON2Video create falhou", { body: JSON.stringify(createData).slice(0, 200) });
      return null;
    }

    const projectId = createData.project;
    log.info("video-generation", "JSON2Video job criado", { projectId, format });

    // 2. Polling — aguarda renderização (max 90s)
    const maxAttempts = 18;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000)); // aguarda 5s entre checks

      const statusRes = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
        headers: { "x-api-key": J2V_API_KEY },
        signal:  AbortSignal.timeout(8000),
      });
      const statusData: any = await statusRes.json();
      const movie = statusData?.movie;

      if (movie?.status === "done" && movie?.url) {
        log.info("video-generation", "JSON2Video pronto", { projectId, url: movie.url.slice(0, 60) });
        return movie.url; // URL pública do MP4
      }
      if (movie?.status === "error") {
        log.warn("video-generation", "JSON2Video erro", { projectId, error: movie.message });
        return null;
      }

      log.info("video-generation", "JSON2Video aguardando", { projectId, attempt: i + 1, status: movie?.status });
    }

    log.warn("video-generation", "JSON2Video timeout após 90s", { projectId });
    return null;
  } catch (e: any) {
    log.warn("video-generation", "JSON2Video exception", { error: e.message?.slice(0, 80) });
    return null;
  }
}
