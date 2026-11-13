# /productos — lista con filtro "Por publicar" (móvil 390 px)

Stitch: `9340d38ba39a418eb5ca3544fd2d84a4`.

## Componentes
- Barra superior: "Productos" + botón primario pequeño "+ Nuevo".
- Búsqueda 48 px, borde #7F9392, radio 12, icono lupa: "Buscar por nombre o código".
- Conmutadores (píldoras 40 px, `aria-pressed`): "Todos", **"Por publicar" activo** (relleno `turquesa`, texto tinta, contador "3" en píldora tinta con texto blanco), "Por revisar", "Sin foto" (blanco, borde 2 px `turquesa-texto`, texto `turquesa-texto`).
- Ayuda: "Prendas con stock que aún no están en el sitio web."
- Filas en tarjeta `niebla` radio 12: miniatura 56×56 (sin foto = icono cámara + "Sin foto" #7F9392), nombre 14 px 700, "Marca ejemplo · Playera", tallas mono en chip blanco, precio mono `turquesa-texto`, a la derecha contorno "Publicar" o estado "Publicado" (punto + texto `ok`).

## Desviaciones (manda el spec)
- Conmutadores de 40 px y "Publicar" de 36 px (`h-9`): subir a 44 (`min-h-11`).
- Contador del chip activo: texto blanco sobre tinta (ok de contraste) — aceptable; alternativa del spec: tinta sobre blanco.
- Título en `text-primary` (#006A6A) e icono "store": usar tinta.
- Miniaturas son fotos generadas por Stitch: en código, `Product.imageUrl` o `niebla`.
- Navegación activa con `secondary-container`: ver README (píldora `turquesa`).
- La lista no muestra "Por revisar" ni "Asignar departamento"; en código siguen existiendo (plan B Task 7).
