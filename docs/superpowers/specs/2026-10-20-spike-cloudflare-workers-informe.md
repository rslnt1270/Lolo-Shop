# Informe de la prueba de LoloShop en Cloudflare Workers (spike local)

- **Fecha:** 2026-10-20 · **Estado:** terminado en local; **nada desplegado en Cloudflare, sin cambios de DNS, sin tocar Neon ni producción**
- **Rama:** `spike/cloudflare-workers` en el `git worktree` `../LoloShop-cf-spike` (3 commits locales, **no subida**, **no mergear**). Parte de `feat/next-15` (PR #17) con `main` fusionado encima.
- **Entorno de la prueba:** `opennextjs-cloudflare preview` (workerd local) contra un **Postgres local desechable** (puerto 54329, ya detenido), con Hyperdrive simulado por `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Sin secretos en el repo: las variables de la prueba viven en `.dev.vars` (ignorado por git) con valores aleatorios locales.
- **Convención:** **[V]** medido o visto en esta prueba; **[D]** documentación oficial leída hoy; **[NV]** no verificado.

## 1. Veredicto: **go condicionado**

LoloShop corre en Workers con OpenNext **si se cambia la capa de acceso a datos** y se usa **Workers Paid (US$5/mes)**. La app funcionó de punta a punta en local: login por rol, páginas protegidas, catálogo público, lectura y escritura en la base, y una acción de servidor con autorización por tienda. Falta lo que solo se prueba en la nube real (ver §5).

## 2. Resultados contra los criterios de la auditoría (§4)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | `opennextjs-cloudflare build` sin errores sobre la rama del PR #17 | **Cumple** | [V] Next 15.5.28, OpenNext `@opennextjs/cloudflare` 1.20.12. El build base (`npm run build`) también pasa con Next 15.5.25 |
| 2 | Tamaño dentro del límite | **Cumple** | [V] `Total Upload: 12 502 KiB` (≈12.2 MiB; 3 083 KiB gzip). [D] Desde 2026-09-04 el límite es **64 MiB sin tope comprimido en Free y Paid** |
| 3 | Login por rol | **Cumple** | [V] owner, manager y collaborator (con `loc-1`) inician sesión y devuelven su rol; contraseña errónea da 401; sin sesión, las páginas redirigen a `/api/auth/signin` |
| 4 | Movimiento de inventario ±1, alta con foto, `/catalogo` | **Parcial** | [V] `/catalogo` público muestra el producto desde la base. [V] La acción `adjustInventoryAction` registró **+1** (stock 10→11, 1 fila en `Movement`) como colaborador de la tienda 1. [V] El mismo colaborador sobre la tienda 2 fue **rechazado** (500, sin movimiento ni cambio de stock). **No probado:** escaneo con cámara real y alta con foto (ver §5) |
| 5 | PWA instalable con Serwist, sin cachear rutas de API | **Parcial** | [V] `/sw.js` y `/manifest.json` responden 200. **No probado:** instalación en un dispositivo ni el contenido de la caché |
| 6 | CPU por petición dentro del plan | **No cumple en Free** | [V] `bcryptjs` compare cuesta **~67 ms de CPU** con costo 10 y **~265 ms** con costo 12 (los que guarda `/cuenta`). [D] Free permite **10 ms** por petición; Paid, **30 s por defecto**. Cada login excede Free. El resto de rutas no se midió en CPU: workerd local no aplica el límite |

## 3. Qué hubo que cambiar (y por qué)

1. **Cliente de Prisma.** El `PrismaClient` estándar carga el motor nativo (`libquery_engine…so.node`) y falla en workerd con `EvalError: Code generation from strings disallowed for this context` [V]. Con Prisma 5.22 funcionó este camino, que además es el que documenta Cloudflare para Postgres con Hyperdrive [D]:
   - `previewFeatures = ["driverAdapters"]` en `prisma/schema.prisma`.
   - Importar `PrismaClient` desde `@prisma/client/wasm`.
   - Adaptador `@prisma/adapter-pg` (5.22.0) con `pg.Pool`.
   - **Un cliente por petición** (clave: el `ctx` de la petición), porque en Workers no se comparten conexiones entre peticiones.
   - Binding `HYPERDRIVE` en `wrangler.jsonc`.
2. **Un solo punto de cambio.** Solo `lib/auth/users.ts` y `lib/data/prisma-source.ts` importan `lib/prisma.ts`. Se mantuvo el `export default prisma` mediante un `Proxy`, así que ningún otro archivo cambió.
3. **Fuera de Workers (Vercel o desarrollo)** el mismo archivo cae a un singleton con `DATABASE_URL` y el mismo adaptador. Un solo camino de código para Cloudflare y Vercel.
4. **Config nueva:** `wrangler.jsonc` (`nodejs_compat`, `assets`, `hyperdrive`, `observability`), `open-next.config.ts`, entradas en `.gitignore` (`.open-next`, `.wrangler`, `.dev.vars`).

**Para la versión real** el cambio debe vivir en `lib/platform/db.ts`, no mezclado con el módulo del dominio, y el middleware de `next-auth` ya es compatible (middleware normal, no el de Node que OpenNext no soporta).

## 4. Hallazgos adicionales

- **La rama del PR #17 está 6 commits detrás de `main`** (falta `/cuenta`, "agregar tienda", catálogo en componente cliente). Fusiona **sin conflictos** [V: `git merge-tree`]. Hay que actualizarla antes de mergear.
- **Error 500 poco claro:** la autorización de tienda en `adjustInventoryAction` lanza un error y el cliente recibe 500 con un `digest`. Es el comportamiento actual de la app, no de Workers. Conviene devolver un 403 con mensaje.
- **Ruta de diagnóstico:** durante la prueba creé `/api/spike-db` (sin autenticación, excluida del middleware). Una revisión automática de seguridad lo marcó. Se **eliminó** en el commit `b1d2913` y la ruta ya no existe en el build final [V: 307 por el middleware].
- **Cuenta de Cloudflare:** `wrangler whoami` muestra sesión OAuth con permisos `user (read)` y `offline_access`. **No hay scope de escritura de Workers**, así que un despliegue real exigirá volver a iniciar sesión con más permisos [NV hasta intentarlo].
- **Costos Cloudflare para la demo:** Workers Paid **US$5/mes** (obligatorio por CPU, ver criterio 6). Hyperdrive y R2 [NV] sus límites gratuitos: verificar antes de crearlos.

## 5. Lo que falta y solo se puede probar en la nube

| Pendiente | Requiere | Quién |
|---|---|---|
| Despliegue real en `workers.dev` | `wrangler login` con permisos de Workers y Workers Paid | Dueño |
| Base de datos real | **Rama de Neon** y un **Hyperdrive** apuntando a ella (`wrangler hyperdrive create`, con la cadena de conexión tecleada por el dueño) | Dueño |
| Secretos (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BOT_API_KEY`) | `wrangler secret put` (los teclea el dueño) | Dueño |
| CPU real por ruta | Observabilidad de Workers tras el despliegue | Claude |
| Alta de producto con foto | `@vercel/blob` desde Workers (token) **o** migración a R2 | Dueño decide |
| Escaneo con cámara y PWA instalada | Un dispositivo real y HTTPS (`workers.dev`) | Dueño |
| Seguridad de las fotos del modo cliente en Workers | Fuera de este spike | Sprint 2 |

## 6. Cómo repetir la prueba local

```
cd ../LoloShop-cf-spike
export DATABASE_URL=<cadena de un Postgres local de prueba>
npx prisma db push && npx tsx prisma/seed.ts          # solo en esa base local
npx opennextjs-cloudflare build
WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<misma cadena con usuario y contraseña> \
  npx opennextjs-cloudflare preview --port 8787
```

Notas: la cadena local necesita **usuario y contraseña** aunque el servidor no los exija (Hyperdrive lo valida). Un socket Unix en una ruta larga hace fallar a Postgres: usar un directorio corto.

## 7. Decisiones que necesito del dueño

1. ¿Autorizas pagar **Workers Paid (US$5/mes)** en tu cuenta de Cloudflare para la demo?
2. ¿Creas tú la **rama de Neon** y el **Hyperdrive**, o prefieres que te guíe paso a paso? (No tengo acceso a Neon desde aquí.)
3. ¿La demo va en `workers.dev` o en un subdominio de `y4ga.app`? (Un subdominio implica un cambio de DNS: solo con tu autorización expresa.)
4. Fotos de producto en la demo: ¿sigues con **Vercel Blob** (requiere token) o pasamos a **R2**?
5. ¿Mergeamos el PR #17 tras tu prueba manual y actualizamos su rama con `main`?
