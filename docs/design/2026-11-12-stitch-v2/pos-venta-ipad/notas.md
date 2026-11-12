# /pos — venta rápida (iPad vertical 820 px)

Stitch: `badece0386dd428e8fc0e77f52c2424e`. Lienzo de Stitch a 2560 px con la columna de 820 px al centro (el PNG es ancho).

## Componentes
- Barra superior 64 px, **solo iconos**: wordmark "LoloShop" · 7 botones 48×48 (Inicio, Vender activo con relleno `turquesa` + icono tinta, Escanear, Etiquetas, Productos, Ventas, Salir) con `aria-label`/`title` · chip "Tienda ejemplo ▾". Sin navegación inferior.
- Dos columnas: izquierda 380 px (visor 4:3, "Escribir código" + pausa 48 px, aviso ok, lecturas en espera); derecha 1fr (carrito "Venta", líneas, total).
- Barra fija inferior a todo el ancho: chips de pago 48 px a la izquierda; "Cobrar $000" 56×360 px a la derecha.

## Reglas
- Grid `grid-cols-[380px_1fr] gap-4`, padding 16. Barra inferior con `pb-[calc(12px+env(safe-area-inset-bottom))]`.
- Botones de icono 48×48 (≥ 44).

## Desviaciones (manda el spec)
- Falta el banner de carrito bloqueado (sí está en la versión móvil): incluirlo arriba del carrito.
- Inventado, no implementar: badge "POS · PORTRAIT", "AUTO-FOCUS ON / FPS: 60 · 1080p", "SKU: PL-M-01", "Precios y promociones automáticas · IVA 16%", subtotal/descuentos/IVA, "Limpiar carrito", "Lectura de código verificada en inventario local", "QUEUE".
- Iconos del visor y del código en `#22B8B8` como color de texto/icono sobre fondo oscuro: decorativo, aceptable solo dentro del visor; fuera del visor el turquesa nunca es texto.
- "Salir" en rojo `agotado`: el spec no lo pide; usar tinta como los demás.
