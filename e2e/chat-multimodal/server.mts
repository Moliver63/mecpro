/**
 * Servidor de teste ponta a ponta do chat multimodal.
 *
 * REAL: router do chat (rotas de upload, validacao por conteudo, deduplicacao, isolamento, laco de ferramentas),
 *       banco Postgres (SQL real), ffmpeg/ffprobe (analise e adaptacao de video), cliente React.
 * SIMULADO (so as bordas de rede, porque este ambiente nao tem as chaves): Cloudinary (armazenamento em memoria)
 *       e o modelo Gemini (roteiro fixo que decide chamar as ferramentas; as ferramentas executam de verdade e o
 *       "modelo de visao" devolve uma descricao calculada a partir dos bytes reais de cada imagem recebida).
 *
 * Uso: DATABASE_URL=... E2E_DIST=... node --import tsx e2e/chat-multimodal/server.mts
 */
const DATABASE_URL = process.env.E2E_DATABASE_URL || "postgres://mec:mec@localhost:54329/mecpro";
process.env.DATABASE_URL = DATABASE_URL;
process.env.JWT_SECRET = "e2e-secret-e2e-secret-e2e-secret";
process.env.SESSION_SECRET = "e2e-secret-e2e-secret-e2e-secret";
process.env.CLOUDINARY_CLOUD_NAME = "demo";
process.env.CLOUDINARY_API_KEY = "k";
process.env.CLOUDINARY_API_SECRET = "s";
process.env.GEMINI_API_KEY = "AIzaE2E-fake-key-for-local-test-only-000000";
process.env.NODE_ENV = "development";

import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import { SignJWT } from "jose";

// ── Bordas de rede simuladas ─────────────────────────────────────────────────
export const nuvem = new Map<string, { buf: Buffer; type: string }>();
export const estadoE2E = { falharUpload: false, chamadasGemini: [] as Array<Record<string, unknown>>, uploads: [] as string[] };
const sha8 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 8);
const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // Cloudinary: upload
  const up = url.match(/^https:\/\/api\.cloudinary\.com\/v1_1\/demo\/(image|video)\/upload$/);
  if (up) {
    if (estadoE2E.falharUpload) return new Response(JSON.stringify({ error: { message: "simulado" } }), { status: 500 });
    const form = init.body as FormData;
    const file = form.get("file") as Blob;
    const folder = String(form.get("folder") || "mecpro");
    const buf = Buffer.from(await file.arrayBuffer());
    const nome = (file as any).name || "arquivo";
    const ext = path.extname(nome).replace(".", "") || (up[1] === "video" ? "mp4" : "jpg");
    const id = `${crypto.randomUUID().slice(0, 8)}`;
    const u = `https://res.cloudinary.com/demo/${up[1]}/upload/${folder}/${id}.${ext}`;
    nuvem.set(u, { buf, type: up[1] === "video" ? "video/mp4" : `image/${ext === "jpg" ? "jpeg" : ext}` });
    estadoE2E.uploads.push(u);
    return new Response(JSON.stringify({ secure_url: u }), { status: 200, headers: { "content-type": "application/json" } });
  }
  // Cloudinary: download
  if (url.startsWith("https://res.cloudinary.com/")) {
    const item = nuvem.get(url);
    if (!item) return new Response("nao encontrado", { status: 404 });
    return new Response(new Uint8Array(item.buf), { status: 200, headers: { "content-type": item.type, "content-length": String(item.buf.length) } });
  }
  // Gemini (modelo simulado)
  if (url.startsWith("https://generativelanguage.googleapis.com/")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const cfg = body.generationConfig || {};
    const resposta = (parts: any[]) => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    const conteudos: any[] = body.contents || [];
    const ultimo = conteudos[conteudos.length - 1];
    // Visao: descreve o que RECEBEU (hash dos bytes reais de cada imagem)
    if (cfg.responseMimeType === "application/json") {
      const partes: any[] = ultimo?.parts || [];
      const itens: any[] = [];
      let id = "";
      for (const p of partes) {
        const m = typeof p.text === "string" ? p.text.match(/^Imagem id=(\S+):$/) : null;
        if (m) id = m[1];
        if (p.inlineData) {
          const bytes = Buffer.from(p.inlineData.data, "base64");
          itens.push({ id, descricao: `imagem ${sha8(bytes)} (${bytes.length} bytes)`, elementos: [`jpeg:${bytes[0] === 0xff}`], textoVisivel: "", qualidade: bytes.length > 15000 ? 8 : 3, problemas: [] });
        }
      }
      estadoE2E.chamadasGemini.push({ tipo: "visao", imagens: itens.length, ids: itens.map((i) => i.id) });
      return resposta([{ text: JSON.stringify(itens) }]);
    }
    // Chat: roteiro minimo que decide as ferramentas; o resto e execucao real
    const retornoDeFerramenta = (ultimo?.parts || []).find((p: any) => p.functionResponse);
    if (retornoDeFerramenta) {
      const r = retornoDeFerramenta.functionResponse.response ?? {};
      const dados = (r.output ?? r.result ?? r) as any;
      estadoE2E.chamadasGemini.push({ tipo: "chat-final", ferramenta: retornoDeFerramenta.functionResponse.name });
      if (retornoDeFerramenta.functionResponse.name === "analisar_anexos") {
        const v = (dados.videos || [])[0];
        const fotos = (dados.fotos || []).map((f: any) => f.descricao).filter(Boolean);
        return resposta([{ text: `Analisei ${(dados.fotos || []).length} foto(s) e ${(dados.videos || []).length} vídeo(s). ${v ? `Vídeo: ${v.duracaoS}s, ${v.largura}x${v.altura} (${v.proporcao}), ${v.quadrosAnalisados} quadros vistos. Fala: ${v.fala?.status}.` : ""} ${fotos.length ? `Fotos: ${fotos.join("; ")}.` : ""} ${dados.melhorFoto ? `Melhor foto: ${dados.melhorFoto.arquivo}.` : ""} Limitações: ${(dados.limitacoes || []).length}.` }]);
      }
      if (retornoDeFerramenta.functionResponse.name === "adaptar_video") {
        return resposta([{ text: `Adaptei: ${(dados.adaptados || []).map((a: any) => `${a.formato} ${a.largura}x${a.altura} ${a.ok ? "ok" : a.erro}`).join("; ")}. Nada foi publicado.` }]);
      }
      return resposta([{ text: "feito" }]);
    }
    const textoUsuario = (ultimo?.parts || []).map((p: any) => p.text || "").join(" ");
    estadoE2E.chamadasGemini.push({ tipo: "chat", usuarioMencionaVideos: (textoUsuario.match(/res\.cloudinary\.com/g) || []).length, avisoOutraConta: /não pertence/.test(textoUsuario) });
    const soOPedido = textoUsuario.split("\n\n[")[0]; // sem as notas do sistema (que citam o nome das ferramentas)
    if (/analis|melhor foto|descrev/i.test(soOPedido)) return resposta([{ functionCall: { name: "analisar_anexos", args: { foco: "anúncio" } } }]);
    if (/adapt/i.test(soOPedido)) {
      const m = textoUsuario.match(/https:\/\/res\.cloudinary\.com\/\S+?\.(?:mp4|mov|webm)/);
      if (m) return resposta([{ functionCall: { name: "adaptar_video", args: { videoUrl: m[0], formatos: ["stories", "feed", "square"] } } }]);
    }
    return resposta([{ text: "Recebi sua mensagem." }]);
  }
  return realFetch(input, init);
}) as typeof fetch;

// ── App ──────────────────────────────────────────────────────────────────────
const dbmod = await import("../../server/db");
const pool = (await dbmod.getPool())!;
await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY)`);
await pool.query(`INSERT INTO users (id) VALUES (1), (2) ON CONFLICT DO NOTHING`);
await pool.query(`CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title VARCHAR(200) NOT NULL DEFAULT 'Nova conversa',
  "lastCampaignId" INTEGER, "lastCampaignName" VARCHAR(255), "lastCampaignUrl" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "pendingPhotoUrls" JSONB, state JSONB NOT NULL DEFAULT '{"briefing":{}}'::jsonb, lease UUID, busy_until TIMESTAMPTZ)`);
await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages (id SERIAL PRIMARY KEY, "sessionId" INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE, role VARCHAR(20) NOT NULL, content TEXT NOT NULL, campanha JSONB, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

const { chatRouter } = await import("../../server/chat");
const { _limparCachesDeMidia } = await import("../../server/chatMediaTools");
const app = express();
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.get("/api/_e2e/login", async (req, res) => {
  const userId = Number(req.query.user) || 1;
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", path: "/" });
  res.json({ ok: true, userId });
});
app.get("/api/_e2e/estado", async (_req, res) => {
  const sessoes = await pool.query(`SELECT id, "userId", "pendingPhotoUrls" FROM chat_sessions ORDER BY id`);
  res.json({ falharUpload: estadoE2E.falharUpload, uploads: estadoE2E.uploads.length, gemini: estadoE2E.chamadasGemini, sessoes: sessoes.rows, nuvem: nuvem.size });
});
app.post("/api/_e2e/falha-upload", (req, res) => { estadoE2E.falharUpload = req.query.on === "1"; res.json({ falharUpload: estadoE2E.falharUpload }); });
app.get("/api/_e2e/arquivo", (req, res) => { const i = nuvem.get(String(req.query.url)); if (!i) return res.status(404).end(); res.type(i.type).send(i.buf); });
app.post("/api/_e2e/reset", async (_req, res) => {
  await pool.query(`TRUNCATE chat_sessions CASCADE`);
  _limparCachesDeMidia();
  nuvem.clear(); estadoE2E.uploads.length = 0; estadoE2E.chamadasGemini.length = 0; estadoE2E.falharUpload = false;
  res.json({ ok: true });
});
app.use("/api/chat", chatRouter);
app.use(express.static(process.env.E2E_DIST || "/tmp/e2e-dist"));

const porta = Number(process.env.E2E_PORT || 4789);
app.listen(porta, () => console.log(`E2E_PRONTO ${porta}`));
