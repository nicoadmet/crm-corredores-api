// Ficha pública de una propiedad: HTML server-side con meta tags Open Graph,
// para que WhatsApp arme el preview al compartir el link.
import type { FastifyInstance } from "fastify";
import { adminPrisma } from "../../db";

// Escapa caracteres especiales para no permitir inyectar HTML/JS desde el título de una propiedad.
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function registerPublicPropertyRoute(server: FastifyInstance) {
  server.get("/p/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = await adminPrisma.property.findUnique({
      where: { id },
      include: { images: { orderBy: { order: "asc" }, take: 1 } },
    });

    if (!property) {
      reply.code(404).type("text/html").send("<h1>Propiedad no encontrada</h1>");
      return;
    }

    const title = escapeHtml(property.title);
    const description = escapeHtml(
      `${property.operationType} · ${property.propertyType} en ${property.zone} — ${property.currency} ${property.price}`
    );
    const imageUrl = property.images[0]?.url;

    reply.type("text/html").send(`<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:type" content="website" />
        ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ""}
      </head>
      <body style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: 0 auto;">
        <h1>${title}</h1>
        ${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="width: 100%; border-radius: 8px;" />` : ""}
        <p>${description}</p>
      </body>
      </html>`
    );
  });
}