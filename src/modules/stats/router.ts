// Router de estadísticas: un solo endpoint que junta los números clave de Propiedades y Leads
// para el panel de "Estadísticas" — nada de reportes pesados, sólo conteos por estado y una
// tasa de conversión aproximada.

import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";

const PROPERTY_STATUSES = ["disponible", "reservada", "vendida", "pausada"] as const;
const LEAD_STATUSES = ["activo", "en_proceso", "cerrado", "perdido"] as const;

export const statsRouter = router({
  // Contadores que muestra la navegación al lado de cada ítem. Va aparte de `summary` a propósito:
  // esto lo pide TODA pantalla del dashboard, así que tiene que ser lo más liviano posible.
  navCounts: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const [properties, leads, matches, agenda, catalogs] = await Promise.all([
        tx.property.count({ where: { accountId: ctx.accountId, deletedAt: null } }),
        tx.lead.count({ where: { accountId: ctx.accountId, deletedAt: null } }),
        tx.match.count({ where: { accountId: ctx.accountId } }),
        tx.agendaEvent.count({ where: { accountId: ctx.accountId, status: "pendiente" } }),
        tx.catalog.count({ where: { accountId: ctx.accountId } }),
      ]);

      return { properties, leads, matches, agenda, catalogs };
    })
  ),

  summary: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const [propertiesByStatus, leadsByStatus] = await Promise.all([
        tx.property.groupBy({
          by: ["status"],
          where: { accountId: ctx.accountId, deletedAt: null },
          _count: { _all: true },
        }),
        tx.lead.groupBy({
          by: ["status"],
          where: { accountId: ctx.accountId, deletedAt: null },
          _count: { _all: true },
        }),
      ]);

      const propertyCounts: Record<string, number> = Object.fromEntries(
        PROPERTY_STATUSES.map((status) => [status, 0])
      );
      let propertiesTotal = 0;
      for (const row of propertiesByStatus) {
        propertyCounts[row.status] = row._count._all;
        propertiesTotal += row._count._all;
      }

      const leadCounts: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0]));
      let leadsTotal = 0;
      for (const row of leadsByStatus) {
        leadCounts[row.status] = row._count._all;
        leadsTotal += row._count._all;
      }
      // % de leads que llegaron a "cerrado" sobre el total cargado — aproximado, no pesa
      // si el lead cerró rápido o después de mucho seguimiento, sólo cuenta el estado final.
      const conversionRate = leadsTotal > 0 ? Math.round((leadCounts.cerrado / leadsTotal) * 100) : null;

      return {
        properties: { total: propertiesTotal, byStatus: propertyCounts },
        leads: { total: leadsTotal, byStatus: leadCounts, conversionRate },
      };
    })
  ),
});
