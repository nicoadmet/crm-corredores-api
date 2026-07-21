import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router";

const server = Fastify();

await server.register(cors, { origin: true });
await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter },
});

server.listen({ port: 4000 }, () => {
  console.log("Servidor corriendo en http://localhost:4000");
});