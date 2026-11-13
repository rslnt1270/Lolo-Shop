# /pos — venta rápida (móvil 390 px)

Stitch: pantalla `9188a94d5d5641a29f0a5c7525bfa6f0` (sistema `assets/13758965080546281388`).

## Componentes (de arriba abajo)
1. Barra superior 56 px: icono + "Vender" (20 px, 700, tinta) · chip "Tienda ejemplo ▾" (píldora, borde #E1E9E9).
2. Visor de cámara: 220 px de alto, radio 16, fondo oscuro; esquinas y línea de escaneo en `turquesa`; píldora "Cámara abierta · escaneo continuo" con punto `ok` pulsante.
3. Fila bajo cámara: botón contorno "Escribir código" (alto 44, flex-1) + botón cuadrado 44×44 de pausa.
4. Aviso ok: fondo verde muy claro, texto `ok`, icono check: "Agregado: Playera ejemplo (M) · ×2".
5. Lecturas en espera: `#FEF8E7` / texto `#8A5D00`: "2 lecturas en espera" + "Entran al carrito cuando termine el cobro."
6. Carrito bloqueado: fondo blanco, borde 2 px `agotado`, icono `agotado`, texto tinta: "No sabemos si la venta se registró. Reintenta el cobro o verifica en Ventas." + botón "Ya revisé en Ventas: empezar otra venta".
7. "Venta" + contador; línea en tarjeta `niebla` radio 16: miniatura 48, nombre, chip mono "Talla M", "×2" en `turquesa-texto`, "Quedan 3 en M en esta tienda" (12 px, #5C6E6D), precio mono `turquesa-texto`, "Quitar" texto `agotado`, stepper 44 px.
8. Total: "Total" + "$000" mono 24 px 900.
9. Barra fija sobre la navegación: chips de pago (Efectivo activo = relleno turquesa/tinta; Tarjeta, Transferencia = contorno) + botón "Cobrar $000" 56 px, radio 12, relleno turquesa, texto tinta 800.
10. Navegación inferior de 7 (64 px + safe-area).

## Reglas de tamaño y espacio
- Margen lateral 16, separación 12 entre bloques, tarjetas radio 16, botones radio 12.
- Stepper: botones 44×44; el visor no baja de 200 px en 360 px de ancho.
- Barra de cobro: `bottom = alto nav (64) + env(safe-area-inset-bottom)`; contenido con `padding-bottom` ≥ alto barra + nav.

## Desviaciones (manda el spec / el código)
- Chips de pago miden 40 px (`h-10`): subir a 44 (`min-h-11`).
- Botón de carrito bloqueado usa borde 1 px rojo y texto 12 px: en el spec es contorno (`Button variant="outline"`), y la confirmación "Sí, empezar otra venta" (primario) + "Cancelar" (contorno) ya existe en `app/pos/page.tsx`. Mantener el código.
- "Quitar" es texto rojo sin borde: según spec es `danger` (contorno `agotado`) con confirmación en pantalla.
- Texto inventado: "Limpiar carrito", "IVA incluido (16%)", "+$000" en el aviso, código "EJ-884920" en el visor, "3 prendas" (son 3 piezas, 2 líneas). No existen en la app: no implementar.
- "Transf." abreviado; el método real es "Transferencia SPAY" (`METHOD_LABEL`).
- Navegación activa usa `bg-secondary-container` (#98F2F1) en vez de la píldora `turquesa` + texto `turquesa-texto` del spec.
- La píldora del visor usa texto blanco sobre tinta 85 %: aceptable (no es turquesa).
