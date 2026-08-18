// Router de catálogos: un catálogo agrupa varias propiedades bajo un link público único (/c/:id)
// para compartir una selección completa por WhatsApp en vez de mandar una propiedad a la vez.
// El borrado es directo (sin papelera) — un catálogo es sólo una selección para compartir, no un
// dato de negocio que haga falta recuperar.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";

export const catalogsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, (tx) =>
      tx.catalog.findMany({
        where: { accountId: ctx.accountId },
        include: {
          properties: {
            orderBy: { order: "asc" },
            include: { property: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    )
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const catalog = await tx.catalog.findFirst({
          where: { id: input.id, accountId: ctx.accountId },
          include: {
            properties: {
              orderBy: { order: "asc" },
              include: { property: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } },
            },
          },
        });
        if (!catalog) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Catálogo no encontrado" });
        }
        return catalog;
      })
    ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        propertyIds: z.array(z.string()).min(1),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, (tx) =>
        tx.catalog.create({
          data: {
            accountId: ctx.accountId,
            name: input.name,
            properties: {
              create: input.propertyIds.map((propertyId, order) => ({
                accountId: ctx.accountId,
                propertyId,
                order,
              })),
            },
          },
        })
      )
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        propertyIds: z.array(z.string()).min(1).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const existing = await tx.catalog.findFirst({ where: { id: input.id, accountId: ctx.accountId } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Catálogo no encontrado" });
        }

        if (input.name !== undefined) {
          await tx.catalog.update({ where: { id: input.id }, data: { name: input.name } });
        }

        // La selección de propiedades se resincroniza entera: se borran todas las filas de unión
        // y se recrean con el orden nuevo — más simple que calcular altas/bajas una por una.
        if (input.propertyIds !== undefined) {
          await tx.catalogProperty.deleteMany({ where: { catalogId: input.id } });
          await tx.catalogProperty.createMany({
            data: input.propertyIds.map((propertyId, order) => ({
              accountId: ctx.accountId,
              catalogId: input.id,
              propertyId,
              order,
            })),
          });
        }

        return tx.catalog.findUniqueOrThrow({ where: { id: input.id } });
      })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const existing = await tx.catalog.findFirst({ where: { id: input.id, accountId: ctx.accountId } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Catálogo no encontrado" });
        }
        await tx.catalogProperty.deleteMany({ where: { catalogId: input.id } });
        await tx.catalog.delete({ where: { id: input.id } });
        return { ok: true };
      })
    ),
});
