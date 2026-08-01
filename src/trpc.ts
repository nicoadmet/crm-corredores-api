// Configuración base de tRPC: procedures públicos vs. protegidos (requieren login)

import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.accountId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Necesitás estar logueado" });
  }
  return next({ ctx: { ...ctx, accountId: ctx.accountId } });
});