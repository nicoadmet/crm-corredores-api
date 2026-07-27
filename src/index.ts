// Punto de entrada del backend: levanta el servidor Fastify, registra CORS
// y el router de tRPC, y escucha en el puerto 4000.
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";
import { createContext } from "./context";

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
});

server.listen({ port: 4000 }, () => {
  console.log("Servidor corriendo en http://localhost:4000");
});