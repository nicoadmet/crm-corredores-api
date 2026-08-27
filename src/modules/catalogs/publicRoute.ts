// Página pública de un catálogo: una selección de propiedades bajo un solo link, para mandar por
// WhatsApp en vez de una propiedad a la vez. Cada tarjeta lleva a la ficha individual /p/:id.
import type { FastifyInstance } from "fastify";
import { adminPrisma } from "../../db";
import { catalogLinkMeta, contactBlock, escapeHtml, formatPrice, renderPage } from "../../services/publicPage";

export function registerPublicCatalogRoute(server: FastifyInstance) {
  server.get("/c/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const catalog = await adminPrisma.catalog.findUnique({
      where: { id },
      include: {
        account: { select: { name: true, phone: true } },
        properties: {
          orderBy: { order: "asc" },
          include: { property: { include: { images: { orderBy: { order: "asc" }, take: 1 } } } },
        },
      },
    });

    const url = `${request.protocol}://${request.hostname}${request.url}`;

    if (!catalog) {
      reply.code(404).type("text/html").send(
        renderPage({
          title: "Catálogo no encontrado",
          description: "El link puede haber vencido o el catálogo ya no está disponible.",
          url,
          body: `<p class="empty">No encontramos este catálogo. Puede que el link haya vencido.</p>`,
        }),
      );
      return;
    }

    const properties = catalog.properties.map((cp) => cp.property);
    const name = escapeHtml(catalog.name);
    const count = properties.length;

    const meta = catalogLinkMeta(catalog.name, properties);
    const description = escapeHtml(meta.description);

    const itemsHtml = properties
      .map((p) => {
        const image = p.images[0]?.url;
        const specs = [
          p.rooms != null ? `${p.rooms} amb` : null,
          p.bathrooms != null ? `${p.bathrooms} ${p.bathrooms === 1 ? "baño" : "baños"}` : null,
          p.coveredArea != null ? `${p.coveredArea} m²` : null,
        ].filter(Boolean);
        return `
        <a class="item" href="/p/${p.id}">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : `<span class="item-noimg"></span>`}
          <span>
            <p class="item-price">${escapeHtml(formatPrice(p.currency, p.price))}</p>
            <p class="item-title">${escapeHtml(p.title)}</p>
            <p class="item-meta">${escapeHtml([p.zone, ...specs].join(" · "))}</p>
          </span>
        </a>`;
      })
      .join("");

    reply.type("text/html").send(
      renderPage({
        title: name,
        description,
        image: meta.image,
        url,
        body: `
    <div class="body">
      <div class="pills"><span class="pill pill-main">Selección</span></div>
      <h1 style="font-size: 24px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 4px;">${name}</h1>
      <p class="zone">${description}</p>

      ${count > 0 ? `<div class="items">${itemsHtml}</div>` : `<p class="empty">Este catálogo todavía no tiene propiedades.</p>`}
    </div>

    ${contactBlock(catalog.account, `Hola! Vi el catálogo "${catalog.name}" y me interesan algunas propiedades. ${url}`)}
    <p class="foot">Publicado con InmoCRM</p>`,
      }),
    );
  });
}
