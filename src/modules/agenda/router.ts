// Router de agenda: eventos con fecha y hora (visitas ligadas a un Lead + Property, o tareas/
// recordatorios libres) de la cuenta logueada. "list" trae por defecto sólo los pendientes;
// con includeDone también trae los realizados/cancelados (para el historial). El front agrupa
// los pendientes por día (Vencidos/Hoy/Mañana/Esta semana/Más adelante).

import { z } from "zod";
import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";

export const agendaRouter = router({
  list: protectedProcedure
    .input(z.object({ includeDone: z.boolean().default(false) }).optional())
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) =>
        tx.agendaEvent.findMany({
          where: {
            accountId: ctx.accountId,
            ...(input?.includeDone ? {} : { status: "pendiente" }),
          },
          include: {
            lead: { select: { id: true, contactName: true } },
            property: { select: { id: true, title: true } },
          },
          orderBy: { date: "asc" },
          take: 300,
        })
      )
    ),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        type: z.enum(["visita", "tarea"]).default("tarea"),
        date: z.coerce.date(),
        // nullable además de optional: el form siempre manda leadId/propertyId/notes (null cuando
        // están vacíos, nunca los omite), así que "create" tiene que aceptar null igual que "update".
        leadId: z.string().nullable().optional(),
        propertyId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) =>
        tx.agendaEvent.create({
          data: { ...input, accountId: ctx.accountId },
        })
      )
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        type: z.enum(["visita", "tarea"]).optional(),
        date: z.coerce.date().optional(),
        // nullable: permite desvincular el lead/la propiedad de un evento ya creado (null explícito
        // borra el vínculo; undefined lo deja como estaba — mismo criterio que nextFollowUpDate).
        leadId: z.string().nullable().optional(),
        propertyId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["pendiente", "realizado", "cancelado"]).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const { id, ...data } = input;
        return tx.agendaEvent.update({ where: { id }, data });
      })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => tx.agendaEvent.delete({ where: { id: input.id } }))
    ),
});
