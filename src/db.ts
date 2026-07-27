// Cliente único de Prisma, para no crear una conexión nueva en cada archivo.
import { PrismaClient, Prisma } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.APP_DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

// Corre una consulta avisándole antes a Postgres qué accountId es, para que las políticas RLS filtren bien.
export async function withAccount<T>(
  accountId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_account_id', ${accountId}, true)`;
    return fn(tx);
  });
}

// Cliente separado (rol postgres, bypassea RLS) sólo para resolver la cuenta en el login — ahí todavía no sabemos el accountId.
const adminAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const adminPrisma = new PrismaClient({ adapter: adminAdapter });