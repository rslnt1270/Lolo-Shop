# /ventas — panel de ventas (móvil 390 px)

Stitch: `f65d4aa1346b408d9c148c0302ff686f`.

**Ajuste manual en `screen.html` (el PNG no lo refleja):** Stitch inventó cifras con apariencia real ($24,850, 42 ventas, +12 %, folios V-0492…). Se reemplazaron por `$000`, `0`, `V-0000` y "Almacén ejemplo"/"Marca ejemplo 2". **El PNG aún muestra esas cifras: no son datos reales.**

## Componentes
- Título "Ventas" 32 px 800 `turquesa-titular`; "Todas las tiendas" #5C6E6D.
- Chips de rango: "Hoy" activo (relleno `turquesa`, tinta), "7 días", "30 días", "Mes".
- "Vendido": tarjeta ancha `niebla` con barra izquierda 4 px `turquesa`, cifra mono 30 px tinta.
- "Cobrado" y "Ventas" en dos medias tarjetas.
- "Vendido por día": 7 barras `turquesa` sobre pista `turquesa/20`, etiquetas mono 10 px.
- Desgloses "Por tienda", "Por canal", "Por método de pago", "Por marca": fila etiqueta + importe mono + barra de proporción 6 px `turquesa`.
- "Ventas recientes": folio mono, hora, importe `turquesa-texto`, contorno "Ver".
- "Poco stock": "Playera ejemplo · M" + "Quedan 1" en `agotado`.

## Desviaciones (manda el spec / el código)
- Chips inactivos con fondo `niebla` y borde 1 px gris: el plan B Task 6 pide `bg-white text-turquesa-texto border-turquesa-texto` (2 px), 44 px.
- "Ver" mide ~28 px: subir a 44.
- Canal "Mostrador" no existe: `CHANNEL_LABEL` = "Tienda" / "WhatsApp". Métodos: "Efectivo", "Tarjeta", "Transferencia SPAY".
- Barra superior "LoloShop" + "Ayuda": inventada; usar el encabezado actual de `/ventas`.
- "Cobrado" en `turquesa-texto`: usar tinta (el color de enlace no es para cifras neutras).
- "Ver todas" y comparativo con ayer no existen en el código.
