# /catalogo — cuadrícula pública (móvil 390 px)

Stitch: `d62e07d1caa74ea7bf8486b9508e73d3`.

## Componentes
- Encabezado 56 px: icono + "LoloShop" (18 px 800 tinta) · enlace "Favoritos" con corazón `turquesa-texto` y contador (círculo `turquesa`, texto tinta 11 px 800).
- "Catálogo" 32 px 800 `turquesa-titular`; "Solo prendas con existencias en tienda."
- Departamentos (tira horizontal sin barra): "Todo" activo (`turquesa`/tinta), "Mujer", "Hombre", "Niños", "Calzado" (contorno 2 px `turquesa-texto`).
- Cuadrícula 2 columnas, separación 12; tarjeta blanca borde #E1E9E9 radio 16, padding 10: foto 3:4 `niebla`, "Marca ejemplo" 13 px #5C6E6D, nombre 15 px 600, precio 16 px 700 `turquesa-texto`, tallas mono 12 px (sin existencias: tachada en #7F9392), **"Guardar en favoritos"** primario 44 px con corazón y **"Ver prenda"** contorno 44 px apilados. Estado guardado: corazón relleno + "En favoritos".
- Pie: "Precios y existencias pueden cambiar."

## Desviaciones (manda el spec)
- Chips de departamento 36 px (`h-9`): subir a 44.
- "Guardar en favoritos" se parte en 2 líneas a 390 px con el icono descolgado: usar texto 13 px con `whitespace-nowrap` y gap 6, o reducir a "Guardar" + `aria-label="Guardar en favoritos"`. El spec pide el texto completo: preferir icono arriba/izquierda alineado con `inline-flex` y `text-balance`.
- Bloque "Inventario sincronizado · Actualizado hoy directo en piso de venta" y pie "LoloShop México · Boutique PWA": inventados, quitar.
- Los códigos EJ-00x dentro de la foto son relleno de Stitch; no mostrar códigos en el sitio público.
- Sin WhatsApp ni carrito: correcto (spec §5, pendiente de confirmar con el dueño).
