# LoloShop — Instrucciones del proyecto

Punto de venta e inventario multi-ubicación (PWA). Repo: `rslnt1270/Lolo-Shop` (**PÚBLICO** — nunca commitear secretos).

## Stack real
- **Next.js** (App Router) + React + TypeScript · **PWA** vía `next-pwa` (SW en `public/sw.js`, gitignored).
- **Prisma** ORM sobre **PostgreSQL** (`DATABASE_URL`). Cliente generado en `/lib/generated/prisma` (gitignored).
- **Auth:** `next-auth` (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`).
- **Escaneo:** `html5-qrcode` + `react-barcode` (flujo POS: escanear SKU/barcode → movimiento de inventario).
- **UI:** `framer-motion`, `lucide-react`. Catálogo 3D + webhook WhatsApp integrados.
- **Imágenes de producto:** `@vercel/blob`. Captura foto en el alta → edición en cliente (Canvas: crop 1:1, resize, auto-niveles, EXIF-upright) en `lib/image/process.ts` → subida server-side en `lib/image/upload.ts` (nunca en el data source) → URL en `Product.imageUrl`. Reutilizable para agregar/cambiar foto desde `/productos`. Requiere `BLOB_READ_WRITE_TOKEN` (crear el store en Vercel; sin él la subida real falla, pero los tests usan mock).
- **Deploy:** Vercel.

## Modelo de datos (Prisma)
Fuente de verdad: `docs/superpowers/specs/2026-11-05-modelo-datos-er.md`.
`User` (role: owner|manager|collaborator, ligado a Location) · `Location` (store|warehouse; tiendas: LoloShop_Lomas y LoloShop_ClubAlva) · `Product` (marca `Brand`, `Department`, `publicCode` de 5 caracteres, `imageUrl` frente, `backImageUrl` atrás) → `Variant` (sku/barcode únicos, price) · `InventoryLevel` (available por variant×location) · `Movement` (auditoría) · `Sale` → `SaleLine` (ventas; stock nunca negativo, idempotencia por `clientRequestId`) · `AppSetting` (umbral de stock bajo).

## Reglas que no se rompen
- **Lo público usa solo `PublicProduct`** (`lib/data/public-projection.ts`): sin SKU, sin código de barras, sin conteos; disponibilidad sí/no por talla. Un producto es público solo con foto de frente y de atrás.
- **Nada inventado ante el cliente:** ni productos, precios o existencias de ejemplo, ni promesas de apartado o envío.
- El servidor decide permisos (rol releído de la base). Colaborador: solo su tienda, no cambia precios. Manager con tienda: solo esa tienda. Solo el owner anula ventas.
- No se guardan contactos de clientes.
- Móvil primero: objetivos táctiles ≥ 44 px, 375 px, `prefers-reduced-motion`, español de México.

## Trabajo entre Claude y Antigravity
Reparto, flujo de Git, contrato y backlog: `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md` (§3). Resumen:
- Antigravity: `components/virtual-store/`, `lib/virtual-store/`, aspecto de `/catalogo`. Claude: `prisma/`, `lib/data/`, `lib/sales/`, `lib/catalog/`, `lib/actions.ts`, `lib/auth/`, `app/api/`, `app/pos`, `app/ventas`, `app/escanear`. Fuera de tu zona, pide el cambio por escrito.
- Rama por tarea desde `feat/demo-alta-lote` (hasta que llegue a `main`). Sin commits en `main`, sin `push` ni `--force` sin visto bueno del dueño.
- Terminado = evidencia pegada de `npx tsc --noEmit`, `npm test` y `npm run build`.

## Convenciones
- **Secretos:** todo `.env`/`.env*.local` está gitignoreado; solo se versiona `.env.example`. **PROHIBIDO** commitear `.env`.
- Commits: Conventional Commits.
- Migraciones: Prisma (`prisma migrate`). No editar SQL a mano.

## Seguridad
- **Incidente 2026-07-21 (remediado):** `.env` estuvo trackeado en el repo público (commit `6f2e79b`) con `DATABASE_URL` + `NEXTAUTH_SECRET`. La auditoría automática (`4e5c510`) lo destrackeó y endureció `.gitignore`.
- **Rotación completada 2026-07-22:** las credenciales expuestas fueron **rotadas y verificadas inservibles**. Password de Neon (`neondb_owner`) cambiado vía `ALTER ROLE` (viejo rechazado con `psql`); `NEXTAUTH_SECRET` regenerado (`openssl rand -base64 32`). Aplicado en `.env` local + Vercel (Production/Preview) + redeploy. Se agregó `DATABASE_URL` (faltaba en Vercel) y `BOT_API_KEY` (endpoint n8n). El blob del `.env` **sigue en la historia pública** pero con credenciales muertas → **purga de historia opcional** (git-filter-repo/BFG), no urgente.
- `User.password`: bcrypt (seed coste 10; `/cuenta` coste 12). Producción usa contraseñas propias (verificado 2026-11-09), nunca las de desarrollo del seed.

## MCP disponibles (`.mcp.json`)
- `shopify-dev` — docs/API de Shopify.
- `graphify` — grafo de conocimiento del código (`graphify-out/graph.json`, 440 nodos/42 comunidades). Regenerar: `graphify update . --no-cluster --force && graphify cluster-only . --no-label --no-viz`.
- `postgres` — consultas read-only al esquema (usa `${DATABASE_URL}` del entorno; **exportar la var o no conecta**). Read-only por diseño del server; para producción, usar un rol de DB de solo-lectura dedicado.

## Verificación
```
npm run dev        # desarrollo
npm run build      # build de producción
npx tsc --noEmit   # tipos
npm test           # pruebas unitarias
npm run test:db    # pruebas contra Postgres local (ver test/db/)
npx prisma studio  # inspección de datos
```
