/**
 * fineTuningRouter.ts
 *
 * Endpoints tRPC para o fluxo de feedback humano (👍/✏️/👎) sobre exemplos
 * capturados por fineTuningService.captureExample, e para a área
 * administrativa de inspeção do dataset.
 *
 * COMO INTEGRAR (já aplicado neste commit em router.ts):
 *   import { fineTuningRouter } from "./fineTuningRouter";
 *   // no appRouter: fineTuning: fineTuningRouter,
 * Rotas: trpc.fineTuning.*
 *
 * Escopo de acesso:
 *  - approve/correct/reject/listPending: protectedProcedure, restrito ao
 *    dono do projeto (mesmo padrão de generateCreativeVideo em router.ts).
 *  - inspectorSummary/buildDataset/exportDataset: adminProcedure — visão
 *    agregada entre projetos, só para admin/superadmin.
 *
 * Nenhum destes endpoints dispara treinamento. exportDataset apenas
 * serializa em JSONL para download/inspeção manual.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./trpc";
import * as db from "../db";
import {
  getExampleById,
  listExamplesByProject,
  approveExample,
  correctExample,
  rejectExample,
  calculateTrainingQualityScore,
  buildDataset,
  exportDataset,
  getDatasetInspectorSummary,
} from "../fineTuningService";

async function assertOwnsExample(exampleId: number, userId: number) {
  const example = await getExampleById(exampleId);
  if (!example) throw new TRPCError({ code: "NOT_FOUND", message: "Exemplo não encontrado" });

  const project = await db.getProjectById(example.projectId);
  if (!project || (project as any).userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return example;
}

export const fineTuningRouter = router({
  // ── Feedback humano (dono do projeto) ──────────────────────────────

  listPending: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      const project = await db.getProjectById(input.projectId);
      if (!project || (project as any).userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return listExamplesByProject(input.projectId, "generated");
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertOwnsExample(input.id, ctx.user.id);
      const updated = await approveExample(input.id);
      if (updated) await calculateTrainingQualityScore(input.id);
      return updated;
    }),

  correct: protectedProcedure
    .input(z.object({
      id: z.number(),
      correctedOutput: z.string().min(1),
      errorType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertOwnsExample(input.id, ctx.user.id);
      const updated = await correctExample(input.id, input.correctedOutput, input.errorType);
      if (updated) await calculateTrainingQualityScore(input.id);
      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number(), errorType: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertOwnsExample(input.id, ctx.user.id);
      return rejectExample(input.id, input.errorType);
    }),

  // ── Admin — visão agregada e export ─────────────────────────────────

  inspectorSummary: adminProcedure.query(async () => {
    const summary = await getDatasetInspectorSummary();
    if (!summary) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
    return summary;
  }),

  buildDataset: adminProcedure
    .input(z.object({
      segment: z.string().optional(),
      taskType: z.string().optional(),
      minTrainingQualityScore: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => buildDataset(input)),

  exportDataset: adminProcedure
    .input(z.object({
      segment: z.string().optional(),
      taskType: z.string().optional(),
      minTrainingQualityScore: z.number().optional(),
      limit: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const examples = await buildDataset(input);
      return exportDataset(examples);
    }),
});
