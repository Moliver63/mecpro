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

export function createMcpServerForUser(userId: number): McpServer {
  const server = new McpServer({ name: "mecproai", version: "1.0.0" });

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

  return server;
}
