# Demo: tienda física digitalizada (catálogo + recorrido 3D + probador)

- **Fecha:** 2026-10-27 · **Estado:** propuesta para aprobación del dueño · **Sin secretos** (repo público)
- **Relaciona:** `2026-10-19-probador-cliente-foto-design.md` (Doc-Cliente), `2026-10-19-probador-personal-vivo-design.md` (Doc-Personal), `2026-10-19-probador-bajo-costo-design.md` (Doc-BajoCosto), `2026-10-20-auditoria-probador-design.md` (auditoría), `plans/2026-10-19-probador-virtual-roadmap-sprints.md` (plan maestro).
- **Convención:** **[V]** verificado en el repo o en la documentación; **[NV]** no verificado; **[A]** juicio propio.

---

## 1. Objetivo

Una demo que muestre la tienda física **digitalizada** en tres capas, en este orden:

1. **Catálogo:** los productos reales de la tienda, dados de alta escaneando sus etiquetas, con foto.
2. **Tienda:** fotos reales del local que se convierten en un recorrido 3D navegable, con los productos del catálogo colocados en sus repisas.
3. **Probador:** el try-on del probador virtual sobre esas prendas (modo personal primero, modo cliente después).

Cada capa depende de la anterior. **La demo no depende de IA**: las capas 1 y 2 se pueden mostrar sin gastar nada en proveedores.

---

## 2. Qué ya existe en el repo y qué falta

| Pieza | Estado actual [V] | Hueco para la demo |
|---|---|---|
| Escaneo de etiquetas | `app/escanear/page.tsx` + `components/inventory/Scanner.tsx` (`html5-qrcode`). Si el código no existe, abre `NewProductForm` | **Un escaneo por alta**: después de cada producto hay que volver a escanear. Sin modo de lote |
| Alta de producto | `createProductAction` → `createProduct` (Prisma) | **Stock inicial fijo en 1** (`available: 1`). **Sin categoría** en el formulario: todo queda como "General", y los filtros de `/productos` no sirven |
| Foto de producto | `ProductPhotoCapture` + `lib/image/process.ts` (crop 1:1, auto-niveles) + `lib/image/upload.ts` (`@vercel/blob`) → `Product.imageUrl` | Funciona en el alta. Falta **captura en lote** y **foto del original** (el plan 3.2 pide conservarlo) |
| Etiquetas | `app/etiquetas/page.tsx` (`react-barcode`, imprimir) | Ya sirve para re-etiquetar. No bloquea nada |
| Catálogo público | `/catalogo` (`CatalogClient`). Hoy usa `fetchPublicProductsAction` → `getProducts()` | **Expone SKU e inventario por sucursal** al visitante. Bloqueante (ver §6) |
| Recorrido 3D | Trabajo de Antigravity, **sin commitear**: `lib/virtual-store/`, `components/virtual-store/`, `VirtualStore.test.tsx`, cambios en `app/catalogo/*` | Datos demo fijos en `ProductHotspotModal` y stock de respaldo `4`. Zonas y hotspots **inventados** (no medidos de la tienda real) |
| Fotos de la tienda | **No existen** | Captura, procesamiento y almacenamiento (§4) |
| Probador | Solo specs y auditoría | Ninguna línea de código (Sprint 4 y 5 del plan) |

---

## 3. Capa 1: catálogo digitalizado con escáner

**Meta:** dar de alta **N productos por hora** con su foto, sin escribir SKU a mano.

### 3.1 Cambios propuestos

1. **Modo lote en `/escanear`.** Tras cada código, el formulario queda abierto y el escáner sigue activo debajo (no se cierra). Al guardar, el escáner vuelve solo. Un contador muestra "N dados de alta en esta sesión".
2. **Categoría obligatoria** en el formulario, con las mismas categorías de `/productos` (`Playeras`, `Pantalones`, `Hoodies`, `Tenis`, `Accesorios`, `Perfumes`, `Raquetas de Padel`). Hay que pasar `category` a `createProduct`, que hoy no lo recibe.
3. **Stock inicial explícito.** Dos opciones (decisión D-1 en §7):
   - **A:** stock inicial = cantidad contada en el alta (campo numérico, por defecto 0).
   - **B:** mantener `available: 1`, como hasta hoy.
   Recomendación [A]: **A con 0 por defecto**. Un stock inventado de 1 sale en el recorrido y en el modal.
4. **Foto en el mismo paso.** Captura con cámara (`<input capture>`), procesamiento actual y **guardado del original** en la tabla de imágenes (migración con `prisma migrate`, como en el plan 3.1). Si no hay foto, el producto se da de alta igual y queda marcado "sin foto".
5. **Alta sin duplicar.** Si el código ya existe, el escáner abre el producto para editarlo (no un error de unicidad).

### 3.2 Criterios de aceptación

- Un operador da de alta 10 productos con foto en menos de 10 minutos en un móvil real. **[A]** Medir en la prueba.
- `createProduct` rechaza categoría vacía y stock negativo (tests).
- Los productos dados de alta aparecen en `/productos` filtrados por categoría.
- Ningún flujo de alta depende de IA ni de red externa salvo Vercel Blob.

### 3.3 Fuera de alcance

- Importación masiva desde CSV o desde Shopify (se puede después; la demo es con etiquetas).
- Conteo físico completo y conciliación (eso es el plan 6.3 y el inventario normal).

---

## 4. Capa 2: fotos reales de la tienda

**Meta:** tener un conjunto de fotos del local suficiente para reconstruir un recorrido.

### 4.1 Captura

- **Protocolo [A]:** caminar por cada zona grabando un video continuo de 20–40 s, o tomar fotos con 70–80 % de solape entre tomas. Cuatro zonas, igual que en `zones.ts`: entrada/vitrina, pasillo de percheros, muro de calzado, mostrador.
- **Sin personas identificables** en las fotos (cara visible de clientes o del personal). Si aparece alguien, se repite la toma. Es un requisito de privacidad, no solo estético.
- **Sin precios ni datos personales visibles** en pantallas o papeles de la caja.
- Resolución: 4K o la mayor disponible. Luz: la de la tienda, sin editar.

### 4.2 Procesamiento (dos caminos, según lo que se elija)

| Ruta | Qué produce | Costo | Cuándo |
|---|---|---|---|
| **R-1: panorámicas 360°** | Una imagen equirectangular por zona. El visor de Antigravity ya acepta `panoramaUrl` | Herramienta gratuita de stitching o celular con modo panorámico [NV] | **Demo mínima** (recomendada) |
| **R-2: Gaussian Splat** | Modelo `.splat`/`.spz` por tienda, con COLMAP + entrenamiento (Luma, SuperSplat, Nerfstudio o Postshot) | Entrenamiento en nube o local con GPU [NV]; un archivo de decenas de MB | **Después**, si la demo con R-1 convence |

**Recomendación [A]:** R-1 para la demo. R-2 da más realismo, pero el entrenamiento y la compresión llevan tiempo y no es necesario para mostrar el concepto. Decisión D-2.

### 4.3 Almacenamiento

- Las fotos de la tienda son **estáticas y públicas**, así que van a un almacén de objetos (Vercel Blob hoy; R2 o Blob en Cloudflare según el hosting, §8).
- Se guardan como `StoreZone.panoramaUrl` / `splatUrl` en la configuración de zonas. **No se hardcodean** en `zones.ts`: la configuración debe venir de la base de datos o de un JSON versionado, para no tener que redesplegar al cambiar una foto. **[A]** Hoy `zones.ts` tiene los datos inventados; hay que reemplazarlos.

---

## 5. Capa 3: recorrido 3D

### 5.1 Qué ya hay (trabajo de Antigravity)

Según su reporte: proyección esférica `projection.ts`, cuatro zonas con conexiones, `VirtualStoreCanvas` (arrastre 360°, touch), minimapa con cono de dirección, cajón con búsqueda y "mover la cámara a la repisa", modal de producto con `ProductCard3D`, y un switch entre recorrido y cuadrícula.

### 5.2 Lo que hay que cambiar antes de que sea demo

1. **Proyección pública.** `/catalogo` no debe recibir SKU ni inventario. Crear `toPublicProduct()` (nombre, marca, categoría, precio, imagen y, si se quiere, solo "disponible / agotado") y usarlo en `fetchPublicProductsAction`. **Bloqueante.** Prueba: `/catalogo` no expone SKU ni `inventory` (tarea 5.4 del plan).
2. **Quitar datos demo.** `ProductHotspotModal` no debe mostrar `LS-DEMO-01` ni `?? 4`. Si un producto no tiene inventario, el modal dice "consultar en tienda", no un número.
3. **Hotspots reales.** `bindProductsToHotspots` asigna productos por índice (`realProducts[idx % length]`). Para la demo, cada hotspot debe apuntar a un producto **elegido** (en la configuración de la tienda), no al azar. Si hay menos productos que hotspots, el hotspot se oculta.
4. **Coordenadas medidas.** `yaw`/`pitch` de `zones.ts` y `DEFAULT_HOTSPOTS_CONFIG` son valores inventados. Se miden sobre las fotos reales (la captura de cada repisa con su ángulo).
5. **Verificación.** El reporte dice 68/68 tests y build correcto, pero el build quedó en segundo plano y luego se mató una tarea. Hay que volver a correr `npm test`, `npm run lint` y `npm run build` en la rama antes de mezclarla.

### 5.3 Dónde vive el trabajo

- Rama propia `feat/demo-recorrido-3d`, PR pequeño. Antigravity trabaja ahí; **no** se mezcla con los docs del probador en `main`.
- Los docs del probador se commitean por separado (`docs:`).

---

## 6. Puente al probador (capa 4)

Cuando el recorrido ya funciona, el probador se engancha en dos lugares:

- **Modo personal (owner):** `/probador`, con la cámara local y la prenda elegida del catálogo. Según el plan, Sprint 4, con modo híbrido y sin IA hasta "Capturar". Tarea de la auditoría: rutas `/api/probador/*` protegidas.
- **Modo cliente:** un botón "Probar" en el modal del producto del recorrido. **Depende de la decisión D4** (abierto en `/catalogo` o solo con enlace firmado).

Lo que la demo **no** incluye: IA de try-on, Decart, WhatsApp ni cobros. La demo muestra que la prenda del catálogo existe, está en la tienda y se puede probar; la prueba con IA es el Sprint 2 del plan.

---

## 7. Decisiones que necesito del dueño

| # | Decisión | Recomendación [A] |
|---|---|---|
| D-1 | Stock inicial al dar de alta: contado (A) o `1` fijo (B) | **A, con 0 por defecto** |
| D-2 | Recorrido: panorámicas 360° (R-1) o Gaussian Splat (R-2) para la demo | **R-1** |
| D-3 | ¿Autorizas tomar fotos de la tienda (sin personas, sin precios visibles)? | Sí, con la regla de §4.1 |
| D-4 | Hosting de la demo: Cloudflare Workers (interino, Workers Paid US$5) o Vercel Pro (US$20) desde ya | **Cloudflare interino**, como acordaste |
| D-5 | ¿El precio y el stock se muestran en el recorrido público (`/catalogo`) o solo "disponible / agotado"? | **Solo "disponible / agotado"** |
| D-6 | Probador en la demo: solo la prenda sin IA (recomendado) o también el try-on | **Sin IA en la demo** |

---

## 8. Orden de trabajo y criterios de salida

| Paso | Qué | Criterio de salida | Responsable |
|---|---|---|---|
| **P1** | Modo lote + categoría + stock explícito + foto con original (§3) | 10 productos dados de alta en un móvil real; tests de `createProduct` | Codex (TDD) + Claude (revisión) |
| **P2** | Captura de fotos de la tienda (§4.1) | Fotos de las 4 zonas, sin personas, con solape | Dueño (captura) |
| **P3** | Proyección pública y limpieza del recorrido (§5.2, puntos 1–2) | Test: `/catalogo` sin SKU ni stock; sin datos demo | Codex |
| **P4** | Recorrido con fotos reales y hotspots medidos (§5.2, puntos 3–4) | Recorrido navegable con 10+ productos en su repisa | Antigravity + Claude |
| **P5** | Verificación completa (§5.2, punto 5) y deploy de la demo | `lint`, `test`, `build` en verde; URL de demo | Claude |
| **P6** | Probador personal en `/probador` (plan Sprint 4, sin IA en demo) | Prueba en tablet real | Según el plan |

**Hosting:** la demo se publica en Cloudflare Workers, como interino (ver `2026-10-20-spike-cloudflare-workers-informe.md` y D-4). Lo que hay que resolver antes de publicar: rama de Neon, Hyperdrive, secretos con `wrangler secret put` y `wrangler login` con permisos de escritura.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fotos con personas o datos sensibles | Regla de §4.1 y revisión antes de subir |
| Recorrido con posiciones inventadas que no coinciden con la tienda | Medir `yaw`/`pitch` sobre fotos reales (§5.2) |
| El recorrido muestra stock falso | Quitar `?? 4` y datos demo; mostrar solo disponible/agotado (D-5) |
| El trabajo de Antigravity se mezcla con los docs | Rama propia y PR (§5.3) |
| Build y tests reportados sin verificar | Repetirlos en la rama antes de mezclar (P5) |
| Sin IA, la demo no muestra "la magia" del probador | Se muestra la prenda en su repisa y el flujo; la IA es el Sprint 2 y se decide con datos |

---

## 10. Fuera de alcance

- Decart, FASHN, Nano Banana, klein o cualquier proveedor de IA.
- Modo cliente con enlace firmado y WhatsApp (Sprint 5).
- Gaussian Splat (R-2), salvo que D-2 lo cambie.
- Cobros o carrito; el canal de compra sigue siendo WhatsApp.
