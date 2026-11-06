# LoloShop: especificación de requerimientos del sistema (SRS)

- **Fecha:** 2026-11-05 · **Versión:** 0.2 (borrador para aprobación del dueño; incorpora decisiones del 2026-11-05) · **Estilo:** ISO/IEC/IEEE 29148 (adaptado)
- **Repo público:** este documento no contiene secretos. Las variables de entorno se nombran, nunca se dan sus valores.
- **Audiencia:** el dueño (aprobación), el builder que planifica la implementación y lectores de portafolio.
- **Qué no hace este documento:** no repite los specs de detalle. Los cita por sección (ver §10). Si un spec y este SRS se contradicen, §12 lo registra y manda la decisión del dueño.
- **Actualización 0.2 (2026-11-05, tarde):** incorpora las decisiones D1 a D7 del dueño y A1 a A7 del autor (registro en §15). El modelo de datos canónico es `specs/2026-11-05-modelo-datos-er.md` (abreviado **ER**); donde este SRS nombra campos, manda el ER.

### Convenciones de evidencia

| Marca | Significado |
|---|---|
| **[V]** | Verificado leyendo el archivo indicado en `main` @ `bed06d2` (2026-11-05) |
| **[V-wt]** | Verificado en el worktree `../LoloShop-alta` (rama `feat/demo-alta-lote`), **sin commitear**. Puede cambiar antes del merge |
| **[V-doc]** | Verificado en un documento del repo (spec, plan o `CLAUDE.md`), no en código |
| **[S]** | Supuesto: no verificado; el builder debe confirmarlo |
| **[D]** | Decisión del dueño, ya tomada (las de hoy llevan "2026-11-05" y su número D1…D7) |
| **[P]** | Decisión pendiente del dueño (ver §11). No se inventa su resultado |
| **[A]** | Decisión o juicio del autor (arquitectura), revisable por el dueño (las de hoy llevan su número A1…A7) |

### Convenciones de requerimiento

- **ID:** `RF-<módulo>-NN` (funcional) y `RNF-<atributo>-NN` (no funcional).
- **Prioridad:** **P1** urgente (inventario, alta por escaneo, ventas, dashboards del owner y bloqueantes de seguridad), **P2** documentación formal y operación, **P3** sitio público como "plus".
- **Estado actual:** *Existe*, *Parcial*, *No existe*, con su marca de evidencia.
- **Criterio de aceptación (CA):** verificable por test automatizado (T), prueba manual en dispositivo real (M) o inspección de código o datos (I).
- Las palabras **debe** (obligatorio), **debería** (recomendado) y **puede** (opcional) se usan en el sentido de ISO 29148.

---

## 1. Introducción

### 1.1 Propósito

Fijar, en un solo documento verificable, qué debe hacer LoloShop como sistema completo: inventario multi-tienda, alta de producto por escaneo, registro de ventas, tableros del dueño y, como complemento, el sitio público. Sirve para que un builder planifique por prioridades y para que el dueño apruebe el alcance.

### 1.2 Alcance

**LoloShop** revende ropa y accesorios de marca en **dos tiendas físicas** [D]. Marcas actuales [D]: Armani Exchange, EA7, Michael Kors, Calvin Klein, Tommy Hilfiger, Nautica, Psycho Bunny, BOSS, The North Face, D&G, Coach, Guess, Oysho, Jordan, Puma, Timberland. Muchas prendas llegan con la **etiqueta original del retailer**: código de barras, talla y precio [D].

Dentro del alcance:

1. **PWA interna** para `owner`, `manager` y `collaborator`: inventario por tienda, alta por escaneo, movimientos auditados, ventas y tableros.
2. **Registro de ventas** físicas (canal `store`) y por WhatsApp (canal `whatsapp`, típicamente pagadas con transferencia SPAY) [D]. LoloShop **registra** la venta; **no cobra** [D].
3. **Sitio público** (P3): catálogo por departamento y marca, ficha de producto, recorrido de la tienda y botón a WhatsApp. El sitio **conecta** clientes con la tienda; no vende en línea [D].
4. **Fotos de producto** con el estándar de imagen del catálogo (spec de fotos §14).

Fuera del alcance (evolución, §13): cobro en línea, carrito, integración con Shopify, facturación fiscal (CFDI), probador virtual con IA (tiene su propio roadmap).

### 1.3 Perspectiva del producto

LoloShop **no es un sistema fiscal ni un POS con caja registradora** [A]: registra la venta para controlar stock y ver ingresos, pero no emite tickets fiscales ni maneja cajón de efectivo. Esto matiza la frase "Punto de venta" de `CLAUDE.md` y la frase "NO es un POS" de la definición del agente `architect` (ver §12, C-1).

### 1.4 Referencias

Specs y planes en `docs/superpowers/`:

| Abrev. | Documento |
|---|---|
| ER | `specs/2026-11-05-modelo-datos-er.md` (fuente de verdad del modelo de datos) |
| Arquitectura | `specs/2026-11-05-arquitectura-flujos.md` |
| UX | `specs/2026-11-05-sitio-publico-ux-design.md` |
| Maestro | `specs/2026-10-27-loloshop-maestro-design.md` |
| Demo | `specs/2026-10-27-demo-tienda-digital-design.md` |
| FotosIA | `specs/2026-10-19-fotos-producto-ia-design.md` (sobre todo §6, §7, §13, §14) |
| Captura | `specs/2026-07-27-captura-foto-catalogo-design.md` |
| Ideas | `specs/2026-10-27-visualizacion-catalogo-ideas.md` |
| Bot | `specs/2026-06-28-loloshop-whatsapp-bot-design.md` |
| Dominio | `specs/2026-10-19-loloshop-dominio-y4ga-design.md` |
| n8n | `specs/2026-10-19-n8n-flujos-design.md` |
| Auditoría | `specs/2026-10-20-auditoria-probador-design.md` |
| Plan global | `plans/2026-10-27-loloshop-plan-global.md` |

---

## 2. Glosario

| Término | Definición |
|---|---|
| **Tienda** (`Location`, `type = store`) | Local físico. Existe también `warehouse` en el esquema [V `prisma/schema.prisma`] |
| **Producto** (`Product`) | Modelo comercial (p. ej. "Sudadera Michael Kors mostaza"). Agrupa variantes |
| **Variante** (`Variant`) | Combinación vendible de un producto (talla, color). Tiene `sku` único, `barcode` opcional único y `price` `Decimal(10,2)` [V] |
| **Nivel de inventario** (`InventoryLevel`) | Piezas disponibles de una variante en una tienda (`@@unique([variantId, locationId])`) [V] |
| **Movimiento** (`Movement`) | Registro auditado de un cambio de stock: `delta`, `type`, usuario, tienda, fecha [V] |
| **Tipo de movimiento** (`MovementType`) | `SALE`, `RESTOCK`, `ADJUSTMENT`, `TRANSFER`, `DAMAGE` [V]. Hoy solo se escribe el valor por defecto (§12, C-3) |
| **Venta** (`Sale`) | Registro de una operación de venta: una o más líneas (`SaleLine`), tienda, usuario, precio, método de pago, canal y fecha. Genera un `Movement` de tipo `SALE` por línea. **No existe aún** [V]. Campos en ER §2.2 |
| **Estado de la venta** (`SaleStatus`) | `pending_payment` (WhatsApp con transferencia SPAY sin confirmar), `paid`, `cancelled`, `refunded`. Describe el pago; el stock se describe con `stockCommittedAt` (ER §2.2). No hay otros estados |
| **Código público** (`Product.publicCode`) | Código corto de 5 símbolos, por producto, sin relación con el SKU, que viaja en el mensaje de WhatsApp y que el bot usa para consultar disponibilidad (ER §2.7, A6) |
| **Alias del cliente** (`Sale.customerAlias`) | Texto corto opcional que escribe el personal para reconocer un pedido. No es un dato de contacto: nunca un teléfono (D5) |
| **Canal de venta** (`SaleChannel`) | `store` (en la tienda física) o `whatsapp` |
| **Método de pago** (`PaymentMethod`) | `spay_transfer`, `cash`, `card` |
| **SPAY** | Transferencia bancaria con la que hoy pagan los clientes de WhatsApp [D]. LoloShop no se integra con SPAY; solo registra el método |
| **Marca** (`Brand`) | Entidad de catálogo con lista controlada y filtrable. Hoy `Product.brand` es texto libre [V] |
| **Departamento** (`Department`) | Agrupación pública del catálogo, en una **tabla editable** por el owner. Lista inicial [D] 2026-11-05 (D6): `dama`, `caballero`, `ninos`, `calzado`, `accesorios`; crecerá. La ropa interior va dentro de `dama` por ahora [A] (A4) |
| **Categoría** | Tipo de prenda (Playeras, Hoodies…). Hoy `Product.category` texto con valor por defecto "General" [V]. Es un eje distinto del departamento (§12, C-6) |
| **SKU interno** | Código propio `LS-XXXXXX-C`: 6 símbolos Crockford base32 aleatorios y un símbolo de control ponderado mod 32 [V-wt `lib/domain/barcode.ts`] |
| **Código del retailer** | Código de barras GTIN (EAN-13, UPC-A) de la etiqueta original. Se guarda en `Variant.barcode` |
| **Proyección pública** | Vista de un producto apta para el visitante: sin SKU, sin cifras de inventario, sin IDs internos innecesarios (Maestro §5.1, `PublicProduct`) |
| **Foto maestra** | Imagen 1:1 de 2048 px, fondo `#FFFFFF`, de la que salen los derivados (FotosIA §14.1) |
| **`ProductImageJob`** | Registro de un candidato de imagen generado o recortado, su revisión y su costo (FotosIA §7.1) |
| **Ficha estilo NORTH** | Ficha de producto con galería, lupa y foto secundaria 3:4 opcional (FotosIA §14.7–14.8) |
| **Data source** | Interfaz `InventoryDataSource` (`lib/data/source.ts`) que toda la app usa vía `getDataSource()`; hoy la implementa `PrismaDataSource` [V] |

---

## 3. Descripción general

### 3.1 Estado real del sistema (2026-11-05)

| Área | Estado | Evidencia |
|---|---|---|
| Login por credenciales con `next-auth` y bcrypt | Existe | [V `lib/actions.ts` usa `getServerSession`; V-doc `CLAUDE.md` coste 10/12] |
| Middleware protege todo salvo `/login`, `/catalogo`, `/api/auth`, `/api/whatsapp`, `/api/bot` y estáticos | Existe | [V `middleware.ts`] |
| Dashboard con stock total y bajo stock (umbral fijo 1) | Existe | [V `app/page.tsx`: `lowStockVariants(products, 1)`] |
| Escaneo y entrada/salida ±N | Existe | [V `app/escanear/page.tsx`, `adjustInventoryAction`] |
| Colaborador limitado a su tienda al mover stock | Parcial: solo en escritura | [V `adjustInventoryAction`]. En lectura todos ven ambas tiendas |
| Movimientos con tipo | **No**: `adjustInventory` no pasa `type`, todo queda como `ADJUSTMENT` | [V `lib/data/prisma-source.ts`] |
| Stock no negativo | **No**: el `upsert` incrementa sin comprobar el mínimo | [V `lib/data/prisma-source.ts`] |
| Alta de producto por escaneo | Parcial en `main`: stock inicial fijo en 1, sin categoría, el SKU queda igual al código escaneado o `SKU-<timestamp>` | [V `prisma-source.ts`, `NewProductForm.tsx`] |
| Alta con SKU `LS-XXXXXX-C`, categoría, talla, stock inicial ≥ 0, equivalencias UPC/EAN, duplicados | En curso, sin commitear | [V-wt `lib/domain/barcode.ts`, `lib/domain/new-product.ts`, `lib/actions.ts`] |
| Generador de SKU descriptivo `LS-CAT-BRA-TALLA-COLOR` | Existe en `main`, sin uso en el alta | [V `lib/domain/sku.ts`] (§12, C-4) |
| Etiquetas imprimibles | Existe | [V `app/etiquetas/page.tsx`] |
| Foto en el alta y "agregar/cambiar foto" | Existe (recorte 1:1, auto-niveles, subida a Vercel Blob) | [V `lib/image/*`, `lib/actions.ts`] |
| Original de la foto | No se guarda | [V-doc Maestro §2] |
| Ventas | **No existe** modelo `Sale`; `SALE` nunca se escribe; `/pos` es un mockup estático con avatar externo | [V `prisma/schema.prisma`, `app/pos/page.tsx`] |
| Marca y departamento | Marca es texto libre; no hay departamento | [V `prisma/schema.prisma`] |
| `/catalogo` público | Recibe productos completos (SKU e inventario por tienda) sin sesión | [V `fetchPublicProductsAction` en `lib/actions.ts`] |
| Recorrido 3D | Trabajo sin commitear con datos demo | [V-doc Maestro §2; no se revisa aquí por instrucción] |
| Migraciones | No hay `prisma/migrations/`; existe el script `db:push` | [V `ls prisma`, `package.json`] |
| API del bot n8n | Existe, con `x-bot-key` comparada en tiempo constante | [V `app/api/bot/products/route.ts`] |
| Webhook de WhatsApp | Existe; **omite la firma** si falta `WHATSAPP_APP_SECRET` | [V `app/api/whatsapp/webhook/route.ts`] |
| Hosting | Vercel (`main`); spike local de Cloudflare Workers | [V-doc Maestro §5] |

### 3.2 Actores

| Actor | Descripción | Alcance |
|---|---|---|
| **Owner** (dueño) | Decide precios, **registra ventas en cualquiera de las dos tiendas** (D1), ve el histórico de ventas y el stock, confirma pagos SPAY, **es el único que anula ventas** (D4), fusiona marcas, administra tiendas y usuarios, aprueba fotos | Todas las tiendas |
| **Manager** (encargado) | Opera inventario y ventas; confirma pagos SPAY (A2); ve importes (D3) | Todas las tiendas [S]; alcance histórico del dashboard **[P]** (D-ROL-1 residual) |
| **Collaborator** | Uno por tienda [D]. Da de alta (y crea marcas nuevas, D7), escanea, registra ventas en tienda y las de WhatsApp que entrega (A1); ve el dashboard del día en curso con importes (D3) | Solo su `locationId` |
| **Cliente final** | Conoce la tienda física; navega el sitio y escribe por WhatsApp | Solo proyección pública |
| **Bot / n8n** (sistema) | Consulta productos con `x-bot-key`; envía avisos | API `/api/bot/*` |
| **Meta Cloud API** (sistema) | Entrega mensajes al webhook | `/api/whatsapp/webhook` |

### 3.3 Casos de uso

| ID | Caso de uso | Actor principal | RF asociados | Prioridad |
|---|---|---|---|---|
| CU-01 | Dar de alta una prenda escaneando la etiqueta del retailer | Collaborator | RF-INV-01…05, RF-CAT-01…05, RF-IMG-01 | P1 |
| CU-02 | Dar de alta un lote de prendas seguidas | Collaborator | RF-INV-02 | P1 |
| CU-03 | Dar de alta una prenda sin código e imprimir su etiqueta | Collaborator | RF-CAT-05, RF-CAT-06 | P1 |
| CU-04 | Registrar entrada, merma o ajuste | Collaborator, manager | RF-INV-06, RF-INV-07 | P1 |
| CU-05 | Registrar una venta en la tienda | Collaborator, owner, manager (D1) | RF-VEN-01, 02, 04, 07, 10, 11 | P1 |
| CU-06 | Registrar una venta por WhatsApp pagada con SPAY | Quien entrega (collaborator u owner); confirma owner o manager (A1, A2) | RF-VEN-03, RF-DASH-06 | P1 |
| CU-07 | Anular una venta registrada por error o impagada | Owner (D4) | RF-VEN-06 | P1 |
| CU-08 | Revisar ventas e inventario | Owner (histórico), collaborator (día en curso) (D3) | RF-DASH-01…07 | P1 |
| CU-09 | Transferir piezas entre tiendas | Manager, owner | RF-INV-08 | P2 |
| CU-10 | Mejorar y aprobar la foto de catálogo | Owner | RF-IMG-03…07 | P3 |
| CU-11 | Explorar el catálogo y escribir por WhatsApp | Cliente final | RF-WEB-01…07 | P3 (RF-WEB-01 es P1) |
| CU-12 | Recorrer la tienda digital | Cliente final | RF-WEB-06 | P3 |

**CU-05, flujo principal [A]:** el colaborador (o el owner o manager, eligiendo la tienda) abre "Vender", escanea una o más prendas (cada escaneo suma una línea o incrementa su cantidad), ve el total, elige el método de pago y confirma. El sistema crea la `Sale`, descuenta stock y escribe un `Movement` `SALE` por línea en una sola transacción, y muestra la confirmación. Puede haber ventas simultáneas en las dos tiendas (D1). **Alternos:** código desconocido (ofrece dar de alta, sin agregarlo a la venta), stock insuficiente (bloquea la línea; también si otra persona vendió la última pieza un instante antes), sin conexión (no confirma; ver RNF-DISP-03).

**CU-06, flujo decidido [A] (A1, A2, revisable):** el cliente conversa por WhatsApp (sin reserva). Quien **entrega** la prenda (colaborador de esa tienda u owner) registra la venta con canal `whatsapp`: el stock se descuenta en ese momento. Si paga en efectivo o tarjeta al recoger, nace `paid`; si paga con transferencia SPAY, nace `pending_payment` y entra al tablero de cobros pendientes. Owner o manager confirman la transferencia contra el banco (`paid`). Si nunca llega, el owner anula con motivo "impago" e indica si la prenda regresó (ER §3.3, §6). Detalle en ER §6 y Arquitectura §2.3.

---

## 4. Requerimientos funcionales

### 4.1 Autenticación y roles (RF-AUT)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-AUT-01 | El sistema debe autenticar al personal por usuario y contraseña, con hash bcrypt (coste ≥ 10) | P1 | Existe [V-doc] | (T) login con contraseña errónea falla; (I) ningún `password` en texto plano en BD |
| RF-AUT-02 | Cada server action o route handler que lea datos internos o modifique datos debe comprobar sesión **y rol** por sí mismo, además del middleware | P1 | Parcial [V: sesión sí, rol solo en `createLocationAction`] | (T) por acción: llamada sin sesión → error; con rol no permitido → error, según la matriz de §4.1.1 |
| RF-AUT-03 | Un `collaborator` debe leer y escribir solo stock, ventas y movimientos de su tienda | P1 | Parcial [V: solo escritura en `adjustInventoryAction`] | (T) colaborador de tienda A no obtiene stock ni ventas de tienda B por ninguna acción |
| RF-AUT-04 | Las acciones con efecto económico (anular venta, confirmar pago SPAY, modificar precio, fusionar marcas, cambiar el umbral de stock bajo, disparar IA, crear tiendas o usuarios) deben **re-leer el usuario en BD** (rol y tienda vigentes) en vez de confiar solo en el JWT | P1 | No existe [V] | (T) usuario degradado en BD con JWT vigente → la acción se rechaza |
| RF-AUT-05 | El owner y el manager deben poder operar `/escanear` y "Vender" eligiendo la tienda cuando no tienen `locationId` asignado | P1 | No existe [V: `/escanear` exige `locationId`] | (M) owner sin tienda asignada registra una entrada eligiendo tienda |
| RF-AUT-06 | El alta y el reseteo de usuarios se hacen por script con contraseñas de entorno; cada usuario puede cambiar su contraseña en `/cuenta` | P1 | Existe [V-doc `CLAUDE.md`] | (I) script y pantalla presentes; contraseñas del seed no válidas en producción |

#### 4.1.1 Matriz de permisos

Fuente de cada celda entre corchetes. Lo que no lleva [D] es propuesta del autor [A], revisable.

| Acción | owner | manager | collaborator |
|---|---|---|---|
| Alta de producto, foto, entrada, salida, merma | Sí | Sí | Sí, su tienda |
| Crear marca nueva durante el alta | Sí | Sí | Sí, sin aprobación [D] D7 |
| Editar o fusionar marcas; editar departamentos; asignar departamento a existentes | Sí [D] D7 / [A] A3 | No | No |
| Ajuste de stock (`ADJUSTMENT` con nota) | Sí | Sí | No [A] (ER §3.2) |
| Registrar venta (tienda o WhatsApp que entrega) | Sí, cualquier tienda [D] D1 | Sí | Sí, su tienda [D] D1 |
| Confirmar pago SPAY | Sí [A] A2 | Sí [A] A2 | No |
| Anular venta; registrar devolución | Sí [D] D4 (devolución [A]) | No [D] D4 | No [D] D4 |
| Modificar precio de venta (descuento) | Sí | **[P]** D-VEN-2 | No |
| Transferir entre tiendas | Sí | Sí | No [A] |
| Ver dashboard con importes | Sí, histórico [D] D3 | Sí, importes [D] D3; alcance histórico **[P]** D-ROL-1 | Sí, mismo dashboard, solo día en curso y su tienda [D] D3 |
| Configurar umbral global de stock bajo | Sí [A] A5 | No | No |
| Crear tiendas y usuarios, aprobar fotos, disparar IA | Sí | No | No |

### 4.2 Catálogo maestro (RF-CAT)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-CAT-01 | El producto debe referenciar una **Marca** (`Brand`) canónica. **[D] 2026-11-05 (D7):** cualquier rol, incluido el colaborador, puede **crear una marca nueva durante el alta**, directamente y sin aprobación; el servidor normaliza el nombre y, si el `slug` ya existe, reutiliza la marca existente. El **owner** puede editar marcas y **fusionar duplicados** (reasigna productos y copias en líneas de venta; la duplicada queda inactiva). Se migran los textos de `Product.brand` sin perder productos (ER §2.3) | P1 | No existe [V: `brand String`] | (T) colaborador crea "Psycho Bunny" en el alta y queda asignada; (T) crear "GUESS " con `guess` existente reutiliza la marca, no crea otra; (T) fusionar B en A deja 0 productos y 0 líneas con `brandId` de B y B inactiva; (T) colaborador o manager no pueden fusionar; (I) tras la migración, cada producto tiene `Brand` y el conteo de productos no cambia |
| RF-CAT-02 | El producto debe tener un **Departamento** (`Department`, tabla editable por el owner). Lista inicial [D] 2026-11-05 (D6): Dama, Caballero, Niños, Calzado, Accesorios; la ropa interior va en Dama [A] (A4). **Obligatorio en el alta de productos nuevos**; opcional en la base para no romper los existentes, que el owner asigna desde una edición rápida en `/productos` [A] (A3) | P1 | No existe [V] | (T) alta nueva sin departamento se rechaza; (T) un producto existente sin departamento sigue listándose internamente; (M) el owner asigna departamento a 10 productos en una sola acción; (T) el owner agrega un departamento nuevo sin migración |
| RF-CAT-03 | El producto debe tener una **categoría** (tipo de prenda) de lista controlada | P1 | Parcial [V-wt: `PRODUCT_CATEGORIES`, validación en el alta] | (T) categoría fuera de la lista se rechaza. La relación categoría ↔ departamento se resuelve en D-CAT-2 |
| RF-CAT-04 | Un producto debe poder tener **varias variantes** (talla y color), y el alta de una talla nueva de un producto existente no debe crear un producto duplicado | P1 | No existe [V: el alta crea un producto con una variante] | (M) dar de alta la talla L de una prenda ya registrada en M deja un producto con 2 variantes |
| RF-CAT-05 | El servidor debe generar el **SKU interno** `LS-XXXXXX-C` con dígito de control, reintentar ante colisión, y guardar el código del retailer en `barcode` (canónico, con equivalencia UPC-A ↔ EAN-13) | P1 | Parcial [V-wt `barcode.ts`, `createProductAction`] | (T) `isValidInternalSku` rechaza un carácter cambiado; (T) un UPC-A de 12 dígitos encuentra la variante guardada como EAN-13 |
| RF-CAT-06 | El sistema debe imprimir etiquetas con el código del SKU interno para prendas sin código del retailer | P1 | Existe [V `app/etiquetas/page.tsx`] | (M) la etiqueta impresa se lee con el escáner de la app |
| RF-CAT-07 | El owner debe poder desactivar un producto o una variante (`isActive`) sin borrar su historial de movimientos y ventas | P2 | Campo existe [V]; uso [S] | (T) producto inactivo no aparece en lo público ni en "Vender"; sus ventas siguen en tableros |

### 4.3 Inventario y alta por escaneo (RF-INV)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-INV-01 | Al escanear o teclear un código, el sistema debe buscarlo en `barcode` y `sku` (con equivalencias) y abrir el producto si existe, o el formulario de alta si no | P1 | Parcial [V `main`: barcode y luego ID de variante; V-wt: `lookupCodeAction`] | (T) código existente → producto; inexistente → alta con el código precargado |
| RF-INV-02 | **Modo lote:** tras guardar un alta, el escáner vuelve solo y un contador muestra las altas de la sesión (Demo §3.1.1) | P1 | En curso [V-wt `app/escanear`] | (M) 10 productos con foto en < 10 min en un móvil real (Maestro §8) |
| RF-INV-03 | El alta debe capturar título, marca, departamento, categoría, talla, color y precio con el mínimo de campos; la talla y el precio se leen de la etiqueta del retailer. Guardar el **precio de etiqueta** como dato aparte queda **[P]** (D-INV-1) | P1 | Parcial [V-wt: talla y precio; sin departamento ni color] | (M) un alta completa se hace sin teclado salvo título y precio [A]; (T) el departamento es obligatorio en el alta (RF-CAT-02) |
| RF-INV-04 | El **stock inicial** debe ser explícito, entero ≥ 0. El valor por defecto depende de D-1 **[P]** (Maestro §6) | P1 | En curso [V-wt: ≥ 0] · `main` fija 1 [V] | (T) stock negativo o no entero se rechaza; (I) el alta escribe un `Movement` `RESTOCK` con el stock inicial [A] |
| RF-INV-05 | Si el código ya existe, el alta no debe fallar por unicidad: debe ofrecer abrir el producto para sumar piezas | P1 | En curso [V-wt: resultado `DUPLICATE`] | (T) alta con barcode duplicado devuelve `DUPLICATE` con la variante existente |
| RF-INV-06 | Cada cambio de stock debe escribir un `Movement` con **tipo** (`RESTOCK`, `ADJUSTMENT`, `DAMAGE`, `TRANSFER`, `SALE`), usuario, tienda, `delta` y nota opcional. Ningún cambio de stock ocurre sin movimiento | P1 | Parcial [V: tipo nunca se pasa; el movimiento se omite si no hay `userId`] | (T) entrada → `RESTOCK`; merma → `DAMAGE`; (T) `adjustInventory` sin usuario se rechaza |
| RF-INV-07 | El stock de una variante en una tienda **no debe quedar negativo**; la salida que lo haría se rechaza dentro de la misma transacción | P1 | No existe [V] | (T) con stock 1, salida de 2 → error y stock sigue en 1; (T) dos salidas concurrentes de 1 sobre stock 1 → solo una tiene éxito |
| RF-INV-08 | **Transferencia** entre tiendas como operación atómica: dos movimientos `TRANSFER` (−N origen, +N destino) en una transacción | P2 | No existe [V] | (T) si falla el destino, el origen no cambia |
| RF-INV-09 | El historial de movimientos debe poder consultarse por variante, tienda, usuario, tipo y rango de fechas | P1 | No existe en UI [V: índices en `Movement` sí] | (M) el owner encuentra quién sacó una pieza en una fecha |
| RF-INV-10 | **Conteo físico:** registrar el conteo de una tienda y generar ajustes por la diferencia | P2 | No existe [V] | (T) conteo 5 sobre stock 7 → un `ADJUSTMENT` de −2 con nota "conteo" |

### 4.4 Ventas (RF-VEN)

Modelo: **ER §2.2** (fuente de verdad). Resumen:

- `Sale`: tienda, usuario que registra, canal (`SaleChannel`), método de pago (`PaymentMethod`), `businessDate`, total, `status` (`SaleStatus`: `pending_payment | paid | cancelled | refunded`), `stockCommittedAt`, `paymentReference` opcional, `clientRequestId` (idempotencia), `customerAlias` opcional. **Sin datos de contacto del cliente** (D5).
- `SaleLine`: variante, cantidad, **precio unitario al momento de la venta** (copia, no referencia a `Variant.price`), `returnedQuantity`.
- `Movement.saleId` opcional enlaza el movimiento con la venta que lo originó.

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-VEN-01 | El sistema debe registrar una **venta en tienda** (`store`) con una o más variantes escaneadas, cantidades, tienda, usuario, método de pago y fecha del servidor | P1 | No existe [V] | (T) venta de 2 líneas → 1 `Sale`, 2 líneas, total = Σ cantidad × precio |
| RF-VEN-02 | La venta debe ser **atómica**: `Sale`, líneas, decremento de `InventoryLevel` y un `Movement` `SALE` por línea en una sola transacción. Si alguna línea no tiene stock, no se registra nada | P1 | No existe [V] | (T) venta con una línea sin stock → ninguna fila nueva en `Sale`, `Movement` ni cambios de stock |
| RF-VEN-03 | El sistema debe registrar **ventas por WhatsApp** (`whatsapp`) según A1 [A, revisable]: las registra **quien entrega** (colaborador de la tienda u owner; también manager); el stock se descuenta **al registrar/entregar** (`stockCommittedAt`); con `spay_transfer` la venta queda `pending_payment` hasta que **owner o manager** (A2) confirmen la transferencia (`paid`); con `cash` o `card` nace `paid`. No existen estados "entregada" ni "disputada" | P1 | No existe [V] | (T) venta WhatsApp con `spay_transfer` → `pending_payment` y stock descontado; (T) colaborador no puede confirmar el pago; manager y owner sí; (T) ninguna pieza vendida por WhatsApp sigue como disponible en la tienda |
| RF-VEN-04 | El método de pago debe ser uno de `spay_transfer`, `cash`, `card`. La referencia de la transferencia SPAY es opcional y **no debe contener datos personales** del cliente. Solo se admite un alias corto opcional del cliente (`customerAlias`, ≤ 40 caracteres, sin teléfono) (D5) | P1 | No existe [V] | (T) método fuera de la lista se rechaza; (T) alias con 7 o más dígitos seguidos se rechaza; (I) el formulario no pide nombre ni teléfono |
| RF-VEN-05 | El precio unitario por defecto es `Variant.price`. Cambiarlo en una venta (descuento) requiere motivo y está limitado por rol **[P]** (D-VEN-2) | P1 | No existe [V] | (T) colaborador no puede cambiar el precio; (T) el cambio queda registrado con motivo y usuario |
| RF-VEN-06 | **Solo el owner** puede **anular** una venta [D] 2026-11-05 (D4): el sistema marca la venta como `cancelled` (no la borra), exige motivo y repone el stock con movimientos `RETURN` ligados a ella **si la prenda regresó**; una venta impagada cuya prenda no regresó se anula sin reingreso (ER §3.3). Las devoluciones también las registra el owner [A]; la política de devoluciones y cambios es **[P]** (D-VEN-3) | P1 | No existe [V] | (T) owner anula con "regresó" → stock vuelve al valor previo, la venta sale de los totales y queda como anulada; (T) con "no regresó" → stock sin cambio; (T) manager y colaborador reciben error al anular |
| RF-VEN-07 | Un colaborador solo registra ventas de su tienda | P1 | No existe [V] | (T) colaborador de A registrando venta en B → error |
| RF-VEN-08 | Cada tienda debe ver la **lista de ventas del día** con total por método de pago (corte informativo, no fiscal) | P1 | No existe [V] | (M) al cierre, el total en efectivo coincide con la suma de las ventas `cash` del día |
| RF-VEN-09 | El mockup estático de `/pos` debe reemplazarse por el módulo de ventas o retirarse de la navegación | P1 | Mockup [V `app/pos/page.tsx`] | (I) no hay pantallas con datos ficticios ni recursos de imagen de terceros en la app interna |
| RF-VEN-10 | La confirmación de una venta debe ser **idempotente**: un doble toque o un reintento de red no crea dos ventas (`Sale.clientRequestId` único, ER §2.2) | P1 | No existe [V] | (T) misma clave de idempotencia dos veces → una sola `Sale` |
| RF-VEN-11 | **Ventas concurrentes** [D] 2026-11-05 (D1): colaboradores y owner (y manager) registran ventas al mismo tiempo en las dos tiendas sin corromper stock. El descuento es condicional y atómico (`UPDATE … WHERE available >= n`), con bloqueos en orden fijo por variante (ER §3.1) | P1 | No existe [V] | (T, contra Postgres real) stock 1 y dos ventas paralelas de 1 → una `Sale`, un `InsufficientStockError`, `available = 0`; (T) ventas paralelas en las dos tiendas → ningún stock negativo y `available` final = inicial + Σ `delta`; (T) dos tickets con las mismas variantes en orden inverso → sin deadlock (criterios completos en ER §3.1) |

### 4.5 Tableros (RF-DASH)

Un solo dashboard para todos los roles [D] 2026-11-05 (D3); el servidor recorta el rango y la tienda según el rol (RF-DASH-07). Consultas e índices en ER §4.

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-DASH-01 | Ventas por periodo (hoy, semana, mes, rango): importe, número de ventas y piezas, con filtros por tienda, canal y método de pago | P1 | No existe [V] | (T) con ventas de fixture, los totales por filtro cuadran con la suma directa en BD |
| RF-DASH-02 | Ventas por **marca** y por **departamento** | P1 | No existe [V] | (T) idem, agrupado |
| RF-DASH-03 | Productos y variantes más vendidos, y **sin rotación** (sin venta en N días, N configurable) | P1 | No existe [V] | (T) variante sin ventas en el rango aparece en "sin rotación" |
| RF-DASH-04 | Stock por tienda, marca, departamento y talla, y valor del inventario a precio de venta | P1 | Parcial [V: stock total y por tienda en dashboard] | (T) valor = Σ disponible × `Variant.price` por tienda |
| RF-DASH-05 | Alertas de bajo stock con **umbral global configurable por el owner** (default 2, `AppSetting.lowStockThreshold`) y **override opcional por variante y tienda** (`InventoryLevel.minStock`, nulo = usar el global) [A] (A5) | P1 | Parcial [V: umbral fijo 1 en `app/page.tsx`] | (T) con global 2 y sin override, una variante con 2 piezas aparece; (T) con override 0 en esa variante y tienda, no aparece hasta llegar a 0; (T) solo el owner cambia el global |
| RF-DASH-06 | **Tablero de cobros pendientes** para el owner: ventas de WhatsApp `pending_payment` con su antigüedad, frente a las confirmadas; owner o manager las marcan `paid` (A1, A2) | P1 | No existe [V] | (T) venta pendiente aparece en la lista hasta marcarse pagada o anularse |
| RF-DASH-07 | Visibilidad [D] 2026-11-05 (D3): **todos los roles ven importes**. Owner y colaborador ven el **mismo dashboard**; el colaborador solo el **día de negocio en curso** (y su tienda, RF-AUT-03); el owner el histórico. El alcance histórico del manager queda **[P]** (D-ROL-1 residual). El recorte se aplica en el servidor | P1 | No existe [V] | (T) colaborador que pide el rango de ayer recibe solo hoy (o error), nunca datos de ayer; (T) owner obtiene el rango pedido; (M) colaborador y owner ven la misma pantalla con importes |
| RF-DASH-08 | Los cortes por día usan la zona horaria de la tienda (`America/Mexico_City` [S]) y no la del servidor | P1 | No existe [V] | (T) venta a las 23:30 hora local cuenta en ese día aunque el servidor esté en UTC |
| RF-DASH-09 | Exportar ventas y movimientos a CSV | P2 | No existe [V] | (M) el CSV abre en una hoja de cálculo con acentos correctos |
| RF-DASH-10 | **Margen** por venta y por marca. Requiere costo de compra, que el modelo no tiene **[P]** (D-DASH-1) | P2 | No existe [V] | Se define al decidir D-DASH-1 |
| RF-DASH-11 | El dashboard muestra estado de carga y no pinta KPIs en cero mientras llegan los datos | P1 | No existe [V: `useEffect` sin indicador] | (M) en 3G simulada no aparece "Sin alertas" antes de cargar |

### 4.6 Imágenes de producto (RF-IMG)

El estándar está en FotosIA §14 y no se repite aquí. Estos requerimientos lo vuelven verificable.

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-IMG-01 | Capturar foto (cámara o galería) en el alta y después desde `/productos`; subirla en el servidor; el data source solo guarda la URL (Captura, "Regla inviolable") | P1 | Existe [V] | (T) con `put` simulado, la URL llega a `createProduct` o a `updateProductImage` |
| RF-IMG-02 | La subida debe validar en el servidor tipo MIME de imagen y tamaño máximo, con sesión | P1 | Parcial [V: sesión y tamaño > 0; V-wt cambios en `upload.ts`] | (T) un archivo no imagen o mayor al límite se rechaza |
| RF-IMG-03 | Guardar el **original** intocable (`originalImageUrl`) además de la vista previa (FotosIA §6.1) | P2 | No existe [V] | (I) cada alta nueva tiene original y vista previa distintos |
| RF-IMG-04 | Las imágenes públicas aprobadas deben cumplir la **foto maestra** de FotosIA §14.1; el encuadre (80 % o ~88 %) es **[P]** (D-IMG-1) | P3 | No existe [V] | (T) script de control: 1:1, ≥ 1024 px, fondo `#FFFFFF`, lado mayor dentro de ±2 % del encuadre aprobado |
| RF-IMG-05 | Generar los **derivados** de FotosIA §14.2 con sus pesos meta | P3 | No existe [V] | (T) cada derivado cumple tamaño y peso de la tabla |
| RF-IMG-06 | El posproceso de imágenes aprobadas (FotosIA §14.4) debe ser un camino **distinto** de `lib/image/process.ts`: sin recorte centrado ni auto-niveles | P3 | No existe [V] | (T) una imagen 3:4 aprobada se rellena a 1:1 sin perder píxeles de la prenda; su color no cambia |
| RF-IMG-07 | Registrar cada candidato en `ProductImageJob`; solo el owner genera, aprueba o rechaza; rechazar borra el blob del candidato (FotosIA §6–§7) | P3 | No existe [V] | (T) un manager no puede aprobar; (T) rechazar elimina el blob |
| RF-IMG-08 | Antes de publicar, aplicar los cuatro controles de FotosIA §14.6 (ΔE2000, logo, fondo, resolución) | P3 | No existe [V] | (I) la pantalla de revisión muestra los cuatro resultados |
| RF-IMG-09 | Limpiar blobs huérfanos (subidos cuando el alta falló después) | P2 | No existe [V-wt: `TODO` en `createProductAction`] | (T) barrido elimina blobs sin producto con antigüedad > 24 h [A] |

### 4.7 Sitio público (RF-WEB)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-WEB-01 | Todo lo público (`/catalogo`, recorrido, ficha) debe recibir solo la **proyección pública** (Maestro §5.1). **Es P1 por seguridad**: hoy se filtran SKU e inventario por tienda (bloqueante B1). Para no romper el flujo del bot al quitar el SKU, la proyección expone el **código público** `publicCode` (A6, ER §2.7), y el webhook lo acepta en el mismo PR | **P1** | No cumple [V `fetchPublicProductsAction`] | (T) la respuesta pública no contiene `sku`, `barcode`, `inventory`, `locationId` ni cifras de stock; (T) sí contiene `publicCode` |
| RF-WEB-02 | Navegación por **departamento** | P3 | No existe [V] | (M) cada departamento aprobado lista solo sus productos |
| RF-WEB-03 | Filtro por **marca** (combinable con departamento y talla) | P3 | No existe [V] | (T) filtro marca + departamento devuelve la intersección |
| RF-WEB-04 | **Ficha estilo NORTH:** galería 1:1 con lupa sobre la maestra, foto secundaria 3:4 opcional **[P]** (FotosIA §14.8.2), precio, tallas disponibles y botón de WhatsApp sobre el pliegue en móvil (Ideas §3.1) | P3 | No existe [V] | (M) en un móvil real, precio, tallas y botón visibles sin desplazar |
| RF-WEB-05 | **Botón de WhatsApp** con mensaje prellenado (producto, talla elegida, **enlace de la ficha** y **código público corto** `publicCode`, A6) hacia el número público de la tienda (`NEXT_PUBLIC_WHATSAPP_NUMBER` [V `.env.example`]). El enlace no lleva datos personales, SKU, `barcode` ni IDs internos | P3 | Parcial [S: existe la variable; no se revisó el componente por instrucción] | (T) el enlace generado contiene solo número de la tienda, texto del producto, URL de la ficha y `publicCode`; (T) no contiene el SKU |
| RF-WEB-06 | **Recorrido de la tienda** según Demo §4–§5 y el contrato del Maestro §5.1 (sala virtual y luego tienda real por secciones, D-9) | P3 | En curso, sin commitear [V-doc] | Criterios de Maestro §8 |
| RF-WEB-07 | La disponibilidad pública se muestra solo como "disponible" o "agotado" (D-5 **[P]**) | P3 | No existe [V] | (T) ningún número de stock en la proyección |
| RF-WEB-08 | Los productos inactivos o sin foto pública no se listan [A] | P3 | No existe [V] | (T) producto inactivo ausente de la respuesta pública |
| RF-WEB-09 | Metadatos para compartir (título, imagen, descripción) por ficha y `canonical` tras el corte del dominio (Dominio §4.7) | P3 | No existe [S] | (M) la ficha compartida por WhatsApp muestra imagen y nombre |

### 4.8 Integraciones (RF-INT)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-INT-01 | La API del bot (`/api/bot/products`) autentica con `x-bot-key` (`BOT_API_KEY`) y responde 503 si no está configurada | P2 | Existe [V] | (T) sin cabecera → 401; sin variable → 503 |
| RF-INT-02 | Lo que el bot puede decir a un cliente debe salir de una proyección para clientes (sin cifras exactas de stock), coherente con RF-WEB-07. El flujo "apartar"/consultar del webhook identifica la prenda por **`publicCode`** (A6), no por SKU, y responde disponible/agotado por talla sin prometer reserva | P2 | No cumple [V: devuelve `getProducts()` completo; el webhook espera `SKU: X`] | (T) la respuesta del bot no contiene `inventory` ni `sku`; (T) un mensaje con "Código K7Q2M" devuelve la disponibilidad de ese producto |
| RF-INT-03 | n8n queda fuera del camino crítico: avisos y respaldos, nunca la venta ni el stock (n8n) | P2 | Diseño [V-doc] | (I) ninguna escritura de stock depende de n8n |

### 4.9 Documentación (RF-DOC)

| ID | Requerimiento | Prioridad | Estado | Criterio de aceptación |
|---|---|---|---|---|
| RF-DOC-01 | Este SRS aprobado por el dueño, con las decisiones de §11 resueltas o fechadas | P2 | Borrador | (I) versión 1.0 con fecha de aprobación |
| RF-DOC-02 | Guía de operador para alta, venta y anulación, con capturas sin datos de clientes | P2 | Parcial [V-wt `docs/guia-captura-catalogo.md`, sin commitear] | (M) un colaborador nuevo registra una venta solo con la guía |
| RF-DOC-03 | Diagrama del modelo de datos y del contrato `InventoryDataSource`, actualizado con cada migración | P2 | No existe [V] | (I) el diagrama coincide con `schema.prisma` |
| RF-DOC-04 | Runbook de respaldo y restauración de la BD, probado (ver RNF-DISP-02) | P2 | No existe [V] | (M) restauración probada en una rama o base de prueba |

---

## 5. Requerimientos no funcionales

### 5.1 Seguridad (RNF-SEG)

| ID | Requerimiento | Prioridad | Estado / hallazgo | Criterio de aceptación |
|---|---|---|---|---|
| RNF-SEG-01 | Ningún secreto en el repo público; `.env.example` solo con nombres y valores vacíos o de ejemplo | P1 | Cumple [V `.env.example`] | (T) gitleaks en CI sin hallazgos |
| RNF-SEG-02 | Roles comprobados en el servidor en cada acción (RF-AUT-02) | P1 | Parcial [V] | Ver RF-AUT-02 |
| RNF-SEG-03 | El webhook de WhatsApp debe **rechazar** mensajes sin firma válida cuando corre en producción; omitir la firma solo en desarrollo local explícito | P1 | **Hallazgo, severidad media:** falla abierta si falta `WHATSAPP_APP_SECRET` [V] | (T) en modo producción sin secreto → 503 o 401, nunca 200 |
| RNF-SEG-04 | Lo público no expone SKU, inventario ni IDs internos innecesarios (RF-WEB-01) | P1 | **Hallazgo, severidad media:** `fetchPublicProductsAction` sin sesión devuelve el producto completo [V] | Ver RF-WEB-01 |
| RNF-SEG-05 | Dependencias del núcleo sin vulnerabilidades conocidas de severidad alta (merge del PR #17, Next 15.5) | P1 | Pendiente (B4) [V-doc] | (I) `npm audit --omit=dev` sin altas en el núcleo |
| RNF-SEG-06 | Cabeceras de seguridad (CSP, `frame-ancestors`, `Referrer-Policy`) en la app interna y la pública | P2 | [S] no revisado | (T) respuesta con las cabeceras esperadas |
| RNF-SEG-07 | Límite de intentos de login por usuario e IP; la IP del cliente se obtiene vía `lib/platform/` | P2 | No existe [S] | (T) N intentos fallidos → bloqueo temporal |
| RNF-SEG-08 | Toda escritura de stock o venta queda auditada con usuario y fecha del servidor (sin hora del cliente) | P1 | Parcial [V: `Movement.timestamp` por defecto en servidor; tipo ausente] | (T) ninguna acción acepta fecha del cliente |

### 5.2 Privacidad (RNF-PRIV)

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-PRIV-01 | **Minimización [D] 2026-11-05 (D5):** LoloShop **no guarda datos de contacto del cliente** (nombre, teléfono, correo, dirección ni datos bancarios), en ventas ni en ninguna otra tabla. A lo sumo, un alias corto libre opcional escrito por el personal (`Sale.customerAlias`, ≤ 40 caracteres, sin teléfono), que no sale en proyecciones públicas, URLs ni logs. La conversación y el comprobante se quedan en WhatsApp; LoloShop guarda solo el folio de la transferencia | P1 | (I) el esquema no tiene `customerName`, `customerPhone` ni equivalentes; (T) alias con 7 o más dígitos seguidos se rechaza; (T) ninguna respuesta pública ni log contiene `customerAlias` |
| RNF-PRIV-02 | Ningún dato personal en URLs (parámetros de consulta ni rutas) | P1 | (T) los enlaces de WhatsApp y de la app no contienen teléfonos de clientes |
| RNF-PRIV-03 | Fotos de la tienda sin personas identificables ni precios o pantallas con datos de clientes (Demo §4.1) | P3 | (M) revisión antes de subir cada panorámica |
| RNF-PRIV-04 | Fotos de personas del probador: no se guardan en LoloShop y hay test de no persistencia (Auditoría) | Fuera del SRS P1–P3 | (T) del roadmap del probador |
| RNF-PRIV-05 | Los registros de error no incluyen contraseñas, cuerpos de mensajes de clientes ni teléfonos | P2 | (I) revisión de `console.*` en webhook y acciones |

### 5.3 Rendimiento móvil (RNF-REN)

Valores iniciales [A], medidos en un teléfono Android de gama media con 4G:

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-REN-01 | Del escaneo leído al producto o formulario en pantalla: ≤ 1.5 s (p95) | P1 | (M) 20 escaneos cronometrados |
| RNF-REN-02 | Venta de una prenda, del primer escaneo a la confirmación: ≤ 30 s de operación humana; respuesta del servidor ≤ 1 s (p95) | P1 | (M) y (T) de carga ligera |
| RNF-REN-03 | Alta de 10 productos con foto: < 10 min (Maestro §8) | P1 | (M) |
| RNF-REN-04 | Tableros del owner: primera pintura útil ≤ 2.5 s con 12 meses de ventas [S de volumen: < 50 000 líneas] | P1 | (M) con datos sintéticos |
| RNF-REN-05 | Sitio público: LCP ≤ 2.5 s y CLS ≤ 0.1 en móvil; imágenes con los derivados de FotosIA §14.2 | P3 | (M) Lighthouse móvil |
| RNF-REN-06 | El escáner funciona con la cámara trasera y sin teclado; alternativa de captura manual del código | P1 | (M) [V-wt `ManualCodeEntry.tsx`] |

### 5.4 Disponibilidad y continuidad (RNF-DISP)

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-DISP-01 | Disponible en el horario de las tiendas con objetivo ≥ 99 % mensual [A]. En la RPi5 exige energía de respaldo y túnel con reconexión (Dominio §3.2) | P1 | (I) monitor externo de disponibilidad |
| RNF-DISP-02 | **Respaldo restaurable** de la BD antes de cualquier migración (B5) y diario después. RPO ≤ 24 h, RTO ≤ 4 h [A] | P1 | (M) restauración probada y fechada |
| RNF-DISP-03 | Sin conexión, la PWA no debe confirmar ventas ni movimientos falsamente: muestra el error y conserva lo escaneado para reintentar. La cola offline de ventas queda fuera de P1 [A] | P1 | (M) modo avión → la venta no se marca como registrada |
| RNF-DISP-04 | **Calendario [D] 2026-11-05 (D2):** el módulo de ventas y los dashboards se construyen y despliegan **antes del Buen Fin**. El congelamiento de producción aplica **durante** el Buen Fin y diciembre (solo correcciones urgentes); no impide salir antes. Todo cambio a producción (migración o despliegue de ventas) se hace con **respaldo restaurable verificado ese día** y **en horario sin ventas** (tiendas cerradas), con retroceso escrito antes de empezar (Plan global §10) | P1 | (I) calendario de despliegues con fecha anterior al Buen Fin para ventas y dashboards; (I) por cada paso a producción: fecha y hora fuera del horario de tiendas y registro del respaldo restaurado (RNF-DISP-02) |

### 5.5 Costo (RNF-COSTO)

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-COSTO-01 | Hosting ≤ US$20/mes (tope de Vercel Pro) o el equivalente eléctrico y de dominio de la RPi5 [V-doc Plan global §9] | P1 | (I) factura mensual |
| RNF-COSTO-02 | P1 y P2 no usan IA de pago. La IA de fotos (P3) respeta los topes de FotosIA §8 y un interruptor de apagado | P1 | (I) sin claves de IA en P1 |
| RNF-COSTO-03 | Almacenamiento de imágenes dentro de la capa gratuita o el tope fijado (≈ 1 GB, FotosIA §7.2) | P2 | (I) uso mensual |

### 5.6 Mantenibilidad y portabilidad (RNF-MANT)

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-MANT-01 | La UI y las acciones usan `InventoryDataSource` vía `getDataSource()`; ningún componente importa Prisma. Las ventas entran a esa interfaz (o a una hermana, decisión de `backend-data`) | P1 | (T) regla de lint o test que falla si `components/` o `app/` importan `@prisma/client` o `lib/prisma` |
| RNF-MANT-02 | Lo propio de la plataforma (IP, anti-bot, almacenamiento, cliente de BD) vive en `lib/platform/`, para poder pasar de Vercel a Cloudflare o a la RPi5 (Postgres local, MinIO) sin tocar el dominio | P1 | (I) `lib/domain/` y `lib/data/` sin imports de `@vercel/*` |
| RNF-MANT-03 | Cambios de esquema solo con `prisma migrate`, probados en una rama o base de prueba; se retira `db:push` del flujo de producción | P1 | (I) `prisma/migrations/` versionado; baseline tras respaldo (B5) |
| RNF-MANT-04 | `npm test`, `npm run lint` y `npm run build` en verde antes de cada merge; reportes de otras herramientas se tratan como no verificados hasta correrlos | P1 | (I) CI |

### 5.7 Usabilidad e idioma (RNF-USA)

| ID | Requerimiento | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RNF-USA-01 | Interfaz en español de México; importes en MXN con dos decimales [S: moneda no declarada en el código] | P1 | (I) formato `$1,234.50` |
| RNF-USA-02 | Operación con una mano en móvil: botones principales ≥ 44 px, sin hover obligatorio | P1 | (M) |
| RNF-USA-03 | Mensajes de error en español, accionables, sin trazas técnicas | P1 | (T) [V-wt: resultados tipados con mensaje] |
| RNF-USA-04 | Contraste AA en textos de la app y del sitio | P2 | (M) herramienta de contraste |

---

## 6. Requerimientos de datos (resumen)

Cambios de esquema que implican los RF, todos con `prisma migrate` y después del baseline (RNF-MANT-03):

Detalle de campos, índices y orden de migraciones: **ER §2 y §5**.

| Cambio | RF | Prioridad |
|---|---|---|
| `Brand` (con `createdById`) y relación desde `Product`; migración de los textos actuales | RF-CAT-01 | P1 |
| `Department` como **tabla editable** (D6) en `Product`, opcional en BD y obligatorio en el alta nueva (A3) | RF-CAT-02 | P1 |
| `Product.publicCode` único (A6) | RF-WEB-01, RF-INT-02 | P1 |
| `Sale`, `SaleLine`, `SaleChannel`, `PaymentMethod`, `SaleStatus`, `stockCommittedAt`, `clientRequestId`, `customerAlias` (sin datos de contacto, D5) | RF-VEN-01…11 | P1 |
| `Movement.saleId` opcional; `type` siempre explícito; `MovementType.RETURN` | RF-INV-06, RF-VEN-02, RF-VEN-06 | P1 |
| `AppSetting.lowStockThreshold` (default 2) e `InventoryLevel.minStock` nullable (A5) | RF-DASH-05 | P1 |
| `Product.slug`, `publishedAt`, `description`; datos públicos de `Location` (A7) | RF-WEB-02…09 | P3 |
| `originalImageUrl` y demás campos de imagen; `ProductImageJob` | RF-IMG-03, RF-IMG-07 | P2 / P3 |
| Costo de compra (solo si D-DASH-1 lo aprueba) | RF-DASH-10 | P2 |

---

## 7. Restricciones

1. **Stack** [V `package.json`]: Next.js (App Router), React, TypeScript, Prisma 5 sobre PostgreSQL, `next-auth` 4, `@vercel/blob`, `html5-qrcode`, `react-barcode`. Next 15.5 y Serwist en PR #17 (pendiente).
2. **Repo público:** sin secretos ni valores de entorno; sin datos reales de clientes en fixtures.
3. **Migraciones** solo con `prisma migrate`; nada de SQL a mano (`CLAUDE.md`).
4. **Hosting por etapas** [D]: Vercel → `loloshop.y4ga.app` → RPi5 24/7 con Postgres local, MinIO y túnel. El hosting definitivo es **[P]** (D-HOST-1). El código no debe depender de una sola plataforma (RNF-MANT-02).
5. **Sin cobro en línea:** el canal de compra es la tienda física y WhatsApp [D].
6. **Presupuesto bajo** (RNF-COSTO).

## 8. Supuestos y dependencias

| # | Supuesto o dependencia | Marca |
|---|---|---|
| S-1 | La mayoría de las prendas trae GTIN legible (EAN-13 o UPC-A) en la etiqueta del retailer | [D] parcialmente ("muchas prendas") |
| S-2 | Las dos tiendas tienen datos móviles o wifi estables en horario de venta | [S] |
| S-3 | El volumen es de tienda pequeña: cientos de productos, decenas de ventas diarias por tienda | [S] |
| S-4 | Un mismo código del retailer no se repite entre prendas distintas | [S]; si ocurre, RF-INV-05 lo trata como duplicado y el operador decide |
| S-5 | La moneda es MXN y la zona horaria `America/Mexico_City` | [S] |
| S-6 | El manager trabaja en ambas tiendas | [S] |
| D-1 | El trabajo del worktree `feat/demo-alta-lote` llega a `main` tras `test`, `lint` y `build` | Dependencia de RF-INV-01…05 y RF-CAT-03, 05 |
| D-2 | Merge del PR #17 antes de añadir dependencias nuevas | Dependencia de RNF-SEG-05 |
| D-3 | Respaldo de BD y baseline de migraciones (B5) antes de cualquier tabla nueva | Dependencia de §6 |

---

## 9. Orden de implementación sugerido para el builder [A]

Restricción de calendario [D] 2026-11-05 (D2): los pasos 1 a 4 (cimientos, catálogo mínimo, ventas y tableros) deben estar **en producción antes del Buen Fin**; el congelamiento empieza con el Buen Fin y sigue en diciembre (RNF-DISP-04). Lo que no llegue a tiempo espera a enero.

1. **Cimientos P1:** B5 (respaldo y baseline; **responsable pendiente del dueño**), merge del alta por lote (`feat/demo-alta-lote`, **pendiente del dueño**), RF-WEB-01 con `publicCode` (A6), RNF-SEG-03 (firma del webhook).
2. **Catálogo e inventario P1:** RF-CAT-01, 02, 04; RF-INV-06, 07, 09; RF-AUT-02, 03, 04, 05.
3. **Ventas P1:** RF-VEN-01, 02, 04, 07, 09, 10, 11, luego 03, 05, 06, 08.
4. **Tableros P1:** RF-DASH-01…08, 11.
5. **P2:** documentación, transferencias, conteo, CSV, original de la foto.
6. **P3:** sitio público, estándar de imagen y recorrido, según Plan global S-B a S-D.

---

## 10. Trazabilidad

| RF / RNF | Fuente |
|---|---|
| RF-AUT-01, 06 | `CLAUDE.md` §Seguridad |
| RF-AUT-02, 04 | Definición del agente `architect`; FotosIA §6.1.3 |
| RF-AUT-03 | Memoria F2 del arquitecto (alcance por tienda); `adjustInventoryAction` [V] |
| RF-CAT-01, 02 | Hechos del dueño 2026-11-05 [D]; D6, D7; A3, A4; ER §2.3 |
| RF-CAT-03 | Demo §3.1.2 |
| RF-CAT-05 | Hechos del dueño (SKU `LS-XXXXXX-C`); `lib/domain/barcode.ts` [V-wt] |
| RF-CAT-06 | `app/etiquetas/page.tsx` [V] |
| RF-INV-01…05 | Demo §3.1, §3.2; Maestro §4 D1 |
| RF-INV-06, 07 | `prisma/schema.prisma` (`MovementType`) [V]; hecho del dueño "SALE no se usa" |
| RF-VEN-* | Hechos del dueño 2026-11-05 (ventas en tienda y WhatsApp con SPAY) [D]; D1, D4, D5; A1, A2; ER §2.2, §3, §6 |
| RF-DASH-* | Hechos del dueño ("el owner necesita controlar stock y ver sus ventas") [D]; D3; A5; ER §4 |
| RF-DASH-11 | Memoria F2 del arquitecto (estado de carga) |
| RF-IMG-01, 02 | Captura (todo el spec) |
| RF-IMG-03, 07 | FotosIA §6, §7 |
| RF-IMG-04…06, 08 | FotosIA §14.1–14.6 |
| RF-WEB-01, 07 | Maestro §3 B1, §5.1; Demo §5.2.1, D-5 |
| RF-WEB-02…05 | Hechos del dueño (departamentos, marca, ficha NORTH, WhatsApp) [D]; Ideas §3.1; FotosIA §14.7 |
| RF-WEB-06 | Demo §4–§5; Maestro §4 D2, §5.1 |
| RF-WEB-09 | Dominio §4.7 |
| RF-INT-* | Bot; n8n |
| RNF-SEG-05 | Maestro §3 B4 |
| RNF-PRIV-03, 04 | Demo §4.1; Auditoría |
| RNF-DISP-02, RNF-MANT-03 | Maestro §3 B5; Auditoría M3 |
| RNF-DISP-04 | Plan global §10; D2 |
| RNF-PRIV-01 | D5; ER §2.2 |
| RF-WEB-01, RF-WEB-05, RF-INT-02 (`publicCode`) | A6; ER §2.7; Arquitectura §2.4 |
| RNF-COSTO-* | Plan global §9; FotosIA §8 |
| RNF-MANT-01, 02 | Captura ("Regla inviolable"); Maestro §5 (capa de plataforma) |

---

## 11. Decisiones del dueño: resueltas y pendientes

### 11.0 Resueltas el 2026-11-05 (detalle en §15)

| ID anterior | Resolución |
|---|---|
| D-VEN-1 (quién registra la venta de WhatsApp) | [A] A1 y A2, revisable: quien entrega registra; stock al registrar; `pending_payment` hasta que owner o manager confirman SPAY |
| D-CAT-1 (lista de departamentos) | [D] D6: Dama, Caballero, Niños, Calzado, Accesorios; tabla editable. Ropa interior en Dama [A] A4 |
| D-ROL-1 (qué ven manager y colaborador) | [D] D3: todos ven importes; colaborador solo el día en curso; owner el histórico. **Residual pendiente:** alcance histórico del manager |
| D-VEN-4 (datos del cliente de WhatsApp) | [D] D5: no se guardan; solo alias corto opcional sin teléfono |
| Anulación de ventas (antes "D-VEN-2" en la matriz) | [D] D4: solo el owner |

### 11.1 Pendientes declaradas

| ID | Pregunta | Bloquea | Opciones |
|---|---|---|---|
| **D-OPS-1** | Merge del worktree `feat/demo-alta-lote` a `main` (tras `test`, `lint`, `build`) | Casi todo RF-INV y RF-CAT (RF-INV-01…05, RF-CAT-03, 05) y el paso 1 de §9 | Mergear antes de empezar ventas, para no rehacer el alta |
| **D-OPS-2** | Quién hace el respaldo restaurable, la rama de Neon y la configuración de `DIRECT_URL` | B5, RNF-DISP-02, RNF-DISP-04, todas las migraciones (ER §5) | El dueño, `devops-deploy` con acceso delegado, u otra persona; debe quedar asignado antes del Buen Fin |
| **D-HOST-1** | Hosting definitivo | RNF-DISP-01, RNF-COSTO-01, almacenamiento de fotos | Vercel Pro; RPi5 (Postgres local, MinIO, túnel); Cloudflare Workers como interino (§12, C-7) |
| **D-IMG-1** | Encuadre de la foto maestra: 80 % o ~88 % | RF-IMG-04 | FotosIA §14.8.1 |

### 11.2 Heredadas de otros specs (siguen abiertas)

| ID | Pregunta | Fuente |
|---|---|---|
| D-1 | Stock inicial por defecto en el alta | Maestro §6 |
| D-5 | Público solo "disponible / agotado" | Maestro §6 |
| D-8 | Herramienta de recorte de fondo | Maestro §6 |
| D-10 | Foto trasera en el alta | Maestro §6 |
| — | Foto secundaria 3:4 en la ficha | FotosIA §14.8.2 |

### 11.3 Preguntas abiertas que detecta este SRS (no decididas)

| ID | Pregunta | Bloquea |
|---|---|---|
| D-ROL-1 (residual) | ¿El manager ve el histórico como el owner o solo el día como el colaborador? | RF-DASH-07 |
| D-VEN-2 | ¿Se permiten descuentos en la venta? ¿Quién los aplica? | RF-VEN-05 |
| D-VEN-3 | Política de devoluciones y cambios de talla | RF-VEN-06 |
| D-CAT-2 | ¿Cómo se relacionan categoría (tipo de prenda) y departamento? ¿Se mantienen "Perfumes" y "Raquetas de Padel"? | RF-CAT-03 |
| D-INV-1 | ¿Se guarda el precio de la etiqueta del retailer, aparte del precio de venta de LoloShop? | RF-INV-03 |
| D-DASH-1 | ¿Se registra el costo de compra para calcular margen? | RF-DASH-10 |

---

## 12. Contradicciones y huecos entre specs y código

| # | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|
| C-1 | `CLAUDE.md` dice "Punto de venta"; el agente `architect` dice "NO es un POS"; el Bot dice "No es un POS". El dueño ahora pide módulo de ventas | [V-doc] | §1.3: registra ventas, no es POS fiscal. Actualizar `CLAUDE.md` y la definición del agente al aprobar este SRS |
| C-2 | El Bot prevé cobro con enlace de Mercado Pago; el dueño dice que hoy se paga con transferencia SPAY y que el sitio no cobra | [V-doc Bot §Flujo de pedido] | Marcar el flujo de Mercado Pago del Bot como superado |
| C-3 | `MovementType` incluye `SALE`, pero ninguna ruta escribe un tipo: todo queda `ADJUSTMENT`; y si falta `userId` no se escribe el movimiento | [V `prisma-source.ts`] | RF-INV-06 |
| C-4 | Hay dos formatos de SKU: `LS-CAT-BRA-TALLA-COLOR` (`lib/domain/sku.ts`, en `main`, con tests y fixtures) y `LS-XXXXXX-C` (worktree). En `main` el alta guarda el código escaneado como SKU | [V], [V-wt] | Retirar `generateSku` o dejar constancia de que no se usa; migrar fixtures al formato nuevo |
| C-5 | El stock puede quedar negativo; no hay validación en `adjustInventory` | [V] | RF-INV-07 |
| C-6 | Demo §3.1.2 usa "categoría" (Playeras, Perfumes, Raquetas de Padel…) y Maestro §4 D2 usa "secciones" de la tienda; el dueño pide "departamentos" (dama, caballero…). Son tres ejes sin relación definida, y `ZoneConfig.categories` del Maestro §5.1 filtra por categoría | [V-doc], [V-wt] | D-CAT-2; decidir si las zonas del recorrido filtran por departamento o por categoría |
| C-7 | Hosting: el Maestro fija Cloudflare interino y luego Vercel Pro; los hechos del dueño de hoy dicen Vercel → `loloshop.y4ga.app` → RPi5. La memoria del proyecto también prevé la RPi5 | [V-doc] | D-HOST-1; actualizar Maestro §4 D5 y §5 al decidir |
| C-8 | `PublicProduct` del Maestro §5.1 no tiene `brand` filtrable como entidad ni `department`; el sitio P3 los necesita | [V-doc] | Ampliar el contrato con `brandId`/`brandName`, `department`, `publicCode` y `slug` (ER §2.7) cuando existan |
| C-9 | `/api/bot/products` entrega inventario exacto y SKU al bot de clientes; el Bot dice "nunca inventa stock", pero lo público debe ser solo disponible/agotado | [V] | RF-INT-02 |
| C-10 | `/pos` muestra datos ficticios ("System Online", "Store Manager") y carga una imagen de un dominio externo de Google | [V `app/pos/page.tsx`] | RF-VEN-09 |
| C-11 | `/escanear` bloquea al owner o manager sin `locationId` con el mensaje "Debes ser colaborador" | [V] | RF-AUT-05 |
| C-12 | No hay `prisma/migrations/` y existe `db:push`, mientras todos los specs exigen `prisma migrate` | [V] | RNF-MANT-03 (B5) |
| C-13 | Captura dice "Múltiples imágenes por producto: fuera de alcance"; FotosIA §14.7 y la ficha NORTH piden galería con miniaturas | [V-doc] | RF-WEB-04; modelar galería al hacer RF-IMG-03 |
| C-14 | La variante tiene `color` fijo "General" por defecto y el alta no captura color; Ideas §2.4 y Maestro D3 piden selector de color | [V] | RF-INV-03, RF-CAT-04 |
| C-15 | El webhook de WhatsApp acepta mensajes sin validar firma si falta el secreto | [V] | RNF-SEG-03 |
| C-16 | **Resuelta 2026-11-05.** La arquitectura recomendaba la variante B (owner registra al confirmar el pago) con estados "entregada" y "disputada"; el ER recomendaba la A y solo define `pending_payment \| paid \| cancelled \| refunded` | [V-doc] | A1: variante A; los cuatro documentos usan solo el `SaleStatus` del ER y `stockCommittedAt` |
| C-17 | **Resuelta 2026-11-05.** El ER tenía `customerName` y `customerPhone`; la arquitectura decía que `Sale` no guarda contacto | [V-doc] | D5: fuera los dos campos; `customerAlias` opcional |
| C-18 | **Resuelta 2026-11-05.** El ER permitía anular a owner o manager; el SRS solo al owner | [V-doc] | D4: solo el owner |
| C-19 | **Resuelta 2026-11-05.** La UX quitaba el SKU del mensaje de WhatsApp, pero el webhook solo reconoce `SKU: X` | [V], [V-doc] | A6: `publicCode` en el mensaje, en la proyección y en el webhook |
| C-20 | **Abierta.** D3 dice que owner y colaborador ven "el mismo dashboard", y RF-AUT-03 limita al colaborador a su tienda. Este SRS lo lee como misma pantalla, recortada a su tienda y al día en curso | [V-doc] | Confirmar con el dueño si el colaborador debe ver también el día de la otra tienda |
| C-21 | **Abierta.** D3 no fija el alcance histórico del manager | [V-doc] | D-ROL-1 residual |

---

## 13. Evolución futura (fuera de alcance)

| Tema | Dependencia en este SRS |
|---|---|
| **Shopify** como canal o fuente de catálogo | `InventoryDataSource` permite una implementación nueva sin tocar la UI (RNF-MANT-01). `Brand` y `Department` deben mapear a vendor y colecciones |
| **Pago en línea y carrito** | `SaleChannel` ganaría un valor `online`; `PaymentMethod` uno por pasarela. La venta atómica (RF-VEN-02) sirve tal cual |
| **Facturación (CFDI)** | No prevista. Requeriría datos fiscales del cliente y cambia RNF-PRIV-01 |
| **Cola offline de ventas** | RNF-DISP-03 lo excluye de P1 |
| **Probador virtual** | Roadmap propio (`plans/2026-10-19-probador-virtual-roadmap-sprints.md`, Plan global S-E, S-F) |

---

## 14. Resumen de requerimientos por prioridad

| Prioridad | Funcionales | No funcionales | Total |
|---|---|---|---|
| P1 | 43 | 26 | 69 |
| P2 | 14 | 5 | 19 |
| P3 | 13 | 2 | 15 |
| **Total** | **70** | **33** | **103** |

La versión 0.2 agrega RF-VEN-11 (concurrencia, P1); los demás cambios del 2026-11-05 modifican requerimientos existentes sin crear nuevos. RNF-PRIV-04 (probador) queda fuera de P1–P3 y no se cuenta.

---

## 15. Registro de decisiones 2026-11-05

**Del dueño [D] 2026-11-05:**

| # | Decisión | Requerimientos afectados |
|---|---|---|
| D1 | Colaborador y owner registran ventas al mismo tiempo y en las dos tiendas; las ventas concurrentes no deben corromper el stock | §3.2, CU-05, §4.1.1, RF-VEN-11 (nuevo), ER §3.1 |
| D2 | Ventas y dashboards se construyen y despliegan **antes** del Buen Fin; el congelamiento aplica durante el Buen Fin y diciembre; todo paso a producción con respaldo restaurable y en horario sin ventas | RNF-DISP-04, §9, ER §5 |
| D3 | Todos los roles ven importes; owner y colaborador ven el mismo dashboard; colaborador solo el día en curso, owner el histórico | §3.2, §4.1.1, §4.5, RF-DASH-07, C-20, C-21 |
| D4 | Solo el owner anula ventas | §4.1.1, CU-07, RF-VEN-06, RF-AUT-04 |
| D5 | No se guardan datos de contacto del cliente; a lo sumo un alias corto libre opcional sin teléfono | RF-VEN-04, RNF-PRIV-01, §6, ER §2.2 |
| D6 | Departamentos: Dama, Caballero, Niños, Calzado, Accesorios; la lista crecerá (`Department` es tabla editable) | Glosario, RF-CAT-02, §6 |
| D7 | El colaborador crea marcas nuevas durante el alta, sin aprobación; el owner edita o fusiona duplicados | RF-CAT-01, §4.1.1 |

**Del autor (decisión del autor, revisable):**

| # | Decisión | Requerimientos afectados |
|---|---|---|
| A1 | WhatsApp, variante A: quien entrega (colaborador u owner) registra; stock al registrar/entregar; `pending_payment` hasta confirmar SPAY; tablero de cobros pendientes; sin estados "entregada" ni "disputada" | CU-06, RF-VEN-03, RF-DASH-06, C-16 |
| A2 | Confirmar el pago SPAY: owner y manager | §4.1.1, RF-VEN-03, RF-AUT-04 |
| A3 | Departamento obligatorio en el alta de productos nuevos; opcional en la base; el owner asigna los existentes desde una edición rápida | RF-CAT-02, RF-INV-03 |
| A4 | Ropa interior dentro de Dama por ahora | Glosario, RF-CAT-02 |
| A5 | Stock bajo: umbral global configurable por el owner (default 2) con override opcional por variante y tienda (`InventoryLevel.minStock` nullable) | RF-DASH-05, §6 |
| A6 | Código público corto por producto (`publicCode`, no el SKU) para el mensaje de WhatsApp y el bot; permite cerrar B1 | RF-WEB-01, RF-WEB-05, RF-INT-02, C-19 |
| A7 | Datos públicos de P3 en el ER (`slug`, `publishedAt`, `description`, datos públicos de tienda; disponibilidad pública calculada); medidas, cuidado, tallas por departamento y foto trasera fuera de P1 | §6, RF-WEB-02…09, ER §2.7 |

**Siguen abiertos (pendientes del dueño):** D-OPS-1 (merge de `feat/demo-alta-lote`) y D-OPS-2 (respaldo, rama de Neon y `DIRECT_URL`), §11.1.
