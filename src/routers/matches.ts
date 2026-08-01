// Router de matches: sólo lectura — los matches se crean, actualizan y borran solos
// cuando se guarda o elimina un lead o una propiedad (ver services/matchSync.ts).

import { router, protectedProcedure } from "../trpc";
import { withAccount } from "../db";
import { matchDetails } from "../services/matching";

export const matchesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const matches = await tx.match.findMany({
        where: { accountId: ctx.accountId },
        include: { lead: true, property: true },
        orderBy: { score: "desc" },
      });
      return matches.map((m) => ({
        ...m,
        reasons: matchDetails(m.lead, m.property).reasons,
      }));
    })
  ),
});
