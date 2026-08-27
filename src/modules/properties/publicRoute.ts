// Ficha pública de una propiedad. Es lo que abre el cliente cuando le mandás el link por WhatsApp:
// tiene que cargar rápido, verse bien en un celular, y terminar en una forma de contactarte.
// Nunca muestra los datos del propietario (ownerName/ownerPhone/ownerNotes): son de uso interno.
import type { FastifyInstance } from "fastify";
import { adminPrisma } from "../../db";
import { contactBlock, escapeHtml, formatPrice, propertyLinkMeta, renderPage } from "../../services/publicPage";

const OPERATION_LABELS: Record<string, string> = { venta: "Venta", alquiler: "Alquiler" };
const PROPERTY_TYPE_LABELS: Record<string, string> = { depto: "Departamento", casa: "Casa" };

export function registerPublicPropertyRoute(server: FastifyInstance) {
  server.get("/p/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const property = await adminPrisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: "asc" } },
        account: { select: { name: true, phone: true } },
      },
    });

    if (!property) {
      reply.code(404).type("text/html").send(
        renderPage({
          title: "Propiedad no encontrada",
          description: "El link puede haber vencido o la propiedad ya no está publicada.",
          url: `${request.protocol}://${request.hostname}${request.url}`,
          body: `<p class="empty">No encontramos esta propiedad. Puede que el link haya vencido o que ya no esté publicada.</p>`,
        }),
      );
      return;
    }

    const title = escapeHtml(property.title);
    const price = formatPrice(property.currency, property.price);
    const operation = OPERATION_LABELS[property.operationType] ?? property.operationType;
    const type = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
    const url = `${request.protocol}://${request.hostname}/p/${property.id}`;

    const meta = propertyLinkMeta(property);
    const description = escapeHtml(meta.description);

    const specs = [
      property.rooms != null ? { value: String(property.rooms), label: property.rooms === 1 ? "ambiente" : "ambientes" } : null,
      property.bedrooms != null ? { value: String(property.bedrooms), label: property.bedrooms === 1 ? "dormitorio" : "dormitorios" } : null,
      property.bathrooms != null ? { value: String(property.bathrooms), label: property.bathrooms === 1 ? "baño" : "baños" } : null,
      property.coveredArea != null ? { value: String(property.coveredArea), label: "m² cubiertos" } : null,
      property.totalArea != null ? { value: String(property.totalArea), label: "m² totales" } : null,
      property.garage ? { value: property.garageSpaces ? String(property.garageSpaces) : "Sí", label: "cochera" } : null,
      property.age != null ? { value: property.age === 0 ? "Nueva" : String(property.age), label: property.age === 0 ? "a estrenar" : "años" } : null,
    ].filter((spec): spec is { value: string; label: string } => spec !== null);

    const galleryHtml = property.images.length
      ? `<div class="gallery${property.images.length === 1 ? " single" : ""}">
          ${property.images.map((image) => `<img src="${escapeHtml(image.url)}" alt="${title}" loading="lazy" />`).join("")}
        </div>`
      : `<div class="no-photo">Sin fotos todavía</div>`;

    reply.type("text/html").send(
      renderPage({
        title: escapeHtml(meta.title),
        description,
        image: meta.image,
        url,
        body: `
    ${galleryHtml}

    <div class="body">
      <div class="pills">
        <span class="pill pill-main">${escapeHtml(operation)}</span>
        <span class="pill">${escapeHtml(type)}</span>
        ${property.status !== "disponible" ? `<span class="pill pill-warn">${escapeHtml(property.status)}</span>` : ""}
      </div>

      <p class="price">${escapeHtml(price)}</p>
      <h1>${title}</h1>
      <p class="zone">${escapeHtml(property.zone)}${property.address ? ` · ${escapeHtml(property.address)}` : ""}</p>

      ${specs.length ? `<div class="specs">${specs
        .map((spec) => `<div class="spec"><span class="spec-value">${escapeHtml(spec.value)}</span><span class="spec-label">${escapeHtml(spec.label)}</span></div>`)
        .join("")}</div>` : ""}

      ${property.description ? `<div class="section"><h2>DESCRIPCIÓN</h2><p>${escapeHtml(property.description)}</p></div>` : ""}

      ${property.tags.length ? `<div class="section"><h2>CARACTERÍSTICAS</h2><div class="tags">${property.tags
        .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`)
        .join("")}</div></div>` : ""}
    </div>

    ${contactBlock(property.account, `Hola! Me interesa "${property.title}" (${price}). ${url}`)}
    <p class="foot">Publicado con InmoCRM</p>`,
      }),
    );
  });
}
