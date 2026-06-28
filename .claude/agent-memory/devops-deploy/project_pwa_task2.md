---
name: project-pwa-task2
description: Task 2 PWA setup completed — manifest, icons, next-pwa, known concerns (themeColor deprecation, next-pwa vulnerabilities, icon placeholders)
metadata:
  type: project
---

Task 2 (Configuración PWA instalable) completada en branch `fase-1-cimientos`, commit `4ac9fb1`.

**Why:** Hace la app instalable como PWA para usuarios móviles de LoloShop.

**How to apply:** Si se toca layout.tsx o next.config.mjs, considerar las notas siguientes antes de modificar.

## Concerns conocidos

1. `themeColor` en `metadata` (no en `viewport`) — emite warnings de Next.js 14.2.5 pero funciona. Para eliminar warnings, mover a `export const viewport: Viewport = { themeColor: "#3CBFBF" }` en un futuro PR.

2. `next-pwa` tiene 12 vulnerabilidades en dependencias transitivas de build (workbox). Revisar con `npm audit` en F2.

3. Iconos `public/icons/icon-192.png` y `public/icons/icon-512.png` son placeholders sólidos teal (#3CBFBF). Deben reemplazarse con el logo real de LoloShop antes del lanzamiento.

4. El SW (`public/sw.js`) está gitignored — se regenera en cada `npm run build`. No añadir al repo.
