# LoloShop — Instrucciones del proyecto

Punto de venta e inventario multi-ubicación (PWA). Repo: `rslnt1270/Lolo-Shop` (**PÚBLICO** — nunca commitear secretos).

## Stack real
- **Next.js** (App Router) + React + TypeScript · **PWA** vía `next-pwa` (SW en `public/sw.js`, gitignored).
- **Prisma** ORM sobre **PostgreSQL** (`DATABASE_URL`). Cliente generado en `/lib/generated/prisma` (gitignored).
- **Auth:** `next-auth` (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`).
- **Escaneo:** `html5-qrcode` + `react-barcode` (flujo POS: escanear SKU/barcode → movimiento de inventario).
- **UI:** `framer-motion`, `lucide-react`. Catálogo 3D + webhook WhatsApp integrados.
- **Deploy:** Vercel.

## Modelo de datos (Prisma)
`User` (role: owner|manager|collaborator, ligado a Location) · `Location` (store|warehouse) · `Product` → `Variant` (sku/barcode únicos, price) · `InventoryLevel` (available por variant×location, `@@unique`) · `Movement` (delta ±1, auditoría de entradas/salidas por usuario).

## Convenciones
- **Secretos:** todo `.env`/`.env*.local` está gitignoreado; solo se versiona `.env.example`. **PROHIBIDO** commitear `.env`.
- Commits: Conventional Commits.
- Migraciones: Prisma (`prisma migrate`). No editar SQL a mano.

## Seguridad
- **Incidente 2026-07-21 (remediado):** `.env` estuvo trackeado en el repo público (commit `6f2e79b`) con `DATABASE_URL` + `NEXTAUTH_SECRET`. La auditoría automática (`4e5c510`) lo destrackeó y endureció `.gitignore`. **Pendiente crítico:** las credenciales expuestas siguen en la historia del repo público → **ROTAR** password de DB y regenerar `NEXTAUTH_SECRET` (`openssl rand -base64 32`); considerar purga de historia (git-filter-repo/BFG).
- `User.password`: verificar que use hashing fuerte (bcrypt/argon2), no "hash simple".

## MCP disponibles (`.mcp.json`)
- `shopify-dev` — docs/API de Shopify.
- `graphify` — grafo de conocimiento del código (`graphify-out/graph.json`, 440 nodos/42 comunidades). Regenerar: `graphify update . --no-cluster --force && graphify cluster-only . --no-label --no-viz`.
- `postgres` — consultas read-only al esquema (usa `${DATABASE_URL}` del entorno; **exportar la var o no conecta**). Read-only por diseño del server; para producción, usar un rol de DB de solo-lectura dedicado.

## Verificación
```
npm run dev        # desarrollo
npm run build      # build de producción
npm run lint
npm test           # tests
npx prisma studio  # inspección de datos
```
