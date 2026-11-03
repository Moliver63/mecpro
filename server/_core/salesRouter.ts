/**
 * salesRouter.ts — trpc.sales.*
 *
 * Gerencia as URLs de webhook de venda (Kiwify / Hotmart) de um projeto e
 * expoe o relatorio de vendas reais por campanha (custo por venda, ROAS).
 * Tudo restrito ao dono do projeto (mesmo padrao do fineTuningRouter).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./trpc";
import * as db from "../db";
import {
  createSalesIntegration,
  deactivateSalesIntegration,
  getProjectSalesSummary,
  getSalesIntegrationById,
  listRecentSaleEvents,
  listSalesIntegrations,
  salesWebhookUrl,
} from "../salesAttribution";

async function assertOwnsProject(projectId: number, userId: number) {
  const project = await db.getProjectById(projectId);
  if (!project || (project as any).userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Projeto nao pertence a este usuario" });
  }
  return project;
}

const providerSchema = z.enum(["kiwify", "hotmart"]);

export const salesRouter = router({
  createIntegration: protectedProcedure
    .input(z.object({
      projectId: z.number().int().positive(),
      provider: providerSchema,
      verifySecret: z.string().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertOwnsProject(input.projectId, ctx.user.id);
      const integration = await createSalesIntegration({
        userId: ctx.user.id,
        projectId: input.projectId,
        provider: input.provider,
        verifySecret: input.verifySecret ?? null,
      });
      return {
        id: integration.id,
        provider: integration.provider,
        webhookUrl: salesWebhookUrl(integration.provider, integration.webhookToken),
        hasVerifySecret: !!integration.verifySecret,
      };
    }),

  listIntegrations: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertOwnsProject(input.projectId, ctx.user.id);
      const rows = await listSalesIntegrations(input.projectId);
      return rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        active: r.active,
        webhookUrl: salesWebhookUrl(r.provider, r.webhookToken),
        hasVerifySecret: !!r.verifySecret,
        lastEventAt: r.lastEventAt,
        createdAt: r.createdAt,
      }));
    }),

  deactivateIntegration: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const integration = await getSalesIntegrationById(input.id);
      if (!integration) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOwnsProject(integration.projectId, ctx.user.id);
      await deactivateSalesIntegration(input.id);
      return { ok: true };
    }),

  summary: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive(), days: z.number().int().min(1).max(365).optional() }))
    .query(async ({ input, ctx }) => {
      await assertOwnsProject(input.projectId, ctx.user.id);
      return getProjectSalesSummary(input.projectId, input.days ?? 30);
    }),

  recentEvents: protectedProcedure
    .input(z.object({ projectId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      await assertOwnsProject(input.projectId, ctx.user.id);
      return listRecentSaleEvents(input.projectId, input.limit ?? 20);
    }),
});
