/**
 * Benchmark dos provedores de IA do chat multimodal (visao, audio, video, sugestao de cortes), com credenciais REAIS.
 *
 * Rode na SUA maquina ou no Render (shell), onde as chaves e a rede existem:
 *   GEMINI_API_KEY=... NVIDIA_API_KEY=... OPENROUTER_API_KEY=... GROQ_API_KEY=... \
 *     node --import tsx scripts/benchmark-provedores-ia.mts [--video arq.mp4] [--audio fala.mp3] [--texto "texto falado no audio"] [--fotos pasta] [--rodadas 3]
 *
 * Sem --video/--fotos/--audio usa material sintetico (so valida funcionamento, NAO qualidade: para qualidade use material seu).
 * `--simulado` roda tudo contra respostas falsas (so para testar o proprio script; o relatorio sai marcado SIMULADO).
 *
 * Nada e publicado, nenhuma chave e impressa nem gravada; o relatorio vai para docs/benchmarks/.
 * Custos: calculados a partir dos tokens que cada provedor devolve x TABELA DE PRECOS abaixo (confira antes de decidir).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chamarVisaoOpenAI, configsDeVisao, instrucaoDeVisao, interpretarAvaliacoes, type ConfigDeVisao, type FetchLike } from "../server/chatVision";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const SIMULADO = args.includes("--simulado");
const RODADAS = Math.max(1, Number(opt("rodadas")) || 3);
const hoje = new Date().toISOString().slice(0, 10);

/** USD por 1M tokens. Gemini: ai.google.dev/pricing consultado em 2026-11-23 (pago, Standard). Os demais: preencha/confirme; n/d = nao calculado. */
const PRECOS: Record<string, { entrada: number; saida: number; fonte: string } | null> = {
  "gemini-flash-latest": null, // alias: confira para qual modelo aponta antes de calcular
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5, fonte: "ai.google.dev/pricing 2026-11-23" },
  "gemini-2.5-flash-lite": { entrada: 0.1, saida: 0.4, fonte: "ai.google.dev/pricing 2026-11-23" },
  "gemini-3.1-flash-lite": { entrada: 0.25, saida: 1.5, fonte: "ai.google.dev/pricing 2026-11-23" },
  "nvidia/nemotron-nano-12b-v2-vl:free": { entrada: 0, saida: 0, fonte: "openrouter.ai :free (uso de teste; nao usar em producao/dados sensiveis)" },
};

const dir = mkdtempSync(path.join(os.tmpdir(), "bench-ia-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const ff = (...a: string[]) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a]); if (r.status !== 0) throw new Error("ffmpeg: " + r.stderr.toString().slice(0, 200)); };

// ── Material de teste ────────────────────────────────────────────────────────
function materiais() {
  let video = opt("video");
  if (!video) { video = path.join(dir, "sintetico.mp4"); ff("-f", "lavfi", "-t", "8", "-i", "testsrc2=size=1280x720:rate=25", "-f", "lavfi", "-t", "8", "-i", "mandelbrot=size=1280x720:rate=25", "-f", "lavfi", "-i", "sine=frequency=330:duration=16", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", video); }
  const frames: Buffer[] = [];
  const pasta = opt("fotos");
  if (pasta && existsSync(pasta)) {
    for (const f of readdirSync(pasta).filter((x) => /\.(jpe?g)$/i.test(x)).slice(0, 6)) frames.push(readFileSync(path.join(pasta, f)));
  }
  if (!frames.length) {
    for (let i = 0; i < 6; i++) {
      const o = path.join(dir, `q${i}.jpg`);
      ff("-ss", String(i * 2.5), "-i", video, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", o);
      frames.push(readFileSync(o));
    }
  }
  let audio = opt("audio");
  if (!audio) { audio = path.join(dir, "audio.mp3"); ff("-i", video, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio); }
  return { video, frames, audio };
}

// ── Chamadas ─────────────────────────────────────────────────────────────────
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

const fetchSimulado: FetchLike = async (url, init) => {
  await new Promise((r) => setTimeout(r, 30 + Math.random() * 60));
  const corpo = JSON.parse(init?.body ?? "{}");
  const n = (corpo.messages?.[0]?.content ?? corpo.contents?.[0]?.parts ?? []).filter((c: any) => c.type === "image_url" || c.inlineData).length;
  const itens = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, descricao: "simulado", elementos: [], textoVisivel: "", qualidade: 5 + (i % 4), problemas: [], gancho: 4 + (i % 5), focoX: 0.5 }));
  const texto = JSON.stringify(itens);
  if (String(url).includes("generativelanguage")) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 200 } }), { status: 200 });
  if (String(url).includes("transcriptions")) return new Response(JSON.stringify({ text: "texto simulado" }), { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: texto } }], usage: { prompt_tokens: 900, completion_tokens: 200 } }), { status: 200 });
};
const doFetch: FetchLike = SIMULADO ? fetchSimulado : fetch;

async function geminiVisao(cfg: ConfigDeVisao, imagens: Array<{ id: string; jpeg: Buffer }>, instrucao: string) {
  const parts: any[] = [{ text: instrucao }];
  for (const i of imagens) { parts.push({ text: `Imagem id=${i.id}:` }, { inlineData: { mimeType: "image/jpeg", data: i.jpeg.toString("base64") } }); }
  const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": cfg.chave, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d: any = await res.json();
  return { texto: String(d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? ""), tokens: d?.usageMetadata ? { entrada: d.usageMetadata.promptTokenCount ?? 0, saida: d.usageMetadata.candidatesTokenCount ?? 0 } : undefined };
}

interface LinhaVisao { provedor: string; modelo: string; ok: number; falhas: number; jsonValido: number; p50: number; p95: number; tokensEntrada: number; tokensSaida: number; custoPorChamadaUSD: number | null; melhorCena: string | null; erros: string[]; notas: Array<number | null> }

async function benchVisao(cfg: ConfigDeVisao, frames: Buffer[]): Promise<LinhaVisao> {
  const imagens = frames.map((jpeg, i) => ({ id: `c${i}`, jpeg }));
  const instrucao = instrucaoDeVisao("anuncio no Meta Ads", true);
  const tempos: number[] = []; const erros: string[] = [];
  let ok = 0, falhas = 0, jsonValido = 0, te = 0, ts = 0; let ultimo: ReturnType<typeof interpretarAvaliacoes> = [];
  for (let r = 0; r < RODADAS; r++) {
    const t0 = Date.now();
    try {
      const out = cfg.tipo === "gemini" ? await geminiVisao(cfg, imagens, instrucao) : await chamarVisaoOpenAI(cfg, imagens, instrucao, doFetch, 60000);
      tempos.push(Date.now() - t0);
      const l = interpretarAvaliacoes(out.texto, imagens);
      if (l.length) { jsonValido++; ultimo = l; }
      ok++; te += out.tokens?.entrada ?? 0; ts += out.tokens?.saida ?? 0;
    } catch (e) { falhas++; erros.push(String((e as Error).message).replace(cfg.chave, "***").slice(0, 120)); }
  }
  const preco = PRECOS[cfg.modelo] ?? null;
  const custo = preco && ok ? (((te / ok) * preco.entrada) + ((ts / ok) * preco.saida)) / 1e6 : null;
  const notas = imagens.map((i) => { const a = ultimo.find((x) => x.id === i.id); return a ? (a.qualidade != null && a.gancho != null ? a.qualidade * 0.6 + a.gancho * 0.4 : a.qualidade) : null; });
  const best = notas.reduce<number | null>((b, n, i) => (n != null && (b == null || n > (notas[b] ?? -1)) ? i : b), null);
  return { provedor: cfg.nome, modelo: cfg.modelo, ok, falhas, jsonValido, p50: pct(tempos, 50), p95: pct(tempos, 95), tokensEntrada: ok ? Math.round(te / ok) : 0, tokensSaida: ok ? Math.round(ts / ok) : 0, custoPorChamadaUSD: custo, melhorCena: best != null ? `c${best}` : null, erros: [...new Set(erros)], notas };
}

async function benchAudio(audio: string, esperado?: string) {
  const buf = readFileSync(audio);
  const linhas: Array<{ provedor: string; modelo: string; ok: boolean; ms: number; texto: string; acerto: number | null; erro?: string; custoUSD: number | null }> = [];
  const horas = (spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]).stdout.toString() || "0");
  const duracaoS = Number(horas) || 0;
  const acerto = (t: string) => { if (!esperado) return null; const a = new Set(esperado.toLowerCase().match(/\p{L}+/gu) ?? []); const b = new Set(t.toLowerCase().match(/\p{L}+/gu) ?? []); let i = 0; for (const w of a) if (b.has(w)) i++; return a.size ? Math.round((i / a.size) * 100) : null; };
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq || SIMULADO) {
    const t0 = Date.now();
    try {
      const form = new FormData(); form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), "audio.mp3"); form.append("model", "whisper-large-v3-turbo"); form.append("response_format", "json"); form.append("temperature", "0");
      const res = await doFetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groq ?? "x"}` }, body: form, signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d: any = await res.json();
      linhas.push({ provedor: "Groq Whisper", modelo: "whisper-large-v3-turbo", ok: true, ms: Date.now() - t0, texto: String(d.text ?? "").slice(0, 200), acerto: acerto(String(d.text ?? "")), custoUSD: (duracaoS / 3600) * 0.04 });
    } catch (e) { linhas.push({ provedor: "Groq Whisper", modelo: "whisper-large-v3-turbo", ok: false, ms: Date.now() - t0, texto: "", acerto: null, erro: String((e as Error).message).slice(0, 100), custoUSD: null }); }
  }
  const gk = (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1 || "").trim();
  if (gk || SIMULADO) {
    const modelo = process.env.GEMINI_VISION_MODEL?.trim() || "gemini-flash-latest";
    const t0 = Date.now();
    try {
      const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": gk || "x", "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Transcreva fielmente a fala deste audio em portugues. Responda so com o texto falado." }, { inlineData: { mimeType: "audio/mp3", data: buf.toString("base64") } }] }] }), signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d: any = await res.json();
      const texto = String(d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "");
      linhas.push({ provedor: "Gemini (audio nativo)", modelo, ok: true, ms: Date.now() - t0, texto: texto.slice(0, 200), acerto: acerto(texto), custoUSD: PRECOS[modelo] ? (duracaoS * 25 * 1.0) / 1e6 : null });
    } catch (e) { linhas.push({ provedor: "Gemini (audio nativo)", modelo, ok: false, ms: Date.now() - t0, texto: "", acerto: null, erro: String((e as Error).message).slice(0, 100), custoUSD: null }); }
  }
  return { linhas, duracaoS };
}

// ── Relatorio ────────────────────────────────────────────────────────────────
const f = (n: number | null | undefined, d = 0) => (n == null || Number.isNaN(n) ? "n/d" : n.toFixed(d));
const usd = (n: number | null) => (n == null ? "n/d" : n === 0 ? "gratis" : `US$ ${n.toFixed(5)}`);

const m = materiais();
const configs = configsDeVisao();
if (SIMULADO && !configs.length) { /* sem chaves no modo simulado */ }
const cfgs = SIMULADO && !configs.length ? configsDeVisao({ GEMINI_API_KEY: "sim", NVIDIA_API_KEY: "sim", OPENROUTER_API_KEY: "sim", GROQ_API_KEY: "sim" } as any) : configs;
console.log(`Provedores de visao com chave: ${cfgs.map((c) => c.nome).join(", ") || "(nenhum)"}${SIMULADO ? " [SIMULADO]" : ""}`);
const visao: LinhaVisao[] = [];
for (const c of cfgs) { console.log(`- visao ${c.nome} ...`); visao.push(await benchVisao(c, m.frames)); }
const audio = await benchAudio(m.audio, opt("texto"));

const concordancia = visao.filter((v) => v.melhorCena).map((v) => `${v.provedor}: ${v.melhorCena}`).join("; ");
const md = [
  `# Benchmark dos provedores de IA do chat multimodal${SIMULADO ? " (SIMULADO: respostas falsas, so valida o script)" : ""}`,
  ``, `Data: ${hoje}. Rodadas por provedor: ${RODADAS}. Material: ${opt("video") || opt("fotos") ? "do usuario" : "sintetico (nao mede qualidade real)"}; ${m.frames.length} quadros por chamada.`, ``,
  `## Visao (fotos e quadros de video) e notas por cena`, ``,
  `| Provedor | Modelo | Sucesso | JSON valido | Latencia p50 / p95 (ms) | Tokens ent/saida | Custo por chamada | Melhor cena |`, `|---|---|---|---|---|---|---|---|`,
  ...visao.map((v) => `| ${v.provedor} | ${v.modelo} | ${v.ok}/${v.ok + v.falhas} | ${v.jsonValido}/${v.ok + v.falhas} | ${f(v.p50)} / ${f(v.p95)} | ${v.tokensEntrada} / ${v.tokensSaida} | ${usd(v.custoPorChamadaUSD)} | ${v.melhorCena ?? "n/d"} |`),
  ``, visao.some((v) => v.erros.length) ? `Erros: ${visao.filter((v) => v.erros.length).map((v) => `${v.provedor}: ${v.erros.join(" | ")}`).join("; ")}` : `Sem erros nas chamadas.`, ``,
  `Concordancia na melhor cena: ${concordancia || "n/d"}.`, ``,
  `## Audio (transcricao de ${f(audio.duracaoS, 1)} s)`, ``,
  `| Provedor | Modelo | OK | Tempo (ms) | Acerto de palavras | Custo | Trecho |`, `|---|---|---|---|---|---|---|`,
  ...audio.linhas.map((l) => `| ${l.provedor} | ${l.modelo} | ${l.ok ? "sim" : `nao (${l.erro})`} | ${f(l.ms)} | ${l.acerto == null ? "n/d (sem --texto)" : l.acerto + "%"} | ${usd(l.custoUSD)} | ${l.texto.replace(/\|/g, " ").slice(0, 80)} |`),
  ``, `## Como ler`, ``,
  `- Latencia e estabilidade variam por hora e regiao: rode em horarios diferentes e com seu material real antes de decidir.`,
  `- Custos usam os tokens devolvidos pela API x a tabela PRECOS no topo do script (so Gemini foi conferido em 2026-11-23). Itens n/d precisam de preco informado.`,
  `- Provedor :free pode registrar prompts e nao serve para producao nem para dados de clientes.`,
].join("\n");

const saidaDir = path.resolve(process.cwd(), "docs/benchmarks");
mkdirSync(saidaDir, { recursive: true });
const arq = path.join(saidaDir, `provedores-ia-${hoje}${SIMULADO ? "-simulado" : ""}.md`);
writeFileSync(arq, md + "\n");
writeFileSync(arq.replace(/\.md$/, ".json"), JSON.stringify({ visao, audio, simulado: SIMULADO }, null, 2));
console.log(`\nRelatorio: ${arq}`);
