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

  // Fix pessoa sem cabeça: sempre especificar composição completa
  const compositionFix = format === "stories"
    ? "full body portrait composition, person fully visible head to toe, centered frame, no cropping"
    : "upper body portrait or full scene, face and head always fully visible, no body cropping";

  // Fix texto: instrução máxima — colocada no INÍCIO e FIM do prompt para ter prioridade
  const noTextFix = "NO TEXT NO WORDS NO LETTERS NO TYPOGRAPHY NO WRITING NO SIGNS NO LOGOS. Pure clean photography, text-free image.";
  const noTextPrefix = "text-free photography, no words, no letters, no typography —";

  const parts = [
    noTextPrefix, // NO INÍCIO — maior peso no modelo
    `Professional Brazilian advertising photograph, ${dim.label} format (${dim.ratio} ratio).`,
    `Visual style: ${visualStyle}.`,
    `Mood: ${mood}.`,
    niche    ? `Brazilian market context: ${niche}.` : "",
    hook     ? `Visual concept: ${hook.slice(0, 80)}.` : "",
    headline ? `Scene theme: ${headline.slice(0, 60)}.` : "",
    pain     ? `Relatable situation: ${pain.slice(0, 60)}.` : "",
    solution ? `Visual resolution: ${solution.slice(0, 60)}.` : "",
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

// ── Cloudflare Workers AI ─────────────────────────────────────────────────
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

    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body:   JSON.stringify({
        prompt,
        negative_prompt: "text, words, letters, typography, watermark, logo, sign, label, caption, title, heading, font, writing, inscription, subtitle, caption, overlay text, printed text, handwriting",
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
const tryPollinations = async (prompt: string, format: CreativeImageFormat): Promise<string | null> => {
  try {
    const dim = FORMAT_DIMENSIONS[format];
    const encoded = encodeURIComponent(prompt.slice(0, 500));
    // notext=true: instrui o modelo a não gerar texto na imagem
    // enhance=true: melhora composição e qualidade geral
    // 'flux' com negative prompt forte via prompt engineering
    // notext=true: parâmetro nativo do Pollinations para suprimir texto
    const negativeEncoded = encodeURIComponent("text, words, letters, typography, writing, watermark, logo, sign, label, caption, title, heading, font");
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=${dim.width}&height=${dim.height}&nologo=true&notext=true&enhance=true&model=flux&negative=${negativeEncoded}&seed=${Date.now()}`;

    // Faz download da imagem (necessário — Meta não aceita URLs dinâmicas do Pollinations)
    const getRes = await fetch(url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!getRes?.ok) return null;

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
    if (providerToTry === "huggingface") {
      // Tenta Cloudflare Workers AI primeiro (FLUX gratuito, 10k neurons/dia)
      if (CF_ACCOUNT_ID && CF_API_TOKEN) {
        const cfUrl = await generateWithCloudflare(inferPrompt(creative, segment, objective, format), format);
        if (cfUrl) return cfUrl;
      }
      // HF hf-inference desabilitado — todos os modelos mortos
      return null;
    }

    if (providerToTry === "genspark") {
      return await generateWithGenspark(creative, objective, format);
    }

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
  // Dimensões reais por formato
  const dims = format === "stories"
    ? { w: 1080, h: 1920 }
    : format === "square"
    ? { w: 1080, h: 1080 }
    : { w: 1080, h: 1350 };

  const movie = {
    resolution: "custom",
    width:    dims.w,
    height:   dims.h,
    quality:  "high",
    fps:      25,
    scenes: [
      {
        comment:  "Ad scene",
        duration,
        elements: [
          // Imagem preenche TODO o canvas (cover) com Ken Burns
          {
            type:     "image",
            src:      imageUrl,
            position: "center-center",
            width:    dims.w,
            height:   dims.h,
            zoom:     3,
            pan:      "right",
            duration,
          },
          // Headline — posicionado acima do CTA com espaçamento claro
          ...(headline ? [{
            type:     "text",
            style:    "003",
            text:     headline.slice(0, 60),
            settings: {
              "font-size":   "44px",
              "font-weight": "900",
              "color":       "#ffffff",
              "text-align":  "center",
              "text-shadow": "0px 2px 12px rgba(0,0,0,0.95)",
              "padding":     "0 40px",
            },
            position: "custom",
            x:        0,
            y:        dims.h - 280,   // 280px do fundo → acima do CTA
            width:    dims.w,
            duration,
            start:    0.3,
          }] : []),
          // CTA — fixado no fundo com margem
          ...(cta ? [{
            type:     "text",
            style:    "003",
            text:     cta.toUpperCase(),
            settings: {
              "font-size":        "34px",
              "font-weight":      "800",
              "color":            "#ffffff",
              "background-color": "#1877f2",
              "padding":          "14px 40px",
              "border-radius":    "40px",
              "text-align":       "center",
            },
            position: "custom",
            x:        "50%",
            y:        dims.h - 140,   // 140px do fundo
            x_anchor: "center",
            duration,
            start:    0.8,
          }] : []),
        ],
      },
    ],
  };

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
