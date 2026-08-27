// Router de propiedades: listar (paginado, con búsqueda y filtros), obtener una, crear, editar,
// duplicar y borrar (soft-delete) propiedades de la cuenta logueada.
// Crear/editar/borrar/duplicar una propiedad mantiene sus matches sincronizados automáticamente (ver services/matchSync.ts).
// Cada alta/duplicado/cambio de precio o moneda queda registrado en PriceHistory.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";
import { propertyLinkMeta } from "../../services/publicPage";
import { syncMatchesForProperty, deleteMatchesForProperty } from "../../services/matchSync";

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
        tag: z.string().optional(),
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
          ...(input.tag ? { tags: { has: input.tag } } : {}),
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
            include: {
              images: { orderBy: { order: "asc" } },
              priceHistory: { orderBy: { createdAt: "asc" } },
            },
            orderBy: { createdAt: "desc" },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          }),
          tx.property.count({ where }),
        ]);
        return { items, total, page: input.page, pageSize: input.pageSize };
      })
    ),

  // Etiquetas más usadas en la cartera de la cuenta, para armar los chips del filtro por tag
  // (unnest desarma el array "tags" de cada propiedad en filas para poder contarlas agrupadas).
  // Lo mismo que WhatsApp va a mostrar cuando el corredor pegue el link, calculado con el mismo
  // helper que usa la ficha pública. Sirve para la vista previa dentro de la app.
  shareInfo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const property = await tx.property.findFirst({
          where: { id: input.id, accountId: ctx.accountId, deletedAt: null },
          include: { images: { orderBy: { order: "asc" }, take: 1 } },
        });
        if (!property) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });
        }
        return propertyLinkMeta(property);
      })
    ),

  topTags: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const rows = await tx.$queryRaw<{ tag: string; count: number }[]>`
        SELECT t.tag, COUNT(*)::int AS count
        FROM "Property" p
        CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
        WHERE p."accountId" = ${ctx.accountId} AND p."deletedAt" IS NULL
        GROUP BY t.tag
        ORDER BY count DESC
        LIMIT 12
      `;
      return rows;
    })
  ),

  // Versión liviana de "list" para llenar selects (ej: elegir una propiedad en Agenda.tsx) —
  // sin paginar, sólo id + título, hasta 500 propiedades activas.
  listOptions: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) =>
      tx.property.findMany({
        where: { accountId: ctx.accountId, deletedAt: null },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
        take: 500,
      })
    )
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const property = await tx.property.findFirst({
          where: { id: input.id, accountId: ctx.accountId, deletedAt: null },
          include: {
            images: { orderBy: { order: "asc" } },
            priceHistory: { orderBy: { createdAt: "asc" } },
          },
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
        tags: z.array(z.string().min(1)).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const property = await tx.property.create({ data: { ...input, accountId: ctx.accountId } });
        await tx.priceHistory.create({
          data: {
            accountId: ctx.accountId,
            propertyId: property.id,
            price: property.price,
            currency: property.currency,
          },
        });
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
        tags: z.array(z.string().min(1)).optional(),
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

        // Sólo se agrega una entrada al historial si el precio o la moneda realmente cambiaron
        // (editar otro campo, como la descripción, no debe generar un registro nuevo).
        const priceChanged = data.price !== undefined && Number(existing.price) !== data.price;
        const currencyChanged = data.currency !== undefined && existing.currency !== data.currency;
        if (priceChanged || currencyChanged) {
          await tx.priceHistory.create({
            data: {
              accountId: ctx.accountId,
              propertyId: property.id,
              price: property.price,
              currency: property.currency,
            },
          });
        }

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
        // y sus fotos se recrean aparte (mismas URLs, sin volver a subir nada). Las etiquetas SÍ se
        // heredan (van dentro de "rest"), igual que el resto de los campos descriptivos.
        const { id, createdAt, updatedAt, deletedAt, status, title, images, ...rest } = original;

        const copy = await tx.property.create({
          data: {
            ...rest,
            title: `${title} (copia)`,
            status: "disponible",
            images: {
              // "accountId" explícito acá: sin esto, Prisma pide el objeto de relación completo
              // ("account: {...}") en vez de aceptar el id suelto, y además cada PropertyImage
              // necesita su propio accountId (no lo hereda solo de la Property a la que se cuelga).
              create: images.map((img) => ({
                accountId: ctx.accountId,
                url: img.url,
                thumbnailUrl: img.thumbnailUrl,
                order: img.order,
              })),
            },
          },
        });

        // La copia arranca su propio historial de precios, no hereda el del original.
        await tx.priceHistory.create({
          data: {
            accountId: ctx.accountId,
            propertyId: copy.id,
            price: copy.price,
            currency: copy.currency,
          },
        });

        await syncMatchesForProperty(tx, ctx.accountId, copy);

        // Se vuelve a traer completa (con fotos + el historial de precio recién creado) para que
        // tenga la misma forma que "list"/"getById" — si no, al abrir el modal de edición justo
        // después de duplicar, faltaría el historial de precios.
        return tx.property.findUniqueOrThrow({
          where: { id: copy.id },
          include: {
            images: { orderBy: { order: "asc" } },
            priceHistory: { orderBy: { createdAt: "asc" } },
          },
        });
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
