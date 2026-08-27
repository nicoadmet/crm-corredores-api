// Buscador global (⌘K): un solo pedido que busca en propiedades, leads y zonas de la cuenta a la vez.
// Devuelve pocos resultados de cada tipo, ya agrupados, para llenar la paleta sin paginar.

import { z } from "zod";
import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";

// Debajo de 2 caracteres cualquier búsqueda devuelve media cartera, así que no vale la pena ir a la base.
const MIN_QUERY_LENGTH = 2;
const LIMIT_PER_GROUP = 5;

export const searchRouter = router({
  global: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => {
      const query = input.query.trim();
      if (query.length < MIN_QUERY_LENGTH) {
        return { query, properties: [], leads: [], zones: [] };
      }

      return withAccount(ctx.accountId, async (tx) => {
        const contains = { contains: query, mode: "insensitive" as const };

        const [properties, leads, zoneGroups] = await Promise.all([
          tx.property.findMany({
            where: {
              accountId: ctx.accountId,
              deletedAt: null,
              OR: [{ title: contains }, { zone: contains }, { address: contains }],
            },
            select: { id: true, title: true, zone: true, price: true, currency: true, status: true },
            orderBy: { updatedAt: "desc" },
            take: LIMIT_PER_GROUP,
          }),
          tx.lead.findMany({
            where: {
              accountId: ctx.accountId,
              deletedAt: null,
              OR: [{ contactName: contains }, { contactPhone: contains }],
            },
            select: {
              id: true,
              contactName: true,
              contactPhone: true,
              operationType: true,
              propertyType: true,
              zones: true,
              status: true,
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT_PER_GROUP,
          }),
          // Las zonas no son una tabla: se sacan agrupando la columna `zone` de las propiedades.
          tx.property.groupBy({
            by: ["zone"],
            where: { accountId: ctx.accountId, deletedAt: null, zone: contains },
            _count: { _all: true },
            orderBy: { _count: { zone: "desc" } },
            take: 3,
          }),
        ]);

        return {
          query,
          properties,
          leads,
          zones: zoneGroups.map((group) => ({ zone: group.zone, count: group._count._all })),
        };
      });
    }),
});
