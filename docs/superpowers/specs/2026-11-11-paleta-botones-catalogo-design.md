# Paleta, botones, catálogo sincronizado y favoritos locales (2026-11-11)

**Estado:** borrador de decisiones aprobadas por el solicitante el 2026-11-10 y 2026-11-11. Pendiente de confirmar con el dueño antes de la demo del 19 de noviembre, porque cambia reglas que la spec del sitio público (`2026-11-05-sitio-publico-ux-design.md`) atribuye al dueño.

**Vistas previas (privadas, del mismo día):**
- Paleta: https://claude.ai/artifact/8AE5DYjV3WFoSZaQhbW3me
- Botones: https://claude.ai/artifact/LSFTMmebKgrZYGbdfWH3b7

## 1. Intención

Una sola marca visual en la PWA de tienda y en el sitio público. El catálogo muestra solo lo que existe en stock, y lo que la persona quiere guardar vive en su navegador, sin cuenta ni datos en el servidor.

## 2. Paleta (aprobada)

Turquesa `#22B8B8` como color de marca, en la PWA y el sitio. Fondo blanco.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `turquesa` | `#22B8B8` | Relleno de botón principal, aros, halos | Solo con texto `tinta` (5.75:1) |
| `tinta` | `#16302F` | Texto principal y texto sobre turquesa | 14.02:1 con blanco |
| `turquesa-texto` | `#0C7C7C` | Contorno de botón, enlaces, precios, anillo de foco | 5.01:1 con blanco |
| `turquesa-titular` | `#0E9494` | Titulares ≥ 28 px, peso 800 | 3.70:1 (texto grande) |
| `turquesa-luz` | `#5FE0DE` | Solo destellos | Decorativo |
| `niebla` | `#F3F7F7` | Fondos de bloque y esqueletos | n/a |
| `ok` | `#1F7A4A` | "Disponible" (siempre con texto) | 5.33:1 |
| `agotado` | `#9A3B2E` | Quitar, errores (siempre con texto) | 6.91:1 |

Regla: el turquesa nunca se usa como color de texto. El blanco sobre turquesa (2.44:1) no se usa.

**Modo oscuro:** pendiente. Se diseña después de cerrar botones y contenedores.

## 3. Botones (aprobados)

- **Relleno turquesa, texto `tinta`:** acción principal de cada pantalla y confirmación de movimientos de stock (traspaso, ajuste, sumar piezas).
- **Contorno `turquesa-texto`, fondo blanco:** navegar o cancelar ("Ver prenda", "Editar precio", "Cancelar").
- **Contorno rojo `agotado`:** solo para quitar algo. Pide confirmación dentro de la pantalla.
- **Altura mínima 44 px.** Deshabilitado: relleno `#BFE9E9`, texto `#5C6E6D`.
- **Movimiento obligatorio:** al pasar el cursor se levanta 2 px; al presionar se encoge a 0.97; en confirmación aparece un giro de carga y luego un check que se dibuja. Con "reducir movimiento" activo, las transiciones duran 1 ms (no se eliminan).

## 4. Catálogo sincronizado con el stock

- El catálogo público solo muestra prendas con existencias en al menos una tienda pública (`Location.type = store`, `isPublic = true`).
- Una prenda sin existencias no aparece. Las tallas sin existencias se muestran tachadas, no ocultas, para que la persona vea qué existió. **Decisión de diseño mía, marcada para revisión.**
- La disponibilidad sigue siendo un booleano por talla y por tienda. Nunca se muestran cifras.
- Se elimina el texto "Agotado" de la tarjeta, porque una prenda agotada ya no aparece.

## 5. Tarjeta de producto

- Botón principal: **favorito** (corazón con texto "Guardar en favoritos"), relleno turquesa. Cambia a "En favoritos" al activarse.
- Botón secundario: **"Ver prenda"**, contorno turquesa.
- **Sin** "Consultar por WhatsApp" y **sin** carrito. El WhatsApp sale del catálogo porque ya no es necesario: el stock se sincroniza y la prenda solo aparece si se puede comprar. **Pendiente de confirmar con el dueño**, porque la spec §5.8 lo define como CTA principal.

## 6. Favoritos locales

- Se guardan en `localStorage` del navegador: lista de IDs públicos (`publicCode` o `slug`), nunca datos de la persona.
- Sin cuenta, sin login y sin llamadas al servidor para guardar.
- Si se borra el navegador o se usa otro dispositivo, la lista se pierde. Esto se explica en la pantalla de favoritos.
- La pantalla "Favoritos" lista las prendas guardadas que sigan con stock. Las que ya no tienen stock se marcan como "Ya no disponible" y se pueden quitar.
- Lectura y escritura con `try/catch`; si el almacenamiento falla, el corazón se deshabilita con texto explicativo.
- **Cambio de la spec:** la spec §2.2 y la lista "Fuera de v1" excluyen favoritos y "Guardar". Este documento lo reemplaza para el caso local, sin cuenta.

## 7. Qué se excluye

- Carrito, checkout, cobro en línea y cuentas de cliente (sigue fuera de alcance, §2.2).
- Promesas de apartado o entrega (sigue **[P]**).
- Datos personales de la persona que guarda favoritos.

## 8. Pendientes

1. **Dueño:** confirmar la eliminación del CTA de WhatsApp y el cambio de favoritos (§2.2).
2. **Animaciones:** lista detallada de movimientos por pantalla (catálogo, ficha, favoritos).
3. **Alta de producto** (spec aparte): escanear primero, luego decidir si va al catálogo, luego fotos (no obligatorias para registrar, sí esenciales) y descripción, con instrucciones en pantalla.
4. **Modo oscuro:** después de cerrar componentes.
5. **Revisión del constructor:** pasar este documento por un subagente lector antes de planear la implementación.

## 9. Cambios que este documento implica en otras specs

- `2026-11-05-sitio-publico-ux-design.md`: §2.2 (favoritos), §3.2 (tokens, sin cambios), §5.8 (CTA), §8 (animaciones).
- `2026-11-05-loloshop-srs.md`: "Fuera del alcance" no menciona favoritos locales; agregar la excepción.
