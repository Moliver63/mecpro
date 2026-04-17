/**
 * elevenlabs.ts — Integração ElevenLabs TTS para MECPro AI
 * Gera narração de alta qualidade para roteiros VSL
 */

import { log } from "./_core/logger";

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";
const ELEVEN_KEY  = () => (process.env.ELEVENLABS_API_KEY || "").trim();

// Vozes padrão otimizadas para marketing em PT-BR
export const DEFAULT_VOICES = [
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Alex (masculino, confiante)",    lang: "pt" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (feminina, profissional)", lang: "en" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (feminina, energética)",     lang: "en" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (masculino, suave)",       lang: "en" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (feminina, amigável)",       lang: "en" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (masculino, profundo)",      lang: "en" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (masculino, forte)",       lang: "en" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (masculino, narrador)",      lang: "en" },
];

interface TTSOptions {
  voiceId?:          string;
  stability?:        number;   // 0-1, default 0.5
  similarityBoost?:  number;   // 0-1, default 0.75
  style?:            number;   // 0-1, default 0.3
  speakingRate?:     number;   // 0.5-2.0, default 1.0
  modelId?:          string;
}

/**
 * Gera narração MP3 via ElevenLabs
 * Retorna Buffer do áudio ou null em caso de erro
 */
export async function generateTTS(
  text: string,
  opts: TTSOptions = {},
): Promise<Buffer | null> {
  const key = ELEVEN_KEY();
  if (!key) {
    log.warn("elevenlabs", "ELEVENLABS_API_KEY não configurada");
    return null;
  }

  const voiceId       = opts.voiceId        || "hpp4J3VqNfWAUOO0d1Us";
  const modelId       = opts.modelId        || "eleven_multilingual_v2";
  const stability     = opts.stability      ?? 0.5;
  const similarity    = opts.similarityBoost ?? 0.75;
  const style         = opts.style          ?? 0.3;

  try {
    log.info("elevenlabs", "Gerando TTS", {
      chars:   text.length,
      voiceId: voiceId.slice(0, 10),
      model:   modelId,
    });

    const res = await fetch(
      ELEVEN_BASE + "/text-to-speech/" + voiceId + "/stream",
      {
        method: "POST",
        headers: {
          "xi-api-key":   key,
          "Content-Type": "application/json",
          Accept:         "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarity,
            style,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log.warn("elevenlabs", "TTS erro", { status: res.status, err: err.slice(0, 200) });
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    log.info("elevenlabs", "TTS OK", { bytes: buffer.length, voiceId });
    return buffer;

  } catch (err: any) {
    log.warn("elevenlabs", "TTS exception", { error: err?.message?.slice(0, 100) });
    return null;
  }
}

/**
 * Lista vozes disponíveis na conta ElevenLabs
 */
export async function listElevenLabsVoices(): Promise<any[]> {
  const key = ELEVEN_KEY();
  if (!key) return DEFAULT_VOICES;

  try {
    const res = await fetch(ELEVEN_BASE + "/voices", {
      headers: { "xi-api-key": key },
      signal:  AbortSignal.timeout(10_000),
    });

    if (!res.ok) return DEFAULT_VOICES;

    const data = await res.json() as any;
    const voices = (data?.voices || []).map((v: any) => ({
      id:       v.voice_id,
      name:     v.name,
      lang:     v.labels?.language || "en",
      category: v.category || "premade",
      preview:  v.preview_url || null,
    }));

    return voices.length > 0 ? voices : DEFAULT_VOICES;
  } catch {
    return DEFAULT_VOICES;
  }
}

/**
 * Estima custo em caracteres (ElevenLabs cobra por char)
 */
export function estimateTTSChars(scenes: { narration: string }[]): number {
  return scenes.reduce((acc, s) => acc + (s.narration?.length || 0), 0);
}
