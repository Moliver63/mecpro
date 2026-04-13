import crypto from "crypto";
import { log } from "./logger";

export type ImageProvider = "huggingface" | "heygen" | "mock";
export type CreativeImageFormat = "feed" | "stories" | "square";

const IMAGE_CACHE = new Map<string, string>();
const HF_MODELS = [
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-xl-base-1.0",
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
  const title = encodeURIComponent(
    `${creative?.headline || creative?.hook || objective || "MECPro Creative"}`.slice(0, 54),
  );
  return `https://placehold.co/${dim.width}x${dim.height}/0f172a/ffffff.png?text=${title}`;
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
    reason = 'IMAGE_PROVIDER está em "mock"; o sistema usa placeholder e não gera imagem real.';
  } else if (normalizedProvider === "heygen") {
    reason = "O fluxo HeyGen deste projeto ainda cai em fallback seguro e não produz imagem real.";
  } else if (!hasHuggingFaceKey) {
    reason = "HUGGINGFACE_API_KEY não configurada.";
  } else if (!storageReady) {
    reason = "Cloudinary não configurado; a imagem até pode ser gerada, mas não há storage público para salvar o arquivo.";
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
        const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "image/png",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              width: dim.width,
              height: dim.height,
              num_inference_steps: 30,
              guidance_scale: 7,
            },
          }),
          signal: AbortSignal.timeout(30000),
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
        log.warn("image-generation", "Imagem gerada mas sem storage configurado; fallback para mock URL", { format, provider });
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
