// Punto de entrada del backend: levanta el servidor Fastify, registra CORS,
// el router de tRPC y las rutas públicas de propiedades/catálogos/notificaciones, y escucha en el puerto 4000.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./routers";
import { createContext } from "./context";
import { registerPublicPropertyRoute } from "./routes/publicProperty";
import { registerPublicCatalogRoute } from "./routes/publicCatalog";
import { registerInternalNotificationsRoute } from "./routes/internalNotifications";

const server = Fastify({ logger: true });

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
