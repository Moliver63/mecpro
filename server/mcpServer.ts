/**
 * server/mcpServer.ts
 *
 * Servidor MCP do MecProAI — expõe dados/ações da plataforma pro Claude.
 *
 * FASE 1 (esta): tools de LEITURA apenas. list_projects, list_campaigns,
 * get_campaign, get_campaign_metrics, get_full_ads_report. Nenhuma tool
 * aqui cria, edita ou publica nada — é seguro, sem risco de gasto ou
 * efeito colateral.
 *
 * Autenticação: reaproveita o sistema de API key já existente
 * (server/publicApi.ts → authApiKey), não um sistema novo. Cada request
 * autenticada resolve um userId — e cada tool AQUI verifica posse antes
 * de devolver qualquer dado (nunca confia em campaignId/projectId vindo
 * do input sem checar se pertence ao usuário autenticado).
 *
 * Padrão de instância: um McpServer NOVO é criado por request (função
 * createMcpServerForUser), não um singleton global. Isso garante que o
 * userId de uma request nunca vaza pra outra — sem isso, um bug de
 * estado compartilhado poderia mostrar campanha de um cliente pra outro.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as db from "./db";
import { appRouter } from "./_core/router";
import { uploadBase64ImageToCloudinary, uploadImageBufferToCloudinary } from "./imageGeneration";

// ── Validação de imagem enviada em base64 ─────────────────────────────────
// Compartilhada entre upload_creative_image e generate_campaign (modo fotos
// reais em base64) — sem lib de imagem no projeto (sem sharp/image-size),
// então valida por assinatura de bytes (magic numbers) + tamanho, não por
// dimensão. Formatos aceitos: JPEG, PNG, WEBP.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB — folga do limite de 50MB do body, com margem pro overhead do base64/JSON

function decodeAndValidateImage(imageBase64: string): { ok: boolean; buffer: Buffer | null; error: string | null } {
  const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Clean, "base64");
  } catch {
    return { ok: false, buffer: null, error: "Base64 inválido — não foi possível decodificar a imagem." };
  }
  if (buffer.length === 0) return { ok: false, buffer: null, error: "Imagem vazia." };
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, buffer: null, error: `Imagem muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Máximo aceito: 12MB.` };
  }
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    return { ok: false, buffer: null, error: "Formato de imagem não reconhecido — envie JPEG, PNG ou WEBP." };
  }
  return { ok: true, buffer, error: null };
}

// ── Resolução de fileUrl — trata o caso especial do Google Drive ──────────
// Links de compartilhamento do Drive (.../file/d/ID/view, .../open?id=ID)
// devolvem a página HTML do visualizador, não o arquivo — content-type
// text/html, o que derrubava a validação de imagem com um erro genérico.
// normalizeGoogleDriveUrl() reescreve qualquer formato de link do Drive pro
// endpoint de download direto (uc?export=download&id=ID). Mesmo assim, o
// Drive às vezes devolve uma página de confirmação HTML ("não foi possível
// verificar vírus") em vez do arquivo — comportamento dele pra certos
// arquivos, não algo evitável só pela URL certa. fetchImageBuffer() detecta
// essa página, extrai o link de confirmação real e refaz o download uma vez
// antes de desistir com um erro acionável.
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;
const MAX_FILEURL_IMAGE_BYTES = 15 * 1024 * 1024;

function normalizeGoogleDriveUrl(url: string): string {
  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/,
    /drive\.google\.com\/open\?id=([^&]+)/,
    /drive\.google\.com\/uc\?.*[?&]id=([^&]+)/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

function looksLikeImage(contentType: string, fileUrl: string): boolean {
  if (contentType.startsWith("image/")) return true;
  // Muitos CDNs/Drive/S3 devolvem octet-stream ou vazio para imagens legítimas.
  // Nesse caso, cai pro fallback de extensão no nome/URL.
  if (!contentType || contentType === "application/octet-stream") {
    return IMAGE_EXT_RE.test(fileUrl);
  }
  return false;
}

async function fetchImageBuffer(
  rawUrl: string,
  timeoutMs = 20000
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const isDrive = /drive\.google\.com/.test(rawUrl);
  const url = isDrive ? normalizeGoogleDriveUrl(rawUrl) : rawUrl;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e: any) {
    return { ok: false, error: `Falha ao baixar a imagem de fileUrl: ${e?.message || "erro de rede"}.` };
  }
  if (!response.ok) {
    return { ok: false, error: `fileUrl retornou status ${response.status} — verifique se a URL é pública e acessível.` };
  }

  let contentType = response.headers.get("content-type") || "";
  let buffer = Buffer.from(await response.arrayBuffer());

  if (isDrive && contentType.startsWith("text/html")) {
    const html = buffer.toString("utf-8");
    const confirmMatch =
      html.match(/href="(\/uc\?export=download[^"]+)"/) ||
      html.match(/action="([^"]+)"[^>]*id="download-form"/);
    if (confirmMatch) {
      const confirmUrl = confirmMatch[1].startsWith("http")
        ? confirmMatch[1].replace(/&amp;/g, "&")
        : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, "&")}`;
      try {
        const retryRes = await fetch(confirmUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (retryRes.ok) {
          contentType = retryRes.headers.get("content-type") || "";
          buffer = Buffer.from(await retryRes.arrayBuffer());
        }
      } catch {
        // mantém o buffer/contentType da primeira tentativa; o check abaixo cobre o erro
      }
    }
  }

  if (isDrive && contentType.startsWith("text/html")) {
    return {
      ok: false,
      error:
        "Este link do Google Drive está bloqueando o download direto (página de confirmação do próprio Drive). " +
        "Baixe o arquivo manualmente e reenvie como base64, ou hospede em outro serviço (Cloudinary, Imgur etc.).",
    };
  }
  if (!looksLikeImage(contentType, url)) {
    return { ok: false, error: `fileUrl não aponta pra uma imagem (content-type: ${contentType || "desconhecido"}).` };
  }
  if (buffer.byteLength > MAX_FILEURL_IMAGE_BYTES) {
    return { ok: false, error: "Imagem baixada de fileUrl excede 15MB — use uma imagem menor." };
  }
  return { ok: true, buffer };
}

// ── Escopo de acesso por API key ──────────────────────────────────────────
// 'read' < 'write' < 'publish', hierárquico (quem tem 'publish' também pode
// tudo que 'write' e 'read' podem). Existe pra dar a clientes MCP menos
// confiáveis por padrão (ex: uma integração nova, testada pela primeira vez)
// acesso só de leitura, sem abrir publish_campaign — que gasta dinheiro real
// do cliente — antes de alguém decidir conscientemente elevar o escopo da key.
type McpScope = "read" | "write" | "publish";
const SCOPE_RANK: Record<McpScope, number> = { read: 0, write: 1, publish: 2 };

function hasScope(userScope: McpScope, required: McpScope): boolean {
  return SCOPE_RANK[userScope] >= SCOPE_RANK[required];
}

function scopeErrorContent(required: McpScope, userScope: McpScope) {
  return {
    content: [{
      type: "text" as const,
      text:
        `Esta API key tem escopo '${userScope}' e essa ferramenta exige '${required}'. ` +
        `Gere ou eleve o escopo de uma API key em Configurações → API Keys no MecProAI ` +
        `pra liberar esta ação.`,
    }],
    isError: true,
  };
}

export function createMcpServerForUser(userId: number, scope: McpScope = "publish"): McpServer {
  const server = new McpServer({ name: "mecproai", version: "1.0.0" });

  // Cria um "caller" tRPC autenticado sob demanda — usado só pelas tools da
  // Fase 3, que precisam invocar procedures reais (upload de imagem,
  // resolver página, publicar) sem reimplementar nenhuma lógica deles.
  // Preguiçoso porque buscar o usuário é assíncrono e essa função é síncrona.
  async function getCaller() {
    const user = await db.getUserById(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    return appRouter.createCaller({ req: {} as any, res: {} as any, user } as any);
  }

  // ── list_projects ──────────────────────────────────────────────────────
  server.registerTool(
    "list_projects",
    {
      title: "Listar projetos",
      description:
        "Lista todos os projetos (clientes/negócios) do usuário autenticado. " +
        "Cada projeto pode ter uma ou mais campanhas. Use isso primeiro pra " +
        "descobrir os projectId antes de listar campanhas de um projeto específico.",
      inputSchema: {},
    },
    async () => {
      const projects = await db.getProjectsByUserId(userId);
      const summary = projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        niche: p.niche || null,
        createdAt: p.createdAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        structuredContent: { projects: summary },
      };
    }
  );

  // ── list_campaigns ──────────────────────────────────────────────────────
  server.registerTool(
    "list_campaigns",
    {
      title: "Listar campanhas",
      description:
        "Lista campanhas do usuário autenticado. Se projectId for informado, " +
        "lista só as campanhas daquele projeto — senão, lista de todos os " +
        "projetos do usuário. Retorna resumo (id, nome, status, orçamento); " +
        "use get_campaign pra detalhe completo de uma campanha específica.",
      inputSchema: {
        projectId: z.number().int().positive().optional()
          .describe("ID do projeto (opcional). Sem isso, lista campanhas de todos os projetos do usuário."),
      },
    },
    async ({ projectId }) => {
      let projectIds: number[];
      if (projectId) {
        const project = await db.getProjectById(projectId);
        if (!project || (project as any).userId !== userId) {
          return {
            content: [{ type: "text", text: `Projeto ${projectId} não encontrado ou não pertence a este usuário.` }],
            isError: true,
          };
        }
        projectIds = [projectId];
      } else {
        const projects = await db.getProjectsByUserId(userId);
        projectIds = projects.map((p: any) => p.id);
      }

      const all: any[] = [];
      for (const pid of projectIds) {
        const camps = await db.getCampaignsByProjectId(pid);
        for (const c of camps as any[]) {
          all.push({
            id: c.id,
            projectId: c.projectId,
            name: c.name,
            publishStatus: c.publishStatus || "draft",
            generatedAt: c.generatedAt,
            suggestedBudgetDaily: c.suggestedBudgetDaily ?? null,
            suggestedBudgetMonthly: c.suggestedBudgetMonthly ?? null,
            metaCampaignId: c.metaCampaignId || null,
          });
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(all, null, 2) }],
        structuredContent: { campaigns: all },
      };
    }
  );

  // ── get_campaign ─────────────────────────────────────────────────────────
  server.registerTool(
    "get_campaign",
    {
      title: "Detalhar campanha",
      description:
        "Retorna detalhes completos de uma campanha específica — objetivo, " +
        "orçamento, status de publicação, e um resumo de quantos ad sets e " +
        "criativos ela tem. Só funciona se a campanha pertencer ao usuário " +
        "autenticado.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (obtido via list_campaigns)."),
      },
    },
    async ({ campaignId }) => {
      const c: any = await db.getCampaignById(campaignId);
      if (!c) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(c.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const adSets  = (() => { try { return JSON.parse(c.adSets || "[]"); } catch { return []; } })();
      const creatives = (() => { try { return JSON.parse(c.creatives || "[]"); } catch { return []; } })();

      const detail = {
        id: c.id,
        projectId: c.projectId,
        projectName: project.name,
        name: c.name,
        objective: c.objective || null,
        publishStatus: c.publishStatus || "draft",
        generatedAt: c.generatedAt,
        publishedAt: c.publishedAt || null,
        suggestedBudgetDaily: c.suggestedBudgetDaily ?? null,
        suggestedBudgetMonthly: c.suggestedBudgetMonthly ?? null,
        durationDays: c.durationDays ?? null,
        metaCampaignId: c.metaCampaignId || null,
        metaAdSetId: c.metaAdSetId || null,
        metaAdId: c.metaAdId || null,
        metaCreativeId: c.metaCreativeId || null,
        adSetsCount: Array.isArray(adSets) ? adSets.length : 0,
        creativesCount: Array.isArray(creatives) ? creatives.length : 0,
        adSets,
        creatives,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
        structuredContent: detail,
      };
    }
  );

  // ── get_campaign_metrics ───────────────────────────────────────────────
  server.registerTool(
    "get_campaign_metrics",
    {
      title: "Métricas diárias de uma campanha",
      description:
        "Retorna a série temporal diária de performance real da Meta " +
        "(impressões, cliques, gasto, CTR, CPC, CPM, alcance, frequência, " +
        "leads, compras, ROAS) para uma campanha já publicada. Útil pra " +
        "analisar tendência ao longo do tempo, não só o total acumulado. " +
        "Só funciona se a campanha pertencer ao usuário autenticado.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (obtido via list_campaigns)."),
        days: z.number().int().min(1).max(90).optional()
          .describe("Quantos dias pra trás buscar (padrão: 30, máximo: 90)."),
      },
    },
    async ({ campaignId, days }) => {
      const c: any = await db.getCampaignById(campaignId);
      if (!c) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(c.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const rows = await db.getCampaignMetricsDaily(campaignId, days || 30);
      if (rows.length === 0) {
        return {
          content: [{
            type: "text",
            text: `Nenhuma métrica diária registrada ainda para a campanha ${campaignId}. ` +
              `Isso é normal se a campanha foi publicada recentemente (o sync roda a cada 24h) ` +
              `ou se ela não está ativa na Meta no momento.`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        structuredContent: { campaignId, days: days || 30, metrics: rows },
      };
    }
  );

  // ── get_full_ads_report ──────────────────────────────────────────────────
  // Diferente de get_campaign_metrics acima (que dá a série diária de UMA
  // campanha já publicada pelo MecProAI, vinda do sync interno), esta tool
  // busca DIRETO nas APIs oficiais de Meta, Google Ads e TikTok — cobre
  // TODAS as campanhas da conta conectada (não só as criadas por aqui) e
  // traz quebras (breakdowns) por idade/gênero, posicionamento e dispositivo
  // que o MCP padrão de cada plataforma normalmente não expõe. Reusa a
  // procedure tRPC unified.getFullReport — nenhuma lógica de API duplicada.
  server.registerTool(
    "get_full_ads_report",
    {
      title: "Relatório completo Meta / Google / TikTok",
      description:
        "Traz um relatório completo e granular de métricas de anúncios, " +
        "direto das APIs oficiais Meta Ads, Google Ads e TikTok Ads — não do " +
        "MCP padrão de cada plataforma. Inclui totais consolidados, métricas " +
        "por campanha, e quebras (breakdowns) por idade/gênero, " +
        "posicionamento/plataforma e dispositivo (Meta), por dispositivo " +
        "com conversões reais (Google), e por idade/gênero (TikTok). Use " +
        "quando o usuário pedir 'relatório', 'métricas', 'performance' ou " +
        "'como estão minhas campanhas' na Meta, Google ou TikTok. Requer " +
        "que a integração da plataforma já esteja configurada em " +
        "Configurações — plataformas sem integração aparecem no relatório " +
        "com configured:false, sem quebrar o restante.",
      inputSchema: {
        platforms: z.array(z.enum(["meta", "google", "tiktok"])).optional()
          .describe("Quais plataformas incluir. Padrão: todas as três (meta, google, tiktok)."),
        period: z.enum(["7d", "30d", "90d"]).optional()
          .describe("Janela de tempo do relatório. Padrão: 30d."),
      },
    },
    async ({ platforms, period }) => {
      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao autenticar: ${e.message}` }], isError: true };
      }
      try {
        const result = await caller.unified.getFullReport({
          platforms: platforms || ["meta", "google", "tiktok"],
          period: period || "30d",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as any,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao gerar relatório: ${e.message}` }], isError: true };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — tools de escrita (criar/editar). Ainda NÃO publica na Meta —
  // isso é a Fase 3, deliberadamente separada por ser a parte que gasta
  // dinheiro real. Tudo aqui reusa exatamente a mesma lógica dos endpoints
  // tRPC reais (checkPlanLimit, generateCampaign de ai.ts) — o MCP não
  // reimplementa regra de negócio nenhuma, só entrega dados estruturados
  // pro motor que já existe.
  // ═══════════════════════════════════════════════════════════════════════

  // ── create_project ───────────────────────────────────────────────────────
  server.registerTool(
    "create_project",
    {
      title: "Criar projeto (cliente)",
      description:
        "Cria um novo projeto no MecProAI — o 'container' que representa um " +
        "cliente/negócio. Toda campanha precisa pertencer a um projeto. Use " +
        "list_projects primeiro pra checar se o cliente já não tem um projeto.",
      inputSchema: {
        name: z.string().min(2).describe("Nome do projeto/cliente (ex: 'Clínica Dr. Silva')."),
        description: z.string().optional().describe("Descrição breve opcional."),
      },
    },
    async ({ name, description }) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const check = await db.checkPlanLimit(userId, "projects");
      if (!check.allowed) {
        return { content: [{ type: "text", text: `Não foi possível criar: ${check.reason}` }], isError: true };
      }
      const project: any = await db.createProject({ name, description, userId } as any);
      return {
        content: [{ type: "text", text: `Projeto criado: "${project.name}" (id: ${project.id})` }],
        structuredContent: { id: project.id, name: project.name },
      };
    }
  );

  // ── set_client_profile ───────────────────────────────────────────────────
  server.registerTool(
    "set_client_profile",
    {
      title: "Definir perfil do cliente",
      description:
        "Preenche ou atualiza o perfil do cliente de um projeto — nicho, público-alvo, " +
        "dor principal, proposta de valor, objeções, site. Quanto mais completo, melhor " +
        "a qualidade da copy que a IA do MecProAI vai gerar. Chame isso ANTES de " +
        "generate_campaign — a geração usa esses dados como contexto principal.",
      inputSchema: {
        projectId: z.number().int().positive().describe("ID do projeto (de create_project ou list_projects)."),
        companyName: z.string().describe("Nome da empresa/cliente."),
        niche: z.string().describe("Nicho/segmento de mercado (ex: 'clínica odontológica', 'e-commerce de moda')."),
        productService: z.string().describe("O que a empresa vende — produto ou serviço."),
        targetAudience: z.string().optional().describe("Público-alvo (ex: 'mulheres 25-45, classe B/C, interessadas em bem-estar')."),
        mainPain: z.string().optional().describe("Principal dor/problema que o público tem."),
        desiredTransformation: z.string().optional().describe("O que o público quer alcançar/se tornar."),
        uniqueValueProposition: z.string().optional().describe("O que diferencia essa empresa da concorrência."),
        mainObjections: z.string().optional().describe("Principais objeções de compra que o público costuma ter."),
        campaignObjective: z.enum(["leads", "sales", "branding", "traffic", "engagement"]).optional(),
        monthlyBudget: z.number().optional().describe("Orçamento mensal de mídia em reais."),
        websiteUrl: z.string().optional().describe("Site da empresa (com ou sem https://)."),
        socialLinks: z.string().optional().describe("Links de redes sociais (Instagram, Facebook etc), texto livre."),
        businessScope: z.enum(["local", "regional", "national", "global"]).optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      },
    },
    async (input) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const project: any = await db.getProjectById(input.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Projeto ${input.projectId} não encontrado ou não pertence a este usuário.` }], isError: true };
      }
      // Mesma normalização do endpoint real (clientProfileRouter.upsert):
      // aceita "www.site.com.br", "site.com" etc e sempre grava com https://
      const websiteUrl = (() => {
        const raw = String(input.websiteUrl || "").trim();
        if (!raw) return undefined;
        if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
        const lower = raw.toLowerCase().replace(/\s+/g, "");
        if (/^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}(\/.*)?$/.test(lower)) return `https://${lower}`;
        return raw;
      })();
      await db.upsertClientProfile({ ...input, websiteUrl } as any);
      return {
        content: [{ type: "text", text: `Perfil do cliente salvo para o projeto ${input.projectId} (${project.name}).` }],
      };
    }
  );

  // ── generate_campaign ────────────────────────────────────────────────────
  server.registerTool(
    "generate_campaign",
    {
      title: "Gerar campanha",
      description:
        "Dispara o motor de geração de campanha do MecProAI — a mesma lógica de IA " +
        "que roda quando alguém clica 'gerar' na interface (copy, criativos, orçamento " +
        "por ad set, auditoria de qualidade). NÃO publica na Meta — só cria o rascunho " +
        "da campanha. Chame set_client_profile antes, se o projeto ainda não tiver perfil " +
        "preenchido — a qualidade da copy depende disso. Pode demorar até 50s (é IA real gerando).",
      inputSchema: {
        projectId: z.number().int().positive(),
        name: z.string().describe("Nome da campanha."),
        objective: z.string().describe("Objetivo (ex: 'sales', 'leads', 'traffic', 'branding')."),
        platform: z.string().describe("Plataforma (ex: 'meta', 'google', 'tiktok')."),
        budget: z.number().positive().describe("Orçamento total em reais."),
        duration: z.number().int().positive().describe("Duração em dias."),
        extraContext: z.string().optional().describe("Contexto adicional livre pra IA considerar."),
        ageMin: z.number().int().min(13).max(65).optional(),
        ageMax: z.number().int().min(18).max(65).optional(),
        locationMode: z.enum(["brasil", "paises", "raio", "cidade"]).optional(),
        regions: z.array(z.string()).optional().describe("Estados do Brasil (sigla), se locationMode='brasil'."),
        countries: z.array(z.string()).optional().describe("Países, se locationMode='paises'."),
        geoCity: z.string().optional().describe("Cidade, se locationMode='raio'."),
        geoRadius: z.number().optional().describe("Raio em km, se locationMode='raio'."),
        mediaFormat: z.string().optional().describe("Formato de mídia (ex: 'image', 'video', 'carousel', 'mixed')."),
        audienceProfile: z.string().optional(),
        // ── Fotos reais do cliente (mesmo "modo upload" que a interface web já tem) ──
        // Antes, só a interface conseguia acionar esse modo — a tool MCP não expunha
        // esses campos, então uma campanha gerada por aqui nunca podia usar fotos
        // reais desde a geração (só dava pra trocar 1 imagem por vez, depois, via
        // upload_creative_image). Agora o caminho fica igual em ambos os canais.
        uploadedImages: z.array(z.string()).optional().describe(
          "URLs https públicas das fotos reais do cliente. Combina com realPhotosBase64 se ambos " +
          "forem informados. Quando informado, cada criativo usa UMA foto real em vez de gerar por " +
          "IA, e a quantidade de criativos passa a acompanhar a quantidade de fotos (a menos que " +
          "numCreatives seja informado)."
        ),
        realPhotosBase64: z.array(z.object({
          imageBase64: z.string().describe("Conteúdo da foto em base64 (com ou sem prefixo data:image/...;base64,)."),
          fileName: z.string().optional().describe("Nome do arquivo, com extensão (ex: foto-cliente-1.jpg)."),
        })).optional().describe(
          "Fotos reais do cliente enviadas em base64 (ex: fotos que o usuário mandou direto na " +
          "conversa) — sobe cada uma pro Cloudinary automaticamente ANTES de gerar a campanha, sem " +
          "precisar gerar primeiro e trocar imagem depois. Cada JPEG/PNG/WEBP até 12MB. Combina com " +
          "uploadedImages se ambos forem informados (essas entram depois das URLs já públicas)."
        ),
        numCreatives: z.number().int().min(2).max(10).optional().describe(
          "Quantidade de criativos a gerar (2-10). Se omitido: usa 1 por foto (uploadedImages + " +
          "realPhotosBase64 combinadas), ou 4 (padrão) se nenhuma foto real for informada. Cada " +
          "criativo recebe copy própria e distinta — é isso que evita headline/texto repetido entre " +
          "os cards de um carrossel."
        ),
      },
    },
    async (input) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      const project: any = await db.getProjectById(input.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Projeto ${input.projectId} não encontrado ou não pertence a este usuário.` }], isError: true };
      }
      const check = await db.checkPlanLimit(userId, "campaigns", { projectId: input.projectId });
      if (!check.allowed) {
        return { content: [{ type: "text", text: `Não foi possível gerar: ${check.reason}` }], isError: true };
      }

      // ── Sobe fotos reais em base64 pro Cloudinary ANTES de gerar ─────────
      // Une com uploadedImages (URLs já públicas) — resultado único vira o
      // realImages passado pra generateCampaign. Falha em QUALQUER foto
      // aborta a geração (evita gastar tokens de IA num briefing incompleto,
      // com uma foto faltando do que o usuário pediu).
      //
      // (sessão 34, 13/08) — coleta labels do Google Vision (já usado no
      // fluxo web via imageRAG.ts, aqui reaproveitado) pra alimentar a copy
      // com sinais visuais sutis. Best-effort: se o Vision falhar numa foto,
      // simplesmente não contribui labels — NUNCA aborta a geração por isso
      // (diferente da validação de imagem em si, que é obrigatória).
      const uploadedFromBase64: string[] = [];
      const visualLabelsSet = new Set<string>();
      if (input.realPhotosBase64?.length) {
        const { analyzeImageWithVision } = await import("./imageRAG");
        for (let i = 0; i < input.realPhotosBase64.length; i++) {
          const photo = input.realPhotosBase64[i];
          const decoded = decodeAndValidateImage(photo.imageBase64);
          if (!decoded.ok || !decoded.buffer) {
            return { content: [{ type: "text", text: `Foto ${i + 1}/${input.realPhotosBase64.length} (${photo.fileName || "sem nome"}) inválida: ${decoded.error}` }], isError: true };
          }
          const cloudUrl = await uploadImageBufferToCloudinary(
            decoded.buffer,
            photo.fileName || `campaign-photo-${input.projectId}-${i}-${Date.now()}.jpg`,
          );
          if (!cloudUrl) {
            return { content: [{ type: "text", text: `Falha ao subir a foto ${i + 1}/${input.realPhotosBase64.length} pro Cloudinary. Verifique as credenciais do Cloudinary no servidor.` }], isError: true };
          }
          uploadedFromBase64.push(cloudUrl);

          try {
            const vision = await analyzeImageWithVision(cloudUrl);
            if (vision?.labels?.length) vision.labels.slice(0, 4).forEach((l: string) => visualLabelsSet.add(l));
            if (vision?.objects?.length) vision.objects.slice(0, 3).forEach((o: string) => visualLabelsSet.add(o));
          } catch {
            // Vision indisponível ou erro — segue sem labels dessa foto, sem abortar.
          }
        }
      }
      const allRealImages = [...(input.uploadedImages || []), ...uploadedFromBase64];
      const visualLabels = Array.from(visualLabelsSet).slice(0, 8); // limite pra não sobrecarregar o prompt

      const { generateCampaign } = await import("./ai");
      const segmentContext = [
        input.extraContext || "",
        (input.regions?.length)   ? "Regioes: " + input.regions.join(", ")                         : "",
        (input.countries?.length) ? "Paises: "  + input.countries.join(", ")                       : "",
        input.geoCity             ? "Raio de "  + (input.geoRadius || 15) + "km em " + input.geoCity : "",
        (input.ageMin && input.ageMax) ? "Faixa etaria: " + input.ageMin + "-" + input.ageMax + " anos" : "",
        (input.mediaFormat && input.mediaFormat !== "mixed") ? "Formato de midia: " + input.mediaFormat : "",
      ].filter(Boolean).join(". ");

      const campaignPromise = generateCampaign({
        projectId: input.projectId, userId, name: input.name, objective: input.objective,
        platform: input.platform, budget: input.budget, duration: input.duration,
        extraContext: segmentContext, ageMin: input.ageMin, ageMax: input.ageMax,
        regions: input.regions, countries: input.countries, locationMode: input.locationMode,
        geoCity: input.geoCity, geoRadius: input.geoRadius, mediaFormat: input.mediaFormat,
        realImages: allRealImages.length ? allRealImages : undefined,
        visualLabels: visualLabels.length ? visualLabels : undefined,
        numCreatives: input.numCreatives,
      } as any);
      // (sessão 32, 13/08) — timeout escalado por quantidade de imagens reais.
      // O upload pro Cloudinary (linhas acima) já terminou antes daqui, então
      // não entra nessa corrida — mas a análise Vision de cada imagem (quando
      // habilitada) roda DENTRO do generateCampaign, e pode empurrar o tempo
      // total além dos 50s fixos com várias fotos. +4s por imagem, teto de 120s
      // pra não deixar uma chamada travada indefinidamente em caso de problema
      // real no motor de IA.
      const timeoutMs = Math.min(50_000 + allRealImages.length * 4_000, 120_000);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          `A geração demorou mais que o esperado (>${Math.round(timeoutMs / 1000)}s). Verifique list_campaigns em alguns segundos — ela pode ter sido criada com sucesso mesmo assim.`
        )), timeoutMs)
      );

      try {
        const campaign: any = await Promise.race([campaignPromise, timeoutPromise]);
        return {
          content: [{ type: "text", text: `Campanha gerada: "${campaign.name || input.name}" (id: ${campaign.id}) no projeto ${project.name}. Ainda não publicada na Meta.` }],
          structuredContent: { id: campaign.id, name: campaign.name || input.name, projectId: input.projectId },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message || "Falha ao gerar a campanha." }], isError: true };
      }
    }
  );

  // ── upload_creative_image ────────────────────────────────────────────────
  // Substitui a imagem de um criativo específico (gerada por IA) por uma
  // imagem enviada manualmente pelo usuário (ex: foto real do cliente).
  // Reaproveita duas peças já existentes e testadas — nenhuma lógica nova
  // de upload/storage é criada aqui:
  //   1. uploadBase64ImageToCloudinary (server/imageGeneration.ts) — mesma
  //      função que o gerador de imagem por IA usa pra subir pro Cloudinary.
  //   2. campaigns.updateCreativeImage (server/_core/router.ts) — mesma
  //      procedure que a tela de edição de criativo usa pra trocar imagem.
  // Ainda é Fase 2 (rascunho) — não gasta orçamento, não publica nada.
  //
  // (sessão 31, 12/08) — aceita fileUrl como alternativa ao imageBase64.
  // Motivo: Base64 infla o payload em ~33% e pode bater limite de tamanho
  // de requisição em clientes MCP diferentes (ex: ChatGPT/outros agentes),
  // especialmente com múltiplas imagens. fileUrl evita reencodar o arquivo
  // inteiro como string — o servidor baixa a imagem direto da URL e reusa
  // exatamente o mesmo pipeline de validação+upload que o Base64 já usa
  // (mesma função uploadImageBufferToCloudinary, só muda como o buffer
  // chega). Nenhum dos dois é obrigatório sozinho — exatamente um dos dois
  // precisa vir preenchido.
  server.registerTool(
    "upload_creative_image",
    {
      title: "Enviar imagem manual pra um criativo",
      description:
        "Substitui a imagem gerada por IA de um criativo específico da " +
        "campanha por uma imagem enviada manualmente (ex: foto real do " +
        "cliente). Sobe a imagem pro Cloudinary e atualiza o rascunho da " +
        "campanha — não publica nada na Meta. Chame get_campaign antes pra " +
        "saber o creativeIndex certo. Informe imageBase64 OU fileUrl (nunca " +
        "os dois) — fileUrl é preferível quando a imagem já está hospedada " +
        "em algum lugar acessível, pois evita payload grande.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (de get_campaign/list_campaigns)."),
        creativeIndex: z.number().int().min(0).describe("Índice do criativo dentro da campanha (0 = primeiro)."),
        format: z.enum(["feed", "stories", "square"]).describe(
          "Formato/aspect ratio de destino: feed (4:5), stories (9:16) ou square (1:1). " +
          "Uma mesma foto normalmente não serve pros 3 formatos sem cortar errado — " +
          "confirme com o usuário qual formato ele quer trocar."
        ),
        imageBase64: z.string().optional().describe(
          "Conteúdo da imagem em base64 (com ou sem prefixo data:image/...;base64,). " +
          "Use isso OU fileUrl, não os dois."
        ),
        fileUrl: z.string().url().optional().describe(
          "URL pública HTTPS de onde baixar a imagem (preferível a imageBase64 " +
          "quando disponível — evita payload grande, especialmente com várias " +
          "imagens). Use isso OU imageBase64, não os dois."
        ),
        fileName: z.string().describe("Nome do arquivo, com extensão (ex: foto-cliente.jpg)."),
      },
    },
    async ({ campaignId, creativeIndex, format, imageBase64, fileUrl, fileName }) => {
      if (!hasScope(scope, "write")) return scopeErrorContent("write", scope);
      // ── checagem de posse — mesmo padrão de get_campaign ──────────────
      const campaign: any = await db.getCampaignById(campaignId);
      if (!campaign) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(campaign.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${campaignId} não pertence a este usuário.` }], isError: true };
      }

      const creatives = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();
      if (!creatives[creativeIndex]) {
        return { content: [{ type: "text", text: `Criativo de índice ${creativeIndex} não existe nessa campanha (ela tem ${creatives.length}).` }], isError: true };
      }

      // ── validação: exatamente uma fonte de imagem precisa vir preenchida ──
      if (!imageBase64 && !fileUrl) {
        return { content: [{ type: "text", text: "Informe imageBase64 ou fileUrl." }], isError: true };
      }
      if (imageBase64 && fileUrl) {
        return { content: [{ type: "text", text: "Informe apenas um: imageBase64 OU fileUrl, não os dois." }], isError: true };
      }

      // ── resolve o buffer da imagem, seja por Base64 ou por download da URL ──
      let buffer: Buffer;
      if (fileUrl) {
        const result = await fetchImageBuffer(fileUrl, 15000);
        if (!result.ok) {
          return { content: [{ type: "text", text: result.error }], isError: true };
        }
        buffer = result.buffer;
      } else {
        // ── validação do payload — helper compartilhado com generate_campaign ──
        const decoded = decodeAndValidateImage(imageBase64!);
        if (!decoded.ok || !decoded.buffer) {
          return { content: [{ type: "text", text: decoded.error || "Imagem inválida." }], isError: true };
        }
        buffer = decoded.buffer;
      }

      // ── upload pro Cloudinary (mesma função que o gerador de IA usa) ──
      const cloudUrl = await uploadImageBufferToCloudinary(buffer, fileName || `manual-${campaignId}-${creativeIndex}-${Date.now()}.jpg`);
      if (!cloudUrl) {
        return { content: [{ type: "text", text: "Falha ao subir a imagem pro Cloudinary. Verifique as credenciais do Cloudinary no servidor." }], isError: true };
      }

      // ── atualiza o criativo via a MESMA procedure que a tela usa ──────
      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
      try {
        const result: any = await caller.campaigns.updateCreativeImage({
          campaignId, creativeIndex, format, imageUrl: cloudUrl,
        } as any);
        return {
          content: [{ type: "text", text: `Imagem do criativo ${creativeIndex} (${format}) atualizada com sucesso.\nURL: ${cloudUrl}` }],
          structuredContent: { ok: true, imageUrl: cloudUrl, creativeIndex, format, creative: result?.creative ?? null },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Upload pro Cloudinary funcionou, mas falhou ao salvar no criativo: ${e.message}` }], isError: true };
      }
    }
  );


  // ── upload_campaign_images (lote) ────────────────────────────────────
  server.registerTool(
    "upload_campaign_images",
    {
      title: "Enviar várias imagens para uma campanha",
      description:
        "Envia várias fotos reais de uma só vez para os criativos da campanha. " +
        "Aceita URLs públicas ou base64 e distribui as imagens na ordem recebida.",
      inputSchema: {
        campaignId: z.number().int().positive(),
  
        images: z.array(
          z.object({
            fileUrl: z.string().url().optional(),
            imageBase64: z.string().optional(),
            fileName: z.string(),
            creativeIndex: z.number().int().min(0).optional(),
            format: z
              .enum(["feed", "stories", "square"])
              .default("feed"),
          })
        ).min(1).max(10),
      },
    },
  
    async ({ campaignId, images }) => {
      if (!hasScope(scope, "write")) {
        return scopeErrorContent("write", scope);
      }
  
      const campaign: any = await db.getCampaignById(campaignId);
  
      if (!campaign) {
        return {
          content: [{
            type: "text",
            text: `Campanha ${campaignId} não encontrada.`,
          }],
          isError: true,
        };
      }
  
      const project: any = await db.getProjectById(campaign.projectId);
  
      if (!project || project.userId !== userId) {
        return {
          content: [{
            type: "text",
            text: `Campanha ${campaignId} não pertence a este usuário.`,
          }],
          isError: true,
        };
      }
  
      const creatives = (() => {
        try {
          return JSON.parse(campaign.creatives || "[]");
        } catch {
          return [];
        }
      })();

      let caller;
      try {
        caller = await getCaller();
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text:
              "Conector MECProAI disponível, mas falhou ao preparar o contexto interno antes do upload. " +
              `Detalhe: ${error?.message || "erro desconhecido"}`,
          }],
          structuredContent: {
            campaignId,
            successCount: 0,
            total: images.length,
            errorType: "connector_runtime",
            stage: "prepare_trpc_caller",
            reachedTool: true,
            reachedRender: true,
            reachedCloudinary: false,
            reachedImageValidator: false,
          },
          isError: true,
        };
      }

      async function processOne(image: (typeof images)[number], index: number) {
        const creativeIndex =
          image.creativeIndex !== undefined ? image.creativeIndex : index;
  
        if (!creatives[creativeIndex]) {
          return {
            index,
            creativeIndex,
            success: false,
            errorType: "campaign_validation",
            stage: "creative_lookup",
            error: "Criativo não encontrado",
          };
        }
  
        if (
          (!image.fileUrl && !image.imageBase64) ||
          (image.fileUrl && image.imageBase64)
        ) {
          return {
            index,
            creativeIndex,
            success: false,
            errorType: "payload_validation",
            stage: "source_selection",
            error: "Informe fileUrl OU imageBase64.",
          };
        }
  
        try {
          let buffer: Buffer;
  
          // URL
          if (image.fileUrl) {
            const result = await fetchImageBuffer(image.fileUrl, 20000);
            if (!result.ok) {
              return {
                index,
                creativeIndex,
                success: false,
                errorType: "file_download",
                stage: "fetch_file_url",
                reachedImageValidator: false,
                reachedCloudinary: false,
                error: result.error,
              };
            }
            buffer = result.buffer;
          }
  
          // BASE64
          else {
            const decoded = decodeAndValidateImage(image.imageBase64!);
  
            if (!decoded.ok || !decoded.buffer) {
              return {
                index,
                creativeIndex,
                success: false,
                errorType: "payload_validation",
                stage: "decode_image_base64",
                reachedImageValidator: true,
                reachedCloudinary: false,
                error: decoded.error || "Imagem inválida",
              };
            }
  
            buffer = decoded.buffer;
          }
  
          const cloudUrl = await uploadImageBufferToCloudinary(buffer, image.fileName);
  
          if (!cloudUrl) {
            return {
              index,
              creativeIndex,
              success: false,
              errorType: "cloudinary_upload",
              stage: "upload_cloudinary",
              reachedImageValidator: true,
              reachedCloudinary: true,
              error: "Falha no upload para Cloudinary",
            };
          }

          try {
            await caller.campaigns.updateCreativeImage({
              campaignId,
              creativeIndex,
              format: image.format,
              imageUrl: cloudUrl,
            } as any);
          } catch (error: any) {
            return {
              index,
              creativeIndex,
              success: false,
              errorType: "creative_update",
              stage: "save_creative_image",
              reachedImageValidator: true,
              reachedCloudinary: true,
              imageUrl: cloudUrl,
              error: error?.message || "Upload feito, mas falhou ao salvar no criativo",
            };
          }
  
          return {
            index,
            creativeIndex,
            success: true,
            errorType: null,
            stage: "completed",
            reachedImageValidator: true,
            reachedCloudinary: true,
            imageUrl: cloudUrl,
          };
        } catch (error: any) {
          return {
            index,
            creativeIndex,
            success: false,
            errorType: "unexpected",
            stage: "process_image",
            error: error?.message || "Erro desconhecido",
          };
        }
      }
  
      // Paralelo (limitado pelo próprio Promise.allSettled na ordem dos itens),
      // já que cada imagem escreve em um creativeIndex/format diferente e não
      // há dependência sequencial entre elas.
      const settled = await Promise.allSettled(
        images.map((image, i) => processOne(image, i))
      );
  
      const results = settled.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              index: i,
              creativeIndex: images[i].creativeIndex ?? i,
              success: false,
              errorType: "unexpected",
              stage: "promise_settlement",
              error: r.reason?.message || "Erro desconhecido",
            }
      );
  
      const successCount = results.filter(r => r.success).length;
      const failedByType = results.reduce<Record<string, number>>((acc, result: any) => {
        if (!result.success) {
          const type = result.errorType || "unknown";
          acc[type] = (acc[type] || 0) + 1;
        }
        return acc;
      }, {});
      const firstError = results.find((r: any) => !r.success);
  
      return {
        content: [{
          type: "text",
          text:
            `${successCount}/${images.length} imagens enviadas para a campanha ${campaignId}.` +
            (firstError
              ? ` Primeira falha: ${firstError.stage || "etapa desconhecida"} (${firstError.errorType || "erro"}): ${firstError.error}`
              : ""),
        }],
  
        structuredContent: {
          campaignId,
          successCount,
          total: images.length,
          failedByType,
          results,
        },
  
        isError: successCount === 0,
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 — publicação real na Meta. A PARTIR DAQUI, gasta orçamento real
  // do cliente. Toda a lógica de negócio (upload de imagem, resolução de
  // página, criação de campaign/adset/ad na Meta) é feita pelos MESMOS
  // procedures tRPC que a interface usa — via createCaller, nunca
  // reimplementada aqui. O papel dessas tools é só orquestrar a ordem
  // certa de chamadas, igual o botão "Publicar" da tela já faz.
  // ═══════════════════════════════════════════════════════════════════════

  // ── list_meta_pages ───────────────────────────────────────────────────
  server.registerTool(
    "list_meta_pages",
    {
      title: "Listar Páginas do Facebook conectadas",
      description:
        "Lista as Páginas do Facebook que a conta Meta do usuário tem acesso — " +
        "necessário pra saber qual pageId usar em publish_campaign. Chame isso " +
        "antes de publicar, se o usuário não souber o pageId de cor.",
      inputSchema: {},
    },
    async () => {
      // Mesmo escopo de publish_campaign: em si list_meta_pages não gasta dinheiro,
      // mas ela só existe pra alimentar o pageId de publish_campaign — deixá-la aberta
      // com escopo 'write' não vazaria dado sensível, mas sinalizaria pro cliente MCP
      // que o próximo passo (publicar) está disponível quando não está. Trava igual.
      if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
      const integration: any = await db.getApiIntegration(userId, "meta");
      if (!integration?.accessToken) {
        return { content: [{ type: "text", text: "Conta Meta não conectada. Acesse Configurações → Meta Ads no MecProAI primeiro." }], isError: true };
      }
      try {
        const res = await fetch(
          `https://graph.facebook.com/v20.0/me/accounts?fields=id,name&limit=50&access_token=${integration.accessToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const data: any = await res.json();
        if (data.error) {
          return { content: [{ type: "text", text: `Erro ao buscar páginas: ${data.error.message}` }], isError: true };
        }
        const pages = (data.data || []).map((p: any) => ({ pageId: p.id, name: p.name }));
        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
          structuredContent: { pages },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao consultar a Meta: ${e.message}` }], isError: true };
      }
    }
  );

  // ── publish_campaign ─────────────────────────────────────────────────────
  server.registerTool(
    "publish_campaign",
    {
      title: "Publicar campanha na Meta",
      description:
        "PUBLICA a campanha na Meta Ads DE VERDADE — a partir daqui, o orçamento " +
        "real do cliente começa a ser gasto. NUNCA chame isso sem confirmação " +
        "explícita do usuário sobre orçamento, página e público antes. Publica " +
        "todos os ad sets da campanha (ou só os índices indicados), reaproveitando " +
        "a mesma campanha na Meta entre eles. Usa as imagens já geradas pelo " +
        "generate_campaign — se houver 2+ imagens distintas nos criativos, publica " +
        "como carrossel automaticamente; não gera imagem nova.\n\n" +
        "IDEMPOTÊNCIA: sempre gere um idempotencyKey único (ex: UUID v4) na " +
        "primeira vez que chamar essa tool pra uma dada intenção de publicação, " +
        "e reenvie o MESMO valor se precisar repetir a chamada (timeout, erro " +
        "de rede, retry automático). Isso evita publicar a campanha duas vezes " +
        "e gastar orçamento em dobro. Nunca gere uma key nova só porque a " +
        "resposta demorou ou pareceu falhar — reenvie a key original.",
      inputSchema: {
        campaignId: z.number().int().positive(),
        pageId: z.string().describe("ID da Página do Facebook (use list_meta_pages se não souber)."),
        destination: z.enum(["website", "lead_form"]).optional().describe("Padrão: website."),
        linkUrl: z.string().optional().describe("URL de destino. Se omitido, tenta resolver automaticamente via WhatsApp/site da página."),
        adSetIndexes: z.array(z.number().int().min(0)).optional().describe("Quais ad sets publicar (por índice, começando em 0). Se omitido, publica todos."),
        idempotencyKey: z.string().min(8).max(200)
          .describe("Identificador único desta tentativa de publicação (ex: UUID v4). Reenvie o MESMO valor em caso de retry para evitar publicar a campanha duas vezes."),
      },
    },
    async (input) => {
      // Gate de escopo é o PRIMEIRO check da tool inteira, antes até de checar posse
      // da campanha — essa é a tool que gasta dinheiro real, então nenhuma outra
      // lógica roda pra uma key sem escopo 'publish'.
      if (!hasScope(scope, "publish")) return scopeErrorContent("publish", scope);
      const campaign: any = await db.getCampaignById(input.campaignId);
      if (!campaign) {
        return { content: [{ type: "text", text: `Campanha ${input.campaignId} não encontrada.` }], isError: true };
      }
      const project: any = await db.getProjectById(campaign.projectId);
      if (!project || project.userId !== userId) {
        return { content: [{ type: "text", text: `Campanha ${input.campaignId} não pertence a este usuário.` }], isError: true };
      }

      // ── Reserva a idempotency key ANTES de qualquer efeito colateral ──
      // (upload de imagem pra Meta e publicação em si). Se essa mesma key
      // já foi usada: devolve o resultado cacheado (completed), recusa por
      // estar em andamento (in_progress), ou libera nova tentativa (failed).
      const requestKey = `publish_campaign:${input.idempotencyKey}`;
      let idempotency: Awaited<ReturnType<typeof db.reserveMcpIdempotencyKey>>;
      try {
        idempotency = await db.reserveMcpIdempotencyKey(userId, "publish_campaign", input.idempotencyKey);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Falha ao verificar idempotência: ${e.message}` }], isError: true };
      }

      if (idempotency.kind === "cached_result") {
        const cached = idempotency.result || {};
        return {
          content: [{
            type: "text",
            text: `[Resultado já processado anteriormente para esta idempotencyKey — nenhuma publicação nova foi feita]\n\n${cached.summaryText || JSON.stringify(cached, null, 2)}`,
          }],
          structuredContent: { ...cached, fromCache: true },
          isError: cached.isError === true,
        };
      }
      if (idempotency.kind === "duplicate_in_progress") {
        return {
          content: [{ type: "text", text: "Já existe uma publicação em andamento com essa mesma idempotencyKey. Aguarde ela terminar em vez de repetir a chamada — repetir agora pode causar condição de corrida." }],
          isError: true,
        };
      }
      const idempotencyRecordId = idempotency.recordId;

      const adSets: any[] = (() => { try { return JSON.parse(campaign.adSets || "[]"); } catch { return []; } })();
      const creatives: any[] = (() => { try { return JSON.parse(campaign.creatives || "[]"); } catch { return []; } })();
      if (adSets.length === 0) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, "Campanha sem ad sets gerados.");
        return { content: [{ type: "text", text: "Essa campanha não tem ad sets gerados. Rode generate_campaign primeiro." }], isError: true };
      }

      let caller;
      try {
        caller = await getCaller();
      } catch (e: any) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, e.message);
        return { content: [{ type: "text", text: e.message }], isError: true };
      }

      // ── Resolve TODAS as imagens dos criativos (não só a 1ª) — regra
      // documentada em docs/FRAMEWORK_EXCELENCIA.md: "coletar todas as
      // feedImageUrl únicas dos criativos, dedup, limite 10". Sem isso,
      // campanha com múltiplas fotos (carrossel) publicaria só com a
      // imagem do 1º criativo — bug real já documentado no histórico do
      // projeto (effectiveImageUrls vazio = publica sem visual completo).
      const uniqueImages = Array.from(new Set(
        creatives
          .map((c: any) => ({ hash: c?.feedImageHash || c?.imageHash, url: c?.feedImageUrl || c?.imageUrl }))
          .filter((x: any) => x.hash || x.url)
          .map((x: any) => x.hash ? `hash:${x.hash}` : `url:${x.url}`)
      )).slice(0, 10);

      if (uniqueImages.length === 0) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, "Nenhuma imagem encontrada nos criativos.");
        return { content: [{ type: "text", text: "Nenhuma imagem encontrada nos criativos gerados — não é possível publicar sem imagem." }], isError: true };
      }

      async function resolveToHash(tagged: string): Promise<string> {
        if (tagged.startsWith("hash:")) return tagged.slice(5);
        const url = tagged.slice(4);
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const uploadResult: any = await caller.integrations.uploadImageToMeta({
          imageBase64: buf.toString("base64"),
          fileName: `campaign-${input.campaignId}-${Date.now()}.jpg`,
        } as any);
        return uploadResult.hash || uploadResult.imageHash;
      }

      let imageHash: string | undefined;
      let imageHashes: string[] | undefined;
      try {
        if (uniqueImages.length === 1) {
          imageHash = await resolveToHash(uniqueImages[0]);
        } else {
          imageHashes = await Promise.all(uniqueImages.map(resolveToHash));
        }
      } catch (e: any) {
        await db.failMcpIdempotencyKey(idempotencyRecordId, `Falha ao enviar imagem(ns): ${e.message}`);
        return { content: [{ type: "text", text: `Falha ao enviar imagem(ns) pra Meta: ${e.message}` }], isError: true };
      }

      // ── Resolve o link de destino, se não veio explícito ──────────────
      let linkUrl = input.linkUrl;
      if (!linkUrl) {
        try {
          const resolved: any = await caller.competitors.resolvePageLink({ pageId: input.pageId });
          linkUrl = resolved?.whatsappUrl || (resolved?.website ? (resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`) : undefined);
        } catch { /* segue sem link automático, publishToMeta pode dar erro claro se precisar */ }
      }

      // Códigos TRPCError que indicam problema não-transitório — repetir a
      // mesma chamada sem o usuário agir primeiro só vai falhar de novo.
      // UNAUTHORIZED = token Meta expirado; FORBIDDEN = permissão negada na
      // conta de anúncios; NOT_FOUND = campanha/projeto inexistente.
      const NON_RETRYABLE_ERROR_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]);

      const indexesToPublish = input.adSetIndexes?.length ? input.adSetIndexes : adSets.map((_, i) => i);
      const results: { adSetName: string; success: boolean; error?: string; errorCode?: string; retryable?: boolean }[] = [];
      let sharedMetaCampaignId: string | undefined;

      for (const idx of indexesToPublish) {
        const adSetName = adSets[idx]?.name || `Conjunto ${idx + 1}`;
        try {
          const result: any = await caller.campaigns.publishToMeta({
            campaignId: input.campaignId,
            projectId: campaign.projectId,
            pageId: input.pageId,
            destination: input.destination || "website",
            linkUrl,
            imageHash,
            imageHashes,
            adSetIndex: idx,
            ...(sharedMetaCampaignId ? { existingMetaCampaignId: sharedMetaCampaignId } : {}),
          } as any);
          if (!sharedMetaCampaignId && result?.campaignId) sharedMetaCampaignId = result.campaignId;
          results.push({ adSetName, success: true });
        } catch (e: any) {
          // e.code vem do TRPCError lançado por publishToMeta/metaPost, que já
          // categoriza (UNAUTHORIZED = token expirado, FORBIDDEN = sem permissão
          // na conta de anúncios, BAD_REQUEST = validação/parâmetro/Meta rejeitou).
          // Antes isso era descartado — só sobrava a mensagem, truncada em 200
          // chars, que às vezes cortava a instrução de como resolver.
          const errorCode: string | undefined = e?.code;
          results.push({
            adSetName,
            success: false,
            error: e?.message || "Erro desconhecido ao publicar.",
            ...(errorCode ? { errorCode, retryable: !NON_RETRYABLE_ERROR_CODES.has(errorCode) } : {}),
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const summary = results.map(r => r.success ? `✅ ${r.adSetName}` : `❌ ${r.adSetName}: ${r.error}`).join("\n");
      const summaryText = `${successCount}/${results.length} ad set(s) publicado(s) na Meta.\n\n${summary}`;
      const finalPayload = {
        successCount,
        total: results.length,
        results,
        metaCampaignId: sharedMetaCampaignId,
        summaryText,
        isError: successCount === 0,
      };

      // Marca como "completed" mesmo se successCount === 0: a essa altura o
      // loop já chamou publishToMeta pelo menos uma vez (efeito colateral
      // real já disparado), então repetir a MESMA idempotencyKey nunca deve
      // tentar de novo — deve só devolver o que de fato aconteceu. Pra
      // tentar de novo de propósito, o chamador precisa gerar uma nova key.
      await db.completeMcpIdempotencyKey(idempotencyRecordId, finalPayload);

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: { successCount, total: results.length, results, metaCampaignId: sharedMetaCampaignId },
        isError: successCount === 0,
      };
    }
  );

  return server;
}
