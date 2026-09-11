/**
 * server/chat.ts — Assistente de Campanhas do MecProAI (via chat)
 *
 * Adaptado do agente de chat do LogPro (function calling + cadeia de fallback)
 * para o domínio de campanhas de marketing:
 *
 * - A IA conversa com o usuário e coleta o briefing (objetivo, orçamento,
 *   duração, plataforma, nicho, público, região) em vez de um formulário.
 * - Quando tem o essencial, chama a FERRAMENTA `gerar_campanha`, que por sua
 *   vez chama exatamente o mesmo motor de geração usado pela interface e pelo
 *   MCP (server/ai.ts → generateCampaign). A IA nunca "inventa" uma campanha.
 * - Cadeia de fallback: Gemini (pool de chaves GEMINI_API_KEY) → DeepSeek →
 *   Groq → resposta local de indisponibilidade.
 *
 * REGRA DE OURO (mesma do LogPro): o agente NUNCA inventa número de
 * performance, preço ou resultado — toda ação real sai da ferramenta.
 *
 * Stateless: o cliente reenvia o histórico a cada turno (máx. 16 mensagens).
 * Nada é persistido no banco neste módulo.
 */

import { Router } from "express";
import { GoogleGenAI, FunctionCallingConfigMode, type Content, type FunctionDeclaration, type GenerateContentResponse } from "@google/genai";
import Groq from "groq-sdk";
import { confirmedChatContact } from "./chatContact";
import { evaluateCampaignBriefingReadiness } from "../shared/campaignBriefingReadiness";
import { chatTaskContext, chatTaskKey, runChatDraftTask } from "./chatDraftTask";
import { appendGeminiToolTurn } from "./ai-providers/geminiToolTurn";
import { jwtVerify } from "jose";
import * as db from "./db";
import { log } from "./logger";
// Achado real (log de produção, 09/09): poolChavesGemini() usava
// require("./ai") — mas este arquivo roda em contexto ESM puro (o
// próprio arquivo usa import/export no topo, carregado via import()
// dinâmico em server/_core/index.ts). `require` simplesmente não existe
// nesse contexto — toda chamada ao chat falhava com "ReferenceError:
// require is not defined" (unhandledRejection, capturado no log do
// Render). Corrigido com import estático de verdade: ai.ts já é
// carregado no processo por vários outros caminhos no boot do servidor
// (módulos ES são cacheados/singleton), então isso não adiciona nenhum
// efeito colateral novo, só reaproveita a mesma constante já centralizada
// lá — sem precisar de require nem de import() dinâmico (que é async,
// e poolChavesGemini() precisa continuar síncrona pra quem já a chama).
import { ALL_GEMINI_KEYS } from "./ai";

export const chatRouter = Router();

const MODELO_GEMINI = process.env.GEMINI_CHAT_MODEL ?? "gemini-flash-latest";
const MODELO_GROQ = process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile";
const MODELO_DEEPSEEK_CHAT = process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat";

/** Quantas mensagens do histórico são reenviadas por turno (custo/latência). */
const MAX_MENSAGENS_HISTORICO = 16;

// Achado real (auditoria da feature de chat, 08/09): o body parser global
// (server/_core/index.ts) aceita até 50mb por requisição — um limite
// pensado pra upload de imagem em outras rotas, não pra texto de chat.
// Sem checagem própria aqui, uma única mensagem gigante seria encaminhada
// direto pra API do Gemini/Groq em toda tentativa de retry, queimando
// custo/cota sem necessidade nenhuma (uma campanha não precisa de uma
// mensagem de milhares de caracteres pra ser descrita).
const MAX_CONTEUDO_MENSAGEM = 4000;
const MAX_CHAT_IMAGE_ATTACHMENTS = 10;
const MAX_CHAT_IMAGE_BYTES = 6 * 1024 * 1024;

/** Timeout da geração de campanha dentro de uma chamada de ferramenta. */
const TIMEOUT_GERACAO_MS = 110_000;

// ── Pool de chaves Gemini (mesmo padrão de env do resto do MecProAI) ──────
// Sem circuit breaker externo: cooldown simples em memória por chave quando
// a cota diária esgota (não resolve com retry curto).
const COOLDOWN_COTA_MS = 3 * 60 * 60_000; // 3h, janela conservadora
const _chavesEsgotadas = new Map<string, number>();

// Achado real (auditoria da feature de chat, 08/09): o pool aqui era
// próprio e tinha DOIS problemas — (1) lia `GEMINI_API_KEY${i}` (sem
// underscore) pras chaves 2-5, mas a variável de ambiente real é
// `GEMINI_API_KEY_2` (com underscore) — ou seja, esse pool NUNCA
// encontrava as chaves 2 a 5, só a principal, mesmo com 8 chaves
// configuradas no ambiente; (2) nem chegava a tentar ler as chaves
// _07/_08/_10 que existem no ambiente. server/ai.ts já centraliza isso
// corretamente em ALL_GEMINI_KEYS (nomes certos, todas as 8) — reaproveita
// em vez de manter um terceiro pool próprio e divergente.
function poolChavesGemini(): string[] {
  return ALL_GEMINI_KEYS;
}

function proximaChaveGemini(): string | null {
  const agora = Date.now();
  for (const chave of poolChavesGemini()) {
    const ate = _chavesEsgotadas.get(chave) || 0;
    if (ate < agora) return chave;
  }
  return null;
}

// ── Rate limit simples em memória (20 msg/min por usuário) ────────────────
const _rateMap = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMITE = 20;
const RATE_JANELA_MS = 60_000;

// Achado real (auditoria da feature de chat, 08/09): _rateMap cresce um
// registro por usuário único que já mandou mensagem, pra sempre — nenhuma
// entrada é removida quando a janela expira. Num processo de servidor de
// longa duração, isso é crescimento de memória sem limite (pequeno por
// entrada, mas nunca encolhe). Faxina oportunista: a cada N chamadas,
// remove entradas cuja janela já expirou — sem precisar de um timer
// próprio com ciclo de vida pra gerenciar.
let _chamadasDesdeUltimaFaxina = 0;
const FAXINA_A_CADA_N_CHAMADAS = 200;

function rateLimitOk(userId: number): boolean {
  const agora = Date.now();

  _chamadasDesdeUltimaFaxina++;
  if (_chamadasDesdeUltimaFaxina >= FAXINA_A_CADA_N_CHAMADAS) {
    _chamadasDesdeUltimaFaxina = 0;
    for (const [uid, entrada] of _rateMap) {
      if (entrada.resetAt < agora) _rateMap.delete(uid);
    }
  }

  const atual = _rateMap.get(userId);
  if (!atual || atual.resetAt < agora) {
    _rateMap.set(userId, { count: 1, resetAt: agora + RATE_JANELA_MS });
    return true;
  }
  if (atual.count >= RATE_LIMITE) return false;
  atual.count += 1;
  return true;
}

// ── Auth: JWT em cookie (mesmo padrão das outras rotas REST) ──────────────
async function authChat(req: any, res: any, next: () => void) {
  try {
    const token = req.cookies?.token || (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ erro: "login_required", mensagem: "Faça login para conversar com o assistente." });
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret).catch(() => ({ payload: null as any }));
    if (!payload?.userId) return res.status(401).json({ erro: "login_required", mensagem: "Faça login para continuar." });
    req.chatUserId = Number(payload.userId);
    if (!rateLimitOk(req.chatUserId)) {
      return res.status(429).json({ erro: "rate_limit", mensagem: "Muitas mensagens em pouco tempo. Aguarde um minuto." });
    }
    next();
  } catch {
    return res.status(401).json({ erro: "login_required", mensagem: "Sessão inválida. Faça login novamente." });
  }
}

// ─────────────────────────────────────────────────────────────────────────

export interface MensagemChat {
  role: "user" | "assistant";
  content: string;
}

interface ChatImageAttachment {
  fileName?: string;
  mimeType?: string;
  size?: number;
  imageBase64?: string;
}

export interface CampanhaGerada {
  id: number;
  name: string;
  projectId: number;
  url: string;
}

interface RespostaChat {
  resposta: string;
  campanha: CampanhaGerada | null;
  modo: "assistente" | "local";
}

const SYSTEM_PROMPT = `Você é o assistente de criação de campanhas do MecProAI, uma plataforma de marketing com IA.

Sua função é ajudar o usuário a montar o briefing de uma campanha de anúncios através de conversa, em vez de um formulário. Você é um coletor de dados direto e educado — nunca um vendedor de resultado, e nunca inventa número de performance.

Colete, nesta ordem de prioridade (só peça o que ainda não souber):
1. Nome do cliente/negócio (projectName) — pra vincular ou criar o projeto.
2. Objetivo da campanha: leads, sales (vendas), traffic (tráfego), branding ou engagement.
3. Plataforma: meta, google ou tiktok. Se o usuário não souber, sugira meta.
4. Orçamento total em reais (budget).
5. Duração em dias (durationDays).
6. Nicho/segmento e o que vende (productService) — melhora muito a copy.
7. Cidade/região de atendimento e público-alvo (idade mínima/máxima se souber).
8. Formato de mídia: image, video, carousel ou mixed. Se não souber, use image.
9. Se o usuário anexar fotos, use essas fotos reais na campanha. Com 2 ou mais fotos anexadas, prefira formato carousel, a não ser que o usuário peça outro formato.

Quando tiver os itens 1 a 5 no mínimo (e idealmente 6), chame a ferramenta gerar_campanha. Não peça confirmação antes — chame direto. Se faltar item obrigatório, pergunte só o que falta.

Situações que você precisa saber lidar:
- Usuário descreve o negócio de forma solta ("tenho uma loja de roupa em BC"): extraia nicho, cidade e proposta de valor do que ele escreveu e confirme em UMA frase antes de gerar.
- Pergunta fora do escopo (clima, notícia, política): responda educadamente que você só ajuda a montar campanhas de marketing, e redirecione.
- Usuário manda vários dados de uma vez: agradeça, confirme o entendimento resumido e chame gerar_campanha se estiver completo.
- Usuário anexa fotos: trate como material real da campanha. Não peça URL pública nem base64; o sistema já recebeu os bytes das imagens.
- Depois de gerar: resuma em 1-2 frases diretas (nome da campanha, objetivo, orçamento/dia aproximado) e diga que os detalhes completos estão no link que aparece na tela. NÃO prometa resultado ("vai vender muito") — só entregue a campanha criada.
- Se a ferramenta retornar erro (falta campo, limite do plano): repasse a mensagem do erro ao usuário de forma clara e continue a conversa coletando o que falta.

Regras que valem sempre:
- Você NUNCA promete resultado, estima ROAS/CPL/CTR ou cita número de performance por conta própria.
- Tom: direto, sem enrolação, português do Brasil. Sem "olá! ficarei feliz em ajudar" — vai direto ao ponto.
- Uma pergunta por vez sempre que possível — não interrogue o usuário com 8 perguntas de uma vez.`;

// ── Ferramenta: gerar_campanha ────────────────────────────────────────────
const PARAMETROS_GERAR_CAMPANHA = {
  type: "object",
  properties: {
    projectName: { type: "string", description: "Nome do cliente/negócio. Usado pra encontrar ou criar o projeto." },
    objective: { type: "string", enum: ["leads", "sales", "traffic", "branding", "engagement"], description: "Objetivo da campanha." },
    platform: { type: "string", enum: ["meta", "google", "tiktok"], description: "Plataforma de anúncios." },
    budget: { type: "number", description: "Orçamento total em reais." },
    durationDays: { type: "number", description: "Duração em dias." },
    name: { type: "string", description: "Nome da campanha. Se omitido, monte um a partir do negócio + objetivo." },
    niche: { type: "string", description: "Nicho/segmento de mercado." },
    productService: { type: "string", description: "O que o negócio vende." },
    targetAudience: { type: "string", description: "Público-alvo em texto livre." },
    city: { type: "string", description: "Cidade/região de atendimento." },
    ageMin: { type: "number", description: "Idade mínima do público (13-65)." },
    ageMax: { type: "number", description: "Idade máxima do público (18-65)." },
    mediaFormat: { type: "string", enum: ["image", "video", "carousel", "mixed"], description: "Formato de mídia." },
    whatsapp: { type: "string", description: "WhatsApp de atendimento, se houver." },
    destinationUrl: { type: "string", description: "URL de destino dos anúncios, se houver." },
  },
  required: ["objective", "platform", "budget", "durationDays"],
};

const DESCRICAO_GERAR_CAMPANHA =
  "Gera a campanha de marketing com IA usando o motor oficial do MecProAI (mesmo da interface). " +
  "Só chame quando tiver no mínimo: nome do cliente/negócio (projectName), objective, platform, budget e durationDays. " +
  "Cria o projeto automaticamente se o cliente ainda não existir. Retorna o id e o link da campanha criada.";

const declaracoesGemini: FunctionDeclaration[] = [
  { name: "gerar_campanha", description: DESCRICAO_GERAR_CAMPANHA, parametersJsonSchema: PARAMETROS_GERAR_CAMPANHA },
];

const ferramentasGroq = [
  {
    type: "function" as const,
    function: { name: "gerar_campanha", description: DESCRICAO_GERAR_CAMPANHA, parameters: PARAMETROS_GERAR_CAMPANHA as Record<string, unknown> },
  },
];

function base64Payload(value: string): string {
  return String(value || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
}

function detectarFormatoImagem(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

function sanitizeChatAttachments(raw: unknown): ChatImageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CHAT_IMAGE_ATTACHMENTS)
    .map((item) => {
      const record = (item && typeof item === "object") ? item as Record<string, unknown> : {};
      return {
        fileName: typeof record.fileName === "string" ? record.fileName.slice(0, 160) : undefined,
        mimeType: typeof record.mimeType === "string" ? record.mimeType.slice(0, 80) : undefined,
        size: Number.isFinite(Number(record.size)) ? Number(record.size) : undefined,
        imageBase64: typeof record.imageBase64 === "string" ? record.imageBase64 : undefined,
      };
    })
    .filter((item) => !!item.imageBase64);
}

async function prepararFotosDoChat(attachments: ChatImageAttachment[], projectId: number): Promise<{
  realImages: string[];
  photoInsights: Array<Record<string, unknown>>;
  visualLabels: string[];
}> {
  if (!attachments.length) return { realImages: [], photoInsights: [], visualLabels: [] };

  const { uploadBase64ImageToCloudinary } = await import("./imageGeneration");
  const { analyzeImageWithVision } = await import("./imageRAG");
  const realImages: string[] = [];
  const photoInsights: Array<Record<string, unknown>> = [];
  const visualLabelsSet = new Set<string>();

  for (let i = 0; i < attachments.length; i++) {
    const photo = attachments[i];
    const base64 = base64Payload(photo.imageBase64 || "");
    if (!base64) throw new Error(`Foto ${i + 1} não contém bytes de imagem.`);

    const buffer = Buffer.from(base64, "base64");
    const detected = detectarFormatoImagem(buffer);
    if (!detected) throw new Error(`Foto ${i + 1} não é JPEG, PNG ou WEBP válido.`);
    if (buffer.byteLength > MAX_CHAT_IMAGE_BYTES) throw new Error(`Foto ${i + 1} excede 6MB.`);

    const originalName = photo.fileName || `chat-photo-${i + 1}.${detected}`;
    const safeName = originalName.replace(/[^\w.\-]+/g, "-").slice(0, 120) || `chat-photo-${i + 1}.${detected}`;
    const cloudUrl = await uploadBase64ImageToCloudinary(photo.imageBase64 || base64, `chat-${projectId}-${Date.now()}-${i}-${safeName}`);
    if (!cloudUrl) throw new Error(`Falha ao subir a foto ${i + 1} para o Cloudinary.`);

    let vision: any = null;
    try {
      vision = await analyzeImageWithVision(cloudUrl);
      if (Array.isArray(vision?.labels)) vision.labels.slice(0, 4).forEach((label: string) => visualLabelsSet.add(label));
      if (Array.isArray(vision?.objects)) vision.objects.slice(0, 3).forEach((object: string) => visualLabelsSet.add(object));
    } catch (error: any) {
      log.warn("chat", "analise visual da foto falhou", { projectId, index: i, erro: error?.message });
    }

    realImages.push(cloudUrl);
    photoInsights.push({
      url: cloudUrl,
      originalIndex: i,
      fileName: safeName,
      role: i === 0 ? "featured_photo" : "supporting_photo",
      copyAngle: vision?.summary || vision?.description || `foto real ${i + 1} enviada pelo usuário`,
      labels: Array.isArray(vision?.labels) ? vision.labels.slice(0, 8) : [],
      objects: Array.isArray(vision?.objects) ? vision.objects.slice(0, 5) : [],
      textFound: vision?.text_found ? String(vision.text_found).slice(0, 160) : undefined,
      hasText: !!vision?.has_text,
      qualityScore: typeof vision?.quality_score === "number" ? vision.quality_score : null,
      isFeatured: i === 0,
    });
  }

  return {
    realImages,
    photoInsights,
    visualLabels: Array.from(visualLabelsSet).slice(0, 8),
  };
}

// ── Execução real da ferramenta (chama o motor existente) ─────────────────
async function executarGeracaoCampanha(args: Record<string, unknown>, userId: number, attachments: ChatImageAttachment[] = []): Promise<{ ok: true; campanha: CampanhaGerada } | { ok: false; erro: string }> {
  try {
    return await runChatDraftTask(userId, () => gerarRascunhoValidado(args, userId, attachments), TIMEOUT_GERACAO_MS);
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : "Falha ao acompanhar a tarefa." };
  }
}

async function gerarRascunhoValidado(args: Record<string, unknown>, userId: number, attachments: ChatImageAttachment[] = []): Promise<{ ok: true; campanha: CampanhaGerada } | { ok: false; erro: string }> {
  try {
    const objective = String(args.objective || "").toLowerCase();
    const platform = String(args.platform || "meta").toLowerCase();
    const budget = Number(args.budget);
    const duration = Math.round(Number(args.durationDays));
    const projectName = String(args.projectName || "").trim();

    if (!["leads", "sales", "traffic", "branding", "engagement"].includes(objective)) {
      return { ok: false, erro: `Objetivo inválido: "${objective}". Use leads, sales, traffic, branding ou engagement.` };
    }
    if (!Number.isFinite(budget) || budget <= 0) return { ok: false, erro: "Orçamento inválido — confirme o valor em reais com o usuário." };
    if (!Number.isFinite(duration) || duration <= 0) return { ok: false, erro: "Duração inválida — confirme a duração em dias com o usuário." };

    const ownedProjects = (await db.getProjectsByUserId(userId)) as any[];
    const selectedProject = projectName
      ? ownedProjects.find(p => String(p.name || "").trim().toLowerCase() === projectName.toLowerCase())
      : ownedProjects.length === 1 ? ownedProjects[0] : undefined;
    const savedProfile: any = selectedProject ? await db.getClientProfile(selectedProject.id) : null;
    const confirmedContact = confirmedChatContact(args, savedProfile?.socialLinks);
    const profile = { ...savedProfile, ...confirmedContact };
    for (const field of ["niche", "productService", "targetAudience", "whatsapp"]) {
      if (typeof args[field] === "string" && String(args[field]).trim()) profile[field] = String(args[field]).trim();
    }
    if (projectName) profile.companyName = projectName;
    if (typeof args.destinationUrl === "string" && args.destinationUrl.trim()) profile.websiteUrl = args.destinationUrl.trim();
    const readiness = evaluateCampaignBriefingReadiness({ objective, platform, budget, duration }, profile);
    if (readiness.requiredMissing.length) {
      return { ok: false, erro: `Antes de gerar, confirme com o usuario: ${readiness.requiredMissing.map(issue => issue.question).join(" ")}` };
    }

    // 1. Resolve o projeto (encontra por nome ou cria)
    let projectId: number;
    if (projectName) {
      const projects = (await db.getProjectsByUserId(userId)) as any[];
      const alvo = projectName.toLowerCase();
      const existente = projects.find((p) => String(p.name || "").trim().toLowerCase() === alvo);
      if (existente) {
        projectId = existente.id;
      } else {
        const limite = await db.checkPlanLimit(userId, "projects");
        if (!limite.allowed) return { ok: false, erro: `Não foi possível criar o projeto: ${limite.reason}` };
        const criado: any = await db.createProject({ name: projectName, userId } as any);
        projectId = criado.id;
      }
    } else {
      const projects = (await db.getProjectsByUserId(userId)) as any[];
      if (projects.length === 1) {
        projectId = projects[0].id;
      } else {
        return { ok: false, erro: "Preciso saber o nome do cliente/negócio pra vincular a campanha a um projeto." };
      }
    }

    // 2. Preenche perfil do cliente quando trouxe dados novos (best effort)
    try {
      const perfilAtual: any = await db.getClientProfile(projectId);
      if (!perfilAtual && (args.niche || args.productService || args.targetAudience)) {
        await db.upsertClientProfile({
          projectId,
          companyName: projectName || undefined,
          niche: args.niche ? String(args.niche) : undefined,
          productService: args.productService ? String(args.productService) : undefined,
          targetAudience: args.targetAudience ? String(args.targetAudience) : undefined,
        } as any);
      }
    } catch {
      // Perfil é enriquecimento — falha não bloqueia a geração
    }

    if (Object.keys(confirmedContact).length) {
      await db.upsertClientProfile({ projectId, ...confirmedContact } as any);
    }

    // 3. Limite do plano
    const limiteCampanhas = await db.checkPlanLimit(userId, "campaigns", { projectId } as any);
    if (!limiteCampanhas.allowed) return { ok: false, erro: `Não foi possível gerar: ${limiteCampanhas.reason}` };

    // 4. Monta contexto e gera com o motor oficial
    const name = String(args.name || "").trim() ||
      `${projectName || "Campanha"} — ${objective === "sales" ? "Vendas" : objective === "leads" ? "Leads" : objective}`;

    const preparedMedia = await prepararFotosDoChat(attachments, projectId);
    const hasChatPhotos = preparedMedia.realImages.length > 0;

    const extraContext = [
      args.niche ? `Nicho: ${args.niche}` : "",
      args.productService ? `Produto/serviço: ${args.productService}` : "",
      args.targetAudience ? `Público-alvo: ${args.targetAudience}` : "",
      args.city ? `Região de atendimento: ${args.city}` : "",
      args.whatsapp ? `WhatsApp: ${args.whatsapp}` : "",
      args.destinationUrl ? `URL de destino: ${args.destinationUrl}` : "",
      hasChatPhotos ? `${preparedMedia.realImages.length} foto(s) real(is) anexada(s) pelo usuário para orientar e montar os criativos.` : "",
    ].filter(Boolean).join(". ");

    const { generateCampaign } = await import("./ai");
    const campaign: any = await generateCampaign({
        projectId,
        userId,
        name,
        objective,
        platform,
        budget,
        duration,
        extraContext: extraContext || undefined,
        ageMin: Number.isFinite(Number(args.ageMin)) ? Number(args.ageMin) : undefined,
        ageMax: Number.isFinite(Number(args.ageMax)) ? Number(args.ageMax) : undefined,
        locationMode: args.city ? "raio" : undefined,
        geoCity: args.city ? String(args.city) : undefined,
        geoRadius: 25,
        mediaFormat: hasChatPhotos && preparedMedia.realImages.length > 1
          ? "carousel"
          : (args.mediaFormat ? String(args.mediaFormat) : "image"),
        realImages: hasChatPhotos ? preparedMedia.realImages : undefined,
        photoInsights: hasChatPhotos ? preparedMedia.photoInsights : undefined,
        visualLabels: preparedMedia.visualLabels.length ? preparedMedia.visualLabels : undefined,
        numCreatives: hasChatPhotos ? Math.min(preparedMedia.realImages.length, 10) : undefined,
      } as any);

    const campanha: CampanhaGerada = {
      id: campaign.id,
      name: campaign.name || name,
      projectId,
      url: `/projects/${projectId}/campaign/result/${campaign.id}`,
    };
    log.info("chat", "campanha gerada via chat", { userId, campaignId: campanha.id, projectId });
    return { ok: true, campanha };
  } catch (e: any) {
    const msg = e?.message === "timeout"
      ? "A geração está demorando mais que o esperado. Ela pode ter sido criada mesmo assim — peça pro usuário conferir a lista de campanhas do projeto em alguns segundos."
      : `Falha ao gerar a campanha: ${e?.message || "erro desconhecido"}.`;
    log.warn("chat", "gerar_campanha falhou", { userId, erro: e?.message });
    return { ok: false, erro: msg };
  }
}

// ── Helpers de erro ───────────────────────────────────────────────────────
function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroEhTemporario(erro: unknown): boolean {
  const texto = String((erro as { message?: string })?.message ?? erro);
  return (
    texto.includes("503") ||
    texto.includes("429") ||
    texto.includes("UNAVAILABLE") ||
    texto.includes("high demand") ||
    texto.includes("rate limit")
  );
}

function erroEhCotaDiariaEsgotada(erro: unknown): boolean {
  const texto = String((erro as { message?: string })?.message ?? erro);
  return texto.includes("RESOURCE_EXHAUSTED") || texto.includes("exceeded your current quota");
}

/* ---------------- Provedor 1: Gemini (com pool de chaves) ---------------- */

async function chamarGeminiComRetry(historico: Content[], tentativas = 4): Promise<GenerateContentResponse> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    const chave = proximaChaveGemini();
    if (!chave) {
      throw ultimoErro ?? new Error("Nenhuma chave Gemini disponível no momento (cotas esgotadas).");
    }
    try {
      const cliente = new GoogleGenAI({ apiKey: chave });
      return await cliente.models.generateContent({
        model: MODELO_GEMINI,
        contents: historico,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: declaracoesGemini }],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        },
      });
    } catch (erro) {
      ultimoErro = erro;
      if (erroEhCotaDiariaEsgotada(erro)) {
        // Cota dessa chave esgotada — marca cooldown e tenta a próxima já na
        // iteração seguinte (cota não resolve com backoff curto).
        _chavesEsgotadas.set(chave, Date.now() + COOLDOWN_COTA_MS);
        continue;
      }
      if (!erroEhTemporario(erro) || i === tentativas - 1) throw erro;
      await aguardar(1200 * (i + 1));
    }
  }
  throw ultimoErro;
}

async function tentarComGemini(mensagens: MensagemChat[], userId: number, attachments: ChatImageAttachment[] = []): Promise<RespostaChat> {
  const historico: Content[] = mensagens.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let campanha: CampanhaGerada | null = null;
  let textoFinal = "";

  for (let passo = 0; passo < 4; passo++) {
    const resposta = await chamarGeminiComRetry(historico);
    if (resposta.text) textoFinal = resposta.text;

    const handled = await appendGeminiToolTurn(historico, resposta, async (name, args) => {
      if (name !== "gerar_campanha") return { erro: "Ferramenta desconhecida." };
      if (campanha) return { campanha };
      const resultado = await executarGeracaoCampanha(args, userId, attachments);
      if ("campanha" in resultado) {
        campanha = resultado.campanha;
        return { campanha };
      }
      return { erro: resultado.erro };
    });
    if (!handled) break;
  }

  return { resposta: textoFinal, campanha, modo: "assistente" };
}

/* ---------------- Provedor 2: Groq (fallback) ---------------- */

async function chamarGroqComRetry(groq: Groq, historico: Groq.Chat.ChatCompletionMessageParam[], tentativas = 2) {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await groq.chat.completions.create({
        model: MODELO_GROQ,
        messages: historico,
        tools: ferramentasGroq,
        tool_choice: "auto",
        temperature: 0.3,
      });
    } catch (erro) {
      ultimoErro = erro;
      if (!erroEhTemporario(erro) || i === tentativas - 1) throw erro;
      await aguardar(1200 * (i + 1));
    }
  }
  throw ultimoErro;
}

async function tentarComGroq(mensagens: MensagemChat[], userId: number, attachments: ChatImageAttachment[] = []): Promise<RespostaChat> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const historico: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...mensagens.map((m) => ({ role: m.role, content: m.content }) as Groq.Chat.ChatCompletionMessageParam),
  ];

  let campanha: CampanhaGerada | null = null;
  let textoFinal = "";

  for (let passo = 0; passo < 4; passo++) {
    const resposta = await chamarGroqComRetry(groq, historico);
    const msg = resposta.choices[0].message;
    if (msg.content) textoFinal = msg.content;

    const chamada = msg.tool_calls?.[0];
    if (!chamada) break;

    historico.push(msg);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(chamada.function.arguments);
    } catch {
      // args inválido — handler abaixo trata
    }

    if (chamada.function.name === "gerar_campanha") {
      const resultado = await executarGeracaoCampanha(args, userId, attachments);
      if (resultado.ok) campanha = resultado.campanha;
      let respostaFuncao: { campanha: CampanhaGerada } | { erro: string };
      if ("campanha" in resultado) {
        respostaFuncao = { campanha: resultado.campanha };
      } else {
        respostaFuncao = { erro: resultado.erro };
      }
      historico.push({
        role: "tool",
        tool_call_id: chamada.id,
        content: JSON.stringify(respostaFuncao),
      });
      continue;
    }

    historico.push({
      role: "tool",
      tool_call_id: chamada.id,
      content: JSON.stringify({ erro: "Ferramenta desconhecida." }),
    });
  }

  return { resposta: textoFinal, campanha, modo: "assistente" };
}

/* ---------------- Provedor 3: DeepSeek (fallback OpenAI-compatible) ---------------- */
async function chamarDeepSeekChat(messages: any[], tools?: any[]) {
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY não configurada.");

  const model = MODELO_DEEPSEEK_CHAT.trim() || "deepseek-chat";
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 1400,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${data?.error?.message || "erro desconhecido"}`);
  }
  return data;
}

async function tentarComDeepSeek(mensagens: MensagemChat[], userId: number, attachments: ChatImageAttachment[] = []): Promise<RespostaChat> {
  log.info("chat", "tentando DeepSeek fallback", { model: MODELO_DEEPSEEK_CHAT });
  const historico: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...mensagens.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  ];

  let campanha: CampanhaGerada | null = null;
  let textoFinal = "";

  for (let passo = 0; passo < 4; passo++) {
    const resposta = await chamarDeepSeekChat(historico, ferramentasGroq);
    const msg = resposta?.choices?.[0]?.message || {};
    if (msg.content) textoFinal = String(msg.content);

    const chamada = Array.isArray(msg.tool_calls) ? msg.tool_calls[0] : null;
    if (!chamada) break;

    historico.push(msg);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(chamada.function?.arguments || "{}");
    } catch {
      // args inválido — handler abaixo trata
    }

    if (chamada.function?.name === "gerar_campanha") {
      const resultado = await executarGeracaoCampanha(args, userId, attachments);
      if (resultado.ok) campanha = resultado.campanha;
      let respostaFuncao: { campanha: CampanhaGerada } | { erro: string };
      if ("campanha" in resultado) {
        respostaFuncao = { campanha: resultado.campanha };
      } else {
        respostaFuncao = { erro: resultado.erro };
      }
      historico.push({
        role: "tool",
        tool_call_id: chamada.id,
        content: JSON.stringify(respostaFuncao),
      });
      continue;
    }

    historico.push({
      role: "tool",
      tool_call_id: chamada.id,
      content: JSON.stringify({ erro: "Ferramenta desconhecida." }),
    });
  }

  return { resposta: textoFinal, campanha, modo: "assistente" };
}

/* ---------------- Provedor 4: resposta local (sem IA) ---------------- */

function responderLocal(): RespostaChat {
  return {
    resposta:
      "No momento os provedores de IA do chat não responderam a tempo. " +
      "Tente novamente em alguns instantes; se estiver criando uma campanha urgente, a tela de campanhas continua disponível.",
    campanha: null,
    modo: "local",
  };
}

/* ---------------- Rotas ---------------- */

// GET /api/chat/status — diagnóstico leve (sem citar fornecedor)
chatRouter.get("/status", (_req, res) => {
  const geminiOk = poolChavesGemini().length > 0;
  const deepSeekOk = !!process.env.DEEPSEEK_API_KEY;
  const groqOk = !!process.env.GROQ_API_KEY;
  res.json({
    disponivel: geminiOk || deepSeekOk || groqOk,
    modo: geminiOk || deepSeekOk || groqOk ? "assistente" : "local",
  });
});

chatRouter.post("/", authChat, (req: any, _res, next) => {
  chatTaskContext.run({ key: chatTaskKey({ mensagens: req.body?.mensagens, attachments: req.body?.attachments }) }, next);
}, async (req: any, res) => {
  const userId = req.chatUserId as number;
  const recebidas: MensagemChat[] = Array.isArray(req.body?.mensagens) ? req.body.mensagens : [];
  const attachments = sanitizeChatAttachments(req.body?.attachments);
  if (recebidas.length === 0) {
    return res.status(400).json({ erro: "Nenhuma mensagem enviada." });
  }
  if (Array.isArray(req.body?.attachments) && req.body.attachments.length > MAX_CHAT_IMAGE_ATTACHMENTS) {
    return res.status(400).json({ erro: `Envie no máximo ${MAX_CHAT_IMAGE_ATTACHMENTS} fotos por campanha.` });
  }
  for (let i = 0; i < attachments.length; i++) {
    const estimatedBytes = Math.ceil(base64Payload(attachments[i].imageBase64 || "").length * 0.75);
    if (estimatedBytes > MAX_CHAT_IMAGE_BYTES) {
      return res.status(400).json({ erro: `Foto ${i + 1} excede 6MB. Comprima antes de enviar.` });
    }
  }
  const mensagemMuitoLonga = recebidas.some(
    (m) => typeof m?.content === "string" && m.content.length > MAX_CONTEUDO_MENSAGEM
  );
  if (mensagemMuitoLonga) {
    return res.status(400).json({ erro: `Mensagem muito longa (máximo ${MAX_CONTEUDO_MENSAGEM} caracteres).` });
  }

  // Mantém só as últimas trocas — o histórico inteiro é reenviado a cada
  // turno, e briefing de campanha não precisa de contexto longo.
  const mensagens = recebidas
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-MAX_MENSAGENS_HISTORICO);

  if (attachments.length && mensagens.length) {
    const lastUser = [...mensagens].reverse().find((m) => m.role === "user");
    if (lastUser) {
      lastUser.content += `\n\n[Fotos anexadas no chat: ${attachments.length}. Use estas fotos reais na campanha; a primeira foto anexada é a candidata a destaque se o usuário não escolher outra.]`;
    }
  }

  if (proximaChaveGemini()) {
    try {
      const resultado = await tentarComGemini(mensagens, userId, attachments);
      return res.json(resultado);
    } catch (erro) {
      log.warn("chat", "Gemini indisponível, tentando DeepSeek", { erro: (erro as any)?.message });
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const resultado = await tentarComDeepSeek(mensagens, userId, attachments);
      return res.json(resultado);
    } catch (erro) {
      log.warn("chat", "DeepSeek indisponível, tentando Groq", { erro: (erro as any)?.message });
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const resultado = await tentarComGroq(mensagens, userId, attachments);
      return res.json(resultado);
    } catch (erro) {
      log.warn("chat", "Groq indisponível, caindo pra resposta local", { erro: (erro as any)?.message });
    }
  }

  return res.json(responderLocal());
});
