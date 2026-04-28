import crypto from "crypto";
import { log } from "./logger";

export type ImageProvider = "huggingface" | "heygen" | "genspark" | "mock";
export type CreativeImageFormat = "feed" | "stories" | "square";

const IMAGE_CACHE = new Map<string, string>();
// API nova HuggingFace router: /v1/text-to-image
// FLUX.1-schnell: gratuito, rápido (4 steps), nova API
// SD 3.5 Large: alta qualidade, nova API
// SDXL Turbo: fallback rápido
const HF_MODELS = [
  // Mantemos apenas o modelo confirmado neste endpoint.
  // Os demais estavam retornando 400 "Model not supported by provider hf-inference".
  "black-forest-labs/FLUX.1-schnell",
];

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

  const parts = [
    `Professional Brazilian advertising photo for ${dim.label} (${dim.ratio} ratio).`,
    `Visual style: ${visualStyle}.`,
    `Mood: ${mood}.`,
    niche    ? `Industry context: ${niche}.` : "",
    hook     ? `Visual concept based on: "${hook.slice(0, 80)}".` : "",
    headline ? `Supporting message: "${headline.slice(0, 60)}".` : "",
    pain     ? `Addresses pain point: ${pain.slice(0, 60)}.` : "",
    solution ? `Shows solution: ${solution.slice(0, 60)}.` : "",
    "Photorealistic, high-end production quality, cinematic lighting.",
    "Leave clean space for text overlay. No text, logos or watermarks in image.",
    "Suitable for Meta Ads, Instagram Feed and Stories.",
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
  form.append("file", new Blob([buffer]), fileName);
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

async function generateWithHuggingFace(prompt: string, apiKey: string, format: CreativeImageFormat): Promise<Buffer | null> {
  const dim = FORMAT_DIMENSIONS[format];

  for (const model of HF_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Todos os modelos usam a nova API do router HF
        const apiUrl = "https://router.huggingface.co/hf-inference/models/" + model + "/v1/text-to-image";

        // Payload adapta por modelo:
        // FLUX.1-schnell: sem guidance_scale, poucos steps
        // SD 3.5 / SDXL: com width/height e guidance
        const isFlux   = model.includes("FLUX");
        const isTurbo  = model.includes("turbo");
        const params: Record<string, any> = { inputs: prompt };
        if (!isFlux) {
          params.parameters = {
            width:               Math.min(dim.width,  1024),
            height:              Math.min(dim.height, 1024),
            num_inference_steps: isTurbo ? 4 : 28,
            guidance_scale:      isTurbo ? 0 : 7,
          };
        } else {
          // FLUX.1-schnell: apenas steps (sem guidance_scale)
          params.parameters = { num_inference_steps: 4 };
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
        if (!contentType.includes("image")) {
          const preview = await res.text().catch(() => "");
          log.warn("image-generation", "HF retornou conteúdo não-imagem", { model, preview: preview.slice(0, 160) });
          break;
        }

        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        log.warn("image-generation", "Erro na geração HF", { model, attempt, error: error?.message, format });
        if (attempt < 3) await sleep(1200 * attempt);
      }
    }
  }

  return null;
}

async function generateWithHeyGen(creative: any, objective: string, format: CreativeImageFormat): Promise<string | null> {
  const apiKey = (process.env.HEYGEN_API_KEY || "").trim();
  if (!apiKey) {
    log.warn("image-generation", "HEYGEN_API_KEY nao configurada");
    return null;
  }

  const prompt = inferPrompt(creative, "", objective, format);

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
async function tryPollinations(prompt: string, format: CreativeImageFormat): Promise<string | null> {
  try {
    const dim = FORMAT_DIMENSIONS[format];
    const encoded = encodeURIComponent(prompt.slice(0, 500));
    // Pollinations retorna imagem direta via GET — sem necessidade de API key
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${dim.width}&height=${dim.height}&nologo=true&model=flux`;

    // Verifica se o endpoint responde (timeout 15s)
    const testRes = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    if (testRes && (testRes.ok || testRes.status === 200)) {
      log.info("image-generation", "Pollinations.AI OK", { format, url: url.slice(0, 80) });
      return url;
    }
    // GET direto como fallback
    const getRes = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (getRes?.ok) {
      log.info("image-generation", "Pollinations.AI GET OK", { format });
      return url;
    }
    return null;
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

  const prompt = inferPrompt(creative, "", objective, format);
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


export async function generateAdImage(
  creative: any,
  segment: string,
  objective: string,
  config: { provider: ImageProvider; apiKey: string },
  format: CreativeImageFormat,
): Promise<string | null> {
  const provider = config?.provider || "mock";

  // Retorno imediato se o provider está sem créditos — evita tentativas desnecessárias
  if (isProviderExhausted(provider)) {
    log.info("image-generation", `Provider ${provider} sem créditos — pulando geração`, { format });
    return null;
  }

  const cacheKey = getCacheKey(creative, segment, objective, provider, format);
  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached) return cached;

  const tryProvider = async (providerToTry: ImageProvider, apiKey?: string): Promise<string | null> => {
    if (providerToTry === "huggingface" && apiKey) {
      const prompt = inferPrompt(creative, segment, objective, format);
      const buffer = await generateWithHuggingFace(prompt, apiKey, format);
      if (!buffer) return null;

      const fileName = "creative-" + Date.now() + "-" + format + ".png";
      const uploadedUrl = await uploadImageBufferToCloudinary(buffer, fileName);
      if (uploadedUrl) return uploadedUrl;

      log.info("image-generation", "HF gerou imagem — usando base64 data URL", { format });
      const b64 = buffer.toString("base64");
      return "data:image/png;base64," + b64;
    }

    if (providerToTry === "genspark") {
      return await generateWithGenspark(creative, objective, format);
    }

    if (providerToTry === "heygen") {
      return await generateWithHeyGen(creative, objective, format);
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

    // Depois tenta fallbacks reais disponíveis no ambiente.
    pushCandidate("genspark", (process.env.GENSPARK_API_KEY || "").trim());
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

    // Última tentativa: Pollinations.AI (gratuito, sem API key)
    const pollinationsUrl = await tryPollinations(
      `${creative?.headline || objective} ${creative?.copy?.slice(0, 100) || ""}`,
      format
    ).catch(() => null);
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
