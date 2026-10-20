# Probador virtual (modo cliente, por foto) — investigación y plan

Fecha: 2026-10-19 · Estado: borrador para validación del usuario · Autor: agente investigador/arquitecto

> Este documento NO contiene código de producto ni valores de claves. El repo es público: solo aparecen nombres de variables de entorno.
> Convención de fuentes: **[Doc]** = documentación oficial leída directamente; **[Prov]** = afirmación comercial del proveedor; **[3ro]** = fuente de terceros (blog, agregador); **[NV]** = no pude verificarlo. Los precios cambian: revalidar antes de contratar.

---

## 1. Resumen y decisión recomendada

**Recomendación: FASHN Try-On v1.6 llamado directamente a su API (no vía fal.ai), con `return_base64: true`.**

Razones, todas verificadas en documentación oficial [Doc]:
- Precio on-demand **US$0.075 por imagen** (mínimo de compra US$7.50 = 100 imágenes) — <https://help.fashn.ai/plans-and-pricing/api-pricing>.
- Latencia documentada: `performance` ~5 s, `balanced` ~8 s (default), `quality` ~12–17 s — <https://docs.fashn.ai/api-reference/tryon-v1-6>.
- Categorías `tops`, `bottoms`, `one-pieces` (o `auto`), y acepta foto de prenda tipo `flat-lay` o `model` (en el catálogo, una foto de producto "en modelo" también sirve).
- **Retención**: con `return_base64: true` la salida solo vive 60 min en su sistema y el historial guarda un marcador de posición; entradas en base64 se borran al terminar la petición (respaldo de limpieza de 1 día); no hay URLs públicas de la foto del cliente. FASHN declara en sus Términos que no entrena con contenido del cliente salvo opt-in contractual — <https://docs.fashn.ai/api-overview/data-retention-privacy>.
- Existe DPA para clientes de negocio (referido en esa misma página).
- API simple: `POST /v1/run` + polling de estado (sin webhooks), apta para una Route Handler de Vercel.

**Respaldo (una alternativa): Google Virtual Try-On (`virtual-try-on-001`) en Vertex AI** — ~US$0.06/imagen [3ro, NV en página oficial], PNG/JPEG hasta 10 MB, no entrena con datos del cliente sin permiso [Doc], pero puede haber logging de prompts para monitoreo de abuso salvo que se solicite excepción [Doc]. Requiere cuenta/facturación de Google Cloud y autenticación por service account (más fricción). Detalle en §3.

**Qué NO está resuelto**: ningún proveedor listado soporta oficialmente accesorios (gorras, lentes). El MVP cubre solo prendas de tronco, piernas y vestidos/conjuntos (§3, §8).

## 2. Objetivos / no-objetivos / anti-objetivos

**Objetivos**
- Desde el catálogo público (`/catalogo`), en el móvil: el cliente da consentimiento, toma o sube una foto, elige una prenda y recibe una imagen con la prenda puesta.
- Sin login. Sin persistir la foto del cliente ni el resultado (ni Postgres ni Blob).
- Claves solo en servidor. Costo acotado por tope diario y límites por IP/sesión.
- Proveedor intercambiable detrás de una interfaz.

**No-objetivos (MVP)**
- Probador en vivo por cámara/video (Decart realtime, etc.).
- Accesorios (gorras, lentes), calzado, joyería.
- Guardar historial de pruebas, cuentas de cliente, compartir resultado por link.
- Multi-prenda (outfit completo) en una sola petición.
- Medición de talla o recomendación de talla.

**Anti-objetivos (cosas que no debemos hacer)**
- No subir la foto del cliente a Vercel Blob ni a ninguna URL pública, aunque sea temporal (los proveedores que exigen URL, p. ej. fal.ai, obligarían a eso; ver §3).
- No loguear la imagen ni su base64, ni nombre de archivo, ni EXIF en logs de Vercel.
- No usar la foto/resultado para marketing, entrenamiento o analítica.
- No exponer ningún endpoint del proveedor al cliente (nada de claves ni URLs firmadas directas).
- No habilitarlo a menores sin una decisión legal explícita (§5).

## 3. Matriz comparativa de proveedores

Fecha de consulta: 2026-10-19. Latencia "NV" = no publicada por el proveedor.

| Proveedor | Precio / imagen | Latencia | Categorías | Entrada | API | Retención / entrenamiento | Notas |
|---|---|---|---|---|---|---|---|
| **FASHN v1.6 (API directa)** | US$0.075 on-demand; Tier I US$19/mes + US$0.0675 extra; Tier II US$249/mes + US$0.060 [Doc: help.fashn.ai/plans-and-pricing/api-pricing]. (Un Tier III ~US$0.049 aparece solo en [3ro]) | 5 / 8 / 12–17 s según `mode` [Doc] | tops, bottoms, one-pieces, auto [Doc]. Accesorios: no listado | URL o data URI; procesa a 864x1296; formato/tamaño sin límite documentado [Doc] | Async: `POST /v1/run` + polling; sin webhooks [Doc] | Base64 de entrada borrado al terminar; salida base64 60 min; salida CDN 3 días; sin entrenamiento sin opt-in (Términos); DPA disponible; borrado por email a legal@fashn.ai [Doc: docs.fashn.ai/api-overview/data-retention-privacy]. Región/residencia: no indicada. Menores/biometría: no se menciona [Doc] | Moderación configurable (`moderation_level`); el default `permissive` permite ropa de baño/íntima, usar `conservative` |
| **FASHN v1.6 vía fal.ai** | US$0.075 [Doc fal: fal.ai/models/fal-ai/fashn/tryon/v1.5] | NV | igual | URLs | Cola de fal | Ver fal abajo | Añade intermediario sin ventaja |
| **Kling Kolors v1.5 vía fal.ai** | US$0.07 [Doc: fal.ai/learn/tools/best-virtual-try-on-apis-2026] | NV | No especificado; mejor con modelo frontal y prenda plana en fondo liso | URLs; hay modo sync [Doc] | fal queue/sync | fal guarda por defecto payloads 90 días y los CDN files (acceso por URL pública) con retención configurable; `X-Fal-Store-IO: 0` desactiva el historial de payloads pero NO los archivos CDN [Doc: fal.ai/docs/documentation/model-apis/media-expiration.md]. Una fuente [3ro] (blog.picassoia.com) menciona fecha de discontinuación 20-ene-2027 para ese modelo [NV] | Exige subir la foto del cliente a una URL (el SDK de fal la sube a su CDN) → choca con el principio de no dejar la foto en URLs |
| **Google Vertex AI `virtual-try-on-001`** | ~US$0.06 [3ro: cloudprice.net, blog.picassoia.com]; la doc oficial no lista precio [NV] | NV; cuota 50 req/min regional [Doc] | No especificado en la doc; hasta 4 imágenes por petición [Doc] | PNG/JPEG, máx 10 MB [Doc] | Predict (síncrono por regional endpoint) [NV el detalle] | No entrena sin permiso; puede registrar prompts para detección de abuso salvo excepción (ZDR) solicitada; el cacheo de 24 h aplica a modelos Gemini [Doc: docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance]. La doc de Vertex indica que se movió a "Gemini Enterprise Agent Platform" (renombre) | Mayor control regional y contractual (puedes elegir región, p. ej. EE. UU.); más setup (GCP, IAM) |
| **FLUX Virtual Try-On Pro (BFL, vía fal)** | US$0.0375 por 1er megapíxel de entrada + US$0.005 por MP adicional de entrada + US$0.005 por MP de salida [Doc fal]. Para persona 1 MP + prenda 1 MP + salida 1 MP ≈ US$0.05 (cálculo propio) | NV | No especificado; una prenda por petición | Persona hasta 2 MP, prenda ~1 MP | fal | Igual que fal | Barato, pero no pude verificar calidad en prendas variadas |
| **Decart Lucy VTON** | Batch es de VIDEO: US$0.04/s a 720p; realtime US$0.02/s [Doc: docs.platform.decart.ai/getting-started/pricing.md]. **No hallé modo imagen** del VTON | tiempo real (stream) | NV | Webcam/WebRTC o video | WebRTC/WebSocket o cola de video | NV | Descartado para foto: está pensado para video/live. Candidato futuro para "probador en vivo" |
| **Vidu** | No hallé API de try-on ni precio [NV] | NV | NV | NV | NV | NV | Sin evidencia: descartado |
| **Leffa (fal)** | US$0.10 [Doc fal list] | NV | upper, lower, dress (obligatorio indicar) | URLs | fal | fal | Más caro, categorías explícitas |
| **Perfect Corp. (AI Clothes)** | ~US$0.096 (suscripción) a ~US$0.11 (pay-go) por resultado [3ro: perfectcorp.com blog, ago-2026] | NV | NV | NV | NV | NV | Orientado a retail empresarial; sin verificar términos |
| **Muapi (agregador)** | US$0.10 [3ro: muapi.ai] | NV | NV | NV | NV | NV | Agregador adicional = otro tercero con la foto; descartado |
| **CatVTON / IDM-VTON (autoalojado)** | Costo de GPU | segundos en GPU | CatVTON: upper, lower, overall, inner, outer | — | — | Control total | **Licencia CC BY-NC-SA 4.0: no uso comercial** [3ro/README]. Ver §3.1 |

**Calidad en prendas variadas**: no encontré benchmarks independientes y reproducibles en esta investigación. Las afirmaciones de calidad de la tabla anterior son de proveedor o de reseñas [Prov/3ro]. **Antes de comprometerse hay que hacer una prueba piloto con 20–30 prendas reales del inventario de LoloShop** (§8, Fase 0). Calidad en vestidos, abrigos largos, prendas holgadas y estampados es el punto típico de falla de estos modelos [NV, criterio del autor].

**Accesorios**: ninguna fuente oficial consultada lista gorras/lentes. FASHN lista solo tops/bottoms/one-pieces. fal documenta CatVTON con `cloth_type` de prendas. Para accesorios habría que usar un modelo genérico de edición de imágenes (p. ej. un modelo tipo "image edit") con riesgo de alterar el rostro; no investigado a fondo → fuera de MVP.

### 3.1 Autoalojado / open source

- **Licencias**: CatVTON y IDM-VTON publican código y pesos bajo **CC BY-NC-SA 4.0** (no comercial) [3ro: README en huggingface.co/camenduru/CatVTON y yisol/IDM-VTON]. LoloShop es una tienda: uso comercial, por lo que **no es utilizable sin licencia aparte de los autores** (no encontré oferta de licencia comercial). Además, los pesos base (SD/SDXL, etc.) tienen sus propias licencias, no revisadas.
- **GPU**: CatVTON declara <8 GB VRAM a 1024x768 [3ro: model card]; IDM-VTON ~16 GB según un wrapper no oficial [3ro, NV].
- **Viabilidad**: Vercel Functions no tienen GPU (límites: 250 MB de bundle, 5 GB en beta de "large functions", sin GPU) [Doc: vercel.com/docs/functions/limitations] → no. RPi5 del homelab: sin GPU capaz → no. GPU serverless (Modal, Replicate, RunPod, etc.): técnicamente posible, pero la licencia NC lo bloquea y añade operación de modelo, arranques en frío y otro tercero con la foto. **Conclusión: descartado para el MVP.** Reevaluar si aparece un modelo abierto con licencia comercial (p. ej. alguno bajo Apache/MIT) — [NV, sin investigar].

### 3.2 Entrada de la prenda y mapeo de categoría

- **¿Sirve `Product.imageUrl` tal cual?** Probablemente sí en la mayoría de casos, con reservas: el flujo actual (`lib/image/process.ts`) recorta 1:1 centrado (`computeSquareCrop`), aplica auto-niveles y sube a Blob. FASHN acepta `flat-lay` u "on-model" y reescala a 864x1296; una foto cuadrada sirve, pero un recorte centrado puede cortar mangas o bajo de la prenda, y fondos con ruido o la prenda puesta en percha/maniquí reducen calidad [Prov/NV]. Hallazgo del repo: `imageUrl` es una URL pública de Blob, así que el servidor puede descargarla y reenviarla como base64 al proveedor (el proveedor nunca necesita una URL de la foto del cliente).
- **Mapeo a categoría**: el modelo `Product` tiene `category String @default("General")` en texto libre (no enum), y `Variant` solo `size`/`color`. No existe un dato "tipo de prenda" fiable. Propuesta: modo `auto` de FASHN por defecto, más un campo opcional nuevo `tryOnCategory` (`tops|bottoms|one-pieces|none`) en `Product` para forzar o excluir (p. ej. `none` para gorras/lentes/calzado). Solo se muestra el botón "Probar" si `tryOnCategory != none` y hay `imageUrl`. **Decisión del autor**: usar campo nuevo + migración Prisma en lugar de inferir de `category` por texto.

## 4. Costos estimados

Supuestos: precio on-demand FASHN US$0.075; 1 imagen por prueba; se asume 25 % de reintentos/fallos facturados (supuesto del autor, FASHN no documenta si los fallos se cobran [NV]). Excluye Vercel (la espera de I/O no cuenta como CPU activa en Fluid compute [Doc]), BotID Deep Analysis (opcional, US$1 por 1.000 llamadas en Pro [Doc: vercel.com/docs/botid]) y tipo de cambio.

| Pruebas / mes | Sin reintentos | Con 25 % extra | Con Tier I (US$19 + US$0.0675 c/u; sin saber imágenes incluidas [NV]) |
|---|---|---|---|
| 100 | US$7.50 | ~US$9.40 | no conviene (el piso del tier ya es mayor) |
| 1.000 | US$75 | ~US$94 | ≈ US$19 + 1.000 × 0.0675 ≈ US$86.5 (cálculo propio, ignora imágenes incluidas) |
| 10.000 | US$750 | ~US$940 | Tier II: US$249 + 10.000 × 0.060 ≈ US$849 (cálculo propio) |

Referencias de otros proveedores a 1.000 pruebas: Kling Kolors US$70; Google ~US$60 [3ro]; FLUX ~US$50 (cálculo propio con 1 MP).

**Tope diario de gasto (propuesta)**: variable `TRYON_DAILY_BUDGET_USD` (p. ej. equivalente a ~40 pruebas/día en arranque). Al llegar al tope, el servidor responde 503 "probador no disponible hoy" sin llamar al proveedor. Además, activar el límite de gasto o prepago en el panel del proveedor (on-demand con crédito prepagado de FASHN es en sí un tope duro: comprar solo lo que se está dispuesto a perder).

## 5. Privacidad y consentimiento

**Suposición (a validar)**: el negocio opera en México, por lo que aplica la **LFPDPPP** vigente (nueva ley publicada en el DOF el 20-mar-2025, vigente al día siguiente; sustituye a la de 2010) [3ro: despachos Hogan Lovells, EY, Basham; texto: diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf, no lo leí completo]. **Esto no es asesoría legal**; pedir revisión a un abogado antes de lanzar.

Puntos relevantes (según fuentes secundarias, [NV] en el texto legal):
- Una foto de rostro identifica a una persona (dato personal); usada para generar un resultado con rostro/cuerpo podría considerarse dato biométrico/sensible según el uso. Las fuentes indican consentimiento **expreso** para datos sensibles y que el aviso de privacidad debe identificar los datos sensibles y separar finalidades que requieren consentimiento.
- El consentimiento debe ser libre, específico e informado.
- La autoridad pasó del INAI a otra dependencia (las fuentes difieren sobre el nombre) [NV].
- Menores: **no pude verificar** reglas específicas. Criterio prudente del autor: pedir confirmación de mayoría de edad en el consentimiento y no ofrecer la función a menores.
- Transferencia internacional: la foto viaja a EE. UU./UE (FASHN: región no indicada [NV]; Google: se puede elegir región). Las fuentes indican que las transferencias internacionales requieren consentimiento expreso; incluirlo en el texto del consentimiento.

**Qué debe hacer el producto**
1. Antes de abrir cámara/selector: pantalla de consentimiento con casilla NO premarcada, texto corto y enlace a aviso de privacidad. Contenido mínimo: quién es el responsable, que la foto se envía a un tercero (nombrarlo) en el extranjero solo para generar la imagen, que LoloShop no la guarda, que el tercero la conserva temporalmente (hasta 60 min el resultado con la configuración recomendada) y no la usa para entrenar, que se confirma ser mayor de edad, y cómo contactar.
2. Registrar el consentimiento SIN la foto: solo una marca en el cliente (sessionStorage; se pide cada sesión) y opcionalmente un contador agregado en servidor. No guardar IP ni identificadores asociados al consentimiento, salvo los necesarios para el rate limit con TTL corto.
3. Redactar/actualizar el **aviso de privacidad** (nueva página pública `/privacidad`, enlazada desde el catálogo y el consentimiento).
4. Borrado práctico: LoloShop no almacena nada; el único rastro es el del proveedor. Con base64: la salida expira a los 60 min y la entrada no se retiene (según doc de FASHN). Los registros de petición (ID, parámetros, timestamps) FASHN no los borra automáticamente; no contienen imagen [Doc].
5. Logs: prohibido loguear cuerpos de petición o base64. Vercel registra metadatos de petición (IP, ruta) con su propia retención; anotarlo en el aviso.
6. Verificar y firmar el **DPA** de FASHN antes de producción (existe, pero no leí sus términos) [NV].

## 6. Arquitectura propuesta

### 6.1 Flujo de datos

```
[Móvil, /catalogo]
  1. Consentimiento (cliente)
  2. Captura <input type=file accept="image/*" capture="user"> (o galería)
  3. Cliente: corrige EXIF, reescala (lado largo ~1280 px) y recomprime JPEG (~0.85) -> < ~1.5 MB
  4. Cliente: elige prenda (productId); obtiene token BotID
  5. POST /api/probador (multipart: photo + productId + categoría opcional + bandera de consentimiento)
        |
        v
[Servidor Next.js (Vercel Function)]
  a. checkBotId() -> rechaza bots
  b. Valida consentimiento, tamaño (<=3 MB), tipo real por magic bytes (JPEG/PNG/WebP), dimensiones
  c. Rate limit por IP + cookie de sesión anónima; presupuesto diario
  d. Carga Product (imageUrl, tryOnCategory) desde Prisma; descarga imageUrl de Blob
  e. TryOnProvider.run(person, garment, category) -> FASHN POST /v1/run (base64 in) + polling hasta completed (timeout ~45 s)
  f. Devuelve la imagen al cliente (base64 o bytes) con Cache-Control: no-store
        |
        v
[Cliente] muestra el resultado en memoria (object URL). Botón "Descargar" y "Pedir por WhatsApp". Al cerrar, revoca el object URL.
```

Memoria y almacenamiento: la foto y el resultado existen solo en la memoria del cliente y de la Function durante la petición. Nada va a Blob ni a Prisma.

Decisión de transporte (**decisión del autor**): una única Route Handler `POST /api/probador` síncrona, que internamente hace polling a FASHN (8–17 s típico; límite de Vercel 300 s en Hobby/Pro por defecto con Fluid compute [Doc]). Alternativa en dos pasos (`POST` crea job, cliente hace polling a `GET`) complica el no-almacenamiento (habría que mantener estado entre invocaciones). Se descarta para el MVP. Fijar `export const maxDuration = 60`.

Server Action vs Route Handler: el repo usa Server Actions (`lib/actions.ts` con `"use server"`) para casi todo, y Route Handlers solo para integraciones externas (`app/api/bot`, `app/api/whatsapp`). Aquí conviene **Route Handler** porque: subida multipart, control del status HTTP (429/503), cabeceras `no-store` y `checkBotId()` están más directos. Las Server Actions además tienen límite de cuerpo por defecto de 1 MB en Next (configurable) [NV, de memoria].

### 6.2 Interfaz de proveedor

Módulo `lib/tryon/` (ver §7):
- `TryOnProvider` con un método `run({ person, garment, category }): Promise<{ image: Buffer, mimeType: string }>`, donde `person`/`garment` son `{ bytes, mimeType }`.
- `TryOnCategory = "tops" | "bottoms" | "one-pieces" | "auto"`.
- Errores tipados: `TryOnInvalidInput` (rostro/persona no detectada, prenda no soportada), `TryOnRateLimited`, `TryOnProviderDown`, `TryOnModerated`. El handler los traduce a mensajes en español.
- Implementaciones: `FashnProvider` (principal), `MockProvider` (tests/dev sin clave), `GoogleVtoProvider` (respaldo, fase posterior).
- Selector `getTryOnProvider()` análogo a `lib/data/get-source.ts` según `TRYON_PROVIDER`.

### 6.3 Variables de entorno (solo nombres)

Añadir a `.env.example` (sin valores):
- `TRYON_PROVIDER` (`fashn` | `google` | `mock`)
- `FASHN_API_KEY`
- `TRYON_DAILY_BUDGET_USD`, `TRYON_COST_PER_RUN_USD`
- `TRYON_RATE_LIMIT_PER_IP_HOUR`, `TRYON_RATE_LIMIT_PER_IP_DAY`
- `TRYON_ENABLED` (interruptor de apagado de emergencia)
- Rate limiting con almacén externo (si se elige Upstash vía Marketplace): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (o las que inyecte la integración). Alternativa sin servicio nuevo: tabla en Neon (ver abajo).
- Respaldo Google: `GOOGLE_VTO_PROJECT_ID`, `GOOGLE_VTO_LOCATION`, `GOOGLE_VTO_CREDENTIALS` (JSON de service account en variable, nunca en el repo).

Todas sin prefijo `NEXT_PUBLIC_`. Registrarlas también en Vercel (Production/Preview), como se hizo con `BOT_API_KEY` según CLAUDE.md.

### 6.4 Protección contra abuso y costo

Capas, de la más barata a la más cara:
1. **Interruptor** `TRYON_ENABLED` y ocultar el botón si está apagado.
2. **BotID** (Vercel): Basic es gratis en todos los planes; Deep Analysis cuesta US$1/1.000 llamadas en Pro [Doc]. Recomendado: Basic desde el inicio; Deep Analysis si hay abuso. Alternativa: Cloudflare Turnstile (el entorno tiene skill `turnstile-spin`); requiere sitekey/secret nuevos. **Decisión del autor**: BotID, por ser nativo de Vercel y sin captcha visible.
3. **Rate limit** por IP (`x-forwarded-for` en Vercel) y por cookie anónima firmada: p. ej. 3 pruebas/hora y 8/día por IP (valores iniciales, ajustables). Almacén: en Vercel las Functions no comparten memoria, así que un `Map` en proceso NO sirve. Opciones: (a) Upstash Redis vía Marketplace (nueva dependencia `@upstash/ratelimit`); (b) tabla `TryOnUsage(key, day, count)` en Neon con `upsert` atómico (sin dependencia nueva; algo más lento). **Decisión del autor**: (b) para MVP por mantener el stack mínimo; el hash de la IP (SHA-256 con sal en `TRYON_RATE_SALT`) evita guardar IPs en claro, con limpieza diaria.
4. **Tope global diario**: contador por día (misma tabla, clave `global:YYYY-MM-DD`), incremento ANTES de llamar al proveedor (reserva) y reversión si falla por validación.
5. **Validación de entrada**: tamaño máximo (3 MB), tipos permitidos por magic bytes (no confiar en `Content-Type`), dimensiones mínimas (p. ej. 300 px) y máximas; rechazar animados/SVG.
6. **Tope de duración** (`maxDuration`) y timeout de polling; cancelar y devolver error amigable.
7. **Moderación** del proveedor en `conservative`.
8. **Presupuesto externo**: prepago/limite de gasto en el panel del proveedor.
9. Vercel Firewall (reglas WAF por ruta) como defensa adicional [no investigado en detalle].

Límite de cuerpo: Vercel rechaza peticiones a Functions > 4.5 MB (413) [Doc]. Por eso el cliente reduce la foto a ~1–1.5 MB antes de enviar; el servidor mantiene un tope de 3 MB para dejar margen del multipart. El `imageUrl` de la prenda lo descarga el servidor, así que no cuenta contra ese límite.

## 7. Cambios por archivo/módulo (basado en lo leído)

Lo que existe hoy y condiciona el diseño:
- `app/catalogo/page.tsx` (server component, `force-dynamic`) obtiene productos con `fetchPublicProductsAction()` y pasa solo UN producto destacado (`products[0]`) a `CatalogClient` (props: `isLoggedIn`, `title`, `imageSrc`, `waMessage`). El catálogo actual es un hero con un solo producto y parallax (framer-motion); no hay lista ni selector de prendas todavía.
- `app/catalogo/CatalogClient.tsx` (client) contiene el hero, un CTA flotante a WhatsApp con número fijo en el código (`wa.me/5211234567890`, ignora `NEXT_PUBLIC_WHATSAPP_NUMBER`), y botones de menú/bolsa sin acción.
- `middleware.ts`: `next-auth/middleware` con matcher que excluye `catalogo`, `api/auth`, `api/whatsapp`, `api/bot`. **Una ruta nueva `/api/probador` quedaría protegida por login a menos que se agregue al matcher.** Además `matcher` está escrito con "negative lookahead" por prefijo: `catalogo` también excluiría `/catalogo/**`.
- `lib/actions.ts` (`"use server"`): `fetchPublicProductsAction` es pública y devuelve `Product[]` completos (incluye `variants` con `inventory` por ubicación y `sku`), expuesto a cualquiera que abra `/catalogo`. Hallazgo: el catálogo público ya pasa por server component, por lo que no filtra datos al cliente salvo lo que se serialice como props; si el selector de prendas recibe `Product[]` completos, hay que proyectarlos a un tipo público mínimo (`id`, `title`, `imageUrl`, `tryOnCategory`, `price`) para no filtrar stock/SKU/ubicaciones.
- `lib/image/process.ts` (`computeSquareCrop`, `autoLevels`): lógica pura probada con Vitest; la parte Canvas/EXIF se hizo en el componente de captura (`components/products/ProductPhotoCapture.tsx`, que no abrí).
- `lib/image/upload.ts`: `uploadImage(file)` sube a Blob con `put`, tests con `vi.mock("@vercel/blob")` (`lib/image/__tests__/upload.test.ts`). Patrón a replicar para el proveedor.
- `lib/data/get-source.ts` + `InventoryDataSource`: patrón de fábrica por entorno. Patrón a replicar en `getTryOnProvider()`.
- `package.json`: Next `^14.2.35`, Vitest `^1.6.1`, `@vercel/blob ^2.8.0`. Hay un plan pendiente de migrar a Next 15 (PR #17 según memoria): `@vercel/functions`/`botid` funcionan en ambos, pero conviene coordinar para no solapar migraciones.
- `prisma/schema.prisma`: `Product.category` es texto libre; no hay tipo de prenda.

Cambios propuestos:

| Archivo / módulo | Cambio |
|---|---|
| `lib/tryon/types.ts` (nuevo) | `TryOnProvider`, `TryOnCategory`, errores tipados |
| `lib/tryon/fashn.ts` (nuevo) | Implementación FASHN (fetch, `POST /v1/run`, polling con timeout, base64) |
| `lib/tryon/mock.ts` (nuevo) | Mock determinista para tests/dev |
| `lib/tryon/get-provider.ts` (nuevo) | Fábrica por `TRYON_PROVIDER` |
| `lib/tryon/validate-image.ts` (nuevo) | Magic bytes, tamaño, dimensiones |
| `lib/tryon/limits.ts` (nuevo) | Rate limit por clave + presupuesto diario (Prisma `upsert`) |
| `lib/tryon/category.ts` (nuevo) | Mapeo `Product` → `TryOnCategory` y regla "elegible" |
| `app/api/probador/route.ts` (nuevo) | Route Handler: BotID, validación, límites, descarga de `imageUrl`, proveedor, respuesta `no-store`; `maxDuration` |
| `middleware.ts` | Añadir `api/probador` (y `privacidad`) a las exclusiones del matcher |
| `prisma/schema.prisma` + migración (`prisma migrate`) | `Product.tryOnCategory String?` y modelo `TryOnUsage` (clave hash, día, contador). Sin guardar fotos |
| `lib/domain/types.ts` | `tryOnCategory?` en `Product`; tipo `PublicProduct` mínimo |
| `lib/data/prisma-source.ts`, `fixture-source.ts`, `source.ts` | Propagar `tryOnCategory` (y actualizar fixtures/tests de fuente) |
| `lib/image/process.ts` | Añadir (puro, testeable) `computeFitSize(w, h, maxSide)` para reescalar manteniendo proporción. La parte Canvas va en el componente cliente |
| `components/tryon/ConsentDialog.tsx`, `TryOnCapture.tsx`, `TryOnResult.tsx` (nuevos, client) | Consentimiento, captura/redimensionado, estados de espera/error/resultado |
| `app/catalogo/CatalogClient.tsx` / `page.tsx` | Botón "Probar" en el producto mostrado; pasar `productId` y `tryOnEligible`; (futuro) lista de prendas. Aprovechar para tomar el número de WhatsApp del env en vez del fijo (cambio ajeno al probador, solo mencionado) |
| `app/privacidad/page.tsx` (nuevo) | Aviso de privacidad (texto lo valida un abogado) |
| `.env.example` | Variables de §6.3 (sin valores) |
| `lib/tryon/__tests__/*`, `app/api/probador/__tests__/*` | Tests con mock de proveedor y de `fetch` (ver §8) |
| `docs/` | Actualizar CLAUDE.md con la sección del probador al terminar |
| `next.config.mjs` | Posible `headers()` con `Cache-Control: no-store` y CSP; BotID requiere envolver config con `withBotId` (a confirmar al implementar) [NV] |

## 8. Plan de implementación por fases

Principio: TDD con mocks, igual que `upload.test.ts` con `vi.mock("@vercel/blob")`. Ningún test llama al proveedor real ni cuesta dinero.

**Fase 0 — Validación de proveedor (sin código en el repo)**
- 0.1 Crear cuenta FASHN y comprar el mínimo (US$7.50). Probar ~20–30 prendas reales (tops, bottoms, vestidos, abrigos, estampados) con 3–4 fotos de personas voluntarias que den consentimiento. Criterio: ≥70 % de resultados aceptables para el dueño (umbral del autor, a validar).
- 0.2 Leer y guardar copias de ToS, privacidad y DPA de FASHN; confirmar por escrito (soporte) región de procesamiento y política con fotos de rostro/menores. Criterio: respuestas archivadas; sin ellas, no pasar a producción.
- 0.3 Probar fotos de prenda "recortadas 1:1" (las de `imageUrl`) vs. originales. Criterio: decidir si basta `imageUrl`.

**Fase 1 — Núcleo servidor con mock**
- 1.1 `lib/tryon/types.ts` + `mock.ts` + `get-provider.ts`. Verif.: tests de fábrica por env.
- 1.2 `validate-image.ts`. Verif.: tests con buffers sintéticos (JPEG/PNG válidos, texto disfrazado, demasiado grande, demasiado pequeño).
- 1.3 `category.ts`. Verif.: tabla de casos Product→categoría y elegibilidad.
- 1.4 `fashn.ts` con `fetch` mockeado. Verif.: arma bien el request (base64, `category`, `mode`, `moderation_level`, `return_base64: true`), maneja `completed`/`failed`/timeout/401/429; la clave nunca aparece en errores ni logs (test que inspecciona los mensajes).
- 1.5 Migración Prisma (`tryOnCategory`, `TryOnUsage`) vía `prisma migrate`. Verif.: `npm test` y `npm run build`.
- 1.6 `limits.ts`. Verif.: tests de contador por ventana, tope global, reserva/reversión; concurrencia razonable.

**Fase 2 — Route Handler**
- 2.1 `app/api/probador/route.ts` con proveedor mock. Verif.: tests de handler: 400 (tipo/tamaño), 403 (sin consentimiento o bot), 404 (producto sin imagen o `none`), 429, 503 (tope/apagado), 200 con `Cache-Control: no-store` y sin llamadas a Blob/Prisma de escritura de fotos (aserción explícita con mock de `@vercel/blob`: `put` nunca se invoca).
- 2.2 Ajustar `middleware.ts`. Verif.: test del matcher con rutas de ejemplo.
- 2.3 BotID: dependencia + integración. Verif.: manual en preview (BotID no corre igual en local [Doc: local development behavior]).

**Fase 3 — UI cliente**
- 3.1 `computeFitSize` en `lib/image/process.ts` + Canvas/EXIF en cliente reutilizando la lógica de `ProductPhotoCapture`. Verif.: tests puros; prueba manual en iOS Safari y Android Chrome con foto vertical de 12 MP (resultado <1.5 MB y orientación correcta).
- 3.2 `ConsentDialog` (checkbox no premarcado, bloquea cámara hasta aceptar). Verif.: RTL: sin aceptar no se abre el input; aceptar guarda marca en `sessionStorage`.
- 3.3 `TryOnCapture` + `TryOnResult` con estados: idle → procesando (indicador y mensaje por etapas, cancelable con `AbortController`) → resultado | error (reintentar, usar otra foto, "no pudimos detectar a una persona", "demasiadas pruebas, vuelve mañana", "no disponible hoy"). Verif.: RTL con `fetch` mockeado para cada estado.
- 3.4 Integración en `CatalogClient`. Verif.: botón solo visible si el producto es elegible; no se rompe el parallax.
- 3.5 Captura: `<input type="file" accept="image/*" capture="user">` como vía principal (sin permisos de cámara en la PWA, funciona en iOS/Android; en escritorio abre selector) y botón secundario "Elegir de la galería" (sin `capture`). `getUserMedia` se descarta para el MVP: añade permisos, flujos de error y diferencias de PWA en iOS; ventaja solo si se quiere guía en pantalla (óvalo de encuadre). **Decisión del autor.**
- 3.6 Espera 5–30 s: no bloquear la UI, mantener la pantalla activa (no usar Wake Lock en MVP), texto "esto tarda unos segundos", timeout cliente de 60 s con mensaje y reintento.

**Fase 4 — Privacidad y salida a producción**
- 4.1 `/privacidad` con texto revisado por abogado. 4.2 Variables en Vercel (Production/Preview) y recarga de despliegue. 4.3 Checklist de seguridad: grep de `FASHN_API_KEY` en el bundle cliente (debe estar vacío); revisión de logs en Vercel tras 20 pruebas (sin imágenes). 4.4 Activar prepago/tope en FASHN, `TRYON_ENABLED` encendido para un grupo reducido. 4.5 Observabilidad: contadores de éxito/error/costo diario (sin datos personales).

**Fase 5 (opcional) — Respaldo Google y accesorios**
- 5.1 `GoogleVtoProvider` tras la misma interfaz. 5.2 Investigar accesorios con un modelo de edición de imágenes; evaluar riesgo de deformar el rostro.

## 9. Riesgos y preguntas abiertas

**Riesgos principales**
1. **Cumplimiento/privacidad**: foto de rostro enviada a un tercero en el extranjero; reglas de menores y transferencia sin verificar en el texto legal. Mitigación: consentimiento expreso, aviso, DPA, revisión legal, mayoría de edad.
2. **Costo y abuso**: función pública con costo por uso (US$0.075/prueba). Mitigación: BotID, rate limit, tope diario, prepago. Riesgo residual: ataques distribuidos o IP compartidas (varias personas tras un mismo NAT móvil) que bloqueen clientes legítimos.
3. **Calidad insuficiente**: prendas fuera de tronco/piernas/vestidos, fotos del cliente de baja calidad, o recortes 1:1 que cortan la prenda → resultados malos que dañan la percepción. Mitigación: Fase 0, guía en pantalla, excluir categorías no soportadas.
4. **Dependencia de proveedor**: FASHN es una empresa pequeña; cambios de precio (subió de US$0.04 a ~US$0.075 en 2025 según [3ro]) o de términos. Mitigación: interfaz de proveedor y respaldo Google.
5. **Fallos de infraestructura**: límite de 4.5 MB, tiempos de espera móviles, 429 del proveedor. Mitigación: redimensionado cliente y errores claros.
6. **Contenido inapropiado**: fotos de terceros sin su consentimiento (el usuario puede subir la foto de otra persona) o de menores. Mitigación: texto de consentimiento ("confirmo que soy yo y mayor de edad"), moderación `conservative`; riesgo residual no eliminable.
7. **Datos fuera de nuestro control**: Vercel guarda metadatos de peticiones; hay que reflejarlo en el aviso.

**Preguntas abiertas para el usuario**
- ¿Confirmas México/LFPDPPP como marco legal? ¿Hay abogado o contador que revise el aviso?
- ¿Presupuesto mensual máximo? Define `TRYON_DAILY_BUDGET_USD`.
- ¿Qué porcentaje de tu catálogo son prendas de tronco/piernas/vestidos vs. accesorios/calzado?
- ¿Quieres limitar el probador a clientes que llegan por WhatsApp/QR (reduce abuso) o realmente abierto en `/catalogo`?
- ¿Aceptas que el MVP muestre una sola prenda (la destacada) hasta que exista un catálogo con lista?
- ¿El plan de Vercel es Hobby o Pro? Afecta BotID Deep Analysis y duraciones máximas.
- ¿Aceptas crear un nuevo servicio (Upstash) o prefieres tabla en Neon para el rate limit?
- ¿Las fotos del catálogo son principalmente de prenda sola (plana) o puesta en persona/maniquí?

## 10. Decisiones del autor (el usuario debe validarlas)

- **Decisión del autor**: FASHN directo (no vía fal.ai) con `return_base64: true`, para no depositar la foto del cliente en URLs públicas de CDN.
- **Decisión del autor**: respaldo = Google `virtual-try-on-001` (por controles contractuales y de región), no Kling/fal.
- **Decisión del autor**: Route Handler síncrono `POST /api/probador` con polling interno, en vez de Server Action o flujo en dos pasos.
- **Decisión del autor**: captura con `<input capture>` + galería; sin `getUserMedia` en MVP.
- **Decisión del autor**: redimensionar en cliente a lado largo ~1280 px, JPEG ~0.85, objetivo <1.5 MB; tope servidor 3 MB.
- **Decisión del autor**: BotID (Basic) en lugar de Turnstile.
- **Decisión del autor**: rate limit y tope diario con tabla en Neon (hash de IP con sal) en vez de Upstash.
- **Decisión del autor**: límites iniciales 3/hora y 8/día por IP; tope global por presupuesto diario; umbral de calidad 70 % en Fase 0.
- **Decisión del autor**: campo nuevo `Product.tryOnCategory` (nullable) con migración Prisma, en vez de inferir de `category` libre.
- **Decisión del autor**: moderación `conservative`; consentimiento por sesión (`sessionStorage`), sin registro server-side.
- **Decisión del autor**: excluir de MVP accesorios, calzado, multi-prenda y mostrar solo la prenda destacada actual.
- **Decisión del autor**: no ofrecer a menores (confirmación de mayoría de edad en el consentimiento).

## Fuentes consultadas (2026-10-19)

- FASHN precios: <https://help.fashn.ai/plans-and-pricing/api-pricing>
- FASHN API v1.6: <https://docs.fashn.ai/api-reference/tryon-v1-6>
- FASHN retención y privacidad: <https://docs.fashn.ai/api-overview/data-retention-privacy>
- FASHN privacidad general: <https://fashn.ai/legal/privacy-policy>; términos: <https://fashn.ai/legal/terms-of-service> (no leídos en detalle)
- fal.ai comparativa try-on: <https://fal.ai/learn/tools/best-virtual-try-on-apis-2026>
- fal.ai retención: <https://fal.ai/docs/documentation/model-apis/media-expiration.md>
- Google Virtual Try-On 001: <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/virtual-try-on-001>
- Google gobernanza de datos: <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance>
- Precio Google [3ro]: <https://cloudprice.net/models/google-virtual-try-on-1>, <https://blog.picassoia.com/virtual-try-on-api-pricing-clothes-glasses-and-gemini>
- Kling vía fal / discontinuación [3ro]: <https://blog.picassoia.com/virtual-try-on-api-free-google-and-kling-options-compared>
- Decart precios: <https://docs.platform.decart.ai/getting-started/pricing.md>
- Perfect Corp [3ro]: <https://www.perfectcorp.com/business/blog/ai-clothes/virtual-try-on-api-pricing>
- Muapi [3ro]: <https://muapi.ai/virtual-try-on-api>
- CatVTON licencia [3ro]: <https://huggingface.co/camenduru/CatVTON/blob/main/README.md>; IDM-VTON: <https://cdn.jsdelivr.net/gh/yisol/idm-vton@main/README.md>
- Vercel Functions límites: <https://vercel.com/docs/functions/limitations>
- Vercel BotID: <https://vercel.com/docs/botid>
- LFPDPPP: <https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf> (no leído completo); resúmenes: <https://www.hoganlovells.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies>, <https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares>

**Lo que no pude verificar**: precio oficial y latencia de Google VTO; categorías soportadas por Google; si FASHN cobra intentos fallidos; calidad comparada en prendas variadas; residencia de datos de FASHN; reglas LFPDPPP sobre menores y texto exacto de biometría; si Vidu ofrece try-on por API; configuración exacta de `withBotId` en Next 14; términos del DPA de FASHN.
