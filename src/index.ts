// Punto de entrada del backend: levanta el servidor Fastify, registra CORS,
// el router de tRPC y las rutas públicas de propiedades/catálogos/notificaciones, y escucha en el puerto 4000.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./routers";
import { createContext } from "./context";
import { registerPublicPropertyRoute } from "./modules/properties/publicRoute";
import { registerPublicCatalogRoute } from "./modules/catalogs/publicRoute";
import { registerInternalNotificationsRoute } from "./modules/push/internalRoute";

// trustProxy: en producción Fastify corre detrás del proxy de Render, así que sin esto
// request.protocol siempre dice "http" y request.hostname puede ser el interno. Las páginas
// públicas usan los dos para armar el og:url y el link del botón de WhatsApp: sin trustProxy,
// el link que recibe el cliente sale mal. Con esto Fastify lee X-Forwarded-Proto/Host.
const server = Fastify({ logger: true, trustProxy: true });

// Fastify por default sólo sabe interpretar "application/json" y "text/plain" — cualquier otro
// Content-Type sin parser registrado lo rechaza con 415, aunque el cuerpo venga vacío. Esto rompía
// el cron externo (cron-job.org) que le pega a /internal/check-notifications: manda un Content-Type
// que Fastify no reconoce, aunque el body quede vacío. Este parser "comodín" sólo actúa como
// respaldo para los Content-Type que Fastify no tiene registrados — no reemplaza el parser de JSON
// que ya usa el resto de la app (tRPC, etc.), esos siguen andando igual.
server.addContentTypeParser("*", function (request, payload, done) {
  done(null, undefined);
});

await server.register(cors, { origin: true });
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
});

registerPublicPropertyRoute(server);
registerPublicCatalogRoute(server);
registerInternalNotificationsRoute(server);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

server.listen({ port, host: "0.0.0.0" }, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
