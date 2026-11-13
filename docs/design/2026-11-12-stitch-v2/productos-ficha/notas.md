# Ficha de producto (staff, desde /productos) (móvil 390 px)

Stitch: `9e659250c818403584bf4b159f6353c2`.

## Componentes
1. Barra: flecha a "/productos" · "Playera ejemplo".
2. Fotos 4:5 en 2 columnas (`niebla`, etiqueta "Frente"/"Atrás"), cada una con contorno "Reemplazar" (icono lápiz) debajo.
3. Meta en tarjeta `niebla`: "Marca ejemplo · Playera · Color ejemplo" + chip mono "EJ-0000".
4. "Precio": tarjeta con "$000" mono 30 px `turquesa-texto` + contorno "Editar precio". Al editar: input con prefijo "$" (mono, 48 px) + "Guardar precio" (primario) + "Cancelar" (contorno). El HTML trae el cambio de estado en JS.
5. "Tallas y existencias": filas `niebla` con chip mono de talla, "Tienda ejemplo", estado "Disponible" (`ok`) o "Agotado" (`agotado`) siempre con texto, y "3 piezas" mono.
6. "Sitio web": "Aún no está en el sitio web"; lista de requisitos con check `ok` ("Foto de frente", "Foto de atrás", "Precio", "Con existencias"); "Publicar" primario ancho completo con icono; ayuda "Se mostrará en el catálogo mientras tenga existencias."
7. "Desactivar producto": `danger` ancho completo.

## Desviaciones (manda el spec)
- Botón "Ayuda" en la barra: inventado, quitar.
- Cuando falta un requisito, el check debe ser icono neutro + texto, y "Publicar" deshabilitado (relleno #BFE9E9, texto #5C6E6D) — Stitch solo muestra el caso completo.
- "Desactivar producto" debe pedir confirmación en pantalla (spec §3).
- Fila "Agotado" con `opacity-80`: no bajar opacidad del texto `agotado` (contraste).
- Navegación activa con `secondary-container`: ver README.
