/**
 * server/mcpServer.ts
 *
 * Servidor MCP do MecProAI — expõe dados/ações da plataforma pro Claude.
 *
 * FASE 1 (esta): tools de LEITURA apenas. list_projects, list_campaigns,
 * get_campaign, get_campaign_metrics. Nenhuma tool aqui cria, edita ou
 * publica nada — é seguro, sem risco de gasto ou efeito colateral.
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

export function createMcpServerForUser(userId: number): McpServer {
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
      const uploadedFromBase64: string[] = [];
      if (input.realPhotosBase64?.length) {
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
        }
      }
      const allRealImages = [...(input.uploadedImages || []), ...uploadedFromBase64];

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
        numCreatives: input.numCreatives,
      } as any);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          "A geração demorou mais que o esperado (>50s). Verifique list_campaigns em alguns segundos — ela pode ter sido criada com sucesso mesmo assim."
        )), 50_000)
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
  server.registerTool(
    "upload_creative_image",
    {
      title: "Enviar imagem manual pra um criativo",
      description:
        "Substitui a imagem gerada por IA de um criativo específico da " +
        "campanha por uma imagem enviada manualmente (ex: foto real do " +
        "cliente). Sobe a imagem pro Cloudinary e atualiza o rascunho da " +
        "campanha — não publica nada na Meta. Chame get_campaign antes pra " +
        "saber o creativeIndex certo.",
      inputSchema: {
        campaignId: z.number().int().positive().describe("ID da campanha (de get_campaign/list_campaigns)."),
        creativeIndex: z.number().int().min(0).describe("Índice do criativo dentro da campanha (0 = primeiro)."),
        format: z.enum(["feed", "stories", "square"]).describe(
          "Formato/aspect ratio de destino: feed (4:5), stories (9:16) ou square (1:1). " +
          "Uma mesma foto normalmente não serve pros 3 formatos sem cortar errado — " +
          "confirme com o usuário qual formato ele quer trocar."
        ),
        imageBase64: z.string().describe("Conteúdo da imagem em base64 (com ou sem prefixo data:image/...;base64,)."),
        fileName: z.string().describe("Nome do arquivo, com extensão (ex: foto-cliente.jpg)."),
      },
    },
    async ({ campaignId, creativeIndex, format, imageBase64, fileName }) => {
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

      // ── validação do payload — helper compartilhado com generate_campaign ──
      const decoded = decodeAndValidateImage(imageBase64);
      if (!decoded.ok || !decoded.buffer) {
        return { content: [{ type: "text", text: decoded.error || "Imagem inválida." }], isError: true };
      }
      const buffer = decoded.buffer;

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
        const uploadResult: any = await caller.campaigns.uploadImageToMeta({
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
          const resolved: any = await caller.campaigns.resolvePageLink({ pageId: input.pageId });
          linkUrl = resolved?.whatsappUrl || (resolved?.website ? (resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`) : undefined);
        } catch { /* segue sem link automático, publishToMeta pode dar erro claro se precisar */ }
      }

      const indexesToPublish = input.adSetIndexes?.length ? input.adSetIndexes : adSets.map((_, i) => i);
      const results: { adSetName: string; success: boolean; error?: string }[] = [];
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
          results.push({ adSetName, success: false, error: e.message?.slice(0, 200) });
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
