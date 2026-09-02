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

  // Las cuentas creadas antes de que el registro pidiera el nombre quedaron con el email como
  // nombre, y el bloque de auto-provisioning de abajo sólo corre la primera vez. Si el nombre
  // guardado sigue siendo exactamente el email (o sea, nadie lo editó todavía) y ahora tenemos uno
  // de verdad —del formulario de registro o de Google—, se completa solo. Si el corredor ya lo
  // cambió a mano, no se toca.
  if (user) {
    const metadata = data.user.user_metadata as { name?: string; full_name?: string } | null;
    const realName = metadata?.name?.trim() || metadata?.full_name?.trim();
    const account = await adminPrisma.account.findUnique({
      where: { id: user.accountId },
      select: { name: true },
    });
    if (realName && account && account.name === data.user.email) {
      await adminPrisma.account.update({ where: { id: user.accountId }, data: { name: realName } });
    }
  }

  if (!user) {
    // El nombre sale de los metadatos del usuario: lo manda el formulario de registro como `name`,
    // y Google lo devuelve como `full_name` al entrar con OAuth. Importa más de lo que parece: es
    // la firma que aparece en las páginas públicas que el corredor comparte por WhatsApp. Si no
    // viene ninguno, se cae al email (que es lo que pasaba siempre antes).
    const metadata = data.user.user_metadata as { name?: string; full_name?: string } | null;
    const displayName = metadata?.name?.trim() || metadata?.full_name?.trim() || data.user.email || "Nueva cuenta";

    const account = await adminPrisma.account.create({
      data: { name: displayName, slug: data.user.id },
    });
    user = await adminPrisma.user.create({
      data: {
        accountId: account.id,
        supabaseId: data.user.id,
        email: data.user.email ?? "",
        name: displayName,
      },
    });
  }

  return { accountId: user.accountId, userId: user.id };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
