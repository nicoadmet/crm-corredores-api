// Ruta interna (NO pasa por tRPC ni requiere login de usuario): la llama un cron externo
// (cron-job.org) cada 10 minutos para revisar seguimientos vencidos y matches nuevos de alto
// puntaje en TODAS las cuentas, y mandar las notificaciones push correspondientes. Se protege con
// una clave compartida (CRON_SECRET) en vez de un JWT de Supabase, porque quien la llama no es una
// persona logueada. Usa adminPrisma (bypassea RLS) a propósito: necesita mirar todas las cuentas
// a la vez, no una sola.
import type { FastifyInstance } from "fastify";
import webpush from "web-push";
import { adminPrisma } from "../../db";

// Umbral más alto que el mínimo para que exista un match (50, ver services/matching.ts): sólo los
// matches realmente fuertes generan una notificación, para no generar ruido/desconfianza.
const MATCH_NOTIFY_SCORE_THRESHOLD = 70;

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
// Si faltan las claves (ej: en desarrollo local, si todavía no se cargó el .env), las notificaciones
// push quedan desactivadas pero el resto del servidor arranca normal — antes esto tiraba abajo TODO
// el backend apenas arrancaba, porque "web-push" rechaza claves vacías/inválidas al configurarlas.
export const vapidConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (vapidConfigured) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "soporte@inmocrm.app"}`,
    vapidPublicKey!,
    vapidPrivateKey!
  );
} else {
  console.warn(
    "[internalNotifications] Faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: las notificaciones push quedan " +
      "desactivadas hasta que se carguen esas variables de entorno (el resto de la app funciona normal)."
  );
}

async function sendToAccount(accountId: string, payload: { title: string; body: string; url?: string }) {
  const subscriptions = await adminPrisma.pushSubscription.findMany({ where: { accountId } });
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        // 404/410: el navegador anuló la suscripción (se desinstaló la app, se borraron datos del
        // sitio, etc.) — se limpia para no seguir intentando mandarle algo que nunca va a llegar.
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminPrisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}

export function registerInternalNotificationsRoute(server: FastifyInstance) {
  server.post("/internal/check-notifications", async (request, reply) => {
    if (request.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    // Sin claves VAPID no hay forma de mandar nada — se corta acá, sin marcar nada como "ya avisado"
    // (si se dejara seguir, más adelante, cuando se carguen las claves, esos avisos ya se habrían
    // perdido para siempre).
    if (!vapidConfigured) {
      reply.send({ ok: true, vapidConfigured: false, overdueLeadsNotified: 0, matchesNotified: 0 });
      return;
    }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    // Seguimientos vencidos que todavía no se avisaron para esta fecha puntual.
    const overdueLeads = await adminPrisma.lead.findMany({
      where: {
        deletedAt: null,
        nextFollowUpDate: { not: null, lt: startOfToday },
        followUpNotifiedAt: null,
      },
    });
    for (const lead of overdueLeads) {
      await sendToAccount(lead.accountId, {
        title: "Seguimiento vencido",
        body: `${lead.contactName} — hace falta hacer seguimiento`,
        url: "/app/leads",
      });
    }
    if (overdueLeads.length > 0) {
      await adminPrisma.lead.updateMany({
        where: { id: { in: overdueLeads.map((l) => l.id) } },
        data: { followUpNotifiedAt: new Date() },
      });
    }

    // Matches nuevos de alto puntaje que todavía no se avisaron.
    const hotMatches = await adminPrisma.match.findMany({
      where: { score: { gte: MATCH_NOTIFY_SCORE_THRESHOLD }, notifiedAt: null },
      include: { lead: true, property: true },
    });
    for (const match of hotMatches) {
      await sendToAccount(match.accountId, {
        title: "Match nuevo",
        body: `${match.lead.contactName} matchea con "${match.property.title}" (${match.score} pts)`,
        url: "/app/matches",
      });
    }
    if (hotMatches.length > 0) {
      await adminPrisma.match.updateMany({
        where: { id: { in: hotMatches.map((m) => m.id) } },
        data: { notifiedAt: new Date() },
      });
    }

    reply.send({
      ok: true,
      vapidConfigured: true,
      overdueLeadsNotified: overdueLeads.length,
      matchesNotified: hotMatches.length,
    });
  });
}
