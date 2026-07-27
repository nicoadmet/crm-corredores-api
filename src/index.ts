// Punto de entrada del backend: levanta el servidor Fastify, registra CORS
// y el router de tRPC, y escucha en el puerto 4000.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";
import { adminPrisma } from "./db";

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
});

// Escapa caracteres especiales para no permitir inyectar HTML/JS desde el título de una propiedad.
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Ficha pública de una propiedad: HTML server-side con meta tags Open Graph, para que WhatsApp arme el preview.
server.get("/p/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const property = await adminPrisma.property.findUnique({ where: { id } });

  if (!property) {
    reply.code(404).type("text/html").send("<h1>Propiedad no encontrada</h1>");
    return;
  }

  const title = escapeHtml(property.title);
  const description = escapeHtml(
    `${property.operationType} · ${property.propertyType} en ${property.zone} — ${property.currency} ${property.price}`
  );

  reply.type("text/html").send(`<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
  </head>
  <body style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: 0 auto;">
    <h1>${title}</h1>
    <p>${description}</p>
  </body>
  </html>`);
});

server.listen({ port: 4000 }, () => {
  console.log("Servidor corriendo en http://localhost:4000");
});