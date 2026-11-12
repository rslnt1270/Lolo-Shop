# /favoritos — favoritos locales (móvil 390 px)

Stitch: `6cf537f73a9741868fe25e6327924cd5`.

## Componentes
- Encabezado: "‹ Catálogo" (`turquesa-texto`) · "LoloShop".
- "Favoritos" 32 px 800 `turquesa-titular`.
- Aviso `niebla`: "Tus favoritos se guardan solo en este navegador. Si lo borras o usas otro dispositivo, la lista se pierde. No pedimos cuenta ni datos."
- Tarjeta horizontal `niebla`: foto 96×96, "Marca ejemplo", nombre 16 px 700, precio mono `turquesa-texto`, tallas mono; abajo "Ver prenda" (contorno, flex-1) y "Quitar" (`danger`).
- "Ya no disponible": tarjeta al 75 %, foto en escala de grises, etiqueta con icono + texto `agotado`, solo "Quitar" a todo el ancho.
- Estado vacío: borde punteado, corazón, "Aún no guardas prendas", "Ir al catálogo" (primario).

## Desviaciones (manda el spec)
- Botones ~32 px (`py-1.5`, texto 12 px): subir a 44.
- Tarjeta "Ya no disponible" con `opacity-75` afecta al texto `agotado` y al botón: atenuar solo la foto.
- Fotos generadas por Stitch: en código, la foto pública o `niebla`.
- Texto extra en vacío "Explora el catálogo y guarda tus piezas favoritas para consultarlas aquí." (inventado; aceptable si el dueño lo aprueba).
- Falta el estado "almacenamiento no disponible": corazón deshabilitado con texto explicativo (spec §6).
- "LoloShop" en `turquesa-texto` 18 px: usar tinta (el turquesa-texto es para enlaces).
