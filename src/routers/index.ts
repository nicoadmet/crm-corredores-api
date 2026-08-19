// Router principal de tRPC: combina los routers de cada dominio en uno solo.

import { router, publicProcedure } from "../trpc";
import { prisma } from "../db";
import { propertiesRouter } from "../modules/properties/router";
import { propertyImagesRouter } from "../modules/propertyImages/router";
import { leadsRouter } from "../modules/leads/router";
import { matchesRouter } from "../modules/matches/router";
import { catalogsRouter } from "../modules/catalogs/router";
import { statsRouter } from "../modules/stats/router";
import { agendaRouter } from "../modules/agenda/router";
import { pushSubscriptionsRouter } from "../modules/push/router";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),

  accounts: router({
    list: publicProcedure.query(() => prisma.account.findMany()),
  }),

  properties: propertiesRouter,
  propertyImages: propertyImagesRouter,
  leads: leadsRouter,
  matches: matchesRouter,
  catalogs: catalogsRouter,
  stats: statsRouter,
  agenda: agendaRouter,
  pushSubscriptions: pushSubscriptionsRouter,
});

export type AppRouter = typeof appRouter;
