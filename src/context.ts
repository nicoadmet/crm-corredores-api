// Valida el token de Supabase Auth y resuelve (o crea) el accountId/userId del usuario logueado.
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createClient } from "@supabase/supabase-js";
import { adminPrisma } from "./db";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function createContext({ req }: CreateFastifyContextOptions) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return { accountId: null, userId: null };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { accountId: null, userId: null };

  let user = await adminPrisma.user.findUnique({ where: { supabaseId: data.user.id } });

  if (!user) {
    const account = await adminPrisma.account.create({
      data: { name: data.user.email ?? "Nueva cuenta", slug: data.user.id },
    });
    user = await adminPrisma.user.create({
      data: {
        accountId: account.id,
        supabaseId: data.user.id,
        email: data.user.email ?? "",
        name: data.user.email ?? "",
      },
    });
  }

  return { accountId: user.accountId, userId: user.id };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
