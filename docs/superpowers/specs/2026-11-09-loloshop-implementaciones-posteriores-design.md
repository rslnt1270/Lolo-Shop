# LoloShop: implementaciones posteriores a ventas P1 y trabajo con Antigravity

**Fecha:** 2026-11-09 · **Estado:** borrador para revisión del dueño
**Base:** SRS (`2026-11-05-loloshop-srs.md`), modelo de datos (`2026-11-05-modelo-datos-er.md`, fuente de verdad), plan global (`../plans/2026-10-27-loloshop-plan-global.md`), UX del sitio público (`2026-11-05-sitio-publico-ux-design.md`), fotos (`2026-10-19-fotos-producto-ia-design.md` §13–§14).

Este documento dice **qué sigue** después del módulo de ventas, **quién lo hace** y **cómo trabajan juntos Claude y Antigravity** sin pisarse. No repite el plan global: lo actualiza con lo que ya está hecho y fija las reglas de colaboración.

---

## 1. Estado al 2026-11-09

### 1.1 Código

Rama **`feat/demo-alta-lote`** (en GitHub; worktree local `../LoloShop-alta`). `main` todavía **no** la tiene: mezclar a `main` despliega a producción y solo se hace en la fase F de la guía de salida.

| Área | Estado | Dónde |
|---|---|---|
| Alta por lote con escaneo, categoría obligatoria, stock inicial | Hecho | `app/escanear`, `components/products/NewProductForm.tsx` |
| Alta en dos modos: **solo stock** (sin foto, no sale al catálogo) y **catálogo** (fotos de frente y atrás obligatorias) | Hecho | `lib/domain/new-product.ts` (`EntryMode`) |
| Marcas (el colaborador crea; el owner fusiona) y departamentos (Dama, Caballero, Niños, Calzado, Accesorios) | Hecho | `lib/catalog/actions.ts`, `BrandCombobox` |
| Código público de 5 caracteres (Crockford) por producto | Hecho | `lib/domain/public-code.ts` |
| Venta en `/pos`: escáner, carrito, efectivo/tarjeta/SPAY, tienda o WhatsApp; sin stock negativo; sin doble cobro | Hecho | `app/pos`, `lib/sales/*`, `lib/data/prisma-sales-source.ts` |
| Dashboard `/ventas`: vendido, cobrado, pendientes, ventas de hoy con anulación (solo owner), stock bajo | Hecho | `app/ventas`, `components/sales/*` |
| Catálogo público y bot sin SKU ni conteos (B1) | Hecho | `lib/data/public-projection.ts` (`PublicProduct`) |
| Recorrido 3D de la tienda (Antigravity), adaptado a `PublicProduct` | Hecho, con datos de ejemplo de zonas | `components/virtual-store/`, `lib/virtual-store/` |
| Pruebas | 446 unitarias + 47 contra Postgres; `tsc` y `next build` en verde | `npm test`, `npm run test:db` |

### 1.2 Base de datos de producción (Neon, `us-east-2`)

- Respaldo verificado del 2026-11-09: rama de Neon `respaldo-2026-11-09` y volcado local fuera del repo, restaurado con conteos iguales.
- Ensayo de migración completo en la rama `ventas-prueba`: sin drift, `0_init` marcado, 3 migraciones aplicadas, relleno idempotente.
- Usuarios: 4, todos con contraseña propia (no las del seed).
- Tiendas: hoy 1 ("Tienda Principal"). Decisión del dueño 2026-11-09: **tienda 1 = `LoloShop_Lomas`** (renombrar), **tienda 2 = `LoloShop_ClubAlva`** (nueva); `colab1` → Lomas, `colab2` → ClubAlva. Pendiente de aplicar (lo ejecuta el dueño).
- Producción **todavía no** tiene las tablas de ventas: la salida sigue `docs/runbooks/2026-11-salida-ventas.md` (faltan fases D a G).

---

## 2. Reglas vigentes que toda implementación respeta

Decisiones del dueño y del diseño que ya no se discuten en cada tarea. Cambiarlas requiere decisión explícita del dueño.

1. **Roles.** Owner: todo, histórico, anula ventas, fusiona marcas. Manager: ve todo; si tiene tienda asignada, vende y confirma pagos **solo en esa tienda**. Colaborador: solo su tienda, solo el día, no cambia precios (R8), crea marcas.
2. **Privacidad.** No se guardan contactos de clientes; solo un alias opcional que rechaza números de teléfono.
3. **Público vs interno.** Todo lo que ve un cliente (catálogo, recorrido, ficha, bot, WhatsApp) usa **solo** `PublicProduct`: sin SKU, sin código de barras, sin conteos; disponibilidad **sí/no por talla**; solo tiendas (no almacén). Un producto es público solo con **foto de frente y de atrás**.
4. **Nada inventado ante el cliente.** Ni productos, ni precios, ni existencias de ejemplo; ni promesas ("apartado", "envío a domicilio") que la operación no cumple. Si no hay datos, se dice ("Pronto verás aquí las prendas de la tienda.").
5. **El cliente pide con el código público** ("Código K7Q2M") por WhatsApp.
6. **Móvil primero.** Objetivos táctiles de 44 px o más, uso a 375 px, `prefers-reduced-motion` respetado, textos en español de México.
7. **Seguridad.** El servidor decide permisos (rol releído de la base); nada de confiar en el cliente para precio, tienda o rol. Repo público: ningún secreto en commits, documentos ni capturas.
8. **Migraciones** solo con `prisma migrate`; el SQL lo genera Prisma.

---

## 3. Trabajo con Antigravity

### 3.1 Quién es dueño de qué

| Zona | Responsable | El otro puede… |
|---|---|---|
| `components/virtual-store/`, `lib/virtual-store/`, aspecto visual de `/catalogo` y de la ficha pública | **Antigravity** | Proponer cambios; Claude solo corrige lo que rompe reglas de §2 o la build, y lo avisa |
| `prisma/`, `lib/data/`, `lib/sales/`, `lib/catalog/`, `lib/actions.ts`, `lib/auth/`, `app/api/`, `app/pos`, `app/ventas`, `app/escanear` | **Claude** | Antigravity no los modifica; pide el cambio por escrito |
| **Contratos compartidos:** `PublicProduct` (`lib/data/public-projection.ts`) y los tipos de `lib/virtual-store/types.ts` | Claude define, Antigravity consume | Antigravity propone campos nuevos; Claude los agrega con pruebas |
| `docs/superpowers/specs/` y `plans/` | Ambos, cada uno en sus documentos | Comentar con una sección "Notas de Antigravity" o "Notas de Claude" |

### 3.2 Contrato público (copia exacta, la fuente es el código)

```ts
// lib/data/public-projection.ts
export interface PublicProduct {
  id: string;
  publicCode: string | null;
  title: string;
  brand: string;
  category: string;
  imageUrl: string | null;      // frente
  backImageUrl: string | null;  // atrás (giro 2.5D)
  sizes: { size: string; available: boolean }[];
  price: number | null;         // MXN, el menor de las tallas activas
}
```

`StoreHotspot.product` es `PublicProduct`. `bindProductsToHotspots` asigna un producto por punto y omite los puntos sin producto. Ningún componente público importa `Product` de `lib/domain/types`.

### 3.3 Flujo de Git

1. Rama base de trabajo: **`feat/demo-alta-lote`** hasta que se mezcle a `main`; después, `main`.
2. Una rama por tarea: `feat/3d-<tema>` (Antigravity) o `feat/<tema>` (Claude), creada desde la base del día.
3. Nadie hace commit en `main` ni `push` sin el visto bueno del dueño. Nadie usa `--force`.
4. Commits con Conventional Commits y solo de archivos de su zona (§3.1).
5. Nunca se commitea `.env*`, volcados, capturas con datos ni la carpeta `.playwright-mcp/`.
6. Integración: Claude revisa la rama de Antigravity (reglas de §2, contrato, pruebas) antes de juntarla con la base, como se hizo el 2026-11-09.

### 3.4 Cuándo una tarea está terminada

Con evidencia pegada en el reporte o el PR, no solo la afirmación:

```bash
npx tsc --noEmit        # sin errores
npm test                # todas en verde (número de pruebas)
npm run build           # "Compiled successfully"
```

Más: pruebas nuevas para el comportamiento nuevo (Vitest + Testing Library), y para UI pública una prueba que verifique que **no** aparece SKU ni conteos. `npm run lint` todavía no sirve como filtro (no hay configuración de ESLint).

### 3.5 Entrega de contexto

Cada sesión de Antigravity empieza leyendo, en este orden: `AGENTS.md`, este documento, y el spec de la tarea. Al terminar deja un reporte corto en el PR o en `docs/superpowers/plans/` con: qué hizo, archivos, evidencia de §3.4, y dudas abiertas.

---

## 4. Backlog priorizado

Prioridad: **P0** antes del Buen Fin · **P1** después del Buen Fin, antes del congelamiento de diciembre · **P2** enero en adelante. "h" = estimación en horas de agente.

### 4.1 P0: salida y operación del Buen Fin

| # | Tarea | Quién | h | Hecho cuando |
|---|---|---|---|---|
| 0.1 | Tiendas Lomas/ClubAlva y asignación de colaboradores (§1.2) | Dueño (script listo) | 0.2 | Consulta de C5 muestra cada colaborador en su tienda |
| 0.2 | Fase D: Preview de Vercel contra `ventas-prueba` y pruebas de humo | Claude + dueño | 2 | Fase G completa en el preview |
| 0.3 | Fases E–G: visto bueno, migración y deploy a producción, en horario sin ventas | Dueño + Claude | 2 | `migrate status` al día en producción; humo en verde |
| 0.4 | Número real de WhatsApp en una variable pública (`NEXT_PUBLIC_WHATSAPP_NUMBER`), sin número en el código; si falta, el botón no aparece | Claude | 1 | Prueba: sin variable no hay botón; con variable, enlace correcto |
| 0.5 | Autosuspend de Neon apagado durante el Buen Fin | Dueño | 0.1 | Anotado en la guía |
| 0.6 | Carga de mercancía con alta por lote (solo stock), y fotos frente/atrás de las prendas que irán al catálogo | Dueño + colaboradores | — | Inventario real cargado en ambas tiendas |

### 4.2 P1: tienda digital con datos reales

| # | Tarea | Quién | h | Hecho cuando |
|---|---|---|---|---|
| 1.1 | Cuadrícula del catálogo con **todos** los productos públicos (hoy solo los que caben en los 22 puntos del recorrido), filtro por departamento | Antigravity | 4 | Prueba con 30 productos: los 30 en la cuadrícula |
| 1.2 | Producto elegido por punto (por `publicCode`), no por orden; configuración de zonas fuera de `zones.ts` (JSON versionado) | Antigravity (UI) + Claude (dato) | 6 | Prueba: punto sin producto no se muestra; mover un producto no requiere código |
| 1.3 | Giro 2.5D frente/atrás con `backImageUrl` | Antigravity | 4 | Prueba en móvil; `prefers-reduced-motion` muestra solo el frente |
| 1.4 | Panorámicas reales por sección y `yaw`/`pitch` medidos (plan global B.2, B.4) | Dueño (fotos) + Antigravity | 6 | Una panorámica aprobada por zona, sin personas |
| 1.5 | Derivados de imagen (200/400/600/800/1280) y estándar de catálogo §14 | Claude | 6 | Catálogo sirve el tamaño adecuado; peso medido |
| 1.6 | Decidir y aplicar R18: ¿el bot de WhatsApp responde por artículos de solo stock (disponible sí/no por talla)? | Dueño decide; Claude implementa | 2 | Prueba del bot según la decisión |

### 4.3 P1: deudas de ventas y plataforma

| # | Tarea | Quién | h |
|---|---|---|---|
| 1.7 | Guardar el carrito de `/pos` si se recarga la página (R14) | Claude | 3 |
| 1.8 | Devoluciones parciales y su efecto en los totales (R10) | Claude | 8 |
| 1.9 | Menores pendientes del ledger de ventas: fusión de marcas dentro de la transacción, `fetchLocationsAction` sin excepción, sesión vencida probada en navegador real | Claude | 4 |
| 1.10 | Vulnerabilidades de dependencias (Dependabot: 7 críticas, 20 altas) y PR #17 (Next 15) | Claude + dueño | 6 |
| 1.11 | Blobs huérfanos cuando falla un alta con foto | Claude | 2 |
| 1.12 | Configurar ESLint para que `npm run lint` sirva como filtro | Claude | 1 |

### 4.4 P2: después del congelamiento

- Probador personal (solo owner) y probador cliente: plan global S-E y S-F, specs del 2026-10-19.
- Migración de Neon y Blob a la Raspberry Pi 5 (memoria del proyecto; decisión en enero).
- Variantes por color (plan global C.2) y riel 2.5D con prendas recortadas (C.1, D-8).

---

## 5. Preguntas abiertas para el dueño

1. **R18:** ¿el bot de WhatsApp debe encontrar artículos de solo stock (sin fotos) y contestar solo "hay / no hay talla"?
2. **WhatsApp:** número de la tienda (o uno por tienda: Lomas y ClubAlva).
3. **Recorrido:** ¿qué productos van en cada repisa? ¿Los elige el dueño por código, o se asignan por departamento (Calzado → muro de calzado)?
4. **Fechas:** ventana sin ventas para la salida a producción, y fechas exactas de congelamiento (Buen Fin y diciembre).
5. **Hosting de la demo (P-2 del plan global):** Vercel Pro o Cloudflare Workers.

---

## Apéndice A. Mensaje inicial para una sesión de Antigravity

Para pegar al empezar cada sesión (ajustar la tarea):

> Trabajas en LoloShop junto con Claude. Antes de tocar código lee `AGENTS.md` y `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md`. Tu zona es `components/virtual-store/`, `lib/virtual-store/` y el aspecto de `/catalogo`; no modifiques `prisma/`, `lib/data/`, `lib/sales/`, `lib/catalog/`, `lib/actions.ts`, `app/api/`, `app/pos`, `app/ventas` ni `app/escanear`: si necesitas algo ahí, escríbelo como petición. En lo público usa solo `PublicProduct` (sin SKU, sin conteos, sin productos ni precios inventados). Crea tu rama desde `feat/demo-alta-lote` con el nombre `feat/3d-<tema>`; no hagas commit en `main` ni `push`. Al terminar pega la salida de `npx tsc --noEmit`, `npm test` y `npm run build`, y lista archivos y dudas. Tarea de hoy: <tarea del backlog §4, por número>.
