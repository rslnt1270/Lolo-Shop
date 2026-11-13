# /escanear — alta de producto (móvil 390 px)

Stitch: `d25e8876baf140319b7f193c95c72341` (generado con Gemini Flash-Lite tras 3 tiempos de espera agotados con el modelo por defecto; puede haber pantallas huérfanas de esos intentos en el proyecto).

## Orden y componentes
1. Barra superior: flecha atrás · "Nuevo producto" · chip "Registrando en: Tienda ejemplo".
2. Tarjeta `niebla`: "Código escaneado" (12 px mayúsculas) + mono "EJ-0000".
3. **Decisión de catálogo primero**: "¿Va al catálogo?" con dos tarjetas en 2 columnas: "Solo stock" / "Sin fotos, solo piezas" y "Para catálogo" / "Fotos de frente y atrás". Seleccionada = relleno `turquesa`, texto tinta, check arriba a la derecha.
4. "Fotos" (solo si "Para catálogo"): dos ranuras 160 px de alto: "Frente" con foto y barra inferior con botón contorno "Reemplazar"; "Atrás" con borde punteado, icono cámara y "Tomar foto (Atrás)". Ayuda: "Toma la foto donde estés; no necesitas fondo blanco."
5. Campos: "Nombre" (placeholder "Ej. Playera ejemplo"), "Descripción" (textarea 2 filas), "Tipo" + "Color" en 2 columnas, "Marca" con ayuda "Elige de la lista o escribe uno nuevo".
6. "Tallas y piezas": fila por talla (chip mono, precio "$000" mono, stepper) + contorno "+ Agregar otra talla".
7. Barra fija sobre la navegación: "Guardar producto" (primario, ancho completo).
8. Navegación de 7, Escanear activo.

## Reglas
- Inputs 16 px de texto, alto ≥ 48; etiquetas 12 px 700 #5C6E6D.
- La decisión de catálogo debe estar visible sin desplazar en 360×640.
- "Solo stock" oculta la sección Fotos (no la deshabilita).

## Desviaciones (manda el spec)
- Stepper y precio de talla usan `py-1` (≈ 32 px): subir a 44 px (botones `h-11 w-11`).
- Botón "Reemplazar" con borde 1 px y texto 12 px: usar `Button variant="outline"` (≥ 44 px).
- Título "Nuevo producto" en `text-primary` (#006A6A): usar tinta (20 px); `#006A6A` no es token.
- Barra de guardar usa `backdrop-blur-sm`: el sistema es plano; fondo blanco sólido con borde superior.
- Foto de "Frente" es una imagen generada por Stitch (lh3.googleusercontent): en código, la foto real del usuario o `niebla`.
- Botón de navegación activo con fondo `primary-container` y texto `on-primary-container` (#004343): usar `turquesa` + tinta para el icono y etiqueta `turquesa-texto`.
- Descripción con placeholder "Detalles del producto, materiales o estilo..." (inventado); el código usa "Ej. Algodón, corte regular, color azul marino". Mantener el del código.
- Falta la ayuda de "Prenda sin código" y el estado "Guardando…"/"Procesando foto…" del botón (existen en `NewProductForm.tsx`).
