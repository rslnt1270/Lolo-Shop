# LoloShop: plan global del próximo salto

- **Fecha:** 2026-10-27 · **Estado:** propuesta para aprobación del dueño · **Sin secretos**
- **Spec de referencia:** `docs/superpowers/specs/2026-10-27-loloshop-maestro-design.md`
- **Reemplaza en orden a:** `plans/2026-10-19-probador-virtual-roadmap-sprints.md` (el contenido de costos y de cada sprint del probador sigue siendo válido, pero las fechas y el orden cambian aquí).
- **Ritmo:** sprints de 2 semanas, con 40 h planificadas (margen de 10 h). Las horas son estimación con agentes, incluyendo pruebas.
- **Fechas:** a partir del 2026-10-28. **Temporada alta:** Buen Fin (mediados de noviembre [C]) y diciembre. No se hacen cortes de producción riesgosos (dominio, migraciones) en esas fechas. Del 2026-12-18 al 2027-01-06: congelamiento de cambios en producción.

---

## 1. Resumen del orden

| Sprint | Fechas (propuestas) | Objetivo | Entregable para el dueño |
|---|---|---|---|
| **S-A** | 10-28 → 11-10 | Bloqueantes, catálogo digitalizado | Alta por lote con foto y `/catalogo` sin datos internos |
| **S-B** | 11-11 → 11-24 | Tienda digital: fotos y recorrido | Recorrido navegable con productos en su repisa |
| **S-C** | 11-25 → 12-08 | Visualizaciones de producto | Riel interactivo y selector de color |
| **S-D** | 12-09 → 12-17 | Demo cerrada y pruebas en tienda | Demo publicada antes del congelamiento |
| **S-E** | 2027-01-07 → 01-20 | Probador personal (solo owner) | `/probador` en tablet real, sin IA en la demo |
| **S-F** | 2027-01-21 → 02-03 | Probador cliente y operación | Enlace o QR firmado, si D4 lo aprueba |

**Puertas de decisión [D]:**
- **P-1** (antes de S-A): aprobar este spec y D-1 a D-6.
- **P-2 = decisión D-4** (antes de S-B): hosting de la demo. Workers Paid más rama de Neon, o Vercel Pro. Es una sola decisión; en el spec maestro aparece como D-4.
- **P-3** (antes de S-E): decidir D4 (modo cliente) y aprobar la captura de la demo en tienda.

---

## 2. Sprint S-A: catálogo digitalizado (10-28 → 11-10)

**Objetivo:** cerrar los bloqueantes B1 a B5 y dar de alta productos por lote con foto.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| A.1 | Decidir D-1 a D-6 y aprobar este plan (P-1) | Dueño | 1 | Decisiones escritas en el spec maestro §6 |
| A.2 | Commitear los docs del probador y de la demo en un PR `docs:` aparte | Claude | 1 | PR `docs:` mergeado |
| A.3a | **Respaldo de Neon** (`pg_dump \| age → R2`) y **simulacro de restauración** en una BD de prueba. **Va antes de A.3** | Claude + Codex | 6 | Restauración documentada con conteo de filas |
| A.3 | Baseline de `prisma migrate` en una rama de Neon, luego `migrate resolve` en producción (B5) | Claude (diseño) + Codex | 6 | `prisma migrate status` limpio en la rama de prueba y en producción |
| A.4 | Modo lote en `/escanear`, con el formulario abierto y el escáner activo (demo §3.1 punto 1) | Codex (TDD) | 6 | Tests del flujo; 10 altas seguidas en móvil |
| A.5 | Categoría obligatoria y paso a `createProduct` (demo §3.1 punto 2) | Codex (TDD) | 3 | Tests: categoría vacía rechazada; aparece en `/productos` |
| A.6 | Stock inicial explícito, con 0 por defecto (D-1) | Codex (TDD) | 2 | Tests: stock negativo rechazado |
| A.8 | Proyección pública de productos y `/catalogo` sin SKU ni inventario (B1) | Codex | 3 | Test: `/catalogo` no expone SKU ni `inventory` |
| A.9 | Quitar datos demo y `?? 4` del modal (B2) | Antigravity (rama `feat/demo-recorrido-3d`) | 2 | Sin `LS-DEMO-01` ni números inventados |
| A.10 | Repetir `test`, `lint` y `build` en la rama del recorrido (B3) | Claude | 1 | Salida de los tres comandos archivada |
| A.11 | Merge del PR #17 tras prueba manual del dueño (B4) | Dueño + Claude | 2 | Deploy de producción verde; PWA instalable |
| A.12 | Prueba de alta por lote con 10 productos reales en móvil. Con el tiempo medido se fija el criterio de éxito (el "10 en 10 min" es provisional) | Dueño | 2 | Tiempo medido y lista de problemas |
| A.13 | `reset-users.ts` en producción (pendiente desde septiembre) | Dueño | 1 | Cada rol inicia sesión en producción |
| A.14 | **Captura de la tienda por secciones reales** (playeras, chamarras, accesorios, gorras y las que defina el dueño) con el protocolo (sin personas, sin precios visibles), **antes del Buen Fin** (a más tardar el 2026-11-10) (demo §4.1) | Dueño | 4 | Lista de secciones y fotos o video de cada una con 70–80 % de solape |
| A.15 | **Contrato del recorrido:** tipos `PublicProduct`, `ZoneConfig` y `HotspotConfig`, y qué recibe cada componente de `components/virtual-store/` (spec maestro §5.1). Se entrega a la sesión de Antigravity | architect | 2 | Tipos en el spec y en `lib/virtual-store/types.ts` |
| | **Total** | | **42** | 8 h son del dueño; 34 h de agentes + margen de 6 h |

> **Movido:** A.7 (guardar el original de la foto) pasa a S-B como B.0, para no pasar de la capacidad del sprint.

---

## 3. Sprint S-B: tienda digital (11-11 → 11-24)

**Objetivo:** recorrido navegable con fotos reales de las cuatro zonas.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| B.0 | Guardar el original de la foto, sin recorte ni niveles, y una **foto trasera opcional** para el giro 2.5D (D-10) (migración por `prisma migrate`, depende de A.3) | backend-data | 4 | Migración aplicada en la rama de Neon; alta guarda original, trasera y vista previa |
| B.1 | **Sala virtual para pruebas** (D-9): cuarto minimalista con pestañas por sección (playeras, chamarras, accesorios, gorras), cámara que se mueve a cada riel y panel de producto con talla. Mismo componente que el recorrido real (`kind: "virtual"`) | visual-3d + visual-design | 6 | Navegable en móvil; se puede mostrar sin fotos de la tienda |
| B.2 | Generar panorámicas 360° **por sección real** (R-1) con las fotos de A.14, y revisar que no muestren personas | Dueño + visual-3d (guía) | 3 | Una panorámica por sección aprobada (`kind: "real"`) |
| B.9 | **Recorte de fondo de prendas** para el 2.5D: comparar 2–3 opciones (librería en el navegador, servicio externo, recorte manual) con 5 prendas reales. Revisar **licencia** y peso de cada librería | visual-3d + architect | 4 | Tabla comparativa y decisión D-8 del dueño |
| B.3 | Subir panorámicas y guardar la configuración de zonas fuera de `zones.ts` | Codex | 4 | Zonas leen de la base de datos o de JSON versionado |
| B.4 | Medir `yaw` y `pitch` de cada repisa sobre las fotos reales | Antigravity + Claude | 4 | Coordenadas en la configuración, con foto de referencia |
| B.5 | Hotspots con producto elegido (no por índice) y ocultar si no hay producto | Codex + Antigravity | 4 | Test: hotspot sin producto no se muestra |
| B.6 | Recorrido con 10 productos reales y riel con filtro por categoría (ideas §2.1) | Antigravity | 6 | Navegable en móvil real con 10 o más productos |
| B.7 | Pruebas en móvil real de la ficha y del recorrido | Dueño | 2 | Lista de problemas de tamaño de toque y de rendimiento |
| B.8 | Decisión de hosting (P-2 = D-4): Cloudflare Workers Paid o Vercel Pro | Dueño | 1 | Decisión escrita |
| | **Total** | | **38** | + margen de 2 h. Sin cortes de producción durante el Buen Fin. Si el margen no alcanza, B.6 se termina en S-C |

---

## 4. Sprint S-C: visualizaciones de producto (11-25 → 12-08)

**Objetivo:** que la cuadrícula y el riel se vean y se usen como en las referencias.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| C.1 | **Riel 2.5D** con prendas recortadas (D-7): hover o toque gira la prenda, clic la levanta y abre el panel (ideas §2.1). Depende de B.9 | visual-3d + visual-design | 8 | Prueba en móvil y escritorio; `prefers-reduced-motion` respetado |
| C.2 | Variantes por color en el modelo y en el alta (requiere migración) | Codex | 6 | Migración aplicada; tests de variantes |
| C.3 | Selector de color y compra rápida en la cuadrícula, sin ocultar precio, talla ni poco stock (ideas §2.4) | Antigravity + Codex | 6 | Prueba en móvil; test: quick-add muestra precio |
| C.4 | Ficha que convierte: reseñas arriba del pliegue, "consultar en tienda" en vez de número de stock (ideas §3.1) | Antigravity | 4 | Revisión visual con el dueño |
| C.5 | Revisión de seguridad y privacidad del recorrido y de las fotos | Claude | 2 | Informe sin hallazgos bloqueantes |
| | **Total** | | **26** | + margen de 14 h |

---

## 5. Sprint S-D: demo cerrada (12-09 → 12-17)

**Objetivo:** demo publicada antes del congelamiento del 12-18.

| # | Tarea | Herramienta | h | Hecho cuando |
|---|---|---|---|---|
| D.1 | Publicar la demo en el hosting elegido (P-2) | Claude + Dueño | 6 | URL de demo accesible; `lint`, `test` y `build` en verde |
| D.2 | Secretos con `wrangler secret put` o en Vercel (el dueño los teclea) | Dueño | 1 | Ninguna credencial en el repo |
| D.3 | Prueba de humo por rol (owner, manager, collaborator) | Claude | 2 | Tabla de resultados |
| D.4 | Checklist de la demo: catálogo, recorrido, riel, ficha | Dueño | 2 | Checklist firmado |
| D.5 | Ajustes de la última prueba | Codex + Antigravity | 6 | Sin errores bloqueantes |
| | **Total** | | **17** | + margen |

---

## 6. Sprint S-E: probador personal (2027-01-07 → 01-20)

**Objetivo:** el owner hace demos con su tablet, sin IA y sin guardar nada. Puerta P-3.

Primero, **corte del dominio** `loloshop.y4ga.app` (Doc-Dominio fase 2) en la primera semana de S-E, con TTL baja, al terminar el congelamiento. Necesita P-2 decidido.

Tareas tomadas de `plans/2026-10-19-probador-virtual-roadmap-sprints.md`, Sprint 4, con los cambios de la auditoría:
- Migración de `tryOnImageUrl`, `tryOnCategory`, `tryOnView` y `TryOnUsage` (Codex).
- `lib/tryon/` con interfaz `TryOnProvider` y `MockProvider` (Codex, TDD).
- `POST /api/probador` en `/api/probador/*`, protegido, `no-store` (Codex).
- `/probador` solo owner: consentimiento, cámara local, selector de prendas, "Capturar", resultado en memoria con borrado garantizado (Antigravity + Codex).
- Revisión de seguridad y privacidad (Claude).

**Criterio:** prueba en tablet real y tests de "no persistencia" (sin `localStorage`, Blob ni `fetch` con la imagen hacia LoloShop).

---

## 7. Sprint S-F: probador cliente y operación (2027-01-21 → 02-03)

**Objetivo:** el modo cliente solo si D4 se decide por enlace o QR firmado. Si D4 es "abierto", se agrega Turnstile y límite por IP antes.

Tareas de Sprint 5 y 6 del plan de probador, con las correcciones de auditoría:
- Enlaces firmados (HMAC, 24 h, 3 usos) y QR diario para la tienda.
- Botón "Probar" en el modal del producto, con consentimiento y captura con `<input capture>`.
- `/privacidad` revisada por un abogado (D4 del plan). Sin esto, no sale a producción el modo cliente.
- Límite por IP con hash y sal; anti-bot (Turnstile en Cloudflare o BotID en Vercel).
- Operación: n8n en VPS o Cloud, avisos de respaldo y de inventario (plan Sprint 6).

---

## 8. Dependencias

| Tarea | Depende de |
|---|---|
| A.3 (baseline de migraciones) | A.3a (respaldo restaurable) |
| A.4 a A.6 y B.0 (alta por lote y foto original) | A.3 (baseline de migraciones) |
| A.8 (proyección pública) | Ninguna. Es bloqueante para cualquier demo pública |
| B.3 (configuración de zonas) | A.14 y B.2 (fotos) |
| B.6 (recorrido con productos) | A.5 (categoría), A.8 (proyección pública) y A.15 (contrato) |
| C.1 (riel 2.5D) | B.9 (recorte de fondo) |
| C.2 (variantes por color) | B.0 (migraciones en orden) |
| Corte del dominio `loloshop.y4ga.app` | P-2 (hosting) y fuera de temporada alta: **se mueve a S-E** (semana del 2027-01-07) |
| D.1 (publicar demo) | P-2 (hosting) y A.11 (PR #17) |
| S-E (probador) | Demo publicada y P-3 |

---

## 9. Costos [C]

| Concepto | Costo mensual | Cuándo |
|---|---|---|
| Cloudflare Workers Paid | US$5 | Desde S-D si se elige Cloudflare (D-4) |
| Vercel Pro | US$20 | Al aceptar el cliente, o desde S-D si se elige Vercel |
| Vercel Blob / R2 | Según uso | Desde S-A (fotos de producto) |
| Probador (IA) | US$0 en demo. Topes del plan §3 después | Desde S-E, con piloto del plan Sprint 2 |

---

## 10. Registro de riesgos del plan

| Riesgo | Sprint | Acción |
|---|---|---|
| Antigravity reporta sin verificar | S-A | B3 antes de cada merge |
| El dueño no tiene tiempo para captura de la tienda | S-A | Captura con celular y protocolo simple, antes del Buen Fin (A.14) |
| El recorte de fondo no da calidad con fotos de historias de IG | S-B | B.9 compara opciones con prendas reales; si ninguna sirve, sesión de fotos con fondo liso |
| El corte del dominio no cabe antes del Buen Fin | S-E | La demo usa la URL del hosting; el corte se hace en enero con TTL baja |
| Dos diseños del recorrido en paralelo (spec frente a Antigravity) | S-A | Contrato A.15 entregado a Antigravity antes de seguir |
| Build o migración falla en Neon de prueba | S-A | Rama de prueba antes de producción |
| Buen Fin cae dentro de S-B | S-B | Sin cortes de producción; cambios en Preview |
| Congelamiento de diciembre corta S-D | S-D | D.1 antes del 12-17 |

---

## 11. Criterios de cierre de la demo

Ver spec maestro §8. Resumen: alta de 10 productos con foto en menos de 10 minutos, `/catalogo` sin datos internos, recorrido con 10 o más productos en móvil real, y `lint`, `test` y `build` en verde.
