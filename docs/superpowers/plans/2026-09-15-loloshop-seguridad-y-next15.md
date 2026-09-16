# LoloShop — Plan: remediación de seguridad y migración a Next 15

**Fecha:** 2026-09-15
**Estado:** T0–T2 hechas; T3 en PR #17 (preview listo, falta prueba manual); T6 parcial (bcrypt verificado, /cuenta desplegada); T4, T5, T7 pendientes. Actualizado 2026-09-15 (tarde).
**Contexto:** Producción estuvo 7 semanas sin desplegar (Vercel perdió la
conexión con GitHub) y `main` no compilaba. Al restaurar el pipeline y activar
Dependabot/CodeQL aparecieron 69 alertas; la más grave (bypass de autorización
en middleware, CVE-2025-29927) se cerró con `next@14.2.35`. Lo que queda solo
se corrige saliendo de Next 14 (EOL) y de `next-pwa` (abandonado).

---

## Hecho (2026-09-15)

| # | Tarea | Resultado |
|---|---|---|
| 0 | NavBar solo con sesión; seed.ts y /catalogo arreglados | `73a36dd`, `9035df5`, `23427eb` |
| 0 | Vercel ↔ GitHub reconectado; deploy automático verificado | `dpl_BwBez7Rb…` (source: git) |
| 1 | CI de seguridad: gitleaks, npm audit (no bloqueante hasta T3), Dependabot, CodeQL, push protection | `6cd3e1a`, `5cdf900` |
| 2 | Triage Dependabot: majors cerrados (#5, #10–#13) e ignorados en config; menores mergeados | PRs #6… |
| 2 | Plugin Semgrep desinstalado; token revocado, nota Keep y PDF borrados | — |
| 3 | Next 15.5 + React 19 + Serwist: rama `feat/next-15`, **PR #17** con CI verde y preview | pendiente prueba manual y merge |
| 6 | `/cuenta` (cambiar contraseña, bcrypt 12) + `prisma/scripts/reset-users.ts` | `9f70527` (PR #18) |
| — | Añadir tienda/bodega desde el dashboard (solo owner), para la demo | `0ac17bd` |
| — | Catálogo público como componente cliente con parallax | `3c58814` |

---

## Regla para todo lo que sigue

Cada tarea va en **su propia rama** con **preview deploy de Vercel** y CI
verde antes de mergear a `main`. `main` siempre despliega a producción.

Verificación mínima por tarea (todas deben pasar):

```
npx vitest run          # 45+ tests
npx tsc --noEmit
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci NEXTAUTH_SECRET=ci NEXTAUTH_URL=http://localhost:3000 npx next build
```

---

## Tarea 3 — Next 14 → 15.5.x + React 19 + Serwist (rama `feat/next-15`)

**Objetivo:** cerrar las 3 críticas y ~10 altas restantes (Next EOL y
`serialize-javascript` vía `next-pwa`). Al terminar, quitar
`continue-on-error` del job `dependencias` en `security.yml`.

**Inventario de riesgo (medido en el repo, 2026-09-15):**
- Sin `cookies()`/`headers()`/`params` en páginas → la API asíncrona de Next 15
  casi no afecta. Único segmento dinámico: `app/api/auth/[...nextauth]/route.ts`.
- `app/layout.tsx:10` exporta `themeColor` en `metadata` → mover a `viewport`.
- `next.config.mjs` envuelve con `next-pwa` → sustituir por `@serwist/next`.
- `next-auth@4.24.15` es compatible con Next 15 (no migrar a Auth.js v5 aquí).
- `framer-motion@12` y `@testing-library/react@16` soportan React 19.
  Revisar peer deps de `react-barcode@1.6` y `html5-qrcode@2.3.8`.
- Middleware `next-auth/middleware` sigue funcionando en 15 (no renombrar a
  `proxy.ts`; eso es Next 16).

**Pasos:**

1. `git checkout -b feat/next-15`.
2. `npx @next/codemod@latest upgrade 15` (acepta React 19 y los codemods
   `next-async-request-api`, `metadata-to-viewport-export`).
   Fijar: `next@15.5.x` (última 15.5, no 16), `react@19`, `react-dom@19`,
   `@types/react@19`, `@types/react-dom@19`, `eslint-config-next@15` (T5).
3. PWA: `npm rm next-pwa && npm i @serwist/next && npm i -D serwist`.
   - `next.config.mjs`: `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: process.env.NODE_ENV === "development" })`.
   - Crear `app/sw.ts` con `defaultCache` de `@serwist/next/worker`.
   - `tsconfig.json`: añadir `"lib": [..., "webworker"]` y `"types": ["@serwist/next/typings"]` si el codemod no lo hace.
   - `.gitignore`: mantener `public/sw.js`, añadir `public/swe-worker-*.js`.
4. `app/layout.tsx`: `export const viewport: Viewport = { themeColor: "#3CBFBF" }`.
5. Revisar `app/api/auth/[...nextauth]/route.ts` (handler sin cambios en v4).
6. Correr verificación mínima. Arreglar tipos de React 19 (`ReactNode`,
   `useRef` obligatorio con argumento, `forwardRef` innecesario).
7. `npm audit --omit=dev --audit-level=high` debe quedar en 0 alta/crítica.
8. Push → preview de Vercel. **Prueba manual en móvil (PWA instalada):**
   login, NavBar oculta sin sesión, escanear, etiquetas, productos, foto de
   producto (Blob), catálogo público, instalación/actualización del SW.
9. `security.yml`: quitar `continue-on-error` y el TODO. Merge a `main`.
10. Actualizar `CLAUDE.md` (stack: Next 15, Serwist en vez de next-pwa).

**Rollback:** `vercel rollback` al deploy anterior (Vercel guarda
`isRollbackCandidate`).

---

## Tarea 4 — Prisma 5 → 7 (rama `feat/prisma-7`)

**Cuándo:** después de T3 y, preferiblemente, junto con la migración
Neon → Postgres en la RPi5 (mismo cambio de conexión).

- Prisma 7 requiere `prisma.config.ts`, driver adapter (`@prisma/adapter-pg`)
  y generador `prisma-client` (salida en `lib/generated/prisma`, ya usada).
- Regenerar cliente, correr `prisma migrate diff` para confirmar que no hay
  drift, actualizar `prisma/seed.ts`.
- Verificar el MCP `postgres` de solo lectura sigue funcionando.

---

## Tarea 5 — Calidad: ESLint y TypeScript

- `npm run lint` hoy abre el asistente interactivo porque no hay config.
  Añadir `eslint@9` + `eslint-config-next` (flat config) y hacer que CI lo
  ejecute. Dependabot ya ignora TS 7; subir a último **5.x** (`typescript@5.9`).
- Corregir el warning de build `themeColor` (se resuelve en T3).

---

## Tarea 6 — Auditoría de autenticación

**Hecho:** `User.password` usa bcrypt (seed coste 10, cambios coste 12) y
`findUser` compara con `bcrypt.compare` (tests en `lib/auth/__tests__`).
Pantalla `/cuenta` para que cada usuario rote su contraseña.

**Hallazgo 2026-09-15:** producción solo tenía `colab1` con contraseña en
texto plano (nadie podía iniciar sesión) y las contraseñas de desarrollo
están en el repo público. **Pendiente inmediato:** correr una vez
`npx tsx prisma/scripts/reset-users.ts` contra producción con
`SEED_PASSWORD_*` definidas en `.env` local (crea lolo/encargado/colab1/colab2
sobre la tienda existente "Tienda Principal", sin tocar productos).

**Pendiente:** comparar `BOT_API_KEY` en tiempo constante
(`crypto.timingSafeEqual`); pantalla de owner para restablecer contraseñas
ajenas y dar de alta usuarios (hoy solo por script).

---

## Tarea 7 — Higiene de secretos (opcional, no urgente)

- Purga del blob de `.env` en la historia pública (`git filter-repo`) —
  credenciales ya rotadas, riesgo residual bajo; requiere force-push y avisar
  a Vercel (redeploy).
- Revocar el token de Semgrep en semgrep.dev (no regenerar). Borrar la nota de
  Google Keep y el PDF subido.

---

## Fuera de alcance por ahora

- Next 16 (`proxy.ts`, Turbopack por defecto, cache components): esperar a
  que `next-auth` v4/Auth.js y Serwist lo soporten de forma estable.
- Migración a Auth.js v5.
