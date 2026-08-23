# crm-corredores-api

Backend de InmoCRM — CRM mobile-first para corredores inmobiliarios independientes.

API tipada end-to-end con tRPC sobre Fastify, Postgres (Supabase) con Row Level Security para multi-tenancy real, y notificaciones push vía Web Push API.

---

## Stack técnico

- **Runtime**: Node.js + TypeScript
- **Servidor HTTP**: Fastify
- **API**: tRPC (tipado end-to-end con el frontend)
- **ORM**: Prisma 7 (`prisma-client`, adapter `@prisma/adapter-pg`)
- **Base de datos**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth (JWT validado en `protectedProcedure`)
- **Multi-tenancy**: Row Level Security (RLS) real en Postgres, por `accountId`
- **Storage**: Supabase Storage (bucket `property-images`)
- **Notificaciones**: Web Push API + VAPID
- **Linter**: oxlint
- **Hosting**: Render (free tier)

---

## Estructura del proyecto

Organizado por dominio/feature, no por capa técnica:

```
src/
  modules/
    properties/
      router.ts          # endpoints tRPC de propiedades
      publicRoute.ts      # GET /p/:id (ficha pública, ruta plana Fastify)
    leads/
      router.ts
    matches/
      router.ts           # sólo lectura, calcula motivos al vuelo
    catalogs/
      router.ts
      publicRoute.ts       # GET /c/:id (catálogo público)
    agenda/
      router.ts
    stats/
      router.ts            # sólo lectura, sin migraciones propias
    push/
      router.ts             # subscribe / unsubscribe
      internalRoute.ts       # POST /internal/check-notifications (cron)
  services/
    matching.ts             # scoring puro, compartido entre properties y leads
    matchSync.ts             # efectos sobre la base (upsert/delete de matches)
  generated/
    prisma/                  # cliente Prisma generado (client.ts)
  context.ts                 # resuelve accountId/userId desde el JWT
  trpc.ts
  index.ts                    # bootstrap de Fastify, parsers, rutas planas
prisma/
  schema.prisma
prisma.config.ts               # datasource url vive acá (Prisma 7), no en schema.prisma
```

Cada módulo de dominio agrupa su router de tRPC y, si aplica, su ruta pública. Lo compartido entre dominios vive en `services/`.

---

## Módulos / entidades

| Módulo | Descripción |
|---|---|
| `properties` | CRUD de propiedades, papelera (soft-delete), duplicar, historial de precios, tags, búsqueda y filtros, `listOptions` liviano para selects, ficha pública `/p/:id` |
| `leads` | CRUD de leads, papelera, timeline de interacciones (`addActivity`), seguimiento (`followUpSummary`), búsqueda y filtros, `listOptions` |
| `matches` | Sólo lectura — el matching se genera y sincroniza automáticamente desde `properties`/`leads`, no hay endpoint de creación manual |
| `catalogs` | Agrupar propiedades bajo un link público reusable (`/c/:id`) |
| `stats` | Resumen de propiedades y leads por estado + tasa de conversión (sin tablas propias) |
| `agenda` | Visitas (ligadas a Lead + Property) y tareas libres, con fecha y hora |
| `push` | Suscripción de dispositivos a notificaciones y disparo interno vía cron |

---

## Modelo de datos

Entidades principales (ver `prisma/schema.prisma` para el detalle completo):

- `Account`, `User`
- `Property` (con `tags`, exclusividad, datos de propietario de uso interno, `deletedAt`)
- `PropertyImage`
- `Lead` (con `zones[]`, `nextFollowUpDate`, `followUpNotifiedAt`, preferencias de matching, `deletedAt`)
- `Match` (con `notifiedAt`, calculado y sincronizado automáticamente)
- `PriceHistory`
- `LeadActivity`
- `Catalog`, `CatalogProperty`
- `AgendaEvent`
- `PushSubscription`

Todas las tablas de negocio tienen `accountId` y policy de RLS `ALL` en Supabase (`using`/`with check` sobre `accountId = current_setting('app.current_account_id')`).

---

## Variables de entorno

Crear un `.env` en la raíz con:

```bash
# Conexión a Postgres (Supabase, pooler Supavisor puerto 5432, session mode)
DATABASE_URL=postgresql://...

# Supabase Auth / API
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxx

# Puerto del servidor
PORT=4000

# Notificaciones push (Web Push / VAPID)
VAPID_PUBLIC_KEY=xxxx
VAPID_PRIVATE_KEY=xxxx

# Ruta interna de notificaciones, llamada por el cron externo
CRON_SECRET=xxxx
```

> Si `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` no están configuradas, el módulo de push queda deshabilitado (con un warning) en vez de impedir que el servidor arranque.

---

## Cómo correr en desarrollo

```bash
npm install
npx prisma generate
npm run dev
```

`npm run dev` usa `tsx watch` — no compila con `tsc`, así que no hace type-checking estricto en desarrollo.

---

## Migraciones de Prisma

```bash
npx prisma migrate dev --name nombre_de_la_migracion
```

Después de cada migración que agregue una **tabla nueva**, hace falta un paso manual adicional en Supabase (Database → Policies):

1. Activar RLS en la tabla nueva.
2. Crear una policy `ALL`:
   ```sql
   using ("accountId" = current_setting('app.current_account_id'::text, true))
   with check ("accountId" = current_setting('app.current_account_id'::text, true))
   ```

Si sólo se agrega una **columna** a una tabla existente, no hace falta policy nueva.

---

## Build y deploy

- **Build Command** (Render): `npm install && npx prisma migrate deploy`
- **Start Command**: `npm start` (sin `--watch`)
- El servidor escucha en `process.env.PORT` y host `0.0.0.0`.
- Auto-deploy configurado en "On Commit" contra `main`.

---

## Notificaciones push

El disparo automático corre vía un cron externo (cron-job.org) que pega cada 10 minutos a:

```
POST /internal/check-notifications
Header: x-cron-secret: <CRON_SECRET>
```

Esta ruta revisa:
- Leads con `nextFollowUpDate` vencido y `followUpNotifiedAt: null`.
- Matches con `score >= 70` y `notifiedAt: null`.

Y envía la notificación a cada `PushSubscription` de la cuenta correspondiente, marcando lo ya notificado para no repetir.

> La ruta no pasa por tRPC — es una ruta plana de Fastify, porque la llama un proceso externo, no un usuario autenticado.

---

## Notas técnicas relevantes

- **Prisma 7**: la URL del datasource vive en `prisma.config.ts`, no en `schema.prisma`. El generator usa `provider = "prisma-client"` con output en `src/generated/prisma` (archivo principal `client.ts`).
- **RLS**: se implementa con un cliente Prisma separado (`adminPrisma`, bypassea RLS) sólo para resolver/crear la cuenta en el login, y `withAccount(accountId, fn)` para todo lo demás — abre una transacción, corre `SELECT set_config('app.current_account_id', ...)` y recién ahí ejecuta la query.
- **Rutas públicas** (`/p/:id`, `/c/:id`, `/internal/check-notifications`) son rutas planas de Fastify, no pasan por tRPC, y usan `adminPrisma` porque son públicas por diseño o las llama un proceso externo.
- **Content-Type comodín**: `src/index.ts` registra un parser de respaldo (`addContentTypeParser("*", ...)`) para que servicios externos (como el cron) no rompan con `415` si mandan un `Content-Type` sin body.
- El backend (Render free) se duerme tras 15 minutos sin tráfico — el cron externo lo despierta indirectamente al pegarle al endpoint de notificaciones.

---

## Repo hermano

El frontend vive en un repositorio aparte: `crm-corredores-web`. No es un monorepo — cada uno tiene su propio `package.json`, `node_modules` y deploy independiente.
