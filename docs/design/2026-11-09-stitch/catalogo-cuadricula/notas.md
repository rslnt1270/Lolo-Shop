# catalogo-cuadricula: catálogo público en cuadrícula

- **Stitch:** pantalla `175c4da3145f4e0fae0b4ffab0a54dbc`. Stitch la guardó como lienzo de escritorio (2560 px); el contenido es la columna móvil de 375 px al centro.
- **Tareas del plan:** 2.1, 2.2 y 2.3.

## Estados que cubre
- Chips de departamento con "Todo" seleccionado.
- Tarjeta con precio único, con "Desde $X", con talla agotada tachada, con más de 6 tallas ("+N") y totalmente agotada ("Agotado").
- "Ver más" y pie.

## Jerarquía de tarjeta
Foto de frente → marca (mono, mayúsculas, 12 px) → nombre (2 líneas máx.) → precio → chips de talla.

## Textos exactos
- Chips: "Todo" + departamentos con prendas públicas, en `sortOrder`, sin conteos. URL `?depto=<slug>`, `aria-pressed`.
- "Desde $X" cuando las tallas tienen precios distintos.
- "Agotado" cuando todas están agotadas.
- "Ver más" (suma 24).
- Sin productos: "Pronto verás aquí las prendas de la tienda."

## Reglas públicas (obligatorias)
- Solo `PublicProduct`: sin SKU, código de barras ni conteos; disponibilidad sí o no por talla; solo tiendas (Lomas y ClubAlva), nunca el almacén.
- Sin "apartado", "envío", carrito ni urgencia.

## Diferencias y avisos
- Los chips de talla de la tarjeta miden menos de 44 px: son informativos y **no** interactivos; toda la tarjeta es el objetivo táctil.
- La talla agotada se ve como tachado ilegible en el PNG: debe conservarse la letra visible con la diagonal, y el nombre accesible "S, agotada" (no solo color).
- El chip "Ca…" (Calzado) queda cortado por el scroll horizontal: es intencional.
- "Equipo" en la cabecera: enlace discreto al login (spec UX 2.2); puede ir al pie.
- El pie "Consulta disponibilidad en tienda." no sustituye el CTA de WhatsApp del modal.
