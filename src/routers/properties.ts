// Router de propiedades: listar (paginado, con búsqueda y filtros), obtener una, crear, editar,
// duplicar y borrar (soft-delete) propiedades de la cuenta logueada.
// Crear/editar/borrar/duplicar una propiedad mantiene sus matches sincronizados automáticamente (ver services/matchSync.ts).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";
import { syncMatchesForProperty, deleteMatchesForProperty } from "../services/matchSync";

export const propertiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(50).default(10),
        search: z.string().optional(),
        operationType: z.string().optional(),
        propertyType: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const search = input.search?.trim();
        const where = {
          accountId: ctx.accountId,
          deletedAt: null,
          ...(input.operationType ? { operationType: input.operationType } : {}),
          ...(input.propertyType ? { propertyType: input.propertyType } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" as const } },
                  { zone: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        };
        const [items, total] = await Promise.all([
          tx.property.findMany({
            where,
            include: { images: { orderBy: { order: "asc" } } },
            orderBy: { createdAt: "desc" },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          }),
          tx.property.count({ where }),
        ]);
        return { items, total, page: input.page, pageSize: input.pageSize };
      })
    ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const property = await tx.property.findFirst({
          where: { id: input.id, accountId: ctx.accountId, deletedAt: null },
          include: { images: { orderBy: { order: "asc" } } },
        });
        if (!property) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });
        }
        return property;
      })
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
        address: z.string().optional(),
        rooms: z.number().int().positive().optional(),
        bedrooms: z.number().int().positive().optional(),
        bathrooms: z.number().int().positive().optional(),
        garage: z.boolean().optional(),
        garageSpaces: z.number().int().positive().optional(),
        coveredArea: z.number().positive().optional(),
        totalArea: z.number().positive().optional(),
        floor: z.string().optional(),
        age: z.number().int().min(0).optional(),
        description: z.string().optional(),
        ownerName: z.string().optional(),
        ownerPhone: z.string().optional(),
        ownerNotes: z.string().optional(),
        exclusive: z.boolean().optional(),
        exclusiveUntil: z.coerce.date().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const property = await tx.property.create({ data: { ...input, accountId: ctx.accountId } });
        await syncMatchesForProperty(tx, ctx.accountId, property);
        return property;
      })
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        operationType: z.string().optional(),
        propertyType: z.string().optional(),
        status: z.string().optional(),
        price: z.number().positive().optional(),
        currency: z.string().optional(),
        zone: z.string().min(1).optional(),
        address: z.string().optional(),
        rooms: z.number().int().positive().optional(),
        bedrooms: z.number().int().positive().optional(),
        bathrooms: z.number().int().positive().optional(),
        garage: z.boolean().optional(),
        garageSpaces: z.number().int().positive().optional(),
        coveredArea: z.number().positive().optional(),
        totalArea: z.number().positive().optional(),
        floor: z.string().optional(),
        age: z.number().int().min(0).optional(),
        description: z.string().optional(),
        ownerName: z.string().optional(),
        ownerPhone: z.string().optional(),
        ownerNotes: z.string().optional(),
        exclusive: z.boolean().optional(),
        exclusiveUntil: z.coerce.date().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const { id, ...data } = input;
        const existing = await tx.property.findUnique({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });
        }
        const property = await tx.property.update({ where: { id }, data });
        await syncMatchesForProperty(tx, ctx.accountId, property);
        return property;
      })
    ),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const original = await tx.property.findFirst({
          where: { id: input.id, accountId: ctx.accountId, deletedAt: null },
          include: { images: { orderBy: { order: "asc" } } },
        });
        if (!original) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });
        }

        // Se descartan id/fechas/estado/imágenes del original: la copia necesita su propio id,
        // sus propias fechas, arranca siempre "disponible" (aunque el original esté vendida/reservada),
        // y sus fotos se recrean aparte (mismas URLs, sin volver a subir nada).
        const { id, createdAt, updatedAt, deletedAt, status, title, images, ...rest } = original;

        const copy = await tx.property.create({
          data: {
            ...rest,
            title: `${title} (copia)`,
            status: "disponible",
            images: {
              create: images.map((img) => ({
                url: img.url,
                thumbnailUrl: img.thumbnailUrl,
                order: img.order,
              })),
            },
          },
          include: { images: { orderBy: { order: "asc" } } },
        });
        await syncMatchesForProperty(tx, ctx.accountId, copy);
        return copy;
      })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const existing = await tx.property.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });
        }
        const property = await tx.property.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        await deleteMatchesForProperty(tx, input.id);
        return property;
      })
    ),
});
