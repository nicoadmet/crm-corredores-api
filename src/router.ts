// Router principal de tRPC: acá se definen todos los endpoints del backend
// y si cada uno es público o requiere estar logueado.

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./trpc";
import { prisma, withAccount } from "./db";

import { scoreMatch } from "./matching";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true })),

  accounts: router({
    list: publicProcedure.query(() => prisma.account.findMany()),
  }),

  properties: router({
    list: protectedProcedure.query(({ ctx }) =>
      withAccount(ctx.accountId, (tx) =>
        tx.property.findMany({
          where: { accountId: ctx.accountId },
          orderBy: { createdAt: "desc" },
        })
      )
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
        })
      )
      .mutation(({ ctx, input }) =>
        withAccount(ctx.accountId, (tx) =>
          tx.property.create({ data: { ...input, accountId: ctx.accountId } })
        )
      ),
  }),

  leads: router({
  list: protectedProcedure.query(({ ctx }) =>
    prisma.lead.findMany({
      where: { accountId: ctx.accountId },
      orderBy: { createdAt: "desc" },
    })
  ),
  create: protectedProcedure
    .input(
      z.object({
        contactName: z.string().min(1),
        contactPhone: z.string().min(1),
        operationType: z.string(),
        propertyType: z.string(),
        zone: z.string().min(1),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      prisma.lead.create({ data: { ...input, accountId: ctx.accountId } })
    ),
  }),

  matches: router({
    list: protectedProcedure.query(({ ctx }) =>
      prisma.match.findMany({
        where: { accountId: ctx.accountId },
        include: { lead: true, property: true },
        orderBy: { score: "desc" },
      })
    ),
    generate: protectedProcedure.mutation(async ({ ctx }) => {
      const leads = await prisma.lead.findMany({ where: { accountId: ctx.accountId } });
      const properties = await prisma.property.findMany({ where: { accountId: ctx.accountId } });

      const created = [];
      for (const lead of leads) {
        for (const property of properties) {
          const score = scoreMatch(lead, property);
          if (score >= 50) {
            const match = await prisma.match.upsert({
              where: { leadId_propertyId: { leadId: lead.id, propertyId: property.id } },
              update: { score },
              create: { accountId: ctx.accountId, leadId: lead.id, propertyId: property.id, score },
            });
            created.push(match);
          }
        }
      }
      return created;
    }),
  }),
});

export type AppRouter = typeof appRouter;