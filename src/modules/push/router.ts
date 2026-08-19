// Router de suscripciones push: el frontend guarda acá el "endpoint" que le da el navegador
// (Web Push API) al activar notificaciones, para que el backend le pueda mandar avisos más
// adelante (ver routes/internalNotifications.ts, que es quien realmente los manda).
import { z } from "zod";
import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";

export const pushSubscriptionsRouter = router({
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().min(1),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) =>
        tx.pushSubscription.upsert({
          where: { endpoint: input.endpoint },
          create: { ...input, accountId: ctx.accountId, userId: ctx.userId },
          update: { accountId: ctx.accountId, userId: ctx.userId, p256dh: input.p256dh, auth: input.auth },
        })
      )
    ),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) =>
        tx.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, accountId: ctx.accountId } })
      )
    ),
});
