// Router de propiedades: listar y crear propiedades de la cuenta logueada.

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";

export const propertiesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, (tx) =>
      tx.property.findMany({
        where: { accountId: ctx.accountId },
        include: { images: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      })
    )
  ),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        operationType: z.string(),
        propertyType: z.string(),
        price: z.number().positive(),
        currency: z.string().default("USD"),
        zone: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, (tx) =>
        tx.property.create({ data: { ...input, accountId: ctx.accountId } })
      )
    ),
});