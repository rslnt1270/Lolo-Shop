# Diseños de Stitch v2: paleta turquesa (2026-11-12)

Guía visual para la migración de paleta del plan B, Tasks 5–10 (`docs/superpowers/plans/2026-11-11-B-paleta-botones.md`).

- **Proyecto de Stitch:** LoloShop, id `12014089549413909070`.
- **Sistema de diseño:** "LoloShop v3 Turquesa", `assets/13758965080546281388`. Se creó para este lote y se pasó como `designSystem` en cada generación. El tema del proyecto en Stitch sigue mostrando "Kinetic Abyss" (oscuro, de septiembre): `update_design_system` no cambió el tema por defecto del proyecto. No se reaplicó el sistema nuevo a las pantallas viejas.
- **Autoridad:** spec `docs/superpowers/specs/2026-11-11-paleta-botones-catalogo-design.md`. Si un mockup contradice el spec o el código vigente, manda el spec. Cada `notas.md` lista las diferencias.
- Datos de ejemplo: "Playera ejemplo", "Marca ejemplo", `$000`, `EJ-0000`. Sin teléfonos. Donde Stitch inventó cifras, se corrigió en el HTML o se marcó en las notas.

## Índice

| Carpeta | Pantalla | Dispositivo | Tarea B | Id en Stitch |
|---|---|---|---|---|
| `escanear-alta/` | Alta: decisión de catálogo, fotos frente/atrás, tallas, "Guardar producto" fijo | Móvil 390 | 7, 8 | `d25e8876baf140319b7f193c95c72341` |
| `pos-venta/` | Venta rápida: cámara continua, carrito ×N, lecturas en espera, carrito bloqueado, "Cobrar" fijo | Móvil 390 | 6 | `9188a94d5d5641a29f0a5c7525bfa6f0` |
| `pos-venta-ipad/` | Venta rápida en dos columnas, barra superior solo iconos | iPad vertical 820 | 6 | `badece0386dd428e8fc0e77f52c2424e` |
| `productos-lista/` | Lista con conmutador "Por publicar" | Móvil 390 | 7 | `9340d38ba39a418eb5ca3544fd2d84a4` |
| `productos-ficha/` | Ficha: fotos con "Reemplazar", editor de precio, "Sitio web" + "Publicar" | Móvil 390 | 7 | `9e659250c818403584bf4b159f6353c2` |
| `ventas-panel/` | Panel de ventas | Móvil 390 | 6 | `f65d4aa1346b408d9c148c0302ff686f` |
| `catalogo-cuadricula/` | Catálogo público: favorito primario, "Ver prenda" contorno | Móvil 390 | 9 | `d62e07d1caa74ea7bf8486b9508e73d3` |
| `favoritos/` | Favoritos locales | Móvil 390 | 9 | `6cf537f73a9741868fe25e6327924cd5` |
| `inicio-duena/` | Inicio de la dueña | Móvil 390 | 5 | `8e07d7073a29480a905b1ec38e3dd5bc` |
| `inicio-duena-ipad/` | Inicio de la dueña | iPad vertical 820 | 5 | `dec51846d1794d289ade75bf5f6e4e2d` |
| `inicio-colaboradora/` | Inicio de la colaboradora | Móvil 390 | 5 | `04ab870293c547088db68b99d4080e0e` |

Cada carpeta trae `screen.png` (captura de Stitch a 2×; los de iPad son lienzo de 2560 px con la columna de 820 px al centro), `screen.html` (Tailwind por CDN; referencia, no código para copiar) y `notas.md`.

## Qué cambia frente a hoy

1. **Turquesa como relleno con texto tinta** en todo primario, chip activo y navegación activa. Hoy hay `bg-loloteal text-white` y `#007272`.
2. **Barras de acción fijas** ("Guardar producto", "Cobrar") encima de la navegación inferior, con safe-area.
3. **Inicio por rol** con mosaicos grandes: Vender y Escanear como primarios, el resto como contorno. La colaboradora solo ve lo suyo.
4. **Estados del POS en bloques con color propio**: ok verde, lecturas en espera ámbar, carrito bloqueado con contorno `agotado`. Hoy el bloqueo usa `bg-error-container`.
5. **Catálogo público** con "Guardar en favoritos" como primario y "Ver prenda" como contorno, tallas sin existencias tachadas, sin WhatsApp ni carrito.

## Cómo aplicarlo en código

### Tokens (`tailwind.config.ts`, ya existen)
| Elemento del diseño | Clase |
|---|---|
| Relleno de marca (primario, chip activo, píldora de navegación activa, barras de gráfica, marco del escáner) | `bg-turquesa` |
| Texto general y texto sobre turquesa | `text-tinta` |
| Enlaces, precios, contornos, anillo de foco, etiqueta de navegación activa | `text-turquesa-texto`, `border-turquesa-texto`, `outline-turquesa-texto` |
| Títulos ≥ 28 px, peso 800 ("Catálogo", "Ventas", "Favoritos", saludos) | `text-turquesa-titular font-extrabold text-[32px]` |
| Bloques y tarjetas, fondos de foto | `bg-niebla` |
| "Disponible", aviso de agregado | `text-ok` (siempre con texto) |
| "Agotado", "Quitar", errores, "Quedan 1" | `text-agotado`, `border-agotado` |
| Bordes de control | `border-borde-control` |

Los colores que Stitch emite como `primary` (#006A6A), `secondary`, `secondary-container` (#98F2F1), `on-primary-container` (#004343) y `tertiary` (#A03F32) **no se usan**: son del motor de color de Stitch, no de la paleta. Al pasar un mockup a código, sustituir por la fila de arriba. Tampoco se usan los tokens heredados `primary`, `on-surface`, `error-container`, `loloteal` del `tailwind.config.ts` actual (el plan B Task 10 los retira).

### Botones (`components/ui/Button.tsx`, `components/ui/button-classes.ts`)
| En el mockup | En código |
|---|---|
| "Guardar producto", "Cobrar $000", "Publicar", "Guardar precio", "Guardar en favoritos", "Ir al catálogo", "+ Nuevo" | `<Button>` (variante `primary`: `bg-turquesa text-tinta`) |
| "Ver prenda", "Escribir código", "Reemplazar", "Editar precio", "Cancelar", "Revisar", "+ Tienda", "+ Agregar otra talla", "Ver" | `<Button variant="outline">` |
| "Quitar", "Desactivar producto" | `<Button variant="danger">` + confirmación en pantalla |
| Enlace con `<a>`/`<Link>` que se ve como botón (mosaicos de Inicio, "Ver prenda" si navega) | `className={buttonClasses("primary" \| "outline")}` |
| Spinner en "Cobrar"/"Guardar" y check al terminar | props `loading` y `success` de `Button` (ya dibujan `lolo-btn-spinner` y `lolo-btn-check`) |
| Levantar 2 px / encoger a 0.97 | clase `lolo-btn` en `app/globals.css` (ya incluida en `BASE`) |

`BASE` ya fija `min-h-11` (44 px) y `rounded-xl`. Los mockups tienen varios botones de 32–40 px: en código manda `min-h-11`. Para el CTA de barra fija, agregar `h-14 w-full text-base` vía `className`.

### Conmutadores y chips
- Activo: `bg-turquesa text-tinta`; inactivo: `bg-white border-2 border-turquesa-texto text-turquesa-texto`; `min-h-11 rounded-full px-4`; `aria-pressed`. Aplica a "Por publicar"/"Por revisar" (`app/productos/page.tsx`), `RangePicker`, `PaymentPicker`, `DepartmentChips`, selector "Solo stock"/"Para catálogo" de `NewProductForm`.

### Navegación (`components/layout/NavBar.tsx`)
- Móvil: barra inferior de 7 (Inicio, Vender, Escanear, Etiquetas, Productos, Ventas, Salir), 64 px + `pb-[env(safe-area-inset-bottom)]`. Activo: icono dentro de píldora `bg-turquesa text-tinta rounded-full px-3`, etiqueta `text-turquesa-texto font-bold` (referencia: `inicio-colaboradora/screen.html`). Hoy usa `text-loloteal` sin píldora.
- iPad vertical: barra superior de iconos 48×48 con `title`/`aria-label`, activo con relleno `turquesa`; sin barra inferior (referencia: `pos-venta-ipad`, `inicio-duena-ipad`).
- Barra de acción fija: `fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))]`, fondo blanco sólido, `border-t border-[#E1E9E9]`, una sombra suave como máximo; el contenido suma ese alto a su `padding-bottom`. Probar a 360 px.

### Escáner
- El marco del visor y la línea de escaneo usan `turquesa` como trazo (decorativo). Los botones que pinta html5-qrcode se cubren con la regla `#reader button` de `app/globals.css` (plan B Task 8: `#22B8B8` + `#16302F`).

## Incidencias
- `generate_screen_from_text` agotó el tiempo de espera en 6 llamadas (alta ×3, productos lista, ficha, ventas y favoritos). `list_screens` y `get_project` no mostraron pantallas nuevas en toda la sesión, así que no se pudo saber si esos intentos terminaron en segundo plano: **puede haber pantallas huérfanas en el proyecto**. Las vigentes son las de la tabla. Las 5 que faltaban se generaron con el modelo `GEMINI_3_5_FLASH_LITE` (menos detalle en espaciado).
- Una llamada de alta devolvió solo texto ("He actualizado…") sin pantalla; no se sabe qué pantalla tocó.
- `screen.html` de `ventas-panel` se editó a mano para quitar cifras con apariencia real; su PNG aún las muestra.
- Las fotos de `escanear-alta`, `productos-lista` y `favoritos` son imágenes generadas por Stitch (URLs `lh3.googleusercontent.com`): son relleno, no fotos de inventario.
- El turquesa nunca se usó como color de texto en las pantallas móviles. En el iPad aparece como color de icono solo dentro del visor oscuro (decorativo).
