// Router de matches: listar matches existentes y generar nuevos por scoring.

import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";
import { scoreMatch } from "../services/matching";

export const matchesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, (tx) =>
      tx.match.findMany({
        where: { accountId: ctx.accountId },
        include: { lead: true, property: true },
        orderBy: { score: "desc" },
      })
    )
  ),
  generate: protectedProcedure.mutation(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const leads = await tx.lead.findMany({ where: { accountId: ctx.accountId } });
      const properties = await tx.property.findMany({ where: { accountId: ctx.accountId } });

      const created = [];
      for (const lead of leads) {
        for (const property of properties) {
          const score = scoreMatch(lead, property);
          if (score >= 50) {
            const match = await tx.match.upsert({
              where: { leadId_propertyId: { leadId: lead.id, propertyId: property.id } },
              update: { score },
              create: { accountId: ctx.accountId, leadId: lead.id, propertyId: property.id, score },
            });
            created.push(match);
          }
        }
      }
      return created;
    })
  ),
});