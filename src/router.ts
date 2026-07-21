import { router, publicProcedure } from "./trpc";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),
  accounts: router({
    list: publicProcedure.query(() => prisma.account.findMany()),
  }),
});

export type AppRouter = typeof appRouter;