/**
 * bootMidia.ts — uma linha no boot dizendo se o servidor consegue cortar/adaptar video e quem analisa imagens.
 *
 * Por que: o log de boot nao dizia nada sobre ffmpeg nem sobre os provedores de visao. Saber se "sugira cortes"
 * funciona em producao exigia mandar um video no chat. Aqui: qual binario foi achado (variavel, sistema ou
 * pacote estatico), a versao, a ordem da cadeia de visao e quem transcreve audio. Nunca imprime chave.
 */
import { spawnSync } from "node:child_process";
import { resolverBinario } from "./chatMedia";
import { configsDeVisao } from "./chatVision";

export interface EstadoDoBinario { origem: "variavel" | "sistema" | "pacote" | "ausente"; versao: string | null }

export function estadoDoBinario(cmd: "ffmpeg" | "ffprobe", env: NodeJS.ProcessEnv = process.env, resolver = resolverBinario): EstadoDoBinario {
  const caminho = resolver(cmd, env);
  const r = spawnSync(caminho, ["-version"], { encoding: "utf8", timeout: 5000 });
  if (r.status !== 0) return { origem: "ausente", versao: null };
  const versao = String(r.stdout || "").match(/version\s+(\S+)/)?.[1]?.slice(0, 40) ?? null;
  const doEnv = (cmd === "ffmpeg" ? env.FFMPEG_PATH : env.FFPROBE_PATH)?.trim();
  const origem = doEnv ? "variavel" : caminho === cmd ? "sistema" : "pacote";
  return { origem, versao };
}

/** Linhas prontas para o boot. Sem chaves: so nomes, origem e se duas variaveis do Google apontam para a mesma chave. */
export function linhasDeMidiaParaBoot(env: NodeJS.ProcessEnv = process.env, estado = estadoDoBinario): string[] {
  const fmt = (n: string, e: EstadoDoBinario) => e.origem === "ausente" ? `${n} ❌ ausente` : `${n} ✅ ${e.versao ?? "?"} (${e.origem})`;
  const ff = estado("ffmpeg", env), fp = estado("ffprobe", env);
  const cortes = ff.origem !== "ausente" && fp.origem !== "ausente";
  const visao = configsDeVisao(env).map((c) => c.nome);
  const g = (env.GOOGLE_API_KEY || "").trim(), m = (env.GEMINI_API_KEY || "").trim();
  const linhas = [
    `[BOOT] Video (cortes/adaptacao): ${fmt("ffmpeg", ff)} · ${fmt("ffprobe", fp)}${cortes ? "" : " — sugerir/adaptar video NAO vai funcionar"}`,
    `[BOOT] Visao (fotos e quadros), em ordem: ${visao.length ? visao.join(" → ") : "❌ nenhum provedor com chave"}`,
    `[BOOT] Transcricao de audio: ${(env.GROQ_API_KEY || "").trim() ? "Groq Whisper ✅" : "— sem GROQ_API_KEY (video segue sem transcricao)"}`,
  ];
  if (g && m) linhas.push(`[BOOT] GOOGLE_API_KEY e GEMINI_API_KEY definidas: ${g === m ? "mesma chave ✅" : "chaves DIFERENTES ⚠️ (o SDK do Google usa GOOGLE_API_KEY; o chat/visao usa GEMINI_API_KEY)"}`);
  return linhas;
}
