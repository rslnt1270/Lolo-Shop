# alta-tallas: alta de producto con varias tallas

- **Stitch:** proyecto `12014089549413909070`, pantalla `02f186e1b8e545e6911009638da20697` (edición de `0a5511d075a540b89d635c6044f7233d`).
- **Tarea del plan:** 1.5 (`NewProductForm`, `SizeRows`, `ExistingProductSearch`). Spec v2 §4.1, punto 1.5.

## Estados que cubre
1. Código nuevo: primero la tarjeta "¿Es otra talla de un producto ya registrado?", con búsqueda y resultados (foto de frente y tallas existentes).
2. Producto nuevo en modo **Catálogo**: datos, fotos de frente y de atrás obligatorias y la sección **Tallas** con 3 filas.
3. Error por fila: código ya registrado (DUPLICATE con `duplicateBarcode`).
4. Fila con "Sin código".

## Jerarquía (respetar)
1. La pregunta y la búsqueda van **antes** del formulario. Mientras no se elija "No, es un producto nuevo" o un resultado, el formulario no se muestra (en el mockup se ven ambos para documentar los dos pasos).
2. Tipo de alta (Solo stock / Catálogo) → Título, Marca, Departamento, Categoría → Fotos (solo en Catálogo) → Tallas → "Guardar producto" fijo abajo.
3. Cada fila de talla: Talla, Código (escaneado o "Sin código"), Precio, Piezas (stepper), quitar fila.

## Textos exactos
- "¿Es otra talla de un producto ya registrado?"
- "Busca por título, marca o código público"
- "No, es un producto nuevo"
- "Foto de frente" / "Foto de atrás" / "Obligatoria"
- "Tallas" · "Agregar otra talla" · ayuda: "Abre el escáner y copia el precio de la talla anterior."
- Error de fila: "Este código ya está registrado en {título}." (texto e icono en #9A3B2E, nunca solo color)
- "Guardar producto"

## Diferencias con el spec y avisos
- Stitch agregó "3 asignadas" junto a "Tallas" y "2 requeridas" en Fotos: opcionales, no son parte del spec.
- Al tocar un resultado (botón +) se abre `agregar-talla`; no agrega directo.
- "Agregar otra talla" debe **reabrir el escáner** y copiar el precio de la fila anterior; el mockup solo muestra el botón.
- En "Solo stock" se ocultan las fotos; el resto igual.
- Límite 1 a 12 tallas: al llegar a 12, deshabilitar "Agregar otra talla" (borde #7F9392 y texto #5C6E6D, no solo opacidad).
- Las fotos son del producto, no de la talla.
- Los objetivos táctiles de las filas miden 44 px; mantener inputs a 16 px.
