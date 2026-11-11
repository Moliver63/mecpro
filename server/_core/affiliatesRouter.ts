/**
 * affiliatesRouter.ts — trpc.affiliates.*
 *
 * Programa de parceiros. Cadastro, relatorio e repasse sao so de admin.
 * `claim` e do usuario logado (para quem entrou por Google sem passar pelo
 * cadastro com ?ref=).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./trpc";
import {
  affiliateReport,
  attachReferral,
  createAffiliate,
  listCommissions,
  markAffiliatePaid,
  updateAffiliate,
  MIN_PAYOUT_CENTS,
} from "../affiliates";
import { getPool } from "../db";

export const affiliatesRouter = router({
  create: adminProcedure
    .input(z.object({
      code: z.string().min(3).max(40),
      name: z.string().min(2).max(200),
      email: z.string().email().optional(),
      pixKey: z.string().max(255).optional(),
      commissionPct: z.number().int().min(1).max(50).optional(),
      maxPayments: z.number().int().min(1).max(36).optional(),
      holdDays: z.number().int().min(7).max(90).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const a = await createAffiliate(input);
        return { ...a, link: `https://www.mecproai.com/register?ref=${a.code}` };
      } catch (e: any) {
        if (String(e?.message).includes("duplicate key")) {
          throw new TRPCError({ code: "CONFLICT", message: "Codigo ja existe" });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Erro ao criar parceiro" });
      }
    }),

  report: adminProcedure.query(async () => ({
    minPayoutCents: MIN_PAYOUT_CENTS,
    affiliates: await affiliateReport(),
  })),

  commissions: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive() }))
    .query(async ({ input }) => listCommissions(input.affiliateId)),

  markPaid: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive(), payoutRef: z.string().min(1).max(255) }))
    .mutation(async ({ input }) => {
      try {
        return await markAffiliatePaid(input.affiliateId, input.payoutRef);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Nao foi possivel registrar o repasse" });
      }
    }),

  update: adminProcedure
    .input(z.object({
      affiliateId: z.number().int().positive(),
      name: z.string().min(2).max(200).optional(),
      email: z.string().email().or(z.literal("")).optional(),
      pixKey: z.string().max(255).optional(),
      commissionPct: z.number().int().min(1).max(50).optional(),
      maxPayments: z.number().int().min(1).max(36).optional(),
      holdDays: z.number().int().min(7).max(90).optional(),
    }))
    .mutation(async ({ input }) => {
      const { affiliateId, ...rest } = input;
      try {
        return await updateAffiliate(affiliateId, rest);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Nao foi possivel atualizar" });
      }
    }),

  setActive: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool?.query(`UPDATE affiliates SET active = $2 WHERE id = $1`, [input.affiliateId, input.active]);
      return { success: true };
    }),

  /** Usuario logado ainda sem indicacao e sem plano pago informa o codigo. */
  claim: protectedProcedure
    .input(z.object({ code: z.string().min(3).max(40) }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const paid = await pool?.query(
        `SELECT 1 FROM user_subscriptions WHERE "userId" = $1 AND status = 'active' LIMIT 1`, [ctx.user.id],
      );
      if (paid?.rows[0]) return { attached: false, reason: "ja_assinante" as const };
      const attached = await attachReferral(ctx.user.id, input.code);
      return { attached, reason: attached ? null : ("codigo_invalido_ou_ja_vinculado" as const) };
    }),
});
