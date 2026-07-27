// Router principal de tRPC: acá se definen todos los endpoints del backend
// y si cada uno es público o requiere estar logueado.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
          include: { images: { orderBy: { order: "asc" } } },
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

  propertyImages: router({
    create: protectedProcedure
      .input(z.object({ propertyId: z.string(), url: z.string().url() }))
      .mutation(({ ctx, input }) =>
        withAccount(ctx.accountId, async (tx) => {
          // RLS ya filtra: si la propiedad es de otra cuenta, esto da null.
          const property = await tx.property.findUnique({ where: { id: input.propertyId } });
          if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Propiedad no encontrada" });

          return tx.propertyImage.create({
            data: { accountId: ctx.accountId, propertyId: input.propertyId, url: input.url },
          });
        })
      ),
  }),

  leads: router({
    list: protectedProcedure.query(({ ctx }) =>
      withAccount(ctx.accountId, (tx) =>
        tx.lead.findMany({
          where: { accountId: ctx.accountId },
          orderBy: { createdAt: "desc" },
        })
      )
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
        withAccount(ctx.accountId, (tx) =>
          tx.lead.create({ data: { ...input, accountId: ctx.accountId } })
        )
      ),
  }),

  matches: router({
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
  }),
});

export type AppRouter = typeof appRouter;