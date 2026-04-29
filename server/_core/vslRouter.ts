/**
 * vslRouter.ts
 * Router tRPC para geração de vídeos via VSL Forge Service.
 *
 * SETUP:
 *   1. Adicione ao .env:
 *      VSL_SERVICE_URL=https://seu-vps.com:8000
 *      VSL_SECRET_KEY=mecpro-vsl-secret
 *
 *   2. Adicione ao appRouter em router.ts:
 *      import { vslRouter } from "./vslRouter";
 *      // no appRouter:
 *      vsl: vslRouter,
 */

import { z }          from "zod";
import { TRPCError }  from "@trpc/server";
import { router, protectedProcedure } from "./trpc";
import { log }        from "../logger";
import { gemini }     from "../ai";
import { generateTTS, listElevenLabsVoices, estimateTTSChars, DEFAULT_VOICES } from "../elevenlabs";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const VSL_SERVICE_URL = process.env.VSL_SERVICE_URL || "http://localhost:8000";
const VSL_SECRET_KEY  = process.env.VSL_SECRET_KEY  || "mecpro-vsl-secret";

const VSL_HEADERS = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${VSL_SECRET_KEY}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMATOS DISPONÍVEIS
// ─────────────────────────────────────────────────────────────────────────────

export const VSL_FORMATS = {
  reels_9_16:   { label: "Reels/TikTok (9:16)",   platform: ["meta", "tiktok"],  resolution: "1080×1920" },
  stories_9_16: { label: "Stories (9:16)",          platform: ["meta"],            resolution: "1080×1920" },
  feed_4_5:     { label: "Feed Premium (4:5)",      platform: ["meta"],            resolution: "1080×1350" },
  youtube_16_9: { label: "YouTube (16:9)",           platform: ["google"],          resolution: "1920×1080" },
  feed_1_1:     { label: "Feed Quadrado (1:1)",      platform: ["meta", "google"],  resolution: "1080×1080" },
  academy_16_9: { label: "Aula Academy (16:9)",      platform: ["academy"],         resolution: "1920×1080" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Chama o VSL Service
// ─────────────────────────────────────────────────────────────────────────────

async function callVslService(path: string, method: string, body?: any): Promise<any> {
  const url = `${VSL_SERVICE_URL}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: VSL_HEADERS,
      body:    body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`VSL Service erro ${res.status}: ${err.slice(0, 200)}`);
    }

    return await res.json();
  } catch (e: any) {
    if (e.message?.includes("fetch failed") || e.message?.includes("ECONNREFUSED")) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "VSL Service não está disponível. Verifique se o serviço está rodando.",
      });
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Gera roteiro via Gemini
// ─────────────────────────────────────────────────────────────────────────────

async function generateScriptWithGemini(params: {
  format:      string;
  platform:    string;
  objective:   string;
  niche:       string;
  productName: string;
  targetAudience: string;
  mainBenefit: string;
  cta:         string;
  duration:    number; // segundos totais desejados
  style:       string;
  extraContext?: string;
}): Promise<{ scenes: any[]; title: string }> {

  const formatDescriptions: Record<string, string> = {
    reels_9_16:   "vídeo vertical 9:16 para Instagram Reels e TikTok, dinâmico, máx 60s, hook forte nos primeiros 3s",
    stories_9_16: "Story vertical 9:16, máx 15s por cena, direto ao ponto, CTA claro",
    feed_4_5:     "vídeo feed 4:5, pode ser mais informativo, até 60s",
    youtube_16_9: "vídeo horizontal 16:9 para YouTube Ads, pode ser mais longo e detalhado",
    feed_1_1:     "vídeo quadrado 1:1, versátil para múltiplos feeds",
    academy_16_9: "aula educacional 16:9, didática, clara, com exemplos práticos",
  };

  const sceneCount = Math.max(3, Math.min(10, Math.round(params.duration / 15)));

  const prompt = `Você é um especialista em criação de VSL (Video Sales Letter) e conteúdo para anúncios digitais.

TAREFA: Crie um roteiro completo de vídeo para ${formatDescriptions[params.format] || "vídeo de marketing"}.

INFORMAÇÕES DO PRODUTO/SERVIÇO:
- Produto: ${params.productName}
- Nicho: ${params.niche}
- Plataforma: ${params.platform}
- Objetivo: ${params.objective}
- Público-alvo: ${params.targetAudience}
- Principal benefício: ${params.mainBenefit}
- CTA: ${params.cta}
- Duração total: ~${params.duration}s
- Estilo: ${params.style}
${params.extraContext ? `- Contexto extra: ${params.extraContext}` : ""}

REQUISITOS:
- Crie exatamente ${sceneCount} cenas
- Cada cena deve ter narração de 10-20 segundos
- Use storytelling emocional e gatilhos de persuasão (dor, solução, prova social, urgência)
- Prompts de imagem detalhados, realistas, cinematográficos, em inglês
- Adapte para o formato: ${formatDescriptions[params.format]}
- Para formatos verticais (9:16, 4:5): usar "portrait orientation, vertical composition" nos prompts

ESTRUTURA OBRIGATÓRIA:
1. Hook — Captura atenção imediata (dor ou curiosidade)
2. Dor — Aprofunda o problema
3. Solução — Apresenta o produto
4. Prova — Depoimento ou resultado
5. CTA — Chamada para ação clara
(adicione cenas de transição conforme necessário para ${sceneCount} cenas)

Responda SOMENTE em JSON válido sem markdown:
{
  "title": "título do vídeo",
  "scenes": [
    {
      "id": "hook",
      "narration": "texto da narração em português brasileiro",
      "prompt": "detailed cinematic image prompt in english, photorealistic, 8k",
      "negative_prompt": "cartoon, text, watermark, blurry, low quality",
      "motion": "push_in",
      "xfade": "dissolve",
      "xfade_duration": 0.8,
      "cinematic_bars": false,
      "grain": 0.06,
      "color_grade": "warm_film",
      "audio_fade_in": 0.05,
      "audio_fade_out": 0.3
    }
  ]
}

Motions disponíveis: push_in, pull_out, slow_zoom_in, drift, pan_right, pan_left, breathe, tilt_up, static
Color grades: warm_film, teal_orange, moody_teal, clean`;

  const raw    = await gemini(prompt, { temperature: 0.7 });
  const clean  = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error("Gemini retornou formato inválido — sem scenes");
  }

  return { title: parsed.title || params.productName, scenes: parsed.scenes };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export const vslRouter = router({

  // ── Health check do VSL Service ──────────────────────────────────────────
  serviceHealth: protectedProcedure
    .query(async () => {
      try {
        const data = await callVslService("/health", "GET");
        return { available: true, ...data };
      } catch {
        return { available: false, ffmpeg: false, huggingface: false, elevenlabs: false };
      }
    }),

  // ── Listar formatos disponíveis ───────────────────────────────────────────
  listFormats: protectedProcedure
    .query(async () => {
      return { formats: VSL_FORMATS };
    }),

  // ── Gerar roteiro com Gemini ─────────────────────────────────────────────
  generateScript: protectedProcedure
    .input(z.object({
      format:         z.string().default("reels_9_16"),
      platform:       z.string().default("meta"),
      objective:      z.string().default("leads"),
      niche:          z.string().default("geral"),
      productName:    z.string(),
      targetAudience: z.string(),
      mainBenefit:    z.string(),
      cta:            z.string().default("Clique agora"),
      duration:       z.number().default(60),
      style:          z.string().default("emocional e persuasivo"),
      extraContext:   z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      log.info("vsl", "generateScript iniciado", { format: input.format, product: input.productName });

      const result = await generateScriptWithGemini(input as any);

      log.info("vsl", "generateScript OK", { scenes: result.scenes.length, title: result.title });

      return {
        title:  result.title,
        scenes: result.scenes,
        format: input.format,
        estimated_duration: result.scenes.reduce((acc: number, s: any) => {
          const words = (s.narration || "").split(/\s+/).length;
          return acc + Math.max(8, words / 2.5);
        }, 0),
      };
    }),

  // ── Iniciar geração de vídeo ─────────────────────────────────────────────
  startGeneration: protectedProcedure
    .input(z.object({
      // Identificação
      campaignId:    z.number().optional(),
      projectName:   z.string().default("mecpro_video"),

      // Formato e conteúdo
      format:        z.string().default("reels_9_16"),
      title:         z.string(),
      scenes:        z.array(z.object({
        id:              z.string(),
        narration:       z.string(),
        prompt:          z.string().default(""),
        negative_prompt: z.string().optional(),
        motion:          z.string().default("push_in"),
        xfade:           z.string().default("dissolve"),
        xfade_duration:  z.number().default(0.8),
        cinematic_bars:  z.boolean().default(false),
        grain:           z.number().default(0.06),
        color_grade:     z.string().default("warm_film"),
        audio_fade_in:   z.number().default(0.05),
        audio_fade_out:  z.number().default(0.3),
      })),

      // Config de áudio
      voice:         z.string().default("hpp4J3VqNfWAUOO0d1Us"),
      addSubtitles:  z.boolean().default(true),
      colorGrade:    z.string().default("warm_film"),

      // Modo
      draft:         z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      log.info("vsl", "startGeneration iniciado", {
        format: input.format,
        scenes: input.scenes.length,
        userId: ctx.user.id,
      });

      const jobId = `mecpro_${ctx.user.id}_${Date.now()}`;

      const payload = {
        job_id:        jobId,
        campaign_id:   input.campaignId,
        user_id:       ctx.user.id,
        project_name:  input.projectName,
        format:        input.format,
        title:         input.title,
        scenes:        input.scenes,
        voice:         input.voice,
        tts_engine:    "elevenlabs",
        add_subtitles: input.addSubtitles,
        color_grade:   input.colorGrade,
        vignette:      true,
        draft:         input.draft,
      };

      const result = await callVslService("/generate", "POST", payload);

      log.info("vsl", "startGeneration OK", { jobId, format: input.format });

      return {
        jobId:          result.job_id,
        status:         result.status,
        format:         result.format,
        formatLabel:    result.format_label,
        estimatedMin:   result.estimated_min,
        message:        result.message,
      };
    }),

  // ── Consultar status do job ───────────────────────────────────────────────
  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const data = await callVslService(`/status/${input.jobId}`, "GET");
      return {
        jobId:      data.job_id,
        status:     data.status,        // queued | processing | done | error
        progress:   data.progress,      // 0–100
        message:    data.message,
        videoUrl:   data.video_url      // URL relativa para download
          ? `${VSL_SERVICE_URL}${data.video_url}`
          : null,
        durationS:  data.duration_s,
        sizeMb:     data.size_mb,
        format:     data.format,
        error:      data.error,
        finishedAt: data.finished_at,
      };
    }),

  // ── Gerar múltiplos formatos de uma vez ────────────────────────────────────
  generateMultiFormat: protectedProcedure
    .input(z.object({
      campaignId:  z.number().optional(),
      projectName: z.string().default("mecpro_video"),
      title:       z.string(),
      scenes:      z.array(z.any()),
      formats:     z.array(z.string()),  // ["reels_9_16", "youtube_16_9", ...]
      voice:       z.string().default("hpp4J3VqNfWAUOO0d1Us"),
      draft:       z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const jobs: any[] = [];

      for (const format of input.formats) {
        const jobId  = `mecpro_${ctx.user.id}_${format}_${Date.now()}`;
        const payload = {
          job_id:       jobId,
          campaign_id:  input.campaignId,
          user_id:      ctx.user.id,
          project_name: `${input.projectName}_${format}`,
          format,
          title:        input.title,
          scenes:       input.scenes,
          voice:        input.voice,
          draft:        input.draft,
        };

        try {
          const result = await callVslService("/generate", "POST", payload);
          jobs.push({ format, jobId: result.job_id, status: "queued" });
        } catch (e: any) {
          jobs.push({ format, jobId: null, status: "error", error: e.message });
        }
      }

      return { jobs, total: jobs.length };
    }),

  // ── Listar vozes ElevenLabs ──────────────────────────────────────────────
  listVoices: protectedProcedure
    .query(async () => {
      const key = (process.env.ELEVENLABS_API_KEY || "").trim();
      if (!key) return { voices: DEFAULT_VOICES, configured: false };
      const voices = await listElevenLabsVoices();
      return { voices, configured: true };
    }),

  // ── Gerar narração TTS para uma cena ─────────────────────────────────────
  generateSceneTTS: protectedProcedure
    .input(z.object({
      text:            z.string().min(1).max(3000),
      voiceId:         z.string().default("hpp4J3VqNfWAUOO0d1Us"),
      stability:       z.number().min(0).max(1).default(0.5),
      similarityBoost: z.number().min(0).max(1).default(0.75),
      style:           z.number().min(0).max(1).default(0.3),
      modelId:         z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const key = (process.env.ELEVENLABS_API_KEY || "").trim();
      if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "ELEVENLABS_API_KEY nao configurada." });
      const buffer = await generateTTS(input.text, {
        voiceId:         input.voiceId,
        stability:       input.stability,
        similarityBoost: input.similarityBoost,
        style:           input.style,
        modelId:         input.modelId,
      });
      if (!buffer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar narracao. Verifique a key do ElevenLabs." });
      const base64 = buffer.toString("base64");
      log.info("vsl", "TTS gerado OK", { chars: input.text.length, bytes: buffer.length });
      return {
        audioBase64: base64,
        mimeType:    "audio/mpeg",
        bytes:       buffer.length,
        durationEstimated: Math.round(input.text.split(" ").length / 2.5),
      };
    }),

  // ── Estimar custo TTS ────────────────────────────────────────────────────
  estimateTTS: protectedProcedure
    .input(z.object({
      scenes: z.array(z.object({ narration: z.string() })),
    }))
    .query(({ input }) => {
      const totalChars = estimateTTSChars(input.scenes as any);
      const configured = !!(process.env.ELEVENLABS_API_KEY || "").trim();
      return { totalChars, configured, estimatedSeconds: Math.round(totalChars / 15) };
    }),

  // ── Deletar job ───────────────────────────────────────────────────────────
  deleteJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      await callVslService(`/job/${input.jobId}`, "DELETE");
      return { deleted: true };
    }),
});
