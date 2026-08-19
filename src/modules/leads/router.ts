// Router de leads: listar (paginado, con búsqueda y filtros), obtener uno, crear, editar
// y borrar (soft-delete) leads de la cuenta logueada.
// Crear/editar/borrar un lead mantiene sus matches sincronizados automáticamente (ver services/matchSync.ts).
// getById trae también la timeline de interacciones (LeadActivity); addActivity carga una nueva a mano,
// y update genera sola una entrada tipo "estado" cuando cambia el status del lead.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc";
import { withAccount } from "../../db";
import { syncMatchesForLead, deleteMatchesForLead } from "../../services/matchSync";

export const leadsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(50).default(10),
        search: z.string().optional(),
        operationType: z.string().optional(),
        propertyType: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const search = input.search?.trim();
        const where = {
          accountId: ctx.accountId,
          deletedAt: null,
          ...(input.operationType ? { operationType: input.operationType } : {}),
          ...(input.propertyType ? { propertyType: input.propertyType } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(search ? { contactName: { contains: search, mode: "insensitive" as const } } : {}),
        };
        const [items, total] = await Promise.all([
          tx.lead.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          }),
          tx.lead.count({ where }),
        ]);
        return { items, total, page: input.page, pageSize: input.pageSize };
      })
    ),

  // Versión liviana de "list" para llenar selects (ej: elegir un lead en Agenda.tsx) — sin
  // paginar, sólo id + nombre, hasta 500 leads activos.
  listOptions: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) =>
      tx.lead.findMany({
        where: { accountId: ctx.accountId, deletedAt: null },
        select: { id: true, contactName: true },
        orderBy: { contactName: "asc" },
        take: 500,
      })
    )
  ),

  // Leads con seguimiento vencido, para hoy, o en los próximos 3 días (para el panel de "Seguimientos
  // urgentes" en Leads.tsx) + el conteo de vencidos (para el badge en la navegación).
  followUpSummary: protectedProcedure.query(({ ctx }) =>
    withAccount(ctx.accountId, async (tx) => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfWindow = new Date(startOfToday);
      endOfWindow.setDate(endOfWindow.getDate() + 4); // exclusivo: hoy + 3 días completos

      const [items, overdueCount] = await Promise.all([
        tx.lead.findMany({
          where: {
            accountId: ctx.accountId,
            deletedAt: null,
            nextFollowUpDate: { not: null, lt: endOfWindow },
          },
          orderBy: { nextFollowUpDate: "asc" },
          take: 50,
        }),
        tx.lead.count({
          where: {
            accountId: ctx.accountId,
            deletedAt: null,
            nextFollowUpDate: { not: null, lt: startOfToday },
          },
        }),
      ]);

      return { items, overdueCount };
    })
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id: input.id, accountId: ctx.accountId, deletedAt: null },
          include: { activities: { orderBy: { createdAt: "desc" } } },
        });
        if (!lead) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado" });
        }
        return lead;
      })
    ),

  create: protectedProcedure
    .input(
      z.object({
        contactName: z.string().min(1),
        contactPhone: z.string().min(1),
        contactEmail: z.string().email().optional(),
        operationType: z.string(),
        propertyType: z.string(),
        zones: z.array(z.string().min(1)).min(1),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        minRooms: z.number().int().positive().optional(),
        minBathrooms: z.number().int().positive().optional(),
        needsGarage: z.boolean().optional(),
        priority: z.enum(["caliente", "tibio", "frio"]).optional(),
        // Acepta null además de Date: permite guardar (o dejar) el lead sin fecha de seguimiento.
        nextFollowUpDate: z.coerce.date().nullable().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const lead = await tx.lead.create({ data: { ...input, accountId: ctx.accountId } });
        await syncMatchesForLead(tx, ctx.accountId, lead);
        return lead;
      })
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        contactName: z.string().min(1).optional(),
        contactPhone: z.string().min(1).optional(),
        contactEmail: z.string().email().optional(),
        operationType: z.string().optional(),
        propertyType: z.string().optional(),
        zones: z.array(z.string().min(1)).optional(),
        budgetMin: z.number().optional(),
        budgetMax: z.number().optional(),
        minRooms: z.number().int().positive().optional(),
        minBathrooms: z.number().int().positive().optional(),
        needsGarage: z.boolean().optional(),
        priority: z.enum(["caliente", "tibio", "frio"]).optional(),
        // z.coerce.date().nullable(): si el front manda null explícito (campo vaciado a propósito),
        // Prisma lo interpreta como "poné NULL". Si el campo no se manda (undefined), Prisma lo ignora
        // y deja el valor que ya tenía — esa es la diferencia que antes rompía el "borrar la fecha".
        nextFollowUpDate: z.coerce.date().nullable().optional(),
        notes: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const { id, ...data } = input;
        const existing = await tx.lead.findUnique({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado" });
        }

        // Si la fecha de seguimiento cambió (a otra fecha distinta, o se borró), hay que resetear
        // el aviso push ya mandado — si no, un vencimiento ya notificado una vez nunca volvería a
        // avisar aunque se cargue una fecha nueva (ver routes/internalNotifications.ts).
        const followUpChanged =
          data.nextFollowUpDate !== undefined &&
          (existing.nextFollowUpDate?.getTime() ?? null) !== (data.nextFollowUpDate?.getTime() ?? null);

        const lead = await tx.lead.update({
          where: { id },
          data: { ...data, ...(followUpChanged ? { followUpNotifiedAt: null } : {}) },
        });

        // Si cambió el status, queda anotado solo en la timeline (no hace falta cargarlo a mano).
        if (data.status !== undefined && existing.status !== data.status) {
          await tx.leadActivity.create({
            data: {
              accountId: ctx.accountId,
              leadId: lead.id,
              type: "estado",
              note: `Estado: ${existing.status} → ${lead.status}`,
            },
          });
        }

        await syncMatchesForLead(tx, ctx.accountId, lead);
        return lead;
      })
    ),

  addActivity: protectedProcedure
    .input(
      z.object({
        leadId: z.string(),
        type: z.enum(["llamada", "visita", "mensaje", "nota"]),
        note: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, accountId: ctx.accountId, deletedAt: null },
        });
        if (!lead) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado" });
        }
        return tx.leadActivity.create({
          data: {
            accountId: ctx.accountId,
            leadId: input.leadId,
            type: input.type,
            note: input.note,
          },
        });
      })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      withAccount(ctx.accountId, async (tx) => {
        const existing = await tx.lead.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead no encontrado" });
        }
        const lead = await tx.lead.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        await deleteMatchesForLead(tx, input.id);
        return lead;
      })
    ),
});
