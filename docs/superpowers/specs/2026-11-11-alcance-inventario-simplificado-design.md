# Alcance simplificado de inventario (2026-11-11)

**Estado:** decisiones del solicitante del 2026-11-11. Pendiente de confirmar con el dueño, porque quita módulos que estaban en la spec v2.
**Relacionado:** `2026-11-11-alta-producto-tienda-design.md`, `2026-11-11-paleta-botones-catalogo-design.md`, `2026-11-09-loloshop-implementaciones-posteriores-design.md`.

## 1. Qué queda

- **Registro de stock nuevo:** alta de prendas y entradas de piezas en la tienda que registra.
- **Ventas:** registro en `/pos` y `/ventas`. Cada venta resta sus piezas del stock.
- **Dashboard de ventas** (`/ventas`).
- **Escáner rápido para ventas:** la persona puede escanear varias prendas seguidas antes de cobrar.
- **Agregar fotos** desde la ficha del producto (buscando el producto en `/productos`). No hay acceso directo desde la lista.

## 2. Qué se quita

- **Pantalla de movimientos** (`/movimientos`, tarea 1.9). Sobra. El historial queda en la base para auditoría, pero no hay pantalla para consultarlo.
- **Correcciones de stock.** Si hay una devolución, es poco frecuente. La persona avisa al dueño y el dueño la resuelve.
- **Mermas.** No aplican.
- **Traspasos entre tiendas** (tarea 1.8). No aplican.

## 3. Lo que cambia para el dueño

- Ya no ve historial de movimientos ni traspasos en la app.
- Para una devolución, recibe un aviso por WhatsApp del colaborador (decidido, ver §5).

## 4. Supuestos míos (marcados para revisión)

- **`Movement` se conserva en la base.** La venta y la entrada de stock siguen escribiéndolo para que el dashboard y la auditoría funcionen. Solo se quita la pantalla.
- **Traspasos fuera de la app.** Si una prenda hace falta en otra tienda, se resuelve con el dueño fuera del sistema. Esto deja de mostrar en la app el stock de la otra tienda a quien no es dueño.
- **Tareas afectadas en el plan v2:** 1.8 (traspasos) y 1.9 (historial) quedan canceladas. 1.13 (conteo físico) sigue en backlog.

## 5. Decisiones del 2026-11-11 (segunda ronda)

- **Devoluciones:** solo un aviso por WhatsApp del colaborador al dueño. No hay módulo ni pendientes en la app.
- **Volver a dar de alta una prenda vendida:** el escáner detecta que el código existe y que ya se vendió. Muestra la opción **"Agregar nuevamente"**, que suma piezas al producto existente (no crea un producto nuevo, porque el código es único).
- **Escaneo de varias prendas en una venta** (agregado a alcance, fuera del spec v2): el objetivo es escanear prendas seguidas sin reiniciar la cámara ni esperar entre una y otra, y cobrar una sola vez.

### 5.1 Diagnóstico del escáner actual (`app/pos/page.tsx`)

- Cada lectura incrementa `scannerKey` y **vuelve a montar el escáner**, así que la cámara se reinicia.
- Cada código hace una consulta al servidor (`lookupCodeAction`) antes de quedar listo para el siguiente.
- El carrito ya admite varias líneas; lo lento es la captura, no el cobro.

### 5.2 Requisitos para el escaneo rápido (propuesta)

- La cámara queda abierta durante toda la venta. No se remonta entre lecturas.
- Cada lectura agrega la pieza al carrito de inmediato y muestra confirmación breve (nombre, talla, precio).
- **Cámara encendida durante toda la venta (aprobado).**
- **Mismo código dos veces:** el carrito ya agrupa la misma variante y suma la cantidad (`lib/sales/use-sale-draft.ts`). Se muestra "×2" con controles para bajar, quitar la línea o eliminarla. Aprobado.
- **Existencias por talla:** cada variante es una talla. Al escanear se valida el stock de esa talla en la tienda; si no hay, avisa "Sin existencias de la talla M en esta tienda". El servidor vuelve a validar al cobrar (ya existe el `StockError`).
- **Sin antirrebote** (se quita la propuesta anterior): el control para quitar la línea reemplaza esa regla.
- Consulta al servidor en segundo plano, con el carrito ya visible. Si falla, la línea queda marcada para reintentar; no se pierde.
- El cobro sigue siendo único y conserva `clientRequestId` (idempotencia de ventas, sin cambios).

### 5.3 Riesgo en producción

Las ventas ya están en producción. Este cambio toca el flujo de cobro, así que va en rama aparte, con pruebas de la capa de base (`npm run test:db`) y preview de Vercel antes de mezclar. No se despliega directo a producción.

## 6. Pendientes

1. **Dueño:** confirmar que `/movimientos` y los traspasos salen del alcance.
2. **Escáner de ventas:** confirmar el comportamiento de "mismo código dos veces" (§5.2).
3. **Agregar nuevamente:** revisar el texto y el flujo en `/escanear` con una prenda vendida.
4. **Agregar fotos desde la ficha:** aplicar la misma guía de fondo blanco del alta.
