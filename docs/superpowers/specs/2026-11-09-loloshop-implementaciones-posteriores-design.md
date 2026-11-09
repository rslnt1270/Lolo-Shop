# LoloShop: implementaciones posteriores a ventas P1 y trabajo con Antigravity

**Fecha:** 2026-11-09 · **Estado:** diseño completo para planificar; pendiente del visto bueno del dueño
**Base:** SRS (`2026-11-05-loloshop-srs.md`), modelo de datos (`2026-11-05-modelo-datos-er.md`, **fuente de verdad**), plan global (`../plans/2026-10-27-loloshop-plan-global.md`), UX del sitio público (`2026-11-05-sitio-publico-ux-design.md`), fotos (`2026-10-19-fotos-producto-ia-design.md` §13–§14), guía de salida (`docs/runbooks/2026-11-salida-ventas.md`).

Este documento dice **qué sigue** después del módulo de ventas, **quién lo hace**, **cómo se acepta** y **cómo trabajan juntos Claude y Antigravity** sin pisarse. Cada tarea de §4 trae comportamiento, contrato, zona, criterios de aceptación (lo que la prueba verifica), riesgos y dependencias. (T) = prueba automática; (M) = verificación manual; [C] = dato de proveedor sin verificar.

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
| Recorrido 3D (Antigravity), adaptado a `PublicProduct` | Hecho con **datos de ejemplo**: 4 zonas inventadas y **9 puntos** con título, marca, precio y etiqueta de repisa de muestra; la cuadrícula muestra solo los productos que caben en los 9 puntos; el modal usa el número falso `5211234567890` | `components/virtual-store/`, `lib/virtual-store/zones.ts` |
| Pruebas | 446 unitarias + 47 contra Postgres; `tsc` y `next build` en verde (cifras del reporte de la rama, no re-ejecutadas para este spec) | `npm test`, `npm run test:db` |

### 1.2 Base de datos de producción (Neon, `us-east-2`)

- Respaldo verificado del 2026-11-09: rama de Neon `respaldo-2026-11-09` y volcado local fuera del repo, restaurado con conteos iguales.
- Ensayo de migración completo en la rama `ventas-prueba`: sin drift, `0_init` marcado, 3 migraciones aplicadas, relleno idempotente.
- Usuarios: 4, todos con contraseña propia (no las del seed).
- Tiendas (aplicado el 2026-11-09 en producción y en `ventas-prueba`, en una transacción SQL de datos sin cambio de esquema): **tienda 1 = `LoloShop_Lomas`** (era "Tienda Principal", mismo id), **tienda 2 = `LoloShop_ClubAlva`** (nueva); `colab1` → Lomas, `colab2` → ClubAlva. Contraseñas sin tocar.
- Producción **todavía no** tiene las tablas de ventas: la salida sigue la guía (faltan fases D a G).

---

## 2. Reglas vigentes que toda implementación respeta

Decisiones del dueño y del diseño que ya no se discuten en cada tarea. Cambiarlas requiere decisión explícita del dueño.

1. **Roles.** Owner: todo, histórico, anula ventas, fusiona marcas. Manager: ve todo; si tiene tienda asignada, vende y confirma pagos **solo en esa tienda**. Colaborador: solo su tienda, solo el día, no cambia precios, crea marcas.
2. **Privacidad.** No se guardan contactos de clientes; solo un alias opcional que rechaza números de teléfono.
3. **Público vs interno.** Todo lo que ve un cliente (catálogo, recorrido, ficha, bot, WhatsApp) usa **solo** `PublicProduct`: sin SKU, sin código de barras, sin conteos; disponibilidad **sí/no por talla**; solo tiendas (no almacén). Un producto es público solo con **foto de frente y de atrás**.
4. **Nada inventado ante el cliente.** Ni productos, ni precios, ni existencias, ni ubicaciones de ejemplo; ni promesas ("apartado", "envío a domicilio") que la operación no cumple. Si no hay datos, se dice ("Pronto verás aquí las prendas de la tienda.").
5. **El cliente pide con el código público** ("Código K7Q2M") por WhatsApp.
6. **Móvil primero.** Objetivos táctiles de 44 px o más, uso a 375 px, `prefers-reduced-motion` respetado, textos en español de México.
7. **Seguridad.** El servidor decide permisos (rol releído de la base); nada de confiar en el cliente para precio, tienda o rol. Repo público: ningún secreto, cadena de conexión ni número de teléfono real en commits, documentos, pruebas ni capturas.
8. **Migraciones** solo con `prisma migrate`; el SQL lo genera Prisma.
9. **Congelamientos.** Durante el Buen Fin y diciembre no hay salidas a producción salvo correcciones urgentes. Se puede seguir desarrollando en ramas; lo que se congela es la salida.

---

## 3. Trabajo con Antigravity

> **Decisión del dueño (2026-11-09): por ahora no se delega trabajo a Antigravity.** Claude ejecuta todas las tareas, incluidas las de la zona visual. Esta sección queda como reglas para cuando Antigravity vuelva; las tareas marcadas "Antigravity" las hace Claude respetando las mismas reglas de §2.

### 3.1 Quién es dueño de qué

| Zona | Responsable | El otro puede… |
|---|---|---|
| `components/virtual-store/`, `lib/virtual-store/`, aspecto visual de `/catalogo` y de la ficha pública | **Antigravity** | Proponer cambios; Claude solo corrige lo que rompe reglas de §2 o la build, y lo avisa en el PR |
| `prisma/`, `lib/data/`, `lib/sales/`, `lib/catalog/`, `lib/image/`, `lib/public/`, `lib/actions.ts`, `lib/auth/`, `app/api/`, `app/pos`, `app/ventas`, `app/escanear`, `app/recorrido/` (administración) | **Claude** | Antigravity no los modifica; pide el cambio por escrito |
| **Contratos compartidos:** `PublicProduct` (`lib/data/public-projection.ts`), tipos de `lib/virtual-store/types.ts`, `HotspotAssignments` (1.2) y `publicImageAttrs` (1.5) | Claude define, Antigravity consume | Antigravity propone campos nuevos; Claude los agrega con pruebas |
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

Hoy `StoreHotspot.product` es `PublicProduct` y `bindProductsToHotspots` asigna por **orden** (defecto que corrige 1.2). Ningún componente público importa `Product` de `lib/domain/types`.

**Cambios previstos (los hace Claude con pruebas, y actualiza esta copia):** 1.1 agrega `department: { slug: string; name: string; sortOrder: number } | null`. 1.2 agrega `type HotspotAssignments = Record<string, string>` (id de punto → `publicCode`). 1.5 agrega `publicImageAttrs(url, context)`.

### 3.3 Flujo de Git

1. Rama base de trabajo: **`feat/demo-alta-lote`** hasta que se mezcle a `main`; después, `main`.
2. Una rama por tarea: `feat/3d-<tema>` (Antigravity) o `feat/<tema>` (Claude), creada desde la base del día.
3. Nadie hace commit en `main` ni `push` sin el visto bueno del dueño. Nadie usa `--force`.
4. Commits con Conventional Commits y solo de archivos de su zona (§3.1).
5. Nunca se commitea `.env*`, volcados, capturas con datos ni la carpeta `.playwright-mcp/`.
6. Integración: Claude revisa la rama de Antigravity (reglas de §2, contrato, pruebas) antes de juntarla con la base.

### 3.4 Cuándo una tarea está terminada

Con evidencia pegada en el reporte o el PR, no solo la afirmación:

```bash
npx tsc --noEmit        # sin errores
npm test                # todas en verde (número de pruebas)
npm run build           # "Compiled successfully"
npm run test:db         # si la tarea toca lib/data o lib/sales
```

Más: pruebas nuevas para el comportamiento nuevo (Vitest + Testing Library), y para UI pública una prueba que verifique que **no** aparece SKU, código de barras ni conteos. `npm run lint` se suma como filtro cuando termine 1.12.

### 3.5 Entrega de contexto

Cada sesión de Antigravity empieza leyendo, en este orden: `AGENTS.md`, este documento (en especial la tarea de §4), y el spec de la tarea. Al terminar deja un reporte corto en el PR o en `docs/superpowers/plans/` con: qué hizo, archivos, evidencia de §3.4, y dudas abiertas.

---

## 4. Backlog priorizado

Prioridad: **P0** antes del Buen Fin · **P1** después del Buen Fin; se desarrolla en ramas y sale antes del congelamiento de diciembre o al terminar (§5.4) · **P2** enero en adelante. "h" = horas de agente.

| # | Tarea | Quién | h | Prio |
|---|---|---|---|---|
| 0.1 | Tiendas Lomas/ClubAlva y colaboradores | Dueño | hecho | P0 (hecho) |
| 0.2 | Fase D: Preview contra `ventas-prueba` | Dueño + Claude | 2 | P0 |
| 0.3 | Fases E–G: producción | Dueño + Claude | 2 | P0 |
| 0.4 | Número de WhatsApp desde configuración | Claude | 1.5 | P0 |
| 0.5 | Autosuspend de Neon durante el Buen Fin | Dueño | 0.1 | P0 |
| 0.6 | Carga de mercancía y fotos | Dueño + colaboradores | — | P0 |
| 0.7 | Webhook: firma obligatoria y textos sin "Tienda Principal" (nueva) | Claude | 1 | P0 |
| 0.8 | `/catalogo` sin datos de ejemplo y con todos los productos (nueva) | Claude (excepción §3.1) | 2 | P0 |
| 1.1 | Filtro por departamento y "Ver más" | Claude (dato) + Antigravity | 1 + 3 | P1 |
| 1.2 | Producto elegido por punto; zonas fuera de `zones.ts` | Claude (dato) + Antigravity | 3 + 5 | P1 |
| 1.3 | Giro frente/atrás | Antigravity | 4 | P1 |
| 1.4 | Panorámicas reales y `yaw`/`pitch` medidos | Dueño + Antigravity | 6 | P1 |
| 1.5 | Derivados de imagen | Claude (+ Antigravity aplica) | 6 | P1 |
| 1.6 | R18: bot y artículos de solo stock | Claude | 1 | P1 |
| 1.7 | Carrito de `/pos` que sobrevive a una recarga | Claude | 3 | P1 |
| 1.8 | Devoluciones parciales | Claude | 8 | P1 |
| 1.9 | Menores del ledger de ventas | Claude | 4 | P1 |
| 1.10 | Dependencias y PR #17 | Claude + dueño | 6 | P1 |
| 1.11 | Blobs huérfanos | Claude | 2 | P1 |
| 1.12 | ESLint como filtro, con reglas de frontera | Claude | 1 | P1 |
| 1.13 | Migrar el contacto a WhatsApp Business (perfil del negocio, horario, catálogo de Meta opcional) y, si se usa el bot con la API de Meta, decidir número dedicado o coexistencia con la app | Dueño (alta en Meta) + Claude (cambiar la variable, probar webhook) | 2 | P1 |

Los identificadores R8, R10, R14 y R18 vienen del registro de revisión de ventas; no están definidos en ningún documento del repo, así que aquí se describe cada uno con palabras.

### 4.1 P0: salida y operación del Buen Fin

**0.1 Tiendas y colaboradores. HECHO (2026-11-09).**
- Aplicado por el dueño en producción y en `ventas-prueba` con una transacción SQL que abortaba si la base no estaba como se esperaba; el resultado se verificó con la consulta de C5. No requiere script ni tarea del plan.
- *Consecuencia:* ClubAlva nace sin inventario: hasta 0.6, una venta de `colab2` se rechaza por falta de existencias (comportamiento esperado). No usar `reset-users.ts`.

**0.2 Fase D: Preview de Vercel contra `ventas-prueba`.**
- *Comportamiento:* el dueño prueba la rama completa en una URL de Preview antes de tocar producción.
- *Contrato:* las variables de Preview (guía D.1, más `NEXT_PUBLIC_WHATSAPP_NUMBER`) se **acotan a la rama de Git `feat/demo-alta-lote`** en Vercel. Sin `DIRECT_URL`.
- *Zona:* el dueño configura y despliega; Claude prepara la lista y acompaña.
- *Acepta:* (M) build en verde; Fase G completa en el preview; además, las verificaciones de 0.4, 0.7 y 0.8 en la URL real. Registro con fecha y el id del deploy, sin valores.
- *Riesgos / no hacer:* una variable de Preview sin acotar hace que **cualquier** rama de preview escriba en `ventas-prueba`. Nunca poner en Preview la conexión de producción.
- *Depende:* 0.4, 0.7 y 0.8 ya mezcladas en la base (si no, el preview no prueba lo que va a salir).

**0.3 Fases E–G: producción.**
- *Comportamiento:* ventas y dashboards en producción antes del Buen Fin.
- *Contrato:* ninguno nuevo. En Production deben existir `WHATSAPP_APP_SECRET` y `NEXT_PUBLIC_WHATSAPP_NUMBER` **antes del build**: `NEXT_PUBLIC_` se incrusta en el JS al compilar.
- *Zona:* el dueño ejecuta; Claude acompaña.
- *Acepta:* (M) Fase E firmada. `migrate status` dice "up to date". El relleno da las cifras del ensayo. Fase G en verde y 10 minutos sin errores en Runtime Logs. Id del deploy anterior y responsable del retroceso anotados antes de empezar.
- *Riesgos / no hacer:* **no correr F.2** (`reset-users.ts`): producción ya tiene contraseñas propias. Si la ventana cae dentro del Buen Fin, se pospone; no se improvisa. Primero la base, después el código.
- *Depende:* 0.2.

**0.4 Número de WhatsApp desde configuración.**
- *Comportamiento:* "Consultar por WhatsApp" abre `wa.me/<número del negocio>` con el mensaje de UX §5.8 sin enlace de ficha (la ficha es P3): `Hola, me interesa {marca} {nombre} en talla {talla}. ¿Sigue disponible? Código {codigo}`. Sin talla, usa la plantilla "¿Qué tallas tienen?". Si el número falta o es inválido, no hay enlace: se muestra el texto "Consulta disponibilidad en tienda." (UX §5.8, sin dirección porque aún no hay datos públicos de tienda).
- *Contrato:* módulo puro nuevo `lib/public/whatsapp.ts` con tres funciones. `getWhatsAppNumber(): string | null` lee `NEXT_PUBLIC_WHATSAPP_NUMBER` y acepta solo `^\d{10,15}$`. `productInquiryMessage(p: PublicProduct, size?: string): string` arma el texto (≤ 300 caracteres, nombre recortado a 80). `whatsAppLink(number, text): string` arma el enlace. El nombre de la variable ya está en `.env.example`.
- *Zona:* Claude escribe el módulo y lo conecta en `ProductHotspotModal.tsx`, por la excepción de §3.1 (el número falso rompe la regla 4). Lo avisa a Antigravity en el PR.
- *Acepta:* (T) sin variable, el modal no tiene `a[href^="https://wa.me"]` y sí el texto. (T) con un valor con espacios o letras, pasa lo mismo que sin variable. (T) con un número ficticio válido, el `href` empieza con `https://wa.me/<número>?text=`; el texto decodificado contiene `Código <publicCode>` y la talla elegida, y no contiene SKU, código de barras ni `id`. (T) ningún archivo de `app/`, `components/` o `lib/` contiene `5211234567890`.
- *Riesgos / no hacer:* cambiar el número exige un redeploy. Ni el número real ni uno "parecido a real" van en el repo: las pruebas usan uno ficticio evidente. El mensaje no promete apartado.
- *Depende:* nada. Bloquea 0.2.

**0.5 Autosuspend de Neon.**
- *Comportamiento:* el primer cobro tras un rato sin uso no espera a que despierte la base.
- *Contrato:* ninguno.
- *Zona:* dueño.
- *Acepta:* (M) en la sección "Operación durante el Buen Fin" de la guía quedan anotadas la fecha en que se apaga (víspera) y la fecha en que se reactiva.
- *Riesgos / no hacer:* [C] el plan de Neon puede no permitir apagarlo. Si no se puede, se acepta el arranque en frío: el reintento de `/pos` con el mismo id ya lo cubre. No crear "pings" programados sin decisión, porque gastan horas de cómputo.
- *Depende:* 0.3.

**0.6 Carga de mercancía.**
- *Comportamiento:* las dos tiendas con inventario real; las prendas elegidas para el catálogo llevan frente y atrás.
- *Contrato:* ninguno.
- *Zona:* el dueño y los colaboradores. Claude atiende los errores que reporten.
- *Acepta:* (M) en una muestra de 20 prendas por tienda, el stock de `/productos` coincide con el físico. Toda prenda marcada "para catálogo" aparece en `/catalogo`.
- *Riesgos / no hacer:* fotos sin caras (la mano se permite), sin otras personas y con la etiqueta del retailer de origen fuera del cuadro (su precio revelaría el costo). El alta ya rechaza códigos repetidos.
- *Depende:* 0.1 y 0.3.

**0.7 Webhook: firma obligatoria y textos (nueva).** Cierra el hallazgo RNF-SEG-03 del SRS (severidad media): hoy, sin `WHATSAPP_APP_SECRET`, la firma se omite.
- *Comportamiento:* un mensaje sin firma válida de Meta se rechaza. El bot deja de decir "Estamos ubicados en nuestra Tienda Principal".
- *Contrato:* en `app/api/whatsapp/webhook/route.ts`, con `NODE_ENV === "production"` y sin secreto, `POST` responde 503 sin procesar; con firma inválida, 401. El `GET` de verificación no cambia. El texto de ubicación pasa a "Escríbenos el código de la prenda y la tienda te confirma por aquí." y los dos mensajes usan la constante `CATALOG_URL`, no una URL escrita a mano.
- *Zona:* Claude.
- *Acepta:* (T) en producción sin secreto: 503 y `sendWhatsAppMessage` no se llama. (T) firma inválida: 401. (T) firma válida: 200. (T) ninguna respuesta contiene "Tienda Principal" ni "apart".
- *Riesgos / no hacer:* si Meta ya apunta al webhook y falta el secreto en Vercel, el bot deja de contestar. Por eso F.7 de la guía lo verifica antes del deploy.
- *Depende:* nada. Bloquea 0.2.

**0.8 `/catalogo` sin datos de ejemplo (nueva).**
- *Comportamiento:* en producción `/catalogo` abre en cuadrícula con **todos** los productos públicos (no solo 9). No se ven la sala virtual, etiquetas de repisa ("Maniquí de Vitrina") ni el contador de puntos. El recorrido solo aparece si hay una zona `kind: "real"` aprobada (1.4), o en un preview con `NEXT_PUBLIC_SALA_VIRTUAL=1`.
- *Contrato:* variable nueva `NEXT_PUBLIC_SALA_VIRTUAL` (solo el nombre en `.env.example`). La cuadrícula itera `products`, no `hotspots`.
- *Zona:* Claude, por excepción de §3.1, en `VirtualStoreCatalog.tsx` y `app/catalogo/CatalogClient.tsx`. Avisa a Antigravity; 1.1 y 1.2 parten de aquí.
- *Acepta:* (T) sin la variable y con 12 productos, se ven 12 tarjetas; no hay botón "Ver en Recorrido 3D" ni ningún `shelfLabel`, título, marca o precio de `DEFAULT_HOTSPOTS_CONFIG` (p. ej. "LoloTech"). (T) con la variable en `1`, el recorrido se ofrece. (T) sin productos aparece "Pronto verás aquí las prendas de la tienda.". (T) el HTML no contiene SKU, código de barras ni cifras de stock.
- *Riesgos / no hacer:* no borrar `zones.ts` (lo reemplaza 1.2). No cambiar `force-dynamic` por caché (la disponibilidad debe estar fresca durante el Buen Fin).
- *Depende:* nada. Bloquea 0.2.

### 4.2 P1: tienda digital con datos reales

**1.1 Filtro por departamento y "Ver más".**
- *Comportamiento:* bajo el encabezado, chips `Todo · Dama · Caballero · …` (solo los departamentos con prendas públicas, en `sortOrder`). Al tocar un chip se filtra y la URL queda `?depto=<slug>`; al abrir esa URL, llega filtrada. Se muestran 24 tarjetas y el botón "Ver más" suma 24. Un producto sin departamento aparece solo en "Todo".
- *Contrato (Claude primero):* `PublicProduct.department: { slug; name; sortOrder } | null`. El `Product` de dominio gana `department`, incluido en `PrismaDataSource.getProducts` y en `FixtureDataSource`. Un departamento inactivo se proyecta como `null`.
- *Zona:* Claude entrega el campo con pruebas de proyección y actualiza §3.2. Antigravity hace los chips, la URL y "Ver más".
- *Acepta:* (T) con 30 productos se ven 24; "Ver más" lleva a 30 y el botón desaparece. (T) con `?depto=calzado` al cargar, solo se ve calzado y el chip tiene `aria-pressed="true"`. (T) un departamento sin productos no tiene chip. (T) la proyección no agrega ninguna clave fuera del contrato (comparación exacta de claves). (T) el HTML no tiene SKU ni conteos. Los chips miden ≥ 44 px.
- *Riesgos / no hacer:* nada de conteos de stock en los chips; nada de orden al azar; no crear una consulta nueva en el servidor (el catálogo es pequeño y se filtra en el cliente).
- *Depende:* 0.8.

**1.2 Producto elegido por punto y zonas fuera de `zones.ts`.**
- *Comportamiento:* el owner abre `/recorrido/puntos`, ve cada punto como "Tienda › Zona › Repisa" y escribe el código público de la prenda que está ahí. Al guardar, el recorrido lo muestra sin desplegar. Un punto sin código, o con un código que dejó de ser público, no se pinta. La vista Lista de una zona muestra además las prendas de su sección (por categorías o departamentos de la zona, D-9), sin decir "en esta repisa".
- *Contrato:*
  - Antigravity: `lib/virtual-store/store-config.json` con validador en `store-config.ts`. Forma: `{ version: 1, stores: [{ slug: "lomas" | "clubalva", label, zones: ZoneConfig[], hotspots: HotspotConfig[] }] }`. `ZoneConfig` es el `StoreZone` actual más `kind: "virtual" | "real"`, `categories: string[]` (ER §2.5), `departments: string[]` y `panoramaUrl?`. `HotspotConfig = { id, zoneId, yaw, pitch, shelfLabel }`, **sin** título, marca, precio ni imagen. Nueva firma `bindProductsToHotspots(products, hotspots, assignments)`, que asigna por `publicCode`.
  - Claude: clave `AppSetting` `recorrido.puntos` con valor `{ "<hotspotId>": "<publicCode>" }`. `lib/data/hotspot-assignments.ts` con `parseHotspotAssignments(value)` (descarta lo inválido) y `getHotspotAssignments()`. `setHotspotAssignmentAction(hotspotId, publicCode | null)`: owner releído de la base; el `hotspotId` existe en `store-config.json`; el código cumple `^[0-9A-HJKMNP-TV-Z]{5}$`, es de un producto de `getPublicCatalog` y no está ya en otro punto (si lo está, el error dice en cuál). La página `/catalogo` pasa `assignments` junto con `products`. **Sin migración.**
- *Zona y entrega:* Claude publica primero `HotspotAssignments` y `getHotspotAssignments`, y la página de administración. Antigravity hace el JSON, el validador, `bind` y la UI del recorrido.
- *Acepta:* (T) con 3 puntos y asignaciones para 2, una de ellas a un código no público, se pinta 1 punto. (T) el orden de `products` no cambia el resultado. (T) validador: ids únicos, `zoneId` existente, `yaw` entre −180 y 180, `pitch` entre −90 y 90, y ningún punto con las claves `title`, `price`, `brand` o `imageUrl`. (T) acción: manager o colaborador reciben FORBIDDEN, y también un JWT de owner cuyo rol en la base es colaborador. Código inexistente o de solo stock: INVALID. Código ya en otro punto: INVALID con el nombre del punto. `null` quita la asignación. (T) dos valores de `AppSetting` con la misma build dan dos recorridos distintos.
- *Riesgos / no hacer:* no asignar por orden ni por categoría a un punto concreto, porque afirma una ubicación falsa. No guardar `productId` en el JSON del repo.
- *Depende:* 0.8. Las zonas reales vienen de 1.4; mientras tanto se prueba con la sala virtual en preview.

**1.3 Giro frente/atrás.**
- *Comportamiento:* en el modal del producto (recorrido y cuadrícula), tocar la foto o "Ver atrás" gira la prenda 180° en ≤ 400 ms. Con `prefers-reduced-motion: reduce` hay dos botones, "Frente" y "Atrás", que cambian la imagen sin animación (UX §7.3). La tarjeta de la cuadrícula muestra solo el frente; la foto trasera se pide al abrir el modal.
- *Contrato:* ninguno (`backImageUrl` ya está en `PublicProduct`).
- *Zona:* Antigravity.
- *Acepta:* (T) con movimiento reducido simulado (`matchMedia`) no hay transformaciones animadas y los dos botones tienen `aria-pressed`. (T) sin movimiento reducido, cada toque alterna el `alt` entre "… de frente" y "… de atrás". (T) antes de abrir un modal, la cuadrícula no tiene ningún `img` con `backImageUrl`. (T) si `backImageUrl` es `null`, no hay control de giro ni error. (M) probado en móvil real a 375 px.
- *Riesgos / no hacer:* sin giro automático en bucle, sin three.js (D-7) y sin cargar las dos fotos en la cuadrícula.
- *Depende:* 0.8. Conviene hacerlo después de 1.5.

**1.4 Panorámicas reales.**
- *Comportamiento:* el recorrido muestra fotos reales de las secciones de Lomas (y de ClubAlva cuando haya fotos), con puntos sobre las repisas reales.
- *Contrato:* archivos `public/recorrido/<storeSlug>/<zoneId>.webp` (4096×2048, ≤ 600 KB) y `<zoneId>-blur.webp` (≤ 20 KB). En `store-config.json`: `kind: "real"`, `panoramaUrl`, `initialYaw`/`initialPitch`, y `yaw`/`pitch` medidos de cada punto.
- *Zona:* el dueño captura (protocolo del plan global A.14) y aprueba. Antigravity procesa, mide y configura. Claude revisa la privacidad antes del merge (C.5 del plan global).
- *Acepta:* (T) cada `panoramaUrl` real existe y pesa ≤ 600 KB. (T) ningún archivo de `public/recorrido/` contiene bloques `EXIF` ni `XMP ` (WebP sin metadatos ni GPS). (M) revisión firmada por el dueño: sin personas, pantallas, tickets, precios legibles ni datos de clientes. (M) en móvil, cada punto cae sobre su repisa con un margen de ±5°.
- *Riesgos / no hacer:* nada de fotos con personas aunque estén borrosas, ni imágenes generadas con IA presentadas como la tienda.
- *Depende:* 1.2 (formato de configuración).

**1.5 Derivados de imagen.**
- *Comportamiento:* la cuadrícula descarga una foto de ~400 px y la tarjeta del punto una de 200 px, en lugar de la maestra.
- *Contrato:* al capturar (`ProductPhotoCapture`, `lib/image/process.ts`), además de la maestra (1080 px, JPEG, ≤ 1 MB, como hoy) se generan JPEG de 200, 400, 600 y 800 px con los pesos de §14.2. `uploadProductImageAction` los recibe en el mismo envío, y el **servidor** fija los nombres: `productos/v2/<base>.jpg` y `productos/v2/<base>-w<ancho>.jpg`. Helper puro `lib/image/derivatives.ts`: `publicImageAttrs(url, "grid" | "hotspot" | "modal")` devuelve `{ src, srcSet?, sizes? }`; para una URL sin `/v2/` devuelve solo `src`. Sin columnas nuevas (ER §2.4) y sin optimización de `next/image`.
- *Zona y entrega:* Claude hace la captura, la subida y el helper con pruebas. Antigravity aplica `publicImageAttrs` en sus `<img>`.
- *Acepta:* (T) con una URL `v2` en modo `grid`, `srcSet` trae w400, w600 y w800 y `sizes` cubre 2, 3 y 4 columnas. Una URL antigua devuelve solo `src`. Una URL que no es de Blob no se transforma. (T) la subida hace 5 `put` con el mismo `<base>`. Un derivado que pasa 1.5 veces su peso meta, o que no es JPEG, se rechaza y no queda nada guardado. (M) peso medido en Slow 4G: tarjeta ≤ 35 KB, punto ≤ 12 KB.
- *Riesgos / no hacer:* la maestra mide 1080, no 2048: la lupa 2× de §14.1 queda para P2. No escalar hacia arriba. No aplicar auto-niveles a imágenes aprobadas (§14.4). El límite de 5 MB por acción alcanza (≈ 1.3 MB por foto).
- *Depende:* nada. Lo aprovechan 1.1 y 1.3; 1.11 necesita los nombres.

**1.6 R18: ¿el bot responde por artículos de solo stock?**
- *Comportamiento por omisión (§5.1):* no. El bot solo conoce productos públicos. A un código de solo stock responde "La tienda te confirma por aquí si lo tenemos.", sin talla ni disponibilidad, y sin revelar que el código existe.
- *Contrato:* ninguno por omisión. Si el dueño dice que sí: `getStockOnlyAvailability(code)` en `lib/data/public-projection.ts` devuelve `{ title, sizes: { size; available }[] }` (sin precio, foto ni cifras), solo para el webhook y detrás de la variable de servidor `BOT_STOCK_ONLY_LOOKUP=1`. Nunca para `/api/bot/products` ni `/catalogo`.
- *Zona:* Claude.
- *Acepta:* (T) el webhook, con el código de un producto activo sin `backImageUrl`, da la respuesta neutral. (T) `/api/bot/products` no lo lista. (Solo si el dueño dice que sí:) (T) con la variable responde sí o no por talla; sin ella, igual que por omisión.
- *Riesgos / no hacer:* abrir el bot a artículos sin fotos cambia la regla 3 de §2: solo con decisión escrita.
- *Depende:* 0.7 (mismo archivo).

### 4.3 P1: deudas de ventas y plataforma

**1.7 Carrito de `/pos` que sobrevive a una recarga (R14).**
- *Comportamiento:* si se recarga `/pos` o el navegador cierra la pestaña, al volver aparece "Recuperamos la venta en curso (N prendas)." con el botón "Descartar". Otro usuario en el mismo equipo no la ve, y un carrito de ayer no se recupera.
- *Contrato:* `lib/sales/use-sale-draft.ts` guarda en `localStorage`, clave `loloshop.pos.borrador.v1:<userId>`, el objeto `{ v: 1, userId, businessDate (businessDateMx), locationId, channel, paymentMethod, lines, clientRequestId, uncertain, rejectedSignature, savedAt }`. **Nunca** guarda `customerAlias` ni `paymentReference`. Restaura solo si coinciden `userId` y `businessDate` y hay renglones; si no, borra la clave. `reset()` la borra, y cerrar sesión (`NavBar`) borra todas las claves `loloshop.pos.borrador.*`.
- *Zona:* Claude.
- *Acepta:* (T) 2 renglones, desmontar y volver a montar con el mismo usuario: mismos renglones y mismo `clientRequestId`. (T) con `uncertain` guardado, después de montar, `requestIdFor(otraFirma)` devuelve el mismo id. (T) otro `userId` empieza vacío y la clave ajena queda intacta. (T) un `businessDate` de ayer empieza vacío y se borra la clave. (T) un JSON corrupto o con otra `v` empieza vacío sin excepción. (T) lo guardado no contiene `customerAlias`. (T) cerrar sesión limpia las claves. (T) si `localStorage` lanza (modo privado o cuota), el POS funciona sin guardar.
- *Riesgos / no hacer:* no guardar el borrador en el servidor. Un precio cambiado entre guardar y cobrar lo rechaza el servidor para el colaborador (ver §7, punto 2).
- *Depende:* Tarea 14 del plan de ventas (id incierto), ya hecha.

**1.8 Devoluciones parciales (R10).**
- *Comportamiento:* en `/ventas`, el owner abre una venta **pagada**, elige renglón y cantidad que regresan, escribe el motivo y confirma. El stock vuelve a la tienda de la venta y los totales bajan. Si regresó todo, la venta queda "Devuelta" (`refunded`). Manager y colaborador no ven el botón y el servidor los rechaza.
- *Contrato:* `refundSaleLinesAction(saleId, lines: { variantId; quantity; expectedReturned }[], reason)` en `lib/sales/actions.ts`, y `SalesDataSource.refundLines` en una transacción con renglones ordenados por `variantId`. Por renglón: `saleLine.updateMany({ where: { saleId, variantId, returnedQuantity: expectedReturned, quantity: { gte: expectedReturned + n } }, data: { returnedQuantity: { increment: n } } })`; con `count === 0` se revierte todo y responde "Esta devolución ya se registró o la venta cambió; recarga." (comparar-y-escribir: es la idempotencia, sin columna nueva). Después: `inventoryLevel` `increment` en la tienda de la venta y `Movement` `RETURN +n` con `saleId`, `userId` y `notes` = motivo. Si todo quedó devuelto, `status = refunded`. Solo para `paid`; con `pending_payment` responde "Anula la venta en su lugar.". En el dashboard, vendido y cobrado pasan a ser Σ (quantity − returnedQuantity) × unitPrice por fecha de la venta, incluyendo `refunded` (ER §3.3), y se agrega la cifra "Devoluciones de hoy" (RETURN de hoy de ventas no anuladas). **Sin migración.**
- *Zona:* Claude.
- *Acepta (`test:db`):* (T) devolver 1 de 3: `returnedQuantity = 1`, stock +1, un `RETURN +1` con `saleId` y motivo, y vendido baja en `unitPrice`. (T) el mismo envío dos veces en paralelo registra una sola devolución. (T) devolver 3 de 3 deja la venta `refunded` y su aporte a vendido en 0. (T) devolver más de lo vendido: INVALID sin cambios. (T) manager, colaborador o un JWT viejo de owner: FORBIDDEN. (T) una venta `pending_payment` o `cancelled`: INVALID. (T) anular una venta con 1 de 3 devuelta y "regresó" reingresa 2. (T) al final de cada prueba, `available` = inicial + Σ delta.
- *Riesgos / no hacer:* no editar `Sale.total` (es lo cobrado), no devolver en otra tienda (eso es un `TRANSFER`) y no modelar el método de reembolso. La política (plazos, cambios) es del dueño (SRS D-VEN-3); el sistema solo registra, y un cambio de talla es una devolución más una venta nueva.
- *Depende:* 0.3 para salir a producción.

**1.9 Menores del ledger de ventas.**
- *Comportamiento:* la fusión de marcas no deja productos en una marca inactiva; un `/ventas` o `/pos` con la sesión vencida muestra "Tu sesión terminó. Vuelve a iniciar sesión." en lugar de un error.
- *Contrato:*
  - `mergeBrandsAction`: dentro de `$transaction`, bloquea las dos filas de `Brand` en orden de `id` (`SELECT … FOR UPDATE` con `$queryRaw` parametrizado) y valida su estado ahí, no antes.
  - `fetchLocationsAction(): Promise<Location[] | null>` (`null` = sesión vencida, igual que `listBrandsAction`), sin lanzar. Sus llamadores lo manejan.
- *Zona:* Claude.
- *Acepta:* (T, `test:db`) A→B y B→C en paralelo: las dos terminan (una puede dar NOT_FOUND) y ningún `Product` ni `SaleLine` queda en una marca inactiva. (T) `fetchLocationsAction` sin sesión devuelve `null`. (M) en Chrome de Android: dejar vencer la sesión, cobrar y confirmar un pago muestra el mensaje con enlace y no duplica la venta.
- *Riesgos / no hacer:* no meter SQL en migraciones; el `FOR UPDATE` es una lectura en código.
- *Depende:* nada.

**1.10 Dependencias y PR #17.**
- *Comportamiento:* ninguno visible.
- *Contrato:* `package.json` y lockfile.
- *Zona:* Claude prepara; el dueño prueba a mano.
- *Acepta:* (M) el PR trae una tabla de triage: paquete, severidad, si corre en producción o solo en desarrollo, y la acción. `npm audit --omit=dev` sin críticas, o cada excepción explicada. `tsc`, `test` y `build` en verde, y Fase G en preview. PR #17 (Next 15, React 19, Serwist): rebase, prueba manual y merge en **enero (P2)**, salvo que el triage encuentre una vulnerabilidad crítica explotable que solo se arregle ahí.
- *Riesgos / no hacer:* `npm audit fix --force` está prohibido. No mezclarlo con la salida de ventas. Al cambiar el service worker, probar que `/pos` no sirva datos viejos.
- *Depende:* 0.3. Fuera de congelamientos. Mejor después de 1.12.

**1.11 Blobs huérfanos.**
- *Comportamiento:* las fotos de un alta fallida o abandonada no se acumulan.
- *Contrato:*
  - Limpieza al fallar: si `createProductAction` falla con URLs válidas (`isProductBlobUrl`) que ningún producto usa, las borra con `del()`, derivados incluidos. Es *best effort* y el error para el usuario no cambia.
  - Barrido: `prisma/scripts/sweep-orphan-blobs.ts` recorre `productos/` con `list()` paginado. Excluye lo que usan `imageUrl`/`backImageUrl` (y sus `-w<n>`) y lo de menos de 24 h. Por omisión solo imprime; con `--apply` borra. Lo corre el dueño con el token en su `.env` local.
- *Zona:* Claude.
- *Acepta:* (T, con Blob simulado) un alta que falla después de subir llama `del` con las maestras y sus derivados. Si una URL ya la usa otro producto, no se borra. (T) barrido: lo referenciado y sus derivados no se borran; un huérfano de 25 h se borra solo con `--apply` y uno de 2 h nunca. (T) si `del` falla, el mensaje al usuario no cambia.
- *Riesgos / no hacer:* borrar una foto en uso deja una URL rota en el catálogo. No exponer al cliente una acción de "borrar blob por URL".
- *Depende:* 1.5 (nombres de derivados).

**1.12 ESLint como filtro.**
- *Contrato:* `.eslintrc.json` con `next/core-web-vitals` y `no-restricted-imports`. En `components/virtual-store/**`, `lib/virtual-store/**` y `app/catalogo/**` quedan prohibidos `@prisma/client`, `@/lib/generated/prisma`, `@/lib/data/prisma*` y `Product` de `@/lib/domain/types`. devDependencies: `eslint@8` y `eslint-config-next` en la versión de `next`.
- *Zona:* Claude.
- *Acepta:* `npm run lint` corre sin preguntas y sale con 0 en la base. (T) un archivo que importa Prisma bajo `components/virtual-store/` hace fallar el lint (prueba con la API de ESLint sobre texto). Cada desactivación por línea lleva su motivo.
- *Riesgos / no hacer:* no reformatear en masa los archivos de Antigravity. Si fallan, la regla queda en `warn` para esa carpeta y se avisa.
- *Depende:* nada.

### 4.4 P2: después del congelamiento

- Probador personal (solo owner) y probador cliente: plan global S-E y S-F, specs del 2026-10-19.
- Migración de Neon y Blob a la Raspberry Pi 5 (decisión en enero).
- Variantes por color (plan global C.2) y riel 2.5D con prendas recortadas (C.1, D-8).
- PR #17 (Next 15) si 1.10 no lo adelanta; maestra de 2048 px para imágenes aprobadas; tablas `StoreZone`/`StoreHotspot` del ER §2.5 si el JSON de 1.2 se queda corto.

---

## 5. Preguntas abiertas para el dueño

Cada una trae una propuesta sobre la que se construye; el plan no espera la respuesta.

1. **R18:** ¿el bot debe encontrar artículos de solo stock y contestar solo "hay / no hay talla"? **Propuesta (decide el dueño):** no. Se construye la respuesta neutral de 1.6; si el dueño dice que sí, se agrega `BOT_STOCK_ONLY_LOOKUP` (1 h).
2. **WhatsApp. Resuelta (dueño, 2026-11-09):** un solo número para ambas tiendas, por ahora el **número personal del dueño**, donde ya coordina las entregas. Va solo en la variable `NEXT_PUBLIC_WHATSAPP_NUMBER` (Vercel y `.env` local), **nunca en el repo ni en documentos** (es dato personal y el repo es público). Debe migrarse a **WhatsApp Business** (tarea 1.13); al migrar solo cambia la variable. Mientras la variable falte, el sitio muestra "Consulta disponibilidad en tienda.".
3. **Recorrido:** ¿quién decide qué va en cada repisa? **Propuesta (decide el dueño):** el owner, por código, en `/recorrido/puntos` (`AppSetting`). La vista Lista de cada zona muestra su sección por categoría o departamento (D-9). No hay asignación automática a repisas.
4. **Fechas.** **Propuesta (decide el dueño):** salida a producción la noche del 2026-11-10 o del 11-11, con las tiendas cerradas. Congelamiento del Buen Fin [C]: del 2026-11-13 al 11-16 (confirmar en el calendario oficial). Congelamiento de diciembre: del 2026-12-01 al 2027-01-06, lectura estricta de D2. Si el dueño prefiere el 12-18 del plan global, P1 gana dos semanas de salida. Las fechas viven en la guía, no en el código.
5. **Hosting de la demo (P-2):** **Propuesta (decide el dueño):** seguir en el Vercel actual hasta enero y decidir P-2 al terminar el congelamiento. Nada de P1 depende del hosting: los derivados de 1.5 se pregeneran y los panoramas son archivos estáticos.

---

## 6. Decisiones de diseño tomadas en este spec

Formato: decisión — por qué — costo si resulta equivocada.

1. Zonas y puntos en JSON versionado; asignación de producto en `AppSetting` (no las tablas del ER §2.5 todavía) — el ER admite JSON mientras no exista la migración, `AppSetting` ya existe y deja al owner mover productos sin desplegar ni migrar en temporada — pasar a tablas después (≈ 3 h, script de copia) y sin FK (se compensa ocultando códigos no públicos).
2. Con movimiento reducido: botones Frente/Atrás, no "solo el frente" (borrador) — manda UX §7.3 y la foto trasera sigue accesible — ninguno.
3. Sin número de WhatsApp, texto "Consulta disponibilidad en tienda." sin dirección — UX §5.8 pide "Consultar en tienda"; los datos públicos de tienda son P3 y no se inventan — ninguno.
4. `/catalogo` en cuadrícula; recorrido solo con zona real o `NEXT_PUBLIC_SALA_VIRTUAL` — D-9 dice que la sala virtual es para pruebas y la UX la oculta mientras sea de muestra — una demo con la sala virtual necesita un preview con la variable.
5. Nuevas P0 0.7 y 0.8 — el webhook falla abierto (RNF-SEG-03) y el catálogo saldría con número falso, etiquetas inventadas y 9 productos como máximo — 3 h antes del Buen Fin.
6. 0.1 se resolvió sin script: el dueño aplicó una transacción SQL de datos el 2026-11-09 (producción y `ventas-prueba`).
7. Derivados JPEG pregenerados en el cliente, nombre deducible (`productos/v2/…-w<n>`), sin `next/image` — no depende del hosting (P-2 abierto) ni de cuotas de optimización; el ER admite "prefijo deducible" — si luego se elige `next/image`, los derivados quedan como almacenamiento sobrante.
8. JPEG y no WebP en los derivados — [C] Safari en iOS no garantiza codificar WebP desde canvas — ≈ 20–30 % más peso que WebP.
9. Maestra de 1080 px (la captura actual), no 2048 — §14.1 aplica a imágenes aprobadas por IA, que son P2 — sin lupa 2× hasta entonces.
10. Devolución con comparar-y-escribir sobre `returnedQuantity` y motivo en `Movement.notes`, sin tabla nueva — idempotente sin migración — si el dueño quiere folio de devolución, hará falta una tabla `SaleReturn`.
11. Devolución solo de ventas `paid`; una `pending_payment` se anula — coherente con ER §3.3 y §6 — ninguno.
12. Totales con devoluciones por fecha de la venta (ER §3.3) más la cifra "Devoluciones de hoy" — el ER manda, y la caja del día necesita ver lo que salió hoy — una cifra más en el dashboard.
13. Carrito en `localStorage` por usuario y día de negocio, sin alias ni referencia — sobrevive a que el celular cierre la pestaña; D5 y equipos compartidos — SKU y precios quedan legibles en el equipo de la tienda (es dato interno).
14. Congelamiento de diciembre desde el 12-01 — D2 del dueño ("diciembre") manda sobre el 12-18 del plan global — P1 sale en enero si no alcanza.
15. PR #17 en enero salvo una crítica explotable — no se cambia el framework en temporada alta — Next 14 más tiempo con parches.
16. Zonas con `categories` (ER) más `departments` — las secciones reales coinciden mejor con departamentos (D6) — un campo más en el JSON.
17. En P1, la disponibilidad pública no es por tienda; el recorrido dice "Disponible", nunca "en esta tienda" — la disponibilidad por tienda es P3 en el ER §2.7 — un cliente puede ir a la tienda equivocada si no pregunta.

---

## 7. Review Focus

Casos que pueden afectar a un usuario real y que ninguna prueba de §4 cubre todavía. Cada uno con el comportamiento esperado:

1. **La última pieza se vende mientras un cliente la está viendo o preguntando** (dos tiendas o dos cajas; el catálogo en caché de la PWA). Esperado: ningún texto público promete nada; el mensaje pregunta "¿Sigue disponible?"; el bot contesta "la tienda te confirma"; en la siguiente carga `/catalogo` marca la talla como no disponible; no existe apartado.
2. **Red lenta o recarga en `/pos` a media venta** (1.7 con el id incierto). Esperado: después de un error de red y una recarga, el carrito restaurado conserva el mismo `clientRequestId` y "Cobrar" devuelve la venta ya registrada, sin duplicarla. Si el precio cambió entretanto y quien cobra es un colaborador, ve "Solo el dueño o el encargado pueden cambiar el precio." y puede descartar y volver a escanear.
3. **Un producto deja de ser público** (desactivado, todas sus variantes inactivas, o una foto que se rompe) mientras está asignado a un punto o en un mensaje de WhatsApp ya enviado. Esperado: el punto desaparece y el resto del recorrido sigue; el bot, por ese código, da la respuesta neutral; el barrido de 1.11 nunca borra una foto referenciada. Agotado no es lo mismo que no público: el punto se queda con "Agotado".
4. **Más productos que puntos, o el mismo código en dos puntos.** Esperado: la cuadrícula muestra todos (0.8/1.1); el recorrido pinta solo los puntos asignados; asignar un código que ya está en otro punto se rechaza diciendo en cuál.
5. **Tablet compartida o cambio de tienda a media jornada** (0.1 corrido con la tienda abierta, o `colab2` entrando en el equipo de `colab1`). Esperado: el borrador de un usuario no aparece a otro; una venta restaurada para la tienda anterior se rechaza con "Solo puedes vender en tu tienda." y no descuenta stock; `/ventas` del colaborador muestra solo su tienda nueva.

---

## 8. Fuera de alcance

- Ficha pública `/catalogo/p/[slug]`, `publishedAt`, datos públicos de tienda y disponibilidad por tienda (P3, ER §2.7).
- Cobro en línea, carrito del cliente, apartados con caducidad, envíos.
- Política de devoluciones y cambios (decisión del dueño, D-VEN-3), método de reembolso y folio de devolución.
- Recorte de fondo, riel 2.5D, variantes por color, probador virtual, imágenes con IA.
- Cambio de hosting y de dominio, y migración a la Raspberry Pi.
- Purga de la historia de Git.

---

## Apéndice A. Mensaje inicial para una sesión de Antigravity

Para pegar al empezar cada sesión (ajustar la tarea):

> Trabajas en LoloShop junto con Claude. Antes de tocar código lee `AGENTS.md` y `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md` (§2, §3 y tu tarea en §4). Tu zona es `components/virtual-store/`, `lib/virtual-store/` y el aspecto de `/catalogo`; no modifiques `prisma/`, `lib/data/`, `lib/sales/`, `lib/catalog/`, `lib/image/`, `lib/public/`, `lib/actions.ts`, `app/api/`, `app/pos`, `app/ventas`, `app/escanear` ni `app/recorrido/`: si necesitas algo ahí, escríbelo como petición. En lo público usa solo `PublicProduct` (sin SKU, sin conteos, sin productos, precios ni ubicaciones inventados). Crea tu rama desde `feat/demo-alta-lote` con el nombre `feat/3d-<tema>`; no hagas commit en `main` ni `push`. Al terminar pega la salida de `npx tsc --noEmit`, `npm test` y `npm run build`, y lista archivos y dudas. Tarea de hoy: <número del backlog §4>.
