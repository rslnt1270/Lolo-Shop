# Diseños de Stitch para el plan v2 (2026-11-09)

- **Proyecto de Stitch:** LoloShop, id `12014089549413909070`.
- **Sistema de diseño en Stitch:** "LoloShop v2 Inventario", `assets/3062660571576513740` (creado para este lote; el de septiembre, "Spatial Streetwear POS", usa botón #3CBFBF con texto blanco y vidrio esmerilado, que no cumplen las reglas).
- **Autoridad:** spec v2 (`docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md`). Si un mockup contradice el spec, manda el spec; cada `notas.md` lista las diferencias.
- Todos los datos son de ejemplo ("Playera ejemplo", "Marca ejemplo", $000, EJ-0000, CÓDIGO-EJEMPLO). Ningún número de teléfono; en ejemplos, `52XXXXXXXXXX`.

## Índice

| Carpeta | Pantalla | Tarea | Id en Stitch |
|---|---|---|---|
| `alta-tallas/` | Alta con varias tallas | 1.5 | `02f186e1b8e545e6911009638da20697` |
| `agregar-talla/` | Agregar talla a un producto existente | 1.5 | `16b1143464df4b76af86e4ebe8f58737` |
| `ficha-interna/` | Ficha de staff: precio, historial, stock, desactivar | 1.7 | `dfe2e71ad00b40b39a9adb505d1b23a5` |
| `merma-traspaso/` | Panel Entrada / Merma o corrección / Traspasar | 1.2, 1.8 | `950b3fd3faf24490a0ec04c8db3ec4e0` |
| `movimientos/` | Historial de movimientos | 1.9 | `a69044c1e448426e8338724eeed721da` |
| `catalogo-cuadricula/` | Catálogo público en cuadrícula | 2.1–2.3 | `175c4da3145f4e0fae0b4ffab0a54dbc` |
| `modal-publico/` | Detalle público con WhatsApp | 2.1, 2.2, 2.4 | `db065b230b7b4c17b93cb352e2b7d08c` |

Cada carpeta trae `screen.png` (captura de Stitch, 2× de 375 px salvo el catálogo), `screen.html` (exportado de Stitch, Tailwind por CDN; es referencia, no código para copiar) y `notas.md`.

## Sistema visual

### Color
| Token | Valor | Uso |
|---|---|---|
| primario | `#007272` | Botón primario y enlaces, **texto blanco** encima |
| primario presionado | `#005F5F` | Estado activo del primario |
| tinta | `#16302F` | Texto principal; chip o talla seleccionada (fondo tinta, texto blanco) |
| texto secundario | `#5C6E6D` | Metadatos, ayudas |
| borde de control | `#7F9392` | Inputs, chips, botones de contorno |
| línea | `#E1E9E9` | Divisores decorativos |
| bloque | `#F3F7F7` | Fondos de tarjeta y avisos neutros |
| fondo | `#FFFFFF` | Página |
| ok | `#1F7A4A` | "Disponible", siempre con texto |
| error / agotado | `#9A3B2E` | Errores, "Agotado", acciones destructivas; siempre con texto o icono |
| aviso | `#8A5D00` sobre `#FEF8E7` | Advertencias no bloqueantes |

Nunca se usa el turquesa claro (`#3CBFBF`/`#22B8B8`) como fondo con texto blanco.

### Tipografía
- **Plus Jakarta Sans** para la interfaz; **JetBrains Mono** (≥ 12 px) para códigos, tallas, cantidades, fechas y deltas.
- Título de pantalla 16–18 px bold en staff; nombre de prenda pública 26 px ligero; cuerpo 14–16 px; inputs siempre 16 px.

### Espacio y forma
- Móvil a 375 px, margen lateral 16 px, separación 12 px, unidad 8 px.
- Objetivos táctiles ≥ 44 px; botón primario 48 px (56 px en el CTA público).
- Radios: tarjetas 12–16 px, botones 12 px, chips en píldora.
- Plano: sin vidrio ni blur; una sombra suave como máximo.
- Movimiento discreto (escala .98 al presionar, transiciones ≤ 200 ms) y nada con `prefers-reduced-motion`.

## Incidencias
- La primera generación de `alta-tallas` agotó el tiempo de espera de la herramienta; la segunda funcionó. Si la primera terminó en segundo plano, puede haber una pantalla duplicada "Nuevo producto" en el proyecto (`list_screens` no mostraba las pantallas nuevas al momento de revisar). La vigente es la de la tabla.
- `alta-tallas`, `agregar-talla` y `ficha-interna` se corrigieron con `edit_screens` (valores de ejemplo, segmento "Catálogo", departamentos); las pantallas originales quedan en el proyecto sin borrar.
- Ajustes hechos a mano en el HTML exportado (el PNG no los refleja): marcas reales en un select de `ficha-interna` y stock de Almacén a 0; "Ticket T-1042" a "Folio V-0000" en `movimientos`.
- Stitch inventó una barra de navegación inferior en `merma-traspaso`: no es parte del spec.
- `catalogo-cuadricula` salió en lienzo de escritorio (2560 px) con la columna móvil al centro.
- El PNG de `modal-publico` se corta antes del CTA; el HTML lo incluye.
