# Subsistema F: venta sin internet en la PWA (2026-11-12)

**Estado:** diseño para revisión. Decisiones del dueño (§1) son definitivas; las preguntas abiertas están en §14, cada una con un valor por omisión recomendado.
**Relacionado:** `2026-11-11-alcance-inventario-simplificado-design.md` (§5.2 POS rápido, `clientRequestId` sin cambios), `docs/superpowers/plans/2026-11-11-version-final-cronograma.md` (F va después de la demo, decisión 9), bitácora de la versión final (rulings de G17 sobre el cobro incierto).
**Plan:** `docs/superpowers/plans/2026-11-12-F-venta-sin-internet.md`.

## 1. Decisiones del dueño (no se discuten aquí)

1. El **alta de producto requiere internet**. Solo la **venta** funciona sin conexión y se sincroniza sola al volver.
2. El stock es **por tienda**; la misma prenda no se vende en dos tiendas. Si al sincronizar no alcanza el stock (otro teléfono de la misma tienda la vendió), la venta sin internet **se acepta** y queda **marcada para aprobación del dueño**. Solo en este caso. La venta en línea conserva la regla estricta: **nunca stock negativo**.
3. Se cobra **el precio que tenía el teléfono** al momento de la venta.
4. **No se guardan datos de contacto** del cliente.

## 2. Lo que hay hoy (código en `main`, d05d68b)

- `/pos` (`app/pos/page.tsx`): escáner continuo; cada lectura llama a `lookupCodeAction(code, store)` y agrega al borrador con `stock.available`. Lecturas que llegan durante un cobro se guardan en `heldRef` ("queued") y entran al terminar. Con resultado incierto (`catch` de red o `UNAVAILABLE`) el carrito queda **bloqueado** (`lock = "uncertain"`): solo "Reintentar cobro" o "Ya revisé en Ventas: empezar otra venta" con confirmación.
- `useSaleDraft` (`lib/sales/use-sale-draft.ts`): un `clientRequestId` por borrador; `requestIdFor(signature)` lo renueva solo tras un rechazo definitivo y si el carrito cambió; si es incierto (`markUncertain`) no se renueva.
- `createSaleAction` (`lib/sales/actions.ts`): relee usuario de la BD (`getCurrentUser`), limita la tienda (colaborador; manager con tienda), y para colaborador revisa `PRICE_CHANGED` **solo si** `hasClientRequest` es falso (un reintento no se evalúa).
- `PrismaSalesDataSource.createSale`: replay o `SaleRequestConflictError` por `clientRequestId` (`isSameSaleRequest`: tienda, canal, método, renglones con precio en centavos); transacción con `UPDATE … WHERE available >= n` por renglón en orden de `variantId`; un `Movement SALE` por renglón; índice único + P2002 cubre la carrera del mismo reintento.
- PWA: `next-pwa` 5.6 con configuración por omisión (`next.config.mjs`). El `sw.js` generado precarga `/_next/static/*` y solo cachea la navegación a `/` (`start-url`, NetworkFirst). **`/pos` no abre sin conexión hoy.** PR #17 (Next 15 + Serwist) sigue sin mezclar.
- Sesión: JWT de 12 h (`maxAge`), cookie httpOnly. Sin red, `useSession` no obtiene sesión y `/pos` muestra el estado "sesión".

## 3. Alcance

**Entra:** abrir `/pos` sin conexión, buscar códigos en una copia local por tienda, cobrar en una cola local (IndexedDB), sincronizar sola, representar "aceptada con stock insuficiente", pantalla del dueño para aprobar o rechazar, avisos al cajero.
**No entra:** alta, entradas de stock, fotos, `/ventas` y `/productos` sin conexión; confirmación de pagos y anulaciones sin conexión; Background Sync del service worker; sincronización entre teléfonos sin servidor.

## 4. Almacenamiento local (IndexedDB)

**Decisión:** IndexedDB a través de la librería `idb` (8.x, ISC, ~1 KB). `localStorage` queda descartado: síncrono, solo texto, ~5 MB y sin transacciones; una cola de dinero necesita escritura atómica. Base `loloshop-offline`, versión 1, tres almacenes:

| Almacén | Llave | Contenido |
|---|---|---|
| `snapshots` | `locationId` | Copia de la tienda (§5) |
| `queue` | `clientRequestId` | Venta sin internet (§6), índice `bySoldAt` |
| `identity` | `"current"` | `{ userId, role, locationId, confirmedAt }` |

- Al encolar la primera venta se pide `navigator.storage.persist()` para que el navegador no la borre por espacio. En iPhone el almacenamiento de un sitio en Safari puede borrarse tras 7 días sin uso; **la PWA instalada en la pantalla de inicio no tiene ese límite** (requisito de operación, §14 P6).
- Nada en IndexedDB es secreto: **no se guarda el JWT, la cookie, `NEXTAUTH_SECRET`, contraseñas ni tokens**. La cookie de sesión sigue httpOnly.
- `signOut` borra `identity` y las copias (`snapshots`). **La cola no se borra al cerrar sesión**: son ventas cobradas. Si hay ventas sin enviar, el botón de salir advierte "Hay N ventas sin enviar en este teléfono. Se enviarán cuando vuelvas a entrar".

## 5. Copia local para buscar sin internet

**Qué se guarda** (proyección cerrada, `OfflineSnapshot`):

```
{ locationId, generatedAt (ISO, reloj del servidor), variants: [
  { variantId, productId, barcode | null, sku, productTitle, variantTitle, size, price, available } ] }
```

- Solo la tienda pedida, solo variantes y productos activos (`isActive`, sin `mergedIntoId`) con fila `InventoryLevel` en esa tienda, **incluidas las de 0 piezas** (para decir "sin existencias" en lugar de "no encontrado").
- **No** se guarda: stock de la otra tienda, `minStock`, `Movement`, usuarios, historial de precios, fotos (sin `imageUrl`; el carrito sin internet no muestra foto), datos de clientes.
- Se busca por `barcode` y por `sku` normalizados con `normalizeCode`, igual que el servidor.
- **Alcance por tienda:** `getOfflineSnapshotAction(locationId)` usa `assertCanOperate`; colaborador y manager con tienda solo bajan la suya. Owner y manager sin tienda bajan la tienda elegida en el selector (y solo esa).
- **Frescura:** se pide al abrir `/pos` con conexión, cada 10 min con `/pos` abierto y conexión, al volver la conexión y después de cada sincronización con éxito. La pantalla muestra la edad ("Precios y existencias de hace 2 h").
- **Vigencia:** sin internet solo se vende con una copia de **≤ 24 h** (P1). Más vieja: "Conéctate para actualizar precios y existencias".
- **Límites:** máximo 20 000 variantes por tienda; si se pasa, la acción responde error y el POS sin internet queda deshabilitado con aviso (hoy son cientos; el límite protege la memoria del teléfono). Tamaño estimado: < 3 MB.
- **Stock local:** `disponible = snapshot.available − piezas de esa variante en ventas de la cola aún no enviadas de esa tienda`. Así un mismo teléfono no vende dos veces la última pieza. Al llegar una copia nueva, las ventas ya enviadas dejan de restarse (ya están en el servidor).

## 6. Cola de ventas y reutilización de `clientRequestId`

Registro `QueuedSale`:

```
{ clientRequestId, userId, locationId, channel, paymentMethod, customerAlias?,
  lines: [{ variantId, quantity, unitPrice, sku, productTitle, variantTitle }],
  total, soldAt (ISO, reloj del teléfono), snapshotAt (generatedAt de la copia usada),
  state: "pending" | "sending" | "synced" | "needs_attention",
  attempts, lastError?, saleNumber?, review?: boolean, syncedAt? }
```

- **El id nace en el borrador**: al cobrar sin internet se guarda `draft.requestIdFor(requestSignature)`, el mismo que se habría mandado en línea. El registro es **inmutable** una vez encolado (solo cambian `state`, `attempts`, `lastError`, `saleNumber`, `review`, `syncedAt`). Cada reintento manda exactamente la misma tienda, canal, método y renglones, así que `isSameSaleRequest` siempre coincide y el servidor responde **replay**, nunca duplica.
- Si el teléfono se cierra con un registro en `sending`, al reabrir se trata como `pending` y se reenvía con el mismo id (replay si ya entró).
- Antes de encolar se valida con `validateNewSale` (pura): alias sin teléfonos, precios válidos.
- Los `synced` se conservan 7 días como historial del cajero y luego se purgan. Los `needs_attention` se conservan hasta que owner o manager los descarte en ese teléfono (con confirmación).

## 7. Sincronización

- **Dónde corre:** en la página (`useOfflineSync`), no en el service worker. Las server actions necesitan el cliente de Next, y Background Sync no existe en iOS Safari. Mientras `/pos` esté abierto, se envía.
- **Disparadores:** evento `online`; carga de `/pos`; `visibilitychange` a visible; después de cada venta en línea con éxito; temporizador con espera creciente (15 s, 30 s, 60 s… hasta 5 min) mientras haya `pending`; botón "Enviar ahora".
- **Orden:** FIFO por `soldAt` dentro del teléfono, **una a la vez**. Entre teléfonos no hay orden global: la primera que llega toma la pieza y la siguiente queda en revisión. Se acepta y se documenta.
- **Exclusión:** `navigator.locks.request("loloshop-offline-sync", …)` evita dos pestañas sincronizando; sin Web Locks, una bandera en memoria. Aun así la idempotencia cubre el choque.
- **Resultado por respuesta** de `submitOfflineSaleAction`:

| Respuesta | Estado | Sigue con la siguiente |
|---|---|---|
| `ok` | `synced`, guarda `saleNumber` y `review` | sí |
| excepción de red, `UNAVAILABLE` | `pending`, `attempts+1` | no (espera) |
| `session_expired` | `pending` | no; aviso "Inicia sesión para enviar N ventas" |
| `INVALID`, `FORBIDDEN`, `NOT_FOUND`, `request_conflict` | `needs_attention` + `lastError` | sí |

- **Usuario:** solo se envían registros cuyo `userId` es el de la sesión actual; el servidor además pone `createdById` = usuario autenticado (no confía en el `userId` del cliente). Registros de otro usuario quedan en espera con aviso (P4).

## 8. Servidor: "aceptada con stock insuficiente"

### 8.1 Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| A. Permitir `available` negativo en ventas sin internet | Contabilidad literal | Rompe el invariante "nunca negativo" en toda la base; números negativos en `/productos`, catálogo y stock bajo; cualquier error futuro en línea queda oculto |
| B. Tabla aparte de ajustes pendientes | Separa conceptos | Tabla, relaciones y pantalla extra; dos fuentes de verdad para la misma venta |
| **C. Descontar solo lo que hay (hasta 0) y guardar el faltante en el renglón** | `available >= 0` se mantiene **siempre**; una columna por renglón; la venta queda completa para el dashboard | El total de `Movement` no explica el faltante: se explica en `SaleLine.shortfall` |

**Elegida: C.** Mantiene el invariante más fuerte posible (ningún camino deja stock negativo, ni en línea ni sin internet) y el camino en línea no cambia.

### 8.2 Migración (solo aditiva, una)

- `enum SaleOrigin { online offline }`, `enum SaleReviewStatus { pending approved rejected }`.
- `Sale`: `origin SaleOrigin @default(online)`, `soldAt DateTime?`, `offlineSnapshotAt DateTime?`, `reviewStatus SaleReviewStatus?` (null = no requiere), `reviewReasons String[] @default([])`, `reviewedById String?` (relación `SaleReviewedBy` a `User`, `onDelete: Restrict`), `reviewedAt DateTime?`, `reviewNote String? @db.VarChar(200)`, `@@index([reviewStatus, createdAt])`.
- `SaleLine`: `shortfall Int @default(0)`.
- `User`: relación inversa `salesReviewed`.
- Sin `DROP`, sin `RENAME`, sin cambio de tipos. Las filas existentes quedan `origin = online`, `reviewStatus = null`, `shortfall = 0`. Generada con `prisma migrate dev --create-only` en un worktree cuyo `.env` apunta al contenedor local (ruling de la bitácora: nunca en la copia principal, que tiene el `.env` de producción). Prueba en rama de Neon y respaldo restaurable antes de producción (frontera 5).

### 8.3 `createSale` en modo sin internet

`SalesDataSource.createSale(input, userId, opts?: { offline?: OfflineMeta; checkPrice?: boolean })`. Sin `opts` el comportamiento actual no cambia (regresión probada).

Con `offline` (`{ soldAt, snapshotAt }`), dentro de la misma transacción y orden de bloqueo:
1. Replay o conflicto por `clientRequestId`, igual que hoy (antes de todo).
2. Variante o producto inactivo: **se acepta** y suma la razón `inactive_product` (la prenda ya salió). Variante inexistente: `SalesRuleError` → `needs_attention`.
3. Por renglón, en orden de `variantId`: `SELECT "available" FROM "InventoryLevel" WHERE … FOR UPDATE` (`tx.$queryRaw`, bloquea la fila hasta el fin de la transacción) y luego `update` con `decrement: taken`; `taken = min(available, quantity)`, `shortfall = quantity − taken`. Sin fila `InventoryLevel`: `taken = 0`, `shortfall = quantity`. Si `shortfall > 0` suma la razón `insufficient_stock`.
4. `Movement SALE` con `delta = −taken` (solo si `taken > 0`): la suma de movimientos sigue cuadrando con `available`.
5. Precio: si `checkPrice` (la acción lo pone solo para colaborador) y `unitPrice` no es el precio actual ni un `oldPrice`/`newPrice` de `PriceChange` de esa variante en los últimos 7 días, suma `price_unverified`. **No se rechaza** (decisión 3).
6. Reloj: si `soldAt` está más de 5 min en el futuro o más de 7 días atrás, se usa la hora del servidor y suma `clock_skew`.
7. `businessDate = businessDateMx(soldAt)`; `createdAt` = hora del servidor; `origin = offline`.
8. `reviewStatus = pending` si hay alguna razón; si no, `null`.

`createSaleAction` y el camino en línea **no se tocan**: siguen con `UPDATE … WHERE available >= n` y `InsufficientStockError`.

### 8.4 Nueva acción `submitOfflineSaleAction(input)`

Misma sesión (`getCurrentUser`, relee de la BD), mismo alcance de tienda que `createSaleAction`, valida con `validateOfflineSale` (= `validateNewSale` + `soldAt` y `snapshotAt` ISO). **No** evalúa `PRICE_CHANGED`. Devuelve `{ ok: true, sale, review: boolean }` o el mismo `Failure` de hoy (sin `NO_STOCK`, que no puede ocurrir).

### 8.5 Abuso de la ruta sin internet

Un colaborador con sesión puede llamar `submitOfflineSaleAction` estando en línea para saltarse el chequeo estricto. **Severidad media.** Mitigación: toda venta con faltante, precio no verificado o reloj raro queda en revisión del dueño y visible; el stock nunca queda negativo; `createdById` siempre es el usuario autenticado. No hay ganancia oculta posible: el abuso deja rastro en la pantalla de revisión.

## 9. Pantalla del dueño: `/ventas/revision`

- **Solo owner** (decisión 1.2), verificado en cada acción con `getCurrentUser` (relee el rol; la acción mueve stock).
- Aviso en `/ventas` para el dueño: "N ventas sin internet por aprobar" con enlace.
- Lista (más vieja primero): folio, tienda, cajero (nombre), hora de venta (`soldAt`) y de llegada (`createdAt`), total, método, razones en palabras ("Faltó stock: 1 pieza de Playera M", "Precio distinto al registrado", "Prenda dada de baja", "Hora del teléfono incorrecta"), renglones con `quantity`, `shortfall` y precio.
- **Aprobar:** `reviewStatus = approved`, `reviewedById`, `reviewedAt`, nota opcional. **El stock no cambia**: ya está en 0 y el faltante queda registrado como "el sistema tenía menos piezas de las reales".
- **Rechazar:** motivo obligatorio (≤ 200) y "¿La prenda regresó a la tienda?". En una transacción: `reviewStatus = rejected` + anulación (`status = cancelled`, `cancelReason`). Si regresó, se reingresa por renglón **`quantity − returnedQuantity − shortfall`** (solo lo que sí se descontó) con `Movement RETURN`.
- `cancelSale` se corrige en general para devolver `quantity − returnedQuantity − shortfall`, y si la venta estaba `pending` en revisión la marca `rejected` (anularla es rechazarla).
- Condicional al estado (`updateMany … where reviewStatus = pending`): dos clics no aprueban y rechazan a la vez.
- Mientras esté pendiente, la venta **cuenta** en el dashboard (P3) con etiqueta "Por aprobar".

## 10. Lo que ve el cajero

- **Banda sin internet** (arriba, fija): "Sin internet. Las ventas se guardan en este teléfono y se envían solas al volver la conexión." + "Precios y existencias de hace X".
- **Contador** "N por enviar" siempre visible si hay cola; al tocarlo, hoja con cada venta: folio local `L-` + 8 primeros caracteres del id, total, hora, estado (Por enviar / Enviando / Enviada #123 / Enviada, por aprobar / Necesita atención: mensaje).
- **Al cobrar sin internet:** "Venta guardada sin internet (L-3f9a2c1b). Se enviará sola." El carrito se limpia; no hay bloqueo.
- **Al sincronizar:** "3 ventas enviadas (#120, #121, #122). 1 quedó por aprobar del dueño." Si alguna falla: aviso en rojo con "Avisa al dueño".
- **Lecturas sin internet:** igual que en línea, pero con la copia local. Código no encontrado: "No está en la copia de esta tienda. Si es nueva, se vende cuando vuelva la conexión."
- Owner y manager sin tienda: el selector de tienda queda fijo a la tienda de la copia mientras no haya conexión.

## 11. Relación con el bloqueo por cobro incierto

- **Regla:** un cobro cuya llamada falla **por red** (excepción en `catch`) **y** `navigator.onLine === false` se convierte en venta sin internet: se encola con **el mismo `clientRequestId`**, se limpia el carrito y no hay bloqueo. Es seguro: si la petición sí llegó, el envío posterior hace replay y la cola guarda ese folio.
- Con `navigator.onLine === true` y error de red (wifi sin salida, "lie-fi"), o con `UNAVAILABLE` (el servidor respondió), se mantiene el bloqueo actual. El panel del bloqueo suma un tercer botón, **"Guardar sin internet"**, que encola el carrito bloqueado con su id incierto. El botón solo aparece con `lock === "uncertain"`, nunca con `"conflict"`.
- Un `UNAVAILABLE` significa rollback en el servidor; si ese carrito pasa a la cola y luego falta stock, queda en revisión. Riesgo aceptado (el cliente ya está frente al cajero).
- `submittingRef` y `heldRef` siguen igual: encolar también es un "cobro en curso" breve y las lecturas en espera entran al terminar.

## 12. Sesión vencida sin internet

- Al confirmar sesión en línea se guarda `identity` con `confirmedAt`. Sin conexión, `/pos` usa esa identidad si `confirmedAt` tiene **≤ 12 h** (igual que el JWT; P1). Más vieja: "Conéctate e inicia sesión para seguir vendiendo".
- El servidor manda siempre: al sincronizar, si la cookie venció responde `session_expired`; la cola espera y el aviso pide iniciar sesión. Tras entrar **el mismo usuario**, se envía.
- Si el usuario cambió de tienda o lo dieron de baja mientras vendía sin internet, el envío responde `FORBIDDEN` → `needs_attention`; el dueño decide (no se reasigna sola a otra tienda).

## 13. Service worker

- `next-pwa` `runtimeCaching` agrega, **antes** de las reglas por omisión: navegación a `/pos` con `NetworkFirst`, `networkTimeoutSeconds: 4`, caché `pos-page`, `cacheableResponse: { statuses: [200] }` (para no guardar redirecciones a `/login` ni respuestas opacas) y `expiration: { maxEntries: 1 }`. El HTML no lleva datos del usuario (el componente es de cliente), así que guardarlo no filtra nada.
- Los `/_next/static/*` ya se precargan. La navegación interna a `/pos` sin red hace una petición RSC que falla y Next cae a navegación completa, que el SW resuelve: **se verifica en dispositivo**.
- No se cachean server actions (POST) ni `/api/*`.
- Si PR #17 (Serwist) se mezcla antes, la misma regla se escribe en `app/sw.ts` de Serwist; el criterio de aceptación no cambia.

## 14. Preguntas para el dueño (con valor por omisión)

| # | Pregunta | Por omisión recomendado |
|---|---|---|
| P1 | ¿Cuánto tiempo se puede vender sin internet? | 12 h desde la última sesión confirmada y copia de precios de ≤ 24 h |
| P2 | ¿Quién puede vender sin internet? | Los tres roles, cada uno en la tienda que ya puede |
| P3 | Las ventas por aprobar, ¿cuentan en el total vendido del dashboard? | Sí, con etiqueta "Por aprobar"; si se rechazan, salen |
| P4 | Si en el mismo teléfono entra otra persona, ¿se envían las ventas pendientes de la anterior? | No: esperan a su dueño; owner o manager pueden descartarlas en ese teléfono |
| P5 | ¿Se permite SPAY/transferencia sin internet? | Sí, nace "pago por confirmar" como hoy |
| P6 | ¿Qué teléfonos usan las tiendas? | Requisito: PWA instalada en pantalla de inicio (en iPhone es obligatorio para que no se borre la cola) |

## 15. Seguridad y privacidad

- Sin secretos en el cliente: la copia y la cola solo tienen ids, códigos, títulos, tallas, precios, piezas de una tienda y el alias opcional (ya validado sin teléfonos). Prueba que fija la lista de llaves permitidas de `OfflineSnapshot`.
- Alcance de tienda en servidor en las dos acciones nuevas (`assertCanOperate` / mismo `storeBound`).
- Rol del revisor releído de la BD (acción que mueve stock).
- Sin datos personales en URLs: `/ventas/revision` no lleva parámetros; las acciones reciben ids por cuerpo.
- Frontera de datos: la UI usa `getDataSource()` / `getSalesSource()`; nada de Prisma en componentes. Frontera de plataforma: IndexedDB y Web Locks viven en `lib/offline/` (cliente), sin depender de Vercel.

## 16. Pruebas

- **Unidad (`npm test`, jsdom):** `fake-indexeddb/auto` (dev) para `lib/offline/*`: cola, copia, identidad, stock local, motor de sincronización con acción falsa (orden FIFO, se detiene con `session_expired`, sigue con `needs_attention`, `sending` huérfano se reenvía con el mismo id, nunca cambia el id). Dominio puro: `validateOfflineSale`, `planOfflineLine`, `reviewReasons`. Acciones con mocks (sesión, alcance, owner-only). POS con Testing Library (`navigator.onLine` simulado).
- **Base (`npm run test:db`):** modo sin internet con stock suficiente, insuficiente, sin fila, último par entre dos ventas concurrentes, replay sin doble descuento, `available >= 0` tras cualquier secuencia, regresión estricta del camino en línea, aprobar, rechazar con y sin devolución, `cancelSale` con `shortfall`, `price_unverified`, `clock_skew`, contador del dashboard.
- **Service worker:** no se prueba en jsdom. Prueba de configuración (la regla `/pos` existe con `statuses: [200]`), `npm run build` y revisión de que `public/sw.js` generado contiene `pos-page`. Lista manual en Android Chrome y en iPhone con PWA instalada: modo avión, abrir `/pos`, vender, cerrar la app, volver la red, ver la venta en `/ventas`.
- Siempre: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:db`.

## 17. Criterios de aceptación

1. Con el teléfono en modo avión, `/pos` abre (si se abrió con red en las últimas 12 h), lee códigos y cobra.
2. Al volver la red, sin tocar nada, la venta aparece en `/ventas` con su folio en ≤ 30 s con `/pos` abierto.
3. Reintentos, cierres y dos pestañas nunca crean dos ventas con el mismo `clientRequestId`.
4. Ningún camino deja `InventoryLevel.available < 0`.
5. La venta en línea sin stock sigue respondiendo `NO_STOCK`.
6. Una venta sin internet sin stock suficiente se registra, descuenta hasta 0, y aparece en `/ventas/revision` solo para el dueño.
7. Rechazar con devolución reingresa solo lo descontado.
8. IndexedDB no contiene token, cookie ni secretos; la copia es solo de la tienda del usuario.
