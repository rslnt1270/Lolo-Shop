# LoloShop versión final, entrega 2: cronograma (2026-11-12)

> **For agentic workers:** este documento es el cronograma y el mapa de dependencias de la entrega 2. Cada grupo apunta a tareas de un plan detallado en `docs/superpowers/plans/`. Ejecuta con superpowers:subagent-driven-development (un implementador y un revisor por grupo) o superpowers:executing-plans. La numeración de grupos sigue la del ledger de la entrega 1 (G01–G17 ya en producción).

**Punto de partida:** `main` d05d68b (PR #34) en producción con las dos migraciones de la versión final aplicadas (`20261111120000_add_product_types`, `20261111150008_catalog_color_visibility`). Entrega 1 = G01–G17: B base, A, G (3.8), H, D (alta) y E Tasks 1–4 (POS rápido). Demo con el dueño hecha.

**Goal:** Sitio web solo con prendas publicadas por owner o manager; captura de fotos libre (sin fondo blanco); lista "Por publicar" para que el dueño edite, reemplace y publique; "Agregar nuevamente" y "Sin código" en el POS; avisos del POS que no se pierden; catálogo sin CTA de WhatsApp y con favoritos; paleta turquesa en todas las zonas; pulido de la entrega 1.

**Planes:**
- `2026-11-11-C-catalogo-favoritos.md` (revisado 2026-11-12: elegibilidad nueva, captura libre, "Por publicar")
- `2026-11-11-E-pos-rapido.md` (Tasks 5, 6, 6a nueva, 7, 8)
- `2026-11-11-B-paleta-botones.md` (Tasks 5–10)
- `2026-11-12-pulido-entrega-1.md` (nuevo: P1–P6)

**Ledger de la entrega 1 (solo lectura):** `LoloShop-vf/.superpowers/sdd/2026-11-11-version-final-cronograma/progress.md` y `decisiones.md`.

## 1. Decisión del dueño del 2026-11-12 (manda sobre los specs)

Se quita el requisito de fondo blanco. Cualquier foto tomada se acepta: sin marco, sin rechazo. El personal solo captura rápido fotos y productos. El dueño edita las fotos después y las reemplaza antes de publicar.

Consecuencias de diseño (detalle en plan C):
- **Elegible para el sitio** = foto de frente y de atrás presentes, descripción y existencias en una tienda pública (`type = store`, `isPublic`). **Publicado** = owner o manager tocó "Publicar" (`isPublished`). El sitio exige las dos cosas en cada lectura.
- **`catalogPhotosCheckedAt`** se conserva sin migración y deja de decidir nada. Significa "frente y atrás guardadas juntas desde la app"; se escribe solo con las dos URL (guarda en la capa de datos). La revisión humana es "Publicar".
- **"Por publicar"** en `/productos` (owner y manager): productos activos con dos fotos y existencias en tienda pública, sin publicar. Cada fila: "Abrir foto" de frente y atrás (para descargarla y editarla), "Reemplazar foto" por lado (abre la galería), huecos que faltan y "Publicar".
- **Etiquetas del alta** sin cambio: "Solo stock", "Falta completar registro fotográfico", "Fotos completas, sin existencias", "Listo para catálogo". "Listo para catálogo" = fotos, descripción y existencias, **esperando que owner o manager publiquen**; el alta lo dice en una línea.
- **Specs afectados** (quedan sin efecto en lo de fondo blanco): alta §1, §2.3, §3, C14, C15, §8; alcance §5 punto 4; decisión 5 de la entrega 1.

## 2. Grupos en orden de mezcla

| Grupo | Plan y tareas | Contenido | Depende de | Horas (agente) |
|---|---|---|---|---|
| **G18** | C T1 (ya cubierta), T2, T2a | `publicStoreIds`, `catalogEligibility` sin fondo blanco, `isPendingPublication`, filtro `isPublished` en proyección, `getCatalogProducts` y bot | — | 3 |
| **G19** | C T2c | Captura libre: sin `analyzeBackground`, marco ni rechazo; acciones de foto sin `photosAnalyzed`; `source="gallery"`; guarda de `catalogPhotosCheckedAt`; textos del alta y del recorrido | **G18 mezclado** (privacidad) | 3.5 |
| **G20** | C T2b, T2d | `setProductPublishedAction`, `PublishControl` con aviso de personas y precios, sección "Sitio web" de la ficha, lista "Por publicar" | G19 | 5 |
| **G21** | Pulido P1–P6 | Trampa y retorno de foco en `AltaTour`; "Catálogo"; `resolveColorLabel`; `fetchLocationsAction` recortada; prueba de `addVariantAction` | G19 (mismos archivos del alta) | 2.5 |
| **G22** | E T5 | "Agregar nuevamente" en `/escanear` (`lookupCodeAction` con tienda; `SumToMyStore label`) | — (paralelo a G18–G21) | 1.5 |
| **G23** | E T6 | "Sin código": `SaleProductSearch`, `searchProducts` por tipo, color y código interno | G22 | 3 |
| **G24** | E T6a, T7, T8 | Avisos del POS (rechazo tras la cola, segunda pieza en espera ×N, filas en error tras la venta); regresión del cobro; preview y `test:db` | G23 | 3 (+ prueba manual del dueño) |
| **G25** | C T3, T4 | Tarjeta sin "Agotado"; `SHOW_WHATSAPP_CTA = false` | G20 | 1.5 |
| **G26** | C T5–T9 | Favoritos (almacén, hook, botón, tarjeta, `/favoritos`, `middleware.ts`) y verificación de C | G25 | 4 |
| **G27** | B T5–T9 | Paleta por zonas: público y acceso, ventas y POS, productos, inventario y escáner, catálogo 3D | G21, G24, G26 | 5 |
| **G28** | B T10 | Barrido final y minors de B base (G01) | G27 | 1.5 |

**Total: 11 grupos, ~33.5 horas de agente.** F (venta sin internet) fuera.

Regla heredada: si un grupo llega tarde, los que van después esperan o se rebasan; nunca se reescribe la lógica de un grupo anterior. B es el que se rebasa.

## 3. Dos líneas en paralelo

- **Línea catálogo:** G18 → G19 → G20 → G21 → G25 → G26.
- **Línea POS:** G22 → G23 → G24 (no depende de la línea catálogo).
- **Cierre:** G27 → G28 cuando ambas líneas están en `main`.

## 4. Choques de archivos (rebasar, no reescribir)

| Archivo | Grupos | Nota |
|---|---|---|
| `lib/data/prisma-source.ts`, `lib/data/fixture-source.ts`, `lib/data/source.ts` | G18 (`getCatalogProducts`), G19 (`createProduct`), G20 (`setProductPublished`, `getProductForPublish`), G23 (`searchProducts`) | Métodos distintos; quien mezcla después rebasa. |
| `lib/actions.ts` | G19 (acciones de foto, `CreateProductInput`), G21 (`fetchLocationsAction`) | Funciones distintas. |
| `components/products/NewProductForm.tsx` | G19 (textos de fotos, `photosAnalyzed`), G21 (P2, P3), G27 (B T7) | G21 se rebasa sobre G19. |
| `components/products/AltaTour.tsx` | G19 (texto del paso 3), G21 (P1 foco), G27 (puntos con tokens) | Igual. |
| `components/products/ProductAdminSheet.tsx` | G19 (bloque de fotos), G20 (sección "Sitio web", tipo de `locations`), G27 | G20 se rebasa sobre G19. |
| `components/products/ProductPhotoButton.tsx`, `ProductPhotoCapture.tsx` | G19, G20 (uso con `source="gallery"`), G27 | — |
| `app/productos/page.tsx` | G20 ("Por publicar", `locations` con `type`/`isPublic`), G27 | — |
| `app/escanear/page.tsx`, `components/inventory/SumToMyStore.tsx` | G22, G27 | — |
| `app/pos/page.tsx`, `components/sales/SaleCart.tsx` | G23 (`onNoBarcode`), G24 (avisos), G27 | G24 se rebasa sobre G23. |
| `components/virtual-store/CatalogGrid.tsx` | G25 (T3), G26 (T7), G27 (T9) | — |
| `middleware.ts` | G26 | Único; `/favoritos` hoy queda tras el login. |
| `app/pos/page.tsx` (plan F, `2026-11-12-F-venta-sin-internet.md`) | F, G23, G24 | F se planea aparte y trae su propia migración (`<timestamp>_offline_sales_review`). Recomendación: F se rebasa sobre G24 (salida 2b), no al revés, para no reescribir la lógica de avisos de E Task 6a. |

## 5. Salidas a producción

**No hay migraciones en la entrega 2.** Todas las columnas (`Product.isPublished`, `Product.catalogPhotosCheckedAt`, `Location.isPublic`, `Product.color`) ya están en producción. Nadie corre `prisma migrate` (recordatorio del ledger: el `.env` de la copia principal apunta a producción).

Tres salidas, cada una con: `npm test`, `npm run test:db` (con el número de pruebas ejecutadas), `npm run lint`, `npm run build`, preview de Vercel contra la rama de Neon `ventas-prueba`, visto bueno del dueño, mezcla a `main`, despliegue de producción y humo. Retroceso: promover el despliegue anterior en Vercel; la base no cambia.

1. **Salida 2a = G18–G21** (lo antes posible). Humo: `/catalogo` 200 y vacío hasta publicar; el bot no encuentra por código un producto sin publicar; alta con dos fotos cualesquiera llega a "Listo para catálogo"; el owner ve "Por publicar", reemplaza una foto desde la galería y publica; la prenda aparece en `/catalogo`; el colaborador no ve "Por publicar" ni "Sitio web". **Justo después del despliegue, el dueño publica desde "Por publicar"** las prendas que quiera en el sitio (hasta entonces el sitio está vacío: hoy ningún producto tiene `isPublished = true`). Pestañas PWA abiertas: recargar (las viejas siguen rechazando fotos sin fondo blanco hasta recargar; el servidor ya acepta ambas).
2. **Salida 2b = G22–G24** (toca el cobro): `test:db` obligatorio y prueba manual de E Task 8 en preview. Humo: venta con escaneo continuo, "Sin código", "Agregar nuevamente".
3. **Salida 2c = G25–G28:** sitio sin CTA, favoritos (`/favoritos` sin sesión), paleta. Revisión visual a 375 px.

## 6. Seguridad y privacidad

- **Alta (hasta la salida 2a):** en producción `/catalogo` y el bot muestran cualquier producto activo con las dos fotos, publicado o no (minor aceptado en la revisión final de la entrega 1). Hoy lo limita el análisis de fondo blanco; al quitarlo, cualquier foto de tienda (con personas, precios o datos de clientes) saldría al sitio sin revisión. **Por eso G18 se mezcla antes que G19 y ambos salen en la misma salida.**
- **Media:** las URL de Blob son públicas para quien las tenga (aleatorias, no listadas). Una foto reemplazada no se borra del almacén. Se acepta para esta entrega; queda como pendiente "borrar el blob anterior al reemplazar" (fuera de alcance).
- **Media:** la confirmación de "Publicar" pide revisar que no haya personas identificables, precios ni datos de clientes (plan C Task 2b). La revisión es humana; no hay detector automático.
- **Baja, previa:** `checkPhotoAccess` en `lib/actions.ts` consulta `prisma` directo en vez de `InventoryDataSource` (frontera de datos). Sin cambio en esta entrega; anotar para la limpieza posterior.
- Permisos: `setProductPublishedAction` y "Por publicar" solo owner y manager, con rol releído de la base; `fetchLocationsAction` deja de nombrar la otra tienda al colaborador (G21).

## 7. Fuera de esta entrega

- **F, venta sin internet:** se planea aparte (otro agente). Absorbe los minors del cobro que E no toca (canal/método/alias con carrito bloqueado; `NO_STOCK` en reintento incierto).
- **3.5, subida de Next** (PR #17: Next 15.5, React 19, Serwist): fuera.
- **3.1, webhook de WhatsApp:** fuera.
- Vercel Pro, purga de la historia del repo, borrado de blobs reemplazados, ruta `/catalogo/p/[slug]`, animaciones de catálogo y ficha, conteo físico (1.13).
- Minors de la entrega 1 no triados para esta entrega (siguen en el ledger): p. ej. filtro "Categoría" → "Tipo" en `/productos`, blobs huérfanos en el alta, `useReducedMotion` que arranca en false, pruebas del CLI de visibilidad.

## 8. Preguntas para el dueño (con lo que haremos si no responde)

1. **Fotos editadas:** "Reemplazar foto" abre la galería. ¿Tus fotos editadas son cuadradas? **Por defecto:** se recortan a cuadrado (1:1), máximo 1080 px, y **no** se les aplica el ajuste automático de brillo, para no alterar tu edición.
2. **Reemplazar una foto de una prenda ya publicada:** ¿sigue publicada? **Por defecto:** sí, sigue publicada.
3. **Prendas con fotos pero sin piezas:** ¿entran a "Por publicar"? **Por defecto:** no; entran cuando lleguen piezas a una tienda.
4. **Sitio vacío tras la salida 2a:** el sitio queda vacío hasta que publiques. ¿Lo aceptas y publicas el mismo día? **Por defecto:** sí.
5. **WhatsApp y favoritos en el sitio:** ¿quitamos el botón "Consultar por WhatsApp" y agregamos favoritos? **Por defecto:** sí, con vuelta atrás de una línea (`SHOW_WHATSAPP_CTA`).

## 9. Próximos pasos

- [ ] G18 y G22 en paralelo.
- [ ] G19 tras mezclar G18; G20 y G21 tras G19.
- [ ] Salida 2a (G18–G21) con las respuestas 1, 2 y 4 del dueño.
- [ ] G23, G24 y salida 2b.
- [ ] G25, G26, G27, G28 y salida 2c.
