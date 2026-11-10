# agregar-talla: sumar una talla a un producto existente

- **Stitch:** pantalla `16b1143464df4b76af86e4ebe8f58737` (edición de `f8463edf4ef84a90acc2d7ac2d8db341`).
- **Tarea del plan:** 1.5 (`AddSizeForm`, `addVariantAction`).

## Estados que cubre
- Producto elegido en la búsqueda (foto de frente, marca, título, código público, tallas registradas).
- Código escaneado que se usará para la talla nueva.
- Aviso (ámbar): misma talla con otro código → se permite.
- Error (#9A3B2E): misma talla sin código → INVALID.

## Jerarquía
Resumen del producto → "Código escaneado" → Talla → Precio → Piezas → "Agregar talla" (primario) y "Cancelar".

## Textos exactos
- "Tallas registradas:" · "Cambiar producto" · "Código escaneado"
- Aviso: "Ya existe la talla {talla} con otro código. Se guardará como otra etiqueta de la misma talla."
- Error del servidor: "Esa talla ya existe: suma piezas con Entrada"
- Botones: "Agregar talla", "Cancelar"

## Diferencias y avisos
- El aviso y el error son **excluyentes**: el mockup los muestra juntos solo como catálogo de estados.
- "Cambiar producto" mide 32 px en el HTML de Stitch: subirlo a 44 px.
- La etiqueta del precio dice "Precio de venta" y lleva sufijo "MXN": aceptable; el campo se llama Precio en el spec.
- El colaborador sí fija el precio de una talla **nueva** (spec 1.5, riesgos).
- Errores FORBIDDEN (otra tienda) e INVALID (producto inactivo o unido) se muestran en el mismo bloque de error.
