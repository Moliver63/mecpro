/**
 * trpc.ts — instância compartilhada do tRPC
 * Importado por router.ts E adminIntelligenceRouter.ts
 * Evita circular imports E garante mesma instância (tipos corretos)
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router            = t.router;
export const publicProcedure   = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "superadmin"].includes((ctx.user as any).role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao Admin" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
