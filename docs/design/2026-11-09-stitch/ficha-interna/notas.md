# ficha-interna: ficha de staff (owner y manager)

- **Stitch:** pantalla `dfe2e71ad00b40b39a9adb505d1b23a5` (edición de `6ba4d9fee6284a6a87930df46c99c953`).
- **Tarea del plan:** 1.7 (`updateVariantPriceAction`, `updateProductAction`, `setProductActiveAction`, `setVariantActiveAction`).

## Estados que cubre
- Datos editables (título, marca, departamento, categoría) con "Guardar cambios".
- Precio por talla con "Guardar precio", motivo opcional y "Desactivar talla".
- CONFLICT en una talla (otra persona cambió el precio).
- Historial: últimas 5 entradas.
- Stock por tienda, solo lectura (Lomas, ClubAlva, Almacén).
- "Desactivar producto" y su confirmación.

## Jerarquía
Fotos y código público → Datos → Precio por talla → Historial de precios → Stock por tienda → Desactivar producto.

## Textos exactos
- "Guardar precio" · "Motivo (opcional)" · "Desactivar talla"
- Historial, una línea por entrada: "$899 → $799 · Lolo · 10 nov 18:20" (formato; en el mockup todo es $000)
- CONFLICT: "Alguien cambió este precio. Precio vigente: $X. Revisa y guarda de nuevo."
- "Solo lectura. Para mover piezas usa Entrada o Traspasar."
- "Desactivar producto" → "¿Desactivar {título}?" / "Deja de verse en el catálogo y no se puede vender. El historial se conserva y puedes reactivarlo." / "Cancelar" / "Sí, desactivar"

## Diferencias y avisos
- La hoja de confirmación aparece abierta en el mockup para documentarla; empieza cerrada.
- El colaborador **no ve** esta ficha con controles (el servidor también lo rechaza).
- Stitch agregó un chip "Activo"; si el producto está inactivo, mostrar "Reactivar producto" en lugar de "Desactivar producto".
- Ajustes locales al HTML exportado: opciones de marca con nombres reales → "Marca ejemplo 2/3"; stock de Almacén → 0. El PNG puede mostrar valores distintos en esa tabla; manda el HTML.
- Errores de precio del servidor: INVALID (igual al vigente, > 2 decimales) en #9A3B2E bajo el campo.
- El precio es único para las dos tiendas. Sin edición masiva.
- "Asignar departamento" en lote vive en la lista de `/productos`, no en esta ficha (no se diseñó aquí).
- "Desactivar talla" es un enlace de texto chico en el HTML: darle 44 px de alto.
