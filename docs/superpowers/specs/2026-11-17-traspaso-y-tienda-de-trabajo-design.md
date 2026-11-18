# Traspaso entre tiendas y tienda de trabajo del colaborador — diseño

Issue: #39 · Fecha: 2026-11-17 · Estado: borrador para aprobación del dueño

## 1. Intención

Los colaboradores se mueven entre tiendas; a veces están en Lomas y en Club Alva el mismo día. Hoy la app los amarra a su tienda asignada en todo: alta, POS, ventas, dashboard y venta sin internet. Por eso unas altas hechas para Lomas quedaron en Club Alva y no hubo forma de corregirlas.

Queremos dos cosas:
1. **Tienda de trabajo:** el colaborador elige en qué tienda está al registrar y al vender, igual que el dueño.
2. **Traspaso:** mover piezas de una tienda a otra, con registro de quién lo hizo.

**Éxito:** un colaborador que pasa la mañana en Lomas y la tarde en Alva registra y vende en la tienda correcta cambiando un selector. Si algo quedó en la tienda equivocada, lo traspasa en segundos y las existencias cuadran en ambas.

## 2. Metas, no metas y antimetas

**Metas**
- El colaborador elige su tienda de trabajo en `/escanear` (alta y entradas) y en `/pos`.
- Traspaso de piezas de cualquier ubicación a cualquier otra, para colaborador, encargado y dueño.
- `/ventas` del colaborador: lo de hoy de la tienda que tenga elegida.

**No metas**
- Traspasos con estados intermedios ("en camino"), aprobación del dueño o envío entre ciudades.
- Traspasar una tanda completa de altas con un botón (decisión del dueño: se mueve prenda por prenda).
- Corregir hacia atrás los movimientos viejos; el traspaso es la corrección.

**Antimetas (sería un fracaso aunque funcione)**
- Que un traspaso deje stock negativo o mueva piezas solo de un lado (salida sin entrada).
- Que el colaborador vea más de lo debido: costos (futuro #41), ventas de otros días o la revisión de ventas sin internet.
- Que se rompa la venta sin internet: la copia y la firma siguen siendo por usuario y por tienda.

## 3. Decisiones del dueño

| # | Pregunta | Decisión |
|---|----------|----------|
| D1 | ¿Quién traspasa y entre qué tiendas? | Colaborador, encargado y dueño, entre **cualquier** tienda. |
| D2 | ¿Se traspasa por tanda o por prenda? | Prenda por prenda: escanear, piezas, origen y destino. |
| D3 | ¿El colaborador queda amarrado a una tienda? | No. Se mueve entre tiendas y elige en cuál está, al registrar y al vender. |
| D4 | ¿Qué ve el colaborador en `/ventas`? | Lo de hoy de la tienda que tenga elegida. |
| D5 | ¿El encargado con tienda asignada también queda libre? | Sí, igual que el colaborador. |
| D6 | ¿Copias sin internet de todas las tiendas? | No hace falta: las dos tiendas tienen internet. La venta sin red es una capacidad extra; se queda como está (copia de la tienda elegida). |

## 4. Enfoques considerados

- **A. Colaborador sin tienda fija (elegido).** Elige tienda en alta y POS, como el dueño, y puede traspasar entre cualquier tienda. Coincide con D1 y D3. Cuesta tocar todos los puntos donde hoy se aplica "solo tu tienda".
- **B. Colaborador con tienda asignada que solo cambia al registrar.** Es menos trabajo, pero no puede vender en la otra tienda aunque esté ahí; contradice D3.
- **C. Solo traspaso, sin selector.** No evita que se repita el error de ayer; descartado.

## 5. Diseño

### 5.1 Permisos (servidor, la fuente de verdad)

Hoy `isStoreBound(user)` es verdadero para un colaborador, y para un encargado con tienda; `assertCanOperate` rechaza cualquier tienda que no sea la asignada.

Nuevo comportamiento:
- **Colaborador y encargado pueden operar en cualquier ubicación existente.** Así lo decidió el dueño (D3, D5). `isStoreBound` deja de amarrarlos; si ya no se usa en ningún lado, se elimina.
- `assertCanOperate(user, locationId)` sigue existiendo, pero solo verifica que haya sesión y que la ubicación exista. Puede lanzar `StockTargetNotFoundError`, como hoy, o un `ForbiddenError` "No encontramos esa tienda".
- Ya no se rechaza a un colaborador sin tienda asignada: elige una. *Mi decisión.*
- Lo que sigue restringido por rol **no cambia**: precios (las reglas actuales del colaborador), anular ventas, aprobar ventas sin internet, crear tiendas, costos y el rango de fechas del dashboard.

Puntos que hoy aplican "solo tu tienda" y se ajustan:

| Lugar | Hoy | Después |
|-------|-----|---------|
| `lib/auth/permissions.ts` `isStoreBound` / `assertCanOperate` | amarra al colaborador y al encargado con tienda | sin amarre; valida que exista la ubicación |
| `lib/sales/actions.ts` (`storeBound`) | "Solo puedes vender en tu tienda." | se quita; la ubicación de la venta se valida con `assertCanOperate` |
| `lib/sales/offline-actions.ts` | rechaza la venta si la tienda no es la asignada | igual que en línea; el token de la copia ya ata usuario y tienda |
| `lib/domain/dashboard-scope.ts` | colaborador: hoy, su tienda asignada | colaborador: hoy, **la tienda pedida** (D4); sin tienda pedida, ninguna. `/ventas` la manda en la consulta (parámetro `location`) y el servidor la valida como ubicación existente. *Mi decisión.* |
| `lib/domain/inventory-scope.ts` | colaborador: solo filas de su tienda | colaborador ve las existencias de **todas** las ubicaciones; las necesita para traspasar. *Mi decisión.* |
| `app/escanear/page.tsx`, `app/pos/page.tsx`, `app/ventas/page.tsx`, `components/products/ProductAdminSheet.tsx` | selector solo para dueño o encargado sin tienda | selector para todos los roles |

### 5.2 Tienda de trabajo (cliente)

- Un solo selector de tienda, compartido por `/escanear`, `/pos` y `/ventas`. Se guarda en `sessionStorage` (hoy `/pos` usa `loloshop:pos:location`) y se mueve a una clave común `loloshop:work-location`.
- **Preselección:** la última tienda elegida en la sesión. Si no hay, la tienda asignada al usuario (`User.locationId`, que ahora significa "tienda de siempre"). Si tampoco hay, se le pide elegir.
- La tienda elegida se ve siempre en la cabecera de esas pantallas ("Estás en: Lomas"), para que el error de ayer sea visible antes de registrar.
- **Sin internet (D6):** el alcance no cambia. Con red, el teléfono baja la copia de la tienda elegida, como hoy. Sin red, el selector se bloquea en la tienda de la copia, como hoy le pasa al dueño (T9). La copia, la identidad y el token ya son por usuario y por tienda, así que no cambia el formato de IndexedDB. Solo hay que comprobar que la copia ya no dependa de `User.locationId`.

### 5.3 Traspaso

**Pantalla.** En `/escanear`, al encontrar una prenda, aparece la acción "Traspasar" junto a "Sumar piezas". También aparece en la hoja de producto de `/productos`, por talla.

```
Traspasar  Playera Guess negro · M
De:     [Club Alva ▾]   (hay 3)
A:      [Lomas ▾]
Piezas: [ 1 ] [+][−]
Motivo (opcional): [______________]
           [ Traspasar 1 pieza ]
```

- **Origen:** de forma predeterminada, la tienda de trabajo. Solo se listan ubicaciones con existencias de esa talla.
- **Destino:** cualquier otra ubicación; no puede ser igual al origen.
- **Piezas:** de 1 hasta lo que haya en el origen, con tope `MAX_STOCK_QUANTITY` (200).
- **Motivo:** opcional, con las reglas de `validateReason` (3 a 120 caracteres, sin teléfonos). *Mi decisión:* opcional, para que traspasar sea rápido.
- **Al terminar:** "Traspasadas 2 piezas de Club Alva a Lomas. Ahora: Club Alva 1 · Lomas 2."

**Servidor.** Nueva acción `transferStockAction({ variantId, fromLocationId, toLocationId, quantity, reason?, requestId })`, que nunca lanza: devuelve `{ ok, … }` como `recordStockMovementAction`.
- Relee al usuario con `getCurrentUser()` y valida ambas ubicaciones con `assertCanOperate`.
- Valida `from !== to`, la cantidad y el motivo en `lib/domain/stock-movement.ts`: nuevo `validateTransfer`.
- Nuevo método del data source `transferStock(data)`, en **una transacción**:
  1. Idempotencia: si ya existe un `Movement` con `requestId = "<requestId>:out"`, es un replay; devuelve las existencias actuales de ambas ubicaciones.
  2. Crea `Movement` de salida: `type TRANSFER`, `delta −n`, ubicación origen, `requestId "<id>:out"`, notas "A <destino>: <motivo>".
  3. Resta en el origen con `UPDATE … WHERE available >= n`. Si no alcanza, lanza `InsufficientStockError` y la transacción revierte todo.
  4. Crea `Movement` de entrada: `type TRANSFER`, `delta +n`, ubicación destino, `requestId "<id>:in"`, notas "De <origen>: <motivo>".
  5. Suma en el destino con upsert del `InventoryLevel`.
  - Orden de bloqueo: el `Movement :out` serializa los reintentos (mismo patrón que `recordStockMovement`).
- Errores al usuario: "Solo hay N en <origen>." / "Elige otra tienda de destino." / "No encontramos la prenda o la tienda." / el texto de tiempo agotado que ya existe.
- `revalidatePath("/catalogo")` y `revalidatePath("/productos")`.

**Sin migración.** `MovementType.TRANSFER` ya existe y el par se liga por el `requestId` con sufijo.

**Historial.** Los movimientos ya muestran el tipo "Traspaso" (`lib/domain/types.ts`); no hace falta pantalla nueva.

**Sin internet.** El traspaso necesita conexión. Sin red, el botón queda deshabilitado con "Conéctate para traspasar".

### 5.4 Textos al usuario (español, sin emojis)

- Cabecera: "Estás en: {tienda}" · selector "Cambiar tienda".
- Sin tienda elegida: "Elige en qué tienda estás."
- Traspaso: los de §5.3.

## 6. Restricciones

- Ningún camino deja `InventoryLevel.available < 0`; la salida y la entrada van en la misma transacción.
- La venta en línea no cambia de comportamiento, salvo que se quita la restricción de tienda.
- Repo público: sin secretos. Sin migraciones; si alguna resultara necesaria, solo `migrate dev --create-only` en un worktree con base local.
- Pruebas: dominio (`validateTransfer`), base de datos (`transferStock`: éxito, faltante, replay, concurrencia sobre la última pieza, origen igual a destino), acciones (roles y ubicación inexistente) y UI (selector en las tres pantallas, preselección, bloqueo sin red y traspaso).

## 7. Lo que decide quien construye

- El componente del selector compartido y su ubicación.
- Cómo se muestra "Traspasar" en la hoja de producto en móvil.
- Si conviene un hook `useWorkLocation()` para `sessionStorage` + preselección.

## 8. Preguntas abiertas

Ninguna para el dueño en este momento.
