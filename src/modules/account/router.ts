// Datos de la cuenta del corredor. Son pocos, pero importan más de lo que parece: el nombre y el
// teléfono son lo que aparece como firma y botón de contacto en las páginas públicas (/p/:id y
// /c/:id). Sin teléfono cargado, el cliente que abre el link no tiene cómo responder.
import { z } from "zod";
import { router, protectedProcedure } from "../../trpc";
import { adminPrisma } from "../../db";

// Se usa adminPrisma (y no withAccount) por el mismo motivo que context.ts: la tabla Account es la
// raíz del multi-tenant y queda fuera de las policies de RLS, que filtran por accountId. El alcance
// lo garantiza el filtro explícito por ctx.accountId de cada consulta.
export const accountRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    adminPrisma.account.findUniqueOrThrow({
      where: { id: ctx.accountId },
      select: { id: true, name: true, phone: true, plan: true },
    })
  ),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Poné tu nombre o el de tu inmobiliaria"),
        // null explícito borra el teléfono; undefined lo dejaría como está.
        phone: z.string().nullable(),
      })
    )
    .mutation(({ ctx, input }) =>
      adminPrisma.account.update({
        where: { id: ctx.accountId },
        data: { name: input.name.trim(), phone: input.phone?.trim() || null },
        select: { id: true, name: true, phone: true, plan: true },
      })
    ),
});
