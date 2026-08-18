// Página pública de un catálogo: HTML server-side con meta tags Open Graph (para el preview de
// WhatsApp) y una mini-card por propiedad, cada una linkeando a su ficha individual /p/:id.
import type { FastifyInstance } from "fastify";
import { adminPrisma } from "../db";

// Escapa caracteres especiales para no permitir inyectar HTML/JS desde el nombre del catálogo
// o el título de una propiedad.
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function registerPublicCatalogRoute(server: FastifyInstance) {
  server.get("/c/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const catalog = await adminPrisma.catalog.findUnique({
      where: { id },
      include: {
        properties: {
          orderBy: { order: "asc" },
          include: { property: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } },
        },
      },
    });

    if (!catalog) {
      reply.code(404).type("text/html").send("<h1>Catálogo no encontrado</h1>");
      return;
    }

    const properties = catalog.properties.map((cp) => cp.property);
    const name = escapeHtml(catalog.name);
    const description = escapeHtml(`${properties.length} propiedades seleccionadas`);
    const coverImage = properties.find((p) => p.images[0])?.images[0]?.url;
    const baseUrl = `${request.protocol}://${request.hostname}`;

    const cardsHtml = properties
      .map((p) => {
        const title = escapeHtml(p.title);
        const image = p.images[0]?.url;
        return `
          <a href="/p/${p.id}" style="display: flex; gap: 12px; align-items: center; text-decoration: none; color: inherit; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            ${image ? `<img src="${image}" alt="${title}" style="width: 64px; height: 64px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" />` : ""}
            <div>
              <p style="margin: 0; font-weight: 600;">${title}</p>
              <p style="margin: 4px 0 0; color: #555;">${escapeHtml(p.zone)} — ${escapeHtml(p.currency)} ${p.price}</p>
            </div>
          </a>`;
      })
      .join("");

    reply.type("text/html").send(`<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${name}</title>
        <meta property="og:title" content="${name}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:type" content="website" />
        ${coverImage ? `<meta property="og:image" content="${coverImage}" />` : ""}
      </head>
      <body style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: 0 auto;">
        <h1>${name}</h1>
        <p style="color: #555;">${description}</p>
        ${cardsHtml || "<p>Este catálogo todavía no tiene propiedades.</p>"}
      </body>
      </html>`
    );
  });
}
