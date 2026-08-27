// Base compartida de las páginas públicas (/p/:id y /c/:id): son las únicas pantallas del producto
// que ve alguien que no es el corredor, y casi siempre las abre desde un link de WhatsApp, en un
// celular. Todo el HTML se arma en el servidor, sin build ni framework: tiene que cargar al toque
// incluso con señal mala.

// Escapa caracteres especiales para no permitir inyectar HTML/JS desde datos cargados por el usuario.
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function formatPrice(currency: string, price: unknown): string {
  const value = Number(price);
  if (!Number.isFinite(value)) return String(price);
  return `${currency} ${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export type PublicAccount = { name: string; phone: string | null };

// El nombre de la cuenta arranca siendo el email del corredor (lo pone el auto-provisioning del
// login). Mostrar un email como firma queda mal, así que sólo se muestra si parece un nombre real.
export function displayName(account: PublicAccount | null | undefined): string | null {
  const name = account?.name?.trim();
  if (!name || name.includes("@")) return null;
  return name;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return escapeHtml(letters.toUpperCase());
}

// Bloque de contacto. Sin esto el cliente ve las propiedades y no tiene cómo responder: el link
// no cierra el círculo. Si la cuenta todavía no cargó un teléfono, no se muestra nada (mejor eso
// que un botón que no lleva a ningún lado).
export function contactBlock(account: PublicAccount | null | undefined, message: string): string {
  const phone = account?.phone?.replace(/\D/g, "");
  const name = displayName(account);
  if (!phone) return "";

  const label = name ? escapeHtml(name) : "el corredor";
  return `
    <section class="contact">
      <div class="contact-who">
        ${name ? `<span class="avatar">${initials(name)}</span>` : ""}
        <div>
          <p class="contact-name">${label}</p>
          <p class="contact-role">Consultá sin compromiso</p>
        </div>
      </div>
      <a class="btn" href="https://wa.me/${phone}?text=${encodeURIComponent(message)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.7-4.3A8.5 8.5 0 1 1 20.5 11.5z" />
        </svg>
        Escribir por WhatsApp
      </a>
    </section>`;
}

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #fbfcfc;
    color: #111827;
    line-height: 1.5;
  }
  .wrap { max-width: 560px; margin: 0 auto; padding: 0 0 40px; background: #fff; min-height: 100vh; }
  @media (min-width: 600px) {
    .wrap { margin: 24px auto; min-height: 0; border: 1px solid #e9ebee; border-radius: 16px; overflow: hidden; }
  }

  .gallery { display: flex; gap: 4px; overflow-x: auto; scroll-snap-type: x mandatory; background: #eef0f2; }
  .gallery img { width: 100%; flex: 0 0 100%; height: 260px; object-fit: cover; scroll-snap-align: center; }
  .gallery.single img { flex: 0 0 100%; }
  .no-photo { display: flex; align-items: center; justify-content: center; height: 180px; background: #eef0f2; color: #b6bcc4; font-size: 13px; }

  .body { padding: 20px 18px 0; }
  .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: #f3f4f6; color: #4b5563; }
  .pill-main { background: #ecfbf7; color: #0f766e; }
  .pill-warn { background: #fef3c7; color: #92400e; }

  .price { font-size: 30px; font-weight: 800; letter-spacing: -.03em; margin: 0; font-variant-numeric: tabular-nums; }
  h1 { font-size: 17px; font-weight: 600; margin: 6px 0 2px; letter-spacing: -.01em; }
  .zone { margin: 0; color: #767c88; font-size: 14px; }

  .specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 1px; background: #eceef0; border: 1px solid #eceef0; border-radius: 12px; overflow: hidden; margin: 18px 0 0; }
  .spec { background: #fff; padding: 10px 8px; text-align: center; }
  .spec-value { display: block; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .spec-label { display: block; font-size: 10.5px; color: #a3a8b1; margin-top: 1px; }

  .section { margin-top: 22px; }
  .section h2 { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: #a3a8b1; margin: 0 0 8px; }
  .section p { margin: 0; font-size: 14px; color: #374151; white-space: pre-line; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }

  .items { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .item { display: flex; gap: 12px; align-items: center; text-decoration: none; color: inherit; border: 1px solid #e9ebee; border-radius: 12px; padding: 10px; }
  .item img { width: 72px; height: 72px; object-fit: cover; border-radius: 9px; flex: 0 0 auto; }
  .item-noimg { width: 72px; height: 72px; border-radius: 9px; background: #eef0f2; flex: 0 0 auto; }
  .item-price { font-size: 16px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; margin: 0; }
  .item-title { margin: 2px 0 0; font-size: 13px; color: #374151; }
  .item-meta { margin: 2px 0 0; font-size: 12px; color: #767c88; }

  .contact { position: sticky; bottom: 0; margin-top: 26px; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); background: rgba(255,255,255,.94); backdrop-filter: blur(8px); border-top: 1px solid #e9ebee; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .contact-who { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
  .avatar { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: 0 0 auto; border-radius: 999px; background: #ccfbf1; color: #0f766e; font-size: 12px; font-weight: 700; }
  .contact-name { margin: 0; font-size: 14px; font-weight: 600; }
  .contact-role { margin: 0; font-size: 11.5px; color: #767c88; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 12px; background: #0d9488; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; flex: 1 1 auto; }
  .btn svg { width: 17px; height: 17px; }

  .foot { padding: 18px; text-align: center; font-size: 11px; color: #a3a8b1; }
  .empty { padding: 28px 18px; text-align: center; color: #767c88; font-size: 14px; }
`;

export function renderPage({
  title,
  description,
  image,
  url,
  body,
}: {
  title: string;
  description: string;
  image?: string;
  url: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <!-- Sin esto el celular renderiza la página a 980px de ancho y sale diminuta: es la diferencia
       entre que el link se vea bien o parezca roto. -->
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ""}
  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" />
  <style>${STYLES}</style>
</head>
<body>
  <main class="wrap">
${body}
  </main>
</body>
</html>`;
}

// ── Metadatos del link ───────────────────────────────────────────────────────
// Título, descripción e imagen que van en las meta tags Open Graph, o sea: lo que arma WhatsApp
// cuando pegás el link en un chat. Viven acá y no adentro de cada ruta pública porque la app los
// necesita también, para mostrarle al corredor cómo va a quedar antes de mandarlo. Si estuvieran
// duplicados, la vista previa mostraría una cosa y el chat otra apenas cambiara uno de los dos.

export type LinkMeta = { title: string; description: string; image?: string };

const OPERATION_LABELS: Record<string, string> = { venta: "Venta", alquiler: "Alquiler" };
const PROPERTY_TYPE_LABELS: Record<string, string> = { depto: "Departamento", casa: "Casa" };

type PropertyForMeta = {
  title: string;
  operationType: string;
  propertyType: string;
  zone: string;
  currency: string;
  price: unknown;
  images: { url: string }[];
};

export function propertyLinkMeta(property: PropertyForMeta): LinkMeta {
  const price = formatPrice(property.currency, property.price);
  const operation = OPERATION_LABELS[property.operationType] ?? property.operationType;
  const type = PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType;
  return {
    title: `${property.title} — ${price}`,
    // Se lee en un renglón: qué es, dónde y cuánto, en ese orden.
    description: `${operation} · ${type} en ${property.zone} — ${price}`,
    image: property.images[0]?.url,
  };
}

export function catalogLinkMeta(name: string, properties: PropertyForMeta[]): LinkMeta {
  const count = properties.length;
  const zones = Array.from(new Set(properties.map((p) => p.zone)));
  const prices = properties.map((p) => Number(p.price)).filter((n) => Number.isFinite(n));
  const currency = properties[0]?.currency ?? "USD";

  const priceRange =
    prices.length === 0
      ? null
      : Math.min(...prices) === Math.max(...prices)
        ? formatPrice(currency, Math.min(...prices))
        : `${formatPrice(currency, Math.min(...prices))} a ${formatPrice(currency, Math.max(...prices))}`;

  const parts = [
    `${count} ${count === 1 ? "propiedad" : "propiedades"}`,
    zones.length === 0 ? null : zones.length <= 3 ? zones.join(", ") : `${zones.slice(0, 2).join(", ")} y ${zones.length - 2} zonas más`,
    priceRange,
  ].filter(Boolean);

  return {
    title: name,
    description: parts.join(" · "),
    image: properties.find((p) => p.images[0])?.images[0]?.url,
  };
}
