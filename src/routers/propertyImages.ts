// Router de fotos de propiedades: alta de una imagen asociada a una propiedad.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";

export const propertyImagesRouter = router({
  create: protectedProcedure
    .input(z.object({ propertyId: z.string(), url: z.string().url() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        // RLS ya filtra: si la propiedad es de otra cuenta, esto da null.
        const property = await tx.property.findUnique({ where: { id: input.propertyId } });
        if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });

        return tx.propertyImage.create({
          data: { accountId: ctx.accountId, propertyId: input.propertyId, url: input.url },
        });
      })
    ),
});