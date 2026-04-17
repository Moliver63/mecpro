import crypto from "crypto";
import { log } from "./logger";

export type ImageProvider = "huggingface" | "heygen" | "mock";
export type CreativeImageFormat = "feed" | "stories" | "square";

const IMAGE_CACHE = new Map<string, string>();
// API nova HuggingFace router: /v1/text-to-image
// FLUX.1-schnell: gratuito, rápido (4 steps), nova API
// SD 3.5 Large: alta qualidade, nova API
// SDXL Turbo: fallback rápido
const HF_MODELS = [
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-3-5-large",
  "stabilityai/sdxl-turbo",
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

export type ImageGenerationDiagnostics = {
  provider: ImageProvider;
  canGenerateRealImages: boolean;
  storageReady: boolean;
  reason: string | null;
  warnings: string[];
};

export function getImageGenerationDiagnostics(providerInput?: string): ImageGenerationDiagnostics {
  const provider = (String(providerInput || process.env.IMAGE_PROVIDER || "mock").toLowerCase() as ImageProvider);
  const normalizedProvider: ImageProvider = provider === "huggingface" || provider === "heygen" ? provider : "mock";
  const hasHuggingFaceKey = !!String(process.env.HUGGINGFACE_API_KEY || "").trim();
  const storageReady = !!(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim()
    && String(process.env.CLOUDINARY_API_KEY || "").trim()
    && String(process.env.CLOUDINARY_API_SECRET || "").trim()
  );
  const warnings: string[] = [];
  let reason: string | null = null;

  if (normalizedProvider === "mock") {
    if (hasHuggingFaceKey) {
      reason = 'HUGGINGFACE_API_KEY detectada, mas IMAGE_PROVIDER não está configurado como "huggingface". Adicione IMAGE_PROVIDER=huggingface no Render.';
    } else {
      reason = 'IMAGE_PROVIDER não configurado. Adicione IMAGE_PROVIDER=huggingface e HUGGINGFACE_API_KEY no Render para ativar geração real.';
    }
  } else if (normalizedProvider === "heygen") {
    reason = "O fluxo HeyGen deste projeto ainda cai em fallback seguro e não produz imagem real.";
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
  if (normalizedProvider === "heygen") {
    warnings.push("Troque IMAGE_PROVIDER para huggingface para geração de imagem real neste projeto.");
  }

  return {
    provider: normalizedProvider,
    storageReady,
    canGenerateRealImages: normalizedProvider === "huggingface" && hasHuggingFaceKey && storageReady,
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
    // Endpoint oficial HeyGen text-to-image: POST /v1/image.generation
    const res = await fetch("https://api.heygen.com/v1/image.generation", {
      method:  "POST",
      headers: {
        "X-Api-Key":    apiKey,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspect,
        model:        "photorealism_v1",  // modelo de imagem realista do HeyGen
      }),
      signal: AbortSignal.timeout(120000),
    });

    const raw = await res.text().catch(() => "{}");
    log.info("image-generation", "HeyGen /v1/image.generation resposta", {
      status: res.status,
      preview: raw.slice(0, 400),
    });

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
      log.warn("image-generation", "HeyGen HTTP erro", { status: res.status, preview: raw.slice(0, 200) });
    }

  } catch (err: any) {
    log.warn("image-generation", "HeyGen exception", { error: err?.message?.slice(0, 120) });
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
  const cacheKey = getCacheKey(creative, segment, objective, provider, format);
  const cached = IMAGE_CACHE.get(cacheKey);
  if (cached) return cached;

  try {
    if (provider === "huggingface" && config.apiKey) {
      const prompt = inferPrompt(creative, segment, objective, format);
      const buffer = await generateWithHuggingFace(prompt, config.apiKey, format);
      if (buffer) {
        const fileName = "creative-" + Date.now() + "-" + format + ".png";
        const uploadedUrl = await uploadImageBufferToCloudinary(buffer, fileName);
        if (uploadedUrl) {
          IMAGE_CACHE.set(cacheKey, uploadedUrl);
          return uploadedUrl;
        }
        // Sem Cloudinary: retornar como base64 data URL
        log.info("image-generation", "HF gerou imagem — usando base64 data URL", { format });
        const b64 = buffer.toString("base64");
        const dataUrl = "data:image/png;base64," + b64;
        IMAGE_CACHE.set(cacheKey, dataUrl);
        return dataUrl;
      }
    }

    if (provider === "heygen") {
      const url = await generateWithHeyGen(creative, objective, format);
      if (url) {
        IMAGE_CACHE.set(cacheKey, url);
        return url;
      }
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
