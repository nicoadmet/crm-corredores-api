// Router principal de tRPC: combina los routers de cada dominio en uno solo.

import { router, publicProcedure } from "../trpc";
import { prisma } from "../db";
import { propertiesRouter } from "./properties";
import { propertyImagesRouter } from "./propertyImages";
import { leadsRouter } from "./leads";
import { matchesRouter } from "./matches";
import { catalogsRouter } from "./catalogs";
import { statsRouter } from "./stats";
import { agendaRouter } from "./agenda";
import { pushSubscriptionsRouter } from "./pushSubscriptions";

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
