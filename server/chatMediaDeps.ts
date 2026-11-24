/**
 * chatMediaDeps.ts — dependencias reais das ferramentas de midia do chat.
 * (Os testes injetam as proprias; aqui so ha ligacao com Cloudinary, banco, Groq e visao.)
 */
import { baixarVideoDoCloudinary, registrarVideoDoChat, urlDeVideoDoChatValida, videoDoChatDoUsuario } from "./chatCreativeVideo";
import type { DepsMidia, DescricaoDeImagem, ImagemParaAnalise } from "./chatMediaTools";
import type { AvaliacaoDeCena } from "./chatVision";
import { limitesDeMidia } from "./chatMedia";

const LIMITE_FOTO_DOWNLOAD = 12 * 1024 * 1024;

/** Foto so do NOSSO Cloudinary (mesma regra de isTrustedPhotoUrl em chat.ts). */
export function urlDeFotoDoNossoCloudinary(url: unknown, cloudName = process.env.CLOUDINARY_CLOUD_NAME): boolean {
  if (typeof url !== "string" || !cloudName || url.length > 600) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && !u.username && !u.password && !u.port && u.pathname.startsWith(`/${cloudName}/`) && !u.pathname.includes("..");
  } catch { return false; }
}

async function baixarFotoDoCloudinary(url: string): Promise<Buffer | null> {
  if (!urlDeFotoDoNossoCloudinary(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!res.ok) return null;
    const declarado = Number(res.headers.get("content-length") || 0);
    if (declarado > LIMITE_FOTO_DOWNLOAD) return null;
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > 0 && b.length <= LIMITE_FOTO_DOWNLOAD ? b : null;
  } catch { return null; }
}

/** Transcricao pelo Groq (whisper), o mesmo provedor ja usado no chat. Sem GROQ_API_KEY: "indisponivel". */
export async function transcreverComGroq(audioMp3: Buffer, env: NodeJS.ProcessEnv = process.env, doFetch: typeof fetch = fetch): Promise<{ texto: string } | "indisponivel" | "falhou"> {
  const chave = env.GROQ_API_KEY?.trim();
  if (!chave) return "indisponivel";
  if (audioMp3.length > 24 * 1024 * 1024) return "falhou";
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioMp3)], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", env.GROQ_TRANSCRIPTION_MODEL?.trim() || "whisper-large-v3-turbo");
    form.append("response_format", "json");
    form.append("temperature", "0");
    const res = await doFetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(60000) });
    if (!res.ok) return "falhou";
    const data: any = await res.json().catch(() => null);
    return typeof data?.text === "string" ? { texto: data.text } : "falhou";
  } catch { return "falhou"; }
}

export function depsMidiaPadrao(
  db: any,
  extras: {
    descreverImagens: (imagens: ImagemParaAnalise[], foco: string) => Promise<DescricaoDeImagem[] | null>;
    subirVideo: (buffer: Buffer, nome: string) => Promise<string | null>;
    avaliarCenas?: (imagens: ImagemParaAnalise[], foco: string) => Promise<{ avaliacoes: AvaliacaoDeCena[]; provedor: string } | null>;
  },
): DepsMidia & { videoDoUsuario(userId: number, url: string): Promise<boolean>; avaliarCenas?: (imagens: ImagemParaAnalise[], foco: string) => Promise<{ avaliacoes: AvaliacaoDeCena[]; provedor: string } | null> } {
  return {
    sessaoDoUsuario: async (userId, sessionId) => {
      const s = await db.getChatSessionById(sessionId).catch(() => null);
      return !!s && (s as any).userId === userId;
    },
    fotosDaSessao: async (sessionId) => (await db.getPendingChatPhotos(sessionId).catch(() => [])) as any,
    videosDaSessao: async (sessionId) => (await db.getPendingChatVideos(sessionId).catch(() => [])) as any,
    baixarFoto: baixarFotoDoCloudinary,
    baixarVideo: baixarVideoDoCloudinary,
    descreverImagens: extras.descreverImagens,
    avaliarCenas: extras.avaliarCenas,
    transcrever: (audio) => transcreverComGroq(audio),
    subirVideo: extras.subirVideo,
    registrarVideo: registrarVideoDoChat,
    persistirVideo: async (sessionId, v) => (await db.addPendingChatVideo(sessionId, v).catch(() => ({ salvo: false }))).salvo,
    videoDoUsuario: async (userId, url) =>
      urlDeVideoDoChatValida(url) && (videoDoChatDoUsuario(userId, url) || (await db.userOwnsPendingChatVideo(userId, url).catch(() => false))),
    limites: limitesDeMidia(),
  };
}
