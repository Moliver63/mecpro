import crypto from "crypto";
import { log } from "./logger";

export type ImageProvider = "huggingface" | "heygen" | "mock";
export type CreativeImageFormat = "feed" | "stories" | "square";

const IMAGE_CACHE = new Map<string, string>();
// API nova do HuggingFace: /v1/models/{model}/generate-image
// Modelos disponíveis via API serverless gratuita
const HF_MODELS = [
  "black-forest-labs/FLUX.1-dev",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "stabilityai/stable-diffusion-2-1",
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
  const dim = FORMAT_DIMENSIONS[format];
  const headline = toText(creative?.headline);
  const hook = toText(creative?.hook);
  const copy = toText(creative?.copy);
  const pain = toText(creative?.pain);
  const solution = toText(creative?.solution);
  const visualType = toText(creative?.type || creative?.format || "performance ad");

  return [
    `Create a premium Brazilian ad creative for ${dim.label} in ${dim.ratio} ratio.`,
    `Objective: ${objective || "performance marketing"}.`,
    `Audience segment: ${segment || "broad audience"}.`,
    `Creative angle: ${visualType || "direct response"}.`,
    hook ? `Main hook: ${hook}.` : "",
    headline ? `Headline reference: ${headline}.` : "",
    copy ? `Support copy context: ${copy}.` : "",
    pain ? `Audience pain point: ${pain}.` : "",
    solution ? `Promised solution: ${solution}.` : "",
    "Use high-contrast composition, strong focal point, polished lighting, clean typography area, no watermarks, no UI chrome.",
    "Keep the scene realistic, conversion-oriented, brand-safe, and suitable for Meta Ads.",
  ].filter(Boolean).join(" ");
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
        // Tentar nova API primeiro, depois legada
        const newApiUrl = "https://router.huggingface.co/hf-inference/models/" + model + "/v1/text-to-image";
        const legacyUrl = "https://api-inference.huggingface.co/models/" + model;
        const apiUrl = model.includes("FLUX") ? newApiUrl : legacyUrl;

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            Accept: "image/png",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width:  Math.min(dim.width,  1024),
              height: Math.min(dim.height, 1024),
              num_inference_steps: 4,  // FLUX.1-dev funciona com 4 steps
              guidance_scale: 3.5,
            },
          }),
          signal: AbortSignal.timeout(60000),
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
  log.warn("image-generation", "HeyGen não possui fluxo estável de imagem neste projeto; usando mock seguro", {
    objective,
    format,
    creativeType: creative?.type || null,
  });
  return buildMockUrl(creative, objective, format);
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
        const fileName = `creative-${Date.now()}-${format}.png`;
        const uploadedUrl = await uploadImageBufferToCloudinary(buffer, fileName);
        if (uploadedUrl) {
          IMAGE_CACHE.set(cacheKey, uploadedUrl);
          return uploadedUrl;
        }
        // Sem Cloudinary: retornar como data URL base64 diretamente
      log.info("image-generation", "HF gerou imagem — sem Cloudinary, usando base64 data URL", { format });
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
