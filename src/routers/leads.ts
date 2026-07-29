// Router de leads: listar y crear leads de la cuenta logueada.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";

export const leadsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, (tx) =>
      tx.lead.findMany({
        where: { accountId: ctx.accountId },
        orderBy: { createdAt: "desc" },
      })
    )
  ),
  create: protectedProcedure
    .input(
      z.object({
        contactName: z.string().min(1),
        contactPhone: z.string().min(1),
        operationType: z.string(),
        propertyType: z.string(),
        zone: z.string().min(1),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, (tx) =>
        tx.lead.create({ data: { ...input, accountId: ctx.accountId } })
      )
    ),
});