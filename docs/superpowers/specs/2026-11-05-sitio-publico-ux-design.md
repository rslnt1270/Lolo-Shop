# Sitio público de LoloShop: diseño UX/UI del catálogo para clientes

- **Fecha:** 2026-11-05 · **Estado:** propuesta de diseño para aprobación del dueño · **Autor:** visual-design · **Sin secretos** (repo público)
- **Para construir:** `frontend-pwa` (rutas, datos, componentes, PWA) y `visual-3d` (recorrido y riel 2.5D). Este documento no contiene código de producto.
- **Convención:** **[V]** verificado en bocetos, repo o cálculo; **[A]** juicio propio o decisión del autor, revisable (las de arquitectura del 2026-11-05 llevan A1…A7); **[D]** decidido por el dueño (las del 2026-11-05 llevan D1…D7); **[P]** pendiente del dueño.
- **Actualización 2026-11-05 (tarde):** alineado con el modelo de datos `2026-11-05-modelo-datos-er.md` (**ER**, fuente de verdad de campos) y con el SRS `2026-11-05-loloshop-srs.md`. Registro de decisiones en §14.
- **Fuentes:**
  - Bocetos aprobados como dirección: «LoloShop en blanco» (dirección visual vigente), «Boceto ficha» (estructura estilo NORTH) y «Dónde vive cada foto» (rejilla, lupa, riel, punto del recorrido). Viven en el scratchpad de la sesión, fuera del repo.
  - `2026-10-19-fotos-producto-ia-design.md` §14 (estándar de imagen; **no se repite aquí**, se refiere como «§14»).
  - `2026-10-27-visualizacion-catalogo-ideas.md`, `2026-10-27-demo-tienda-digital-design.md`, `2026-10-27-loloshop-maestro-design.md`, `tailwind.config.ts`.
  - Estado actual: `app/catalogo/*` y `components/virtual-store/*` (solo lectura).
- **Hechos de la tienda (fotos reales, 2026-11-05) [V]:** de día es clara (piso beige, cromo, madera, muro de piedra, espejo dorado, plantas, cortina azul del probador); acentos LED azul/turquesa; neón blanco «lolo» sobre muro azul; bolsas blancas con logo y mascota. Vende ropa de marca (Armani Exchange, Michael Kors, Tommy Hilfiger, BOSS, Psycho Bunny, The North Face, entre otras).

---

## 1. Resumen

El sitio público es un **plus** para gente que ya conoce la tienda: ve qué hay, filtra por **marca** primero, abre la ficha y **consulta por WhatsApp**. No cobra, no tiene cuentas, no tiene carrito. La conversión es **un solo gesto**: tocar «Consultar por WhatsApp» con el mensaje ya armado.

La dirección visual es **«LoloShop en blanco»**: blanco de galería, mucho aire, líneas finas, tipografía ligera con una palabra clave en negrita turquesa «encendida». El turquesa es luz, no relleno. El neón «lolo» de la tienda es la portada.

Este documento corrige lo que los bocetos hacen mal para producción (contraste, semántica, movimiento sin pausa, datos internos visibles, costo en móvil). §3.3 y §11.1 listan cada problema.

---

## 2. Principios y anti-objetivos

### 2.1 Principios

1. **Marca primero.** La gente busca «algo de BOSS» antes que «una chamarra». La marca es filtro de primer nivel en portada, departamento y búsqueda (§5).
2. **Una acción por pantalla.** En la ficha es WhatsApp; en la lista, abrir la ficha. Lo demás es secundario y no compite.
3. **La prenda es la protagonista.** Fondo blanco, fotos del estándar §14, texto discreto. El turquesa nunca tapa la foto.
4. **Móvil primero a 375 px.** Se diseña ahí y se amplía. Toda zona táctil ≥ 44 px; nada depende de hover.
5. **Luz con moderación.** Un momento luminoso por pantalla (§3.4). Si todo brilla, nada brilla.
6. **Solo datos reales.** Sin precio, talla, medida, marca o disponibilidad inventados. Si falta el dato, se diseña el estado vacío (regla 3 del equipo).
7. **Disponible o agotado, nada más.** Sin cifras de stock, sin SKU, sin bodega (decisión D-5 de la demo).
8. **Rápido en un celular medio.** Presupuesto en §8; lo que no cabe, se recorta.

### 2.2 Anti-objetivos (lo que este sitio NO es)

- No es tienda en línea: sin carrito, checkout, cuentas, favoritos ni cupones.
- No presiona: sin «últimas piezas», contadores, urgencia ni «X personas lo están viendo».
- No promete políticas que el dueño no ha definido (apartado, envíos, devoluciones, formas de pago): esos textos son **[P]** hasta que existan.
- No usa cifras de conversión de proveedores como argumento (regla 6).
- No usa logotipos de las marcas (derechos de terceros); las marcas se escriben en texto (§5.4).
- No muestra gente identificable en fotos de la tienda (D-3 de la demo).
- No es el panel interno: nada de `Inventario`, roles ni login en el sitio público (el acceso del equipo queda como enlace discreto en el pie).

---

## 3. Sistema visual

### 3.1 Qué se toma de cada boceto

| Boceto | Se toma | Se descarta |
|---|---|---|
| **En blanco** | Paleta, tipografía, halo, línea LED bajo repisas, tarjetas redondeadas, portada con aro luminoso | Marco de celular y «lienzo» escalado (el sitio real es a sangre), video autoplay de 30 s, chat simulado, `backdrop-filter` en todo, manchas de blur animadas |
| **Ficha** (NORTH) | Estructura: foto grande + panel angosto; barra fija móvil; talla → disponibilidad → CTA; acordeones; paginación de vitrina | Paleta cobalto/concreto y fuentes Archivo/Geist (ajenas a la marca), código de producto, cifras por tienda, «Última», «Pieza única», zoom por toque en toda la foto |
| **Dónde vive cada foto** | Rejilla 2/4 columnas, miniaturas 76/64 px, lupa 2.2× sobre la maestra, riel con `mix-blend-multiply`, tarjeta de punto del recorrido, tabla de derivados | Botón «Guardar» (♡), etiquetas de medida (herramienta de boceto) |

### 3.2 Tokens de color

El turquesa del boceto (`#22B8B8`) **no pasa AA como texto ni como fondo de texto blanco** (§3.3). Se separa en tokens de **luz** (decorativos) y tokens de **texto** (accesibles).

| Token | Valor | Uso | Contraste [V] (calculado) |
|---|---|---|---|
| `blanco` | `#FFFFFF` | Fondo base, fotos | n/a |
| `niebla` | `#F3F7F7` | Fondos de bloque, riel, esqueletos | n/a |
| `linea` | `#E1E9E9` | Divisores decorativos (no identifican controles) | 1.23 con blanco: **solo decorativa** |
| `borde-control` | `#7F9392` | Borde de controles interactivos (chips, input, tallas) | 3.24 con blanco (cumple 3:1 de componente) |
| `tinta` | `#16302F` | Texto principal, estado «seleccionado» | 14.02 con blanco |
| `tenue-texto` | `#5C6E6D` | Texto secundario (marca, etiquetas, metadatos) | 5.38 blanco / 4.98 niebla |
| `tenue` (boceto) | `#7C8E8D` | **Solo decorativo** (iconos inactivos grandes) | 3.44 blanco / 3.18 niebla: **no usar para texto** |
| `turquesa` (luz) | `#22B8B8` | Fondo del CTA, aros, líneas LED, halos, relleno de puntos | 2.44 con blanco: **nunca como texto** |
| `turquesa-luz` | `#5FE0DE` | Solo halos y destellos | 1.59 con blanco: decorativo |
| `turquesa-texto` | `#0C7C7C` | Enlaces, precios, texto turquesa de ≤ 24 px, anillo de foco | 5.01 blanco / 4.64 niebla |
| `turquesa-titular` | `#0E9494` | Palabra luminosa de titulares ≥ 28 px en peso 800 | 3.70 blanco / 3.42 niebla (AA texto grande) |
| `ok` | `#1F7A4A` | Punto «Disponible» (siempre con texto) | 5.33 blanco |
| `agotado` | `#9A3B2E` | Texto «Agotado» (siempre con texto) | 6.91 blanco |

Notas:

- **Texto sobre `turquesa`:** `tinta` sobre `#22B8B8` da **5.75:1** [V]; blanco sobre `#22B8B8` da 2.44 y **no se usa**. El CTA primario es fondo `turquesa` con texto `tinta` en 700. Si el dueño prefiere texto blanco, el fondo debe ser `turquesa-texto` `#0C7C7C` (5.01:1), con menos «luz».
- **Relación con el repo [V]:** `tailwind.config.ts` ya tiene `primary #006a6a` (6.42:1 con blanco) y `primary-container #3cbfbf` (`loloteal`, 2.23:1). El sitio público usa los tokens de arriba; `loloteal` queda para el panel interno. `#0C7C7C` es el mismo tono (180°) que `primary` pero menos oscuro; si se quiere evitar un token nuevo, `primary` es un sustituto válido (más pesado visualmente). **[A]** frontend-pwa decide si los nombres viven en `tailwind.config.ts` o como variables CSS del sitio público.
- **Modo claro único:** `color-scheme: light` y `<meta name="color-scheme" content="light">`. El dueño rechazó la versión oscura; esto también evita que el oscurecimiento forzado de algunos Android invierta las fotos de fondo blanco.
- **Fondo de página:** `blanco`. Los destellos de luz (`.irradia` del boceto) se hacen como **un solo `radial-gradient` estático** de `#BFF3F1` al 35–50 % de opacidad en una esquina del hero, sin blur ni animación (§8).

### 3.3 Contraste: lo que se evaluó

| Elemento del boceto | Combinación | Resultado | Corrección |
|---|---|---|---|
| Texto turquesa 10–16 px (precios, `.x`, etiquetas) | `#22B8B8` / blanco | 2.44: falla AA (4.5) y falla incluso texto grande (3.0) | `turquesa-texto` |
| Botón con texto blanco (CTA, «Ver prenda», burbujas) | blanco / `#22B8B8` | 2.44: falla | Texto `tinta` sobre `turquesa` (5.75) |
| Texto «tenue» 10–13 px | `#7C8E8D` / blanco | 3.44; sobre niebla 3.18: falla | `tenue-texto` |
| Borde de talla seleccionada (turquesa + texto turquesa) | `#22B8B8` / blanco | 2.44, y el estado depende solo del color | Fondo `tinta` + texto blanco (14.02) |
| Anillo de foco | `#22B8B8` 2 px | 2.44: falla 3:1 (1.4.11 y 2.4.11) | Anillo `turquesa-texto` 2 px + 2 px de blanco por fuera |
| Talla agotada | `#C4CFCF` / blanco | 1.59 (los controles deshabilitados están exentos) | Se queda tachada, pero con texto «Agotada» en el nombre accesible y en la leyenda |
| Insignia «Última» (boceto ficha) | blanco / `#B26A00` 9 px | 4.24 y 9 px | Se elimina (revela stock, §5.6) |
| Halo (`text-shadow`) sobre texto ≤ 24 px | n/a | Emborrona letras chicas | Halo solo en titulares ≥ 28 px (§3.4) |

Regla de revisión: **todo par texto/fondo nuevo se calcula antes de aprobarse**; las tablas anteriores se mantienen en el repositorio de diseño como referencia.

### 3.4 Uso del halo turquesa (moderación)

El halo del boceto es `0 0 6px rgba(60,191,191,.55), 0 0 22px rgba(60,191,191,.45), 0 0 48px rgba(95,224,222,.35)`. Reglas:

1. **Una palabra luminosa por pantalla**, en el titular principal (≥ 28 px, peso 800, color `turquesa-titular`). Ejemplo: «La tienda, **en tu mano.**».
2. **Permitido además:** el aro del logo en la portada, la línea LED de 2 px bajo un riel o repisa, un `box-shadow` suave (≤ 24 px, opacidad ≤ .35) bajo el CTA primario, y el anillo de un chip seleccionado (3 px, opacidad .25).
3. **Prohibido:** halo en texto de cuerpo, precios, etiquetas, enlaces, mono de 12 px; halo en más de un elemento animado a la vez; halo como único indicador de estado.
4. **Animación del halo:** como máximo 3 ciclos (≤ 5 s) al entrar la pantalla, luego queda fijo. Con `prefers-reduced-motion`, nace fijo.
5. El halo es **decorativo**: la lectura nunca depende de él (el texto ya cumple contraste sin halo).

### 3.5 Tipografía

- **Plus Jakarta Sans** (display y cuerpo) y **JetBrains Mono** (etiquetas, contadores, chips de talla), como en `tailwind.config.ts` [V].
- **Carga:** `next/font` autoalojado (no el `<link>` a Google Fonts de los bocetos, que bloquea el render). Jakarta como fuente variable, subconjunto `latin`; Mono solo peso 500. Precarga solo de Jakarta. `font-display: swap` con fuente de respaldo de métricas ajustadas para evitar saltos (CLS).
- **Escala (móvil 375 → escritorio):**

| Rol | Móvil | Escritorio | Peso | Notas |
|---|---|---|---|---|
| Display (portada) | 34/1.05 | 64/1.02 | 300 + palabra clave 800 | `letter-spacing -0.035em`; peso 300 solo ≥ 28 px |
| Título de pantalla (h1) | 28/1.1 | 40/1.1 | 300 + 800 | Una por pantalla |
| Título de sección (h2) | 20/1.25 | 24/1.3 | 700 | |
| Nombre de prenda en ficha | 26/1.1 | 32/1.1 | 300 + marca en 800 | |
| Cuerpo | 16/1.55 | 16/1.6 | 400 | Los `input` siempre 16 px (si no, iOS hace zoom al enfocar) |
| Texto de tarjeta | 14/1.3 | 14/1.3 | 500 | Nombre a 2 líneas máx. |
| Precio | 16–18 | 18–22 | 700, `tabular-nums` | En sans, no en mono (la tabla de números ya alinea) |
| Etiqueta mono (marca, sección, contador) | **12** | 12 | 500, mayúsculas, `tracking .14em` | **Mínimo 12 px.** Los bocetos usan 9–11 px |

- Español de México: acentos y «ñ» completos; los titulares usan `text-wrap: balance`.

### 3.6 Forma, espacio y componentes base

- **Rejilla:** margen 16 px a 375; hueco 12 px; contenedor máximo 1240 px. Breakpoints: 375 (base), 600, 900, 1200.
- **Radios:** foto de tarjeta 14 px; tarjetas de panel 18–24 px; botones y chips «píldora» (999 px), como el boceto.
- **Sombras:** una sola elevación suave (`0 24px 50px -20px rgba(22,48,47,.3)`) para hojas y tarjeta flotante; sin sombras apiladas.
- **Botón primario:** 56 px de alto en ficha (48 en barra fija), fondo `turquesa`, texto `tinta` 700, sombra turquesa suave. Estados: reposo, presionado (escala .985, 120 ms), foco (§3.3), deshabilitado (borde `borde-control`, texto `tenue-texto`, nunca solo opacidad).
- **Botón secundario:** 48 px, borde `tinta` 1 px, fondo blanco.
- **Chip:** 44 px de alto (boceto: 42), borde `borde-control`; seleccionado = fondo `tinta`, texto blanco, anillo turquesa de 3 px al .25.
- **Chip de talla:** 48×48, mono 14; seleccionada = fondo `tinta`; agotada = diagonal tachada + nombre accesible «M, agotada».
- **Icono de acción:** 24 px dentro de un área táctil de 44×44.
- **Foco visible siempre**; nunca `outline: none` sin sustituto.
- **Fotos:** las del estándar §14 (1:1, fondo `#FFFFFF`, prenda al 80 %, 10 % superior libre). Sobre `niebla` se compone con `mix-blend-mode: multiply` (§14.7). Alt obligatorio (§11).
- **Esqueleto:** bloques `niebla` con el aspecto final (1:1 en fotos) para que no haya salto de layout.

---

## 4. Mapa del sitio y navegación

### 4.1 Rutas propuestas

Se proponen bajo `/catalogo` para no romper el enlace existente. **[A]** frontend-pwa y el arquitecto pueden moverlas a un grupo de rutas público (por ejemplo `(publico)`) o a la raíz del dominio cuando llegue `loloshop.y4ga.app`; el diseño no cambia.

| Pantalla | Ruta | Notas |
|---|---|---|
| Portada | `/catalogo` | Entrada pública |
| Departamento | `/catalogo/[departamento]` (`dama`, `caballero`, `ninos`, `calzado`, `accesorios` [D] D6; la lista sale de la tabla `Department` y puede crecer) | Filtros en la URL: `?marca=boss&talla=M&sub=playeras&disp=1&orden=nuevo` |
| Índice de marcas | `/catalogo/marcas` | Lista A–Z |
| Marca | `/catalogo/marca/[marca]` | Con chips de departamento |
| Búsqueda | `/catalogo/buscar?q=` | |
| Ficha | `/catalogo/p/[slug]` (`Product.slug`, ER §2.7; no cambia si se edita el título) | **Página completa**, no modal: la URL viaja dentro del mensaje de WhatsApp y debe abrir sola. Opcional `?desde=recorrido&zona=…` |
| Recorrido | `/catalogo/recorrido` | Carga diferida; vive detrás de bandera hasta tener panorámicas reales (§5.7) |
| Visítanos / aviso de privacidad | `/catalogo/tienda`, `/catalogo/privacidad` | Texto corto |

Reglas:

- **Todo filtro vive en la URL** (se puede compartir, el botón «atrás» lo respeta, se restaura el scroll).
- Un departamento **sin prendas publicadas no aparece** en la portada ni en el menú (no se muestra «próximamente»: nada inventado).
- Una prenda dada de baja devuelve una página «Esta prenda ya no está» con salidas útiles, no un 404 en seco (§5.5, estados).

### 4.2 Navegación móvil (375 px)

- **Encabezado fijo de 56 px:** logo (36 px, enlace a portada) y la palabra LOLO SHOP · botón **Buscar** (44) · botón **Menú** (44). Fondo blanco al 92 %; es el único `backdrop-filter` permanente de la página (§8).
- **Fila de departamentos** fija bajo el encabezado en las pantallas de lista: chips con desplazamiento horizontal (`Todo · Dama · Caballero · Niños · Calzado · Accesorios`, en el `sortOrder` de la tabla `Department`), chip activo en `tinta`. El chip activo se centra al abrir. Como la lista crecerá (D6), la fila nunca asume cinco elementos fijos.
- **Menú** (hoja a pantalla completa, con foco atrapado, cierra con Esc y con el botón): Departamentos (grandes, 56 px), Marcas, Recorrido (si existe), Visítanos, «Escríbenos por WhatsApp». En el pie, discreto: «Acceso del equipo» (enlace al login actual).
- **Sin barra inferior de pestañas** [A]: choca con la barra del navegador de iOS y con la barra fija de CTA de la ficha. El pulgar alcanza Buscar y Menú arriba porque la lista no tiene más acciones.
- **Volver:** en la ficha, flecha de 44 px a la izquierda; respeta la lista de origen con sus filtros.
- **Enlace «Saltar al contenido»** primero en el DOM, visible al enfocarlo.

### 4.3 Navegación en escritorio (≥ 900 px)

- Encabezado de 72 px: logo · departamentos en línea · **Marcas** (panel desplegable con las marcas en 3–4 columnas) · campo de búsqueda en línea (≥ 280 px) · Recorrido.
- Migas de pan en la ficha: `Inicio › Caballero › BOSS › {nombre}`.
- Lista: filtros en barra lateral izquierda de 240 px (Marca arriba), rejilla de 4 columnas a la derecha. A < 900 px los filtros son una hoja inferior.
- Todo accesible con teclado (menús con `Esc`, flechas y foco visible); hover solo como mejora.

---

## 5. Pantallas

Formato por pantalla: estructura, jerarquía, estados, microinteracciones, móvil/escritorio. Los copys finales están en §10.

### 5.1 Portada (`/catalogo`)

**Objetivo:** que alguien que ya conoce la tienda llegue a una marca o departamento en un toque, y sienta que es la misma tienda.

**Estructura móvil (de arriba abajo):**

1. **Encabezado** (§4.2).
2. **Hero «el neón».** Foto real del neón blanco «lolo» sobre el muro azul, relación 4:5, altura ≤ 62 svh. Es la «letra iluminada» de la marca: **no se superpone texto sobre la foto**; el borde inferior se funde a blanco con una máscara de degradado (CSS, sin imagen extra). Debajo, el titular:
   - Eyebrow mono (texto en §10).
   - h1: «Lo que hay en la tienda, **ahora en tu celular.**» (la frase en negrita usa `turquesa-titular` con halo, único momento luminoso).
   - Subtexto de una línea y **un** botón: «Ver prendas» (ancla a departamentos) y enlace secundario «Escríbenos por WhatsApp».
   - **Respaldo sin foto** (mientras el dueño no entregue la foto aprobada): logo de 150 px con aro turquesa y halo estático sobre blanco, como la portada del boceto.
3. **Departamentos.** Con los 5 departamentos actuales, tarjetas 2 × 2 y una de ancho completo; con un número par, 2 × n (la rejilla se adapta al número de departamentos con prendas), altura 120 px: foto de una prenda real del departamento sobre `niebla` (multiply) y nombre en 20 px 700. Si no hay prenda con foto: solo texto sobre `niebla` con línea LED. No se muestran conteos de stock; el conteo de prendas publicadas es opcional («18 prendas») y solo si es real.
4. **Compra por marca.** Riel horizontal con *scroll-snap* de chips-texto (alto 56, texto 16 en 700, **sin logotipos**). Orden: el que fije el dueño; por omisión, por número de prendas publicadas. Último elemento: «Ver todas las marcas».
5. **Recién llegado.** Riel de 8 tarjetas (se asoma la 3.ª para invitar al desliz), línea LED de 2 px bajo el riel. Solo prendas con `publishedAt` (ER §2.7) de los últimos N días (el umbral lo fija el dueño; por omisión 21). Si no hay, el bloque se oculta.
6. **Recorrido** (solo si hay panorámica real aprobada): tarjeta con un fotograma recortado de la tienda y el botón «Darte una vuelta por la tienda».
7. **Visítanos.** Dirección, horario y botón «Cómo llegar» (enlace a mapas). Los datos salen de las ubicaciones tipo tienda con `isPublic` (`publicName`, `address`, `openingHours`, `mapUrl`, ER §2.7); si falta alguno, esa línea no se pinta. Debajo, «¿Buscas algo? Escríbenos por WhatsApp».
8. **Pie:** privacidad, «Acceso del equipo», leyenda «Precios en MXN. Consulta disponibilidad en tienda.» (el texto exacto sobre políticas es **[P]**).

**Escritorio:** hero de 21:9 con el neón a sangre y el titular a la izquierda **sobre una franja blanca** (no sobre la foto); departamentos en una sola fila de 5; rieles pasan a rejilla de 4–5 tarjetas con flechas de 44 px.

**Estados:**

| Estado | Comportamiento |
|---|---|
| Cargando | Hero y titular son estáticos (no esperan datos). Esqueletos `niebla` en rieles y departamentos con su aspecto final |
| Vacío (sin productos publicados) | Se ocultan «Recién llegado» y marcas; el hero queda y aparece el mensaje «Estamos subiendo el catálogo» con Visítanos y WhatsApp |
| Error de datos | Banner dentro de la página (no pantalla en blanco): «No pudimos cargar las prendas» con «Reintentar» y «Escríbenos por WhatsApp» |
| Sin conexión | Ver §6 |

**Microinteracciones:** el hero entra con fundido de 500 ms; el aro/halo del neón «se enciende» una vez (≤ 1.2 s) y queda fijo; tarjetas de departamento se hunden (escala .98, 120 ms) al toque; los rieles no se mueven solos.

### 5.2 Departamento (`/catalogo/caballero`)

**Estructura móvil:**

1. Encabezado + fila de departamentos (§4.2).
2. **h1** «**Caballero**» (28 px, palabra luminosa) y línea mono «N prendas» (real, de los resultados actuales).
3. **Marca como primer filtro.** Fila de chips de marca con scroll horizontal, solo marcas con prendas en este departamento, en 44 px; selección múltiple; el chip «Todas» limpia. Esto cumple «la marca es filtro de primer nivel».
4. **Barra de filtros** (pegajosa bajo la fila de marcas): botón «Filtros (n)» abre una hoja inferior con **Talla**, **Tipo** (subcategoría: playeras, pantalones…), **Disponibilidad** (interruptor «Solo lo disponible», activo por omisión [A]) y **Ordenar** (Recién llegado, Precio menor, Precio mayor, Marca A–Z). Junto al botón, el selector de densidad (2 columnas / 3 columnas) de 44 px.
5. **Rejilla** de tarjetas: 2 columnas en 375 (con la densidad compacta, 3), 3 en 600, 4 en 900.
6. **«Ver más»** (botón de 48 px) que carga 24 más; **no hay scroll infinito** (el pie queda alcanzable y es accesible por teclado). El contador «24 de 61» se anuncia con `aria-live`.

**Tarjeta de prenda (componente compartido):**

- Foto 1:1 (derivado de §14.2), esquina de 14 px, fondo blanco.
- Sello superior izquierdo («Nuevo» si cumple el umbral de «recién llegado»; **«Agotado»** si no hay talla disponible), 12 px, dentro de la zona reservada del 10 % superior.
- Debajo: marca en mono 12 (`tenue-texto`), nombre 14/500 a 2 líneas, precio 16/700. Sin chips de tallas en la tarjeta [A] (alargan la tarjeta e insinúan existencias que pueden haber cambiado; el filtro de talla ya resuelve «¿hay mi talla?»).
- **Toda la tarjeta es un solo enlace** (≥ 44 px, obvio). Nombre accesible: «{Marca} {nombre}, {precio}, agotado».
- Sin botón «Guardar» ni «compra rápida» en esta versión.

**Estados:**

| Estado | Comportamiento |
|---|---|
| Cargando | 8 esqueletos de tarjeta; los filtros ya son operables |
| Vacío por filtros | «Sin resultados con estos filtros.» + botón «Quitar filtros» + «Pregúntanos por WhatsApp si lo tenemos» |
| Vacío por departamento | No existe: un departamento sin prendas no se muestra (§4.1) |
| Agotado | Tarjeta se queda visible si el interruptor «Solo lo disponible» está apagado; se ordena al final; foto sin cambios, sello «Agotado», sin atenuar el texto bajo 4.5:1 |
| Error | Banner con «Reintentar»; lo ya cargado se conserva |

**Microinteracciones:** al aplicar un filtro, la rejilla se atenúa 120 ms y se reemplaza (sin animación de orden); en `hover: hover`, la foto sube 4 px (no gira). La lista **no reordena prendas al azar** (el «Mezclar» del boceto queda fuera de v1 [A]: rompe la expectativa de orden y el «atrás»).

**Escritorio:** barra lateral de filtros con Marca arriba (lista con casillas y conteo real); ordenar en la esquina superior derecha de la rejilla.

### 5.3 Marca (`/catalogo/marca/boss`) e índice de marcas

- **Índice (`/catalogo/marcas`):** lista A–Z de marcas con prendas publicadas; índice de letras pegajoso en el costado (cada letra ≥ 44 px de alto en agrupaciones), campo para filtrar por texto. Cada fila: nombre en 18/600 y «N prendas».
- **Marca:** h1 con el nombre de la marca **en texto** (Plus Jakarta 800, sin logotipo), línea «N prendas en tienda», chips de departamento como segundo filtro (`Todo · Caballero · Accesorios …` solo los que tienen prendas), rejilla igual a §5.2.
- **Nota de datos:** hoy `Product.brand` es texto libre; «Armani Exchange», «A|X» y «AX» serían marcas distintas. El ER §2.3 lo resuelve con la tabla `Brand` (nombre canónico y `slug`); el personal puede crear marcas en el alta (D7) y el owner fusiona duplicados, así que una marca fusionada redirige su URL a la canónica [A].
- **Estados:** marca sin prendas disponibles → «Por ahora no hay prendas disponibles de {marca}.» + enlace «Ver todas las marcas»; marca desconocida en la URL → página «No encontramos esa marca» con el índice.

### 5.4 Búsqueda (`/catalogo/buscar`)

**Móvil:** el botón de lupa abre una pantalla completa con el campo enfocado (16 px, alto 52, botón «Borrar» de 44).

- **Antes de escribir:** «Marcas populares» (chips) y «Departamentos» (chips). Opcional: «Búsquedas recientes» guardadas **solo en el dispositivo** (`localStorage`, con enlace «Borrar»); no se envía nada al servidor.
- **Al escribir (150 ms de espera):** resultados en la misma tarjeta de §5.2. La búsqueda ignora acentos y mayúsculas y cubre nombre, marca, departamento y tipo. El catálogo público es pequeño (cientos de prendas), así que se busca sobre un índice ligero en el cliente. **[P]** El dueño puede dar un glosario corto de sinónimos (playera/camiseta, tenis/zapatillas, sudadera/hoodie).
- **Anuncio:** «12 resultados para «boss»» en una región `aria-live="polite"`.
- **Sin resultados:** «No encontramos «{texto}».» + sugerencias (revisar la ortografía, buscar por marca) + botón primario **«Preguntar por «{texto}» en WhatsApp»** (convierte una búsqueda fallida en una consulta; mensaje en §10).
- **Cargando:** el índice se descarga una vez; mientras tanto, el campo funciona y los resultados muestran esqueletos.
- **Error:** igual que §5.2.
- **Escritorio:** campo en el encabezado con lista de sugerencias (marcas y prendas, máx. 6), navegable con flechas y `Enter`.

### 5.5 Ficha (`/catalogo/p/[slug]`)

Es la pantalla que convierte. Objetivo de diseño [A]: en un viewport de **375×640**, sin desplazar, se ven **foto, marca, nombre, precio, selector de talla y botón de WhatsApp**. Los bocetos esconden la barra fija hasta que el CTA sale de pantalla, y en 640 px de alto el CTA queda debajo del pliegue; aquí la barra está **desde la carga**.

**Estructura móvil (375×640):**

| Zona | Alto aprox. | Contenido |
|---|---|---|
| Encabezado de ficha | 48 | Flecha atrás (44), «Compartir» (44, `navigator.share`; si no existe, copiar enlace) |
| Galería | `min(100vw, 48svh)` ≈ 307 | Foto 1:1 maestra en `contain` sobre blanco; desliza con *scroll-snap* horizontal nativo; contador mono «1 / 4» |
| Identidad | 92 | Marca (mono 12), nombre (26), precio (18/700) |
| Talla | 72 | Etiqueta «Talla» + estado, chips 48×48 en fila (desplazable si hay más de 5) |
| Barra fija | 72 | Precio/talla en 14 px + **«Consultar por WhatsApp»** (48 de alto) |

Debajo del pliegue, en este orden:

1. **Disponibilidad por tienda.** Filas de tiendas **públicas** (`Location.isPublic`) con punto + texto: «Tienda Centro · Disponible» / «Tienda Plaza · Agotado». La proyección entrega un booleano por talla y tienda, calculado en el servidor, nunca la cifra (ER §2.7). **Sin cantidades y sin bodega** (las ubicaciones tipo almacén son internas). Si hay talla elegida, refleja esa talla («Talla M: disponible en Tienda Centro»). Si no se conoce, la fila no se pinta.
2. **Botón principal en flujo** (mismo CTA, 56 de alto) con el mensaje visible: «Ver mensaje» (disclosure con el texto exacto que se enviará).
3. **Acordeones:** *Detalles* (abierto, solo si hay descripción real), *Medidas* (solo si hay tabla real para la talla), *Cuidado y composición* (solo si hay datos). Un acordeón sin datos **no se renderiza**; en su lugar, una línea: «¿Dudas con la talla? Pregúntanos por WhatsApp.»
4. **Así está en la tienda:** tarjeta a recorrido, solo si la prenda tiene hotspot real (§5.7).
5. **Más de {marca}:** riel de 6 tarjetas del mismo marca, mismo departamento primero. (No «Combínala con»: no hay datos de combinaciones; se dejaría inventada.)

**Galería y zoom:**

- **Móvil:** la foto abre un visor a pantalla completa con zoom de pellizco nativo (contenedor con `overflow: auto` y `touch-action: pinch-zoom`), botón «Cerrar» de 44 y flechas anterior/siguiente. Nada se activa solo.
- **Escritorio:** miniaturas verticales de 76 px a la izquierda, foto principal 1:1 y **lupa de 2.2×** sobre la maestra de 2048 (como el boceto «Dónde vive cada foto»). La lupa es una mejora de puntero; el equivalente para teclado y táctil es el visor de pantalla completa (`Enter` o clic abre; flechas mueven; `Esc` cierra).
- **Alt:** foto 1 «{Marca} {nombre}, vista frontal»; las demás «{nombre}, foto {n} de {total}»; foto ambiente «{nombre} en la tienda».
- **Fotos (§14.8, decisión abierta):** todas 1:1 en v1. La foto 2 puede ser la foto de ambiente o la trasera cuando existan (D-10).

**Talla (grupo de radio, no botones con `aria-pressed`):**

- Un `radiogroup` etiquetado «Talla»; se mueve con flechas; estados: disponible, seleccionada (fondo `tinta`), agotada (tachada, deshabilitada, nombre «M, agotada»). Leyenda visible bajo el grupo cuando haya alguna agotada: «Tachada = agotada».
- Talla única («Única») viene preseleccionada.
- Si la prenda tiene un solo color o ninguno, **el bloque de color no se renderiza** (hoy toda variante es «General» [V]); nunca se pintan muestras de color inventadas.
- Guía de talla del boceto («Corte holgado…») solo si el dueño la redacta; de lo contrario, no hay.

**CTA y mensaje:** ver §5.8.

**Estados de la ficha:**

| Estado | Comportamiento |
|---|---|
| Cargando | Foto en esqueleto 1:1 (el espacio se reserva); texto en esqueletos; la barra fija ya muestra «Consultar por WhatsApp» con mensaje genérico, porque no depende de datos |
| Sin precio | «Consulta el precio en tienda» en lugar de la cifra; el CTA sigue activo |
| Sin foto | Placeholder `niebla` con el logo en gris y la leyenda «Foto próximamente»; la prenda sigue vendible por WhatsApp |
| Sin talla elegida | Etiqueta «Elige una talla»; al tocar el CTA, el foco va al grupo de tallas y se anuncia «Elige tu talla para armar el mensaje», con la salida «Consultar sin talla» |
| Talla agotada | No se puede elegir; si **todas** las tallas están agotadas: sello «Agotado» sobre la foto, tallas tachadas y CTA secundario «Preguntar si vuelve a llegar» (mensaje distinto) |
| Prenda dada de baja | Página «Esta prenda ya no está en el catálogo» con enlaces a su marca y departamento |
| Error de carga | Pantalla con «Reintentar» y el botón de WhatsApp genérico |
| Sin conexión | Ver §6 |

**Microinteracciones:** al elegir talla, el estado de disponibilidad por tienda cambia con un fundido de 160 ms y se anuncia en una región `aria-live="polite"`; el botón se hunde en `:active`; el aro de la miniatura activa en la galería se marca con borde `tinta` + anillo turquesa; la foto de la galería cambia por deslizamiento (240 ms) o corte con movimiento reducido.

**Datos para compartir (importante):** el enlace de la ficha viaja en el mensaje y se previsualiza en WhatsApp. La página necesita **etiquetas Open Graph** (nombre, marca, precio si existe, foto 1:1 de 1200 px); sin stock ni SKU.

**Escritorio (≥ 900):** dos columnas, galería 1.45fr (con la foto principal pegajosa) y panel de 340–420 px; la barra fija no existe (el CTA va en el panel, siempre visible porque el panel es pegajoso); acordeones bajo el panel.

### 5.6 Qué NO se muestra en la ficha (reglas 2 y 3)

Se eliminan del boceto «Ficha»: el código `LS-7Q4K2M-H`, «2 piezas / 1 pieza / 0» por tienda, la fila «Bodega», «Última», «Últimas 3 piezas», «Pieza única por talla», las medidas en centímetros de ejemplo, «Mezclilla 12 oz…», «Selección Lolo», «Otoño 26 · nuevo en tienda», «Since 2020» y «tienda o SPAY». Todo eso es contenido de muestra: reaparece **solo si el dueño lo aporta como dato real** (descripción, medidas, temporada, formas de pago).

### 5.7 Recorrido (`/catalogo/recorrido`)

El recorrido ya existe como prototipo de Antigravity en `components/virtual-store/*` (cámara esférica, minimapa, cajón de catálogo, modal de producto, interruptor recorrido/cuadrícula). Este diseño **no lo reemplaza**: lo enmarca y fija su UX. Reglas de coordinación en §9.

**Entrada:**

- Solo existe si hay al menos una zona con `panoramaUrl` aprobada. Mientras las coordenadas y fotos sean de muestra (estado actual [V], demo §5.2), el enlace al recorrido **no aparece** en portada, menú ni ficha. Es una bandera, no un «próximamente».
- Carga diferida (`dynamic`, sin SSR); nada del recorrido pesa en la portada (§8).

**Estructura móvil:**

1. Encabezado reducido (atrás + «Recorrido» + interruptor **Recorrido | Lista**, 44 px, recordado entre visitas).
2. **Paso «¿A qué sección vas hoy?»** (idea del boceto): primera vista a pantalla completa con la panorámica de entrada y las zonas como tarjetas en la parte inferior (Dama, Caballero, Calzado…, las que existan). Tocar una mueve la cámara a esa zona.
3. **Visor:** arrastre para girar; botones de giro izquierda/derecha (44) y pantalla completa; el minimapa **empieza colapsado** en un botón de 44 px.
4. **Hotspots:** punto blanco de 24 px con aro turquesa (≥ 3:1 con borde interior `tinta` de 1.5 px si el fondo es claro) y **área táctil de 44 px**. El pulso se repite 2 veces al entrar a la zona y se detiene.
5. **Tarjeta de producto** (hoja inferior, como el boceto): miniatura de 76 px (§14.7), marca, nombre, precio, «Disponible/Agotado» y **«Ver prenda»** (lleva a la ficha con `?desde=recorrido&zona=…`). Un solo botón; el CTA de WhatsApp vive en la ficha.
6. **Ayuda de primera vez:** «Arrastra para mirar. Toca los puntos para ver las prendas.» Se cierra con una X de 44 y no vuelve (se guarda en el dispositivo).

**Riel 2.5D (visual-3d):** la prenda recortada (`cutoutUrl`) que se gira al pasar el cursor o al tocar, y se levanta con un clic/toque, solo se usa en la vista de zona con percheros, y **solo con prendas que tengan recorte**. En móvil no hay hover: el giro se hace por toque (un toque gira 90° entre vistas) o por giro automático de una sola vuelta de 1.2 s al abrir la tarjeta. Prendas sin recorte entran como foto blanca con `multiply` y sin giro.

**Accesibilidad (obligatoria, el visor no es leíble por lector de pantalla):** el modo **Lista** es la alternativa equivalente: lista de prendas por zona (`<ul>`), cada una con enlace a su ficha y la leyenda de ubicación («Tienda Centro › Caballero › Perchero 3»). Los hotspots tienen nombre accesible «{nombre}, {precio}» y se alcanzan con `Tab`; los botones de giro mueven 15° por pulsación; cambiar de zona no depende de arrastrar.

**Estados:**

| Estado | Comportamiento |
|---|---|
| Cargando | Primero un fotograma borroso de la panorámica (≤ 20 KB), luego la panorámica; se muestra «Cargando la tienda…» y el modo Lista ya funciona |
| Ahorro de datos / 2G-3G | Si `navigator.connection.saveData` o conexión lenta, se abre en **Lista** con el botón «Ver recorrido (peso aproximado)»; el peso real lo da el archivo |
| Sin panorámica en una zona | Esa zona no se ofrece |
| Hotspot sin producto asignado | No se pinta (no se asignan productos al azar; `bindProductsToHotspots` por índice queda como defecto a corregir, demo §5.2) |
| Prenda agotada | El hotspot se mantiene con la tarjeta «Agotado» |
| Error | «No pudimos abrir el recorrido» + «Ver la lista» |
| Sin conexión | El recorrido no se precachea (pesado); se ofrece la Lista con lo último visto (§6) |

**Movimiento del visor:** cámara entre zonas en 900–1200 ms con ease `cubic-bezier(.4,0,.2,1)`; con `prefers-reduced-motion`, corte directo con fundido de 120 ms, sin *dolly* ni parallax (§7).

### 5.8 Mensaje a WhatsApp (destino de la conversión)

**Comportamiento:**

- El CTA es un enlace real `https://wa.me/{número}?text={mensaje codificado}` con `target="_blank"` y `rel="noopener"`. No hay paso intermedio: un toque abre WhatsApp con el texto escrito.
- **El número es el real del negocio, tomado de configuración.** En el código actual hay `5211234567890` (**marcador falso**, `ProductHotspotModal`) [V]; no se publica con ese número. Si falta el número configurado, el CTA se cambia por «Consultar en tienda» (con dirección y horario) en vez de apuntar a un número inexistente.
- Debajo del CTA, un disclosure «Ver mensaje» muestra el texto exacto. Desde que se elige talla, el mensaje se actualiza.
- Al tocar, se muestra un aviso `role="status"`: «Abrimos WhatsApp. Si no se abrió, toca aquí.» (enlace al mismo `wa.me`). Si el navegador bloquea la ventana, se ofrece también «Copiar mensaje».

**Plantillas** (sin SKU; el enlace de la ficha identifica la prenda para la persona y el **código público corto** `{codigo}` = `Product.publicCode` la identifica para el bot, [A] A6, ER §2.7):

| Contexto | Mensaje |
|---|---|
| Ficha con talla | `Hola, me interesa {marca} {nombre} en talla {talla}. ¿Sigue disponible? {enlace} Código {codigo}` |
| Ficha sin talla | `Hola, me interesa {marca} {nombre}. ¿Qué tallas tienen? {enlace} Código {codigo}` |
| Color (solo si la prenda tiene colores reales) | se añade « en color {color}» |
| Todas las tallas agotadas | `Hola, vi {marca} {nombre} agotada. ¿Les va a llegar de nuevo? {enlace} Código {codigo}` |
| Búsqueda sin resultados | `Hola, busqué «{texto}» en el catálogo y no lo encontré. ¿Lo tienen en tienda?` |
| Consulta general | `Hola, vi el catálogo de LoloShop y quisiera preguntar por una prenda.` |

- Longitud ≤ 300 caracteres; el nombre se recorta a 80.
- **Prohibido en el mensaje:** SKU, código de barras, cantidades, IDs internos, datos del cliente. El `publicCode` sí va: son 5 símbolos sin relación con el SKU y no revelan nada interno.
- El código **no** se muestra como dato en la ficha (el boceto mostraba el SKU `LS-7Q4K2M-H`, que se elimina, §5.6); solo viaja dentro del mensaje.
- **Respuesta del dueño (promesas):** el mensaje no promete apartado ni entrega. Lo que el dueño conteste es operación, no UI.
- Medición opcional **[P]**: contar toques al CTA sin identificadores personales (para saber si el sitio sirve). Requiere decisión y aviso de privacidad.

---

## 6. Estados transversales

| Estado | Diseño |
|---|---|
| **Cargando** | Esqueletos `niebla` con el aspecto final; sin giratorios a pantalla completa; el encabezado y el CTA de WhatsApp nunca esperan datos |
| **Vacío** | Mensaje corto + salida útil (WhatsApp o tienda). Nunca una pantalla vacía, nunca datos de muestra |
| **Error** | Banner dentro de la página con «Reintentar» y WhatsApp. Lo ya cargado se conserva. El error técnico va a consola, no al cliente |
| **Sin conexión** | PWA: la cáscara y las últimas fichas y listas vistas se sirven del caché. Aviso fijo bajo el encabezado: «Sin conexión. Estás viendo lo último que abriste; la disponibilidad puede haber cambiado.» Cada ficha en caché muestra «Disponibilidad al {fecha y hora}» si hay dato. El CTA queda activo (WhatsApp puede abrirse sin la página); el recorrido y los filtros nuevos se desactivan con explicación |
| **404 / baja** | Texto en español con enlaces a departamentos y marcas |
| **Mantenimiento** | Página estática con dirección y WhatsApp |

---

## 7. Reglas de movimiento

### 7.1 Principios

- El movimiento **explica** (de dónde viene algo, qué cambió); no decora.
- **Solo `transform` y `opacity`** (y `clip-path` en la revelación del hero). Nada que anime `width`, `height`, `top`, `box-shadow` grande o `filter: blur`.
- **Nada se mueve solo más de 5 s.** Todo bucle infinito de los bocetos (`respira`, `mecer`, `pulso`, `brillo`, `flotar`, `parp`) pasa a un máximo de 3 iteraciones o se dispara por interacción (WCAG 2.2.2).
- Hover solo mejora (`@media (hover: hover)`); en táctil se traduce a toque o a una acción única.

### 7.2 Duraciones y curvas

| Tipo | Duración | Curva | Ejemplos |
|---|---|---|---|
| Micro | 120–180 ms | `ease-out` | Presionar botón, marcar chip, foco |
| Estándar | 240–320 ms | `cubic-bezier(.2,.7,.2,1)` | Hoja de filtros, galería, acordeón, cambio de talla |
| Énfasis | 500–700 ms | `cubic-bezier(.2,.7,.2,1)` | Entrada del hero, tarjeta de producto del recorrido |
| Cámara del recorrido | 900–1200 ms | `cubic-bezier(.4,0,.2,1)` | Cambio de zona |
| Salidas | ≈ 70 % de la entrada | `ease-in` | Cerrar hoja, cerrar visor |

- Escalonado de lista: ≤ 60 ms entre elementos y máximo 6 elementos; el resto aparece junto.
- Sin *parallax* en el sitio (el `CatalogClient` anterior lo tenía; no se retoma). La profundidad la da el recorrido, no el scroll.

### 7.3 `prefers-reduced-motion: reduce`

Se aplica a **CSS y a JavaScript** (en los bocetos solo se aplicó a CSS; los `Element.animate()` de «mezclar» y de entrada de rejilla lo ignoraban).

| Con movimiento normal | Con movimiento reducido |
|---|---|
| Hero con revelado y halo que se enciende | Aparece completo, halo fijo |
| Entrada escalonada de tarjetas | Aparecen juntas, sin desplazamiento |
| Deslizar de galería (240 ms) | Corte inmediato o fundido ≤ 120 ms |
| Giro de prenda 2.5D | Botones «Frente / Espalda» (sin giro) |
| *Dolly* de cámara entre zonas, hotspot con pulso | Corte directo; hotspot con anillo estático |
| *Scroll* suave | `scroll-behavior: auto` |
| Esqueleto con brillo | Esqueleto estático |

Además: pausa de cualquier animación cuando la pestaña no está visible; ninguna animación empieza antes de que haya contenido útil en pantalla.

---

## 8. Presupuesto de rendimiento móvil

Dispositivo de referencia [A]: Android de gama media (aprox. Moto G) con CPU a 4× más lenta y red **Slow 4G** (1.6 Mbps, 150 ms), caché fría. Se mide en Lighthouse móvil y en un dispositivo real.

| Métrica | Meta |
|---|---|
| LCP (portada, ficha, lista) | ≤ 2.5 s (meta [A] 2.0 s) |
| INP | ≤ 200 ms |
| CLS | ≤ 0.05 (fotos con `aspect-ratio`, fuentes con métricas ajustadas) |
| TBT | ≤ 200 ms |
| Lighthouse móvil | Rendimiento ≥ 90, Accesibilidad = 100, SEO ≥ 95 |

| Recurso | Presupuesto |
|---|---|
| JS de la ruta (portada y lista), comprimido | ≤ 110 KB |
| JS de la ficha tras interacción | ≤ 170 KB acumulado |
| Recorrido | Pieza aparte, diferida; no cuenta en lo anterior. Meta [A] ≤ 350 KB de JS y ≤ 600 KB de panorámica por zona (WebP, 4096×2048) |
| CSS crítico | ≤ 25 KB comprimido |
| Fuentes | ≤ 70 KB `woff2` en total; sin bloqueo del render |
| Portada, bytes antes del primer desplazamiento | ≤ 600 KB |
| Hero | AVIF/WebP, 828 px de ancho, ≤ 80 KB, `priority`, dimensiones declaradas |
| Tarjeta de rejilla | 400 px, ≤ 35 KB (§14.2); `sizes` para 2/3/4 columnas; las 4 primeras `eager`, el resto `lazy` |
| Ficha | Foto principal 800 px (móvil) ≤ 110 KB, `priority`; lupa y visor cargan la maestra de 2048 solo al abrirse |

Reglas visuales con costo:

- **Prohibidas** las manchas desenfocadas animadas de pantalla completa del boceto (`.irradia`, `blur(60–80px)` con `animation`): repintan en cada cuadro. Se sustituyen por un `radial-gradient` estático.
- `backdrop-filter` solo en el encabezado y en hojas/modales (máx. 1 visible a la vez). Sin él, el fondo cae a blanco al 96 %.
- Sin `filter: blur` en capas grandes, sin SVG con `feGaussianBlur` animado, sin `will-change` permanente.
- Imágenes siempre por `next/image` (o derivados pregenerados) con WebP/AVIF; nunca la maestra en una tarjeta.
- Datos: la lista pública usa una proyección ligera (`toPublicProduct`, sin SKU ni inventario por sucursal); se recomienda **caché de 60 s** con revalidación, en vez de `force-dynamic` de la página actual [V]. La frescura de la disponibilidad se compensa mostrando la hora en modo sin conexión (§6).
- PWA: precache de la cáscara; imágenes con *cache-first* (máx. 60 entradas, 7 días); datos *network-first* con espera de 3 s antes de usar el caché.
- Sin scripts de terceros que bloqueen el render.

---

## 9. Reparto del trabajo

### 9.1 frontend-pwa

- Rutas de §4.1; filtros en URL; restauración de scroll; página de ficha completa con metadatos *Open Graph*.
- Proyección pública `toPublicProduct()` (`publicCode`, `slug`, marca, nombre, departamento, tipo, precio, imágenes, `publishedAt`, `description`, tallas con **solo** `disponible/agotado`, tiendas públicas con `disponible/agotado`). **Sin SKU, sin `barcode`, sin cantidades, sin bodega** (demo §5.2, bloqueante B1). Campos según ER §2.7.
- Componentes de presentación: encabezado, menú, chips, tarjeta, rejilla, hoja de filtros, ficha, barra fija, acordeones, selector de talla (radiogroup), región `aria-live`, banner sin conexión.
- Generador de mensaje de WhatsApp (plantillas de §5.8) y lectura del número desde configuración, con el estado «Consultar en tienda» si falta.
- Service worker/PWA según §8; índice de búsqueda ligero.
- Quitar del flujo público lo que ya se sabe fuera de regla: `LS-DEMO-01`, `?? 4`, número falso, tarjetas con código (demo §5.2, B2).

### 9.2 visual-3d

- Recorrido: paso «¿A qué sección vas hoy?», zonas desde datos, hotspots con área táctil de 44 px, hoja de producto, modo Lista equivalente, movimiento reducido, carga diferida y modo de ahorro de datos (§5.7).
- Riel 2.5D (giro por toque, levantado, recortes) acotado a §5.7. Con `prefers-reduced-motion`, botones Frente/Espalda.
- Medición de `yaw`/`pitch` sobre fotos reales (demo §5.2, punto 4); quitar zonas y hotspots de muestra.
- Panorámicas y fotogramas con peso dentro de §8.

### 9.3 backend-data (necesario para el diseño)

Hoy el modelo no cubre todo lo que el diseño pide [V: `Product` tiene `category` y `brand` como texto]. Respuesta del ER (fuente de verdad, §2.3 y §2.7) [A] A7:

| Necesidad | Para qué | En el ER | Prioridad |
|---|---|---|---|
| Departamento (Dama, Caballero, Niños, Calzado, Accesorios) separado del tipo (`category`) | Navegación y portada | `Department`, tabla editable ([D] D6); `Product.departmentId`, obligatorio en el alta nueva (A3) | P1 |
| Marca canónica con slug | Filtro de primer nivel, índice de marcas | `Brand` con `slug` único ([D] D7) | P1 |
| Código público corto | Mensaje de WhatsApp y bot | `Product.publicCode` (A6) | P1 (lo exige B1) |
| `slug` de la ficha | Ruta `/catalogo/p/[slug]` | `Product.slug` | P3 |
| `publishedAt` y bandera de publicado/oculto | «Recién llegado», baja de prenda | `Product.publishedAt` (nulo = no publicado) + `isActive` | P3 |
| Descripción opcional | Acordeón *Detalles* | `Product.description` | P3 |
| Disponibilidad por talla y por tienda | Selector de talla, disponibilidad por tienda | **Calculada** en la proyección como booleano; no se guarda | P3 |
| Datos públicos de tienda: nombre, dirección, horario, enlace de mapa | Visítanos | `Location.isPublic`, `publicName`, `address`, `openingHours`, `mapUrl` | P3 |
| Número de WhatsApp | CTA | Uno del negocio, `NEXT_PUBLIC_WHATSAPP_NUMBER` (no por tienda) | P3 |
| Medidas y cuidado | Acordeones | **Fuera de P1**, sin columna; el acordeón no se pinta | Posterior |
| Tallas por departamento (ropa CH–XG, calzado numérico, niños por edad, «Única») | Selector y filtro de talla | **Fuera de P1**; `Variant.size` sigue como texto | Posterior |
| Foto de ambiente / trasera por prenda | Galería | **Fuera de P1**; tras D-10 (`backImageUrl` opcional) | P3 |

### 9.4 Antigravity

Este documento **difiere** del prototipo actual en: (a) el recorrido es una sección, no toda la página; el prototipo mezcla recorrido y cuadrícula en una sola pantalla con encabezado de vidrio flotante; (b) el prototipo usa `#f8f9fa`, grises de Tailwind, mono de 10 px y manchas de blur con `mix-blend-multiply` (§8); (c) usa `bg-loloteal` en textos pequeños (2.23:1). Se conserva lo que sirve: cámara esférica, minimapa, cajón de catálogo y el interruptor recorrido/lista. Antigravity debe revisar este documento antes de seguir; cualquier divergencia se discute en vez de duplicar.

---

## 10. Textos clave (español de México, tuteo, tono directo)

| Dónde | Texto |
|---|---|
| Eyebrow del hero | `LOLOSHOP · TIENDA EN TU MANO` |
| h1 portada | «Lo que hay en la tienda, **ahora en tu celular.**» |
| Subtexto portada | «Mira qué hay, elige tu talla y pregúntanos por WhatsApp.» |
| Botón hero | «Ver prendas» |
| Enlace hero | «Escríbenos por WhatsApp» |
| Sección departamentos | «¿Qué buscas hoy?» |
| Sección marcas | «Compra por marca» · «Ver todas las marcas» |
| Sección nuevos | «Recién llegado» |
| Recorrido | «Date una vuelta por la tienda» · «Arrastra para mirar. Toca los puntos para ver las prendas.» |
| Visítanos | «Visítanos» · «Cómo llegar» |
| Búsqueda (campo) | «Busca una marca o una prenda» |
| Resultados | «12 resultados para «boss»» · «1 resultado» |
| Sin resultados | «No encontramos «{texto}».» · «Prueba con otra palabra o busca por marca.» · «Preguntar por «{texto}» en WhatsApp» |
| Filtros | «Marca» · «Talla» · «Tipo» · «Solo lo disponible» · «Ordenar» · «Quitar filtros» · «Filtros (2)» |
| Orden | «Recién llegado» · «Precio: menor a mayor» · «Precio: mayor a menor» · «Marca A–Z» |
| Paginación | «Ver más» · «Mostrando 24 de 61» |
| Sello tarjeta | «Nuevo» · «Agotado» |
| Ficha | «Talla» · «Elige una talla» · «Talla M» · «Tachada = agotada» |
| Disponibilidad | «Disponible en tienda» · «Disponible» · «Agotado» · «Talla M: disponible en Tienda Centro» |
| CTA | **«Consultar por WhatsApp»** |
| Nota bajo CTA | «Te confirmamos si está en tienda.» |
| CTA sin talla | «Elige tu talla para armar el mensaje.» · «Consultar sin talla» |
| CTA agotada | «Preguntar si vuelve a llegar» |
| Aviso tras tocar | «Abrimos WhatsApp. Si no se abrió, toca aquí.» · «Copiar mensaje» |
| Sin precio | «Consulta el precio en tienda» |
| Sin foto | «Foto próximamente» |
| Sin medidas | «¿Dudas con la talla? Pregúntanos por WhatsApp.» |
| Más productos | «Más de {marca}» |
| Prenda baja | «Esta prenda ya no está en el catálogo.» · «Ver más de {marca}» |
| Vacío general | «Estamos subiendo el catálogo. Mientras, escríbenos o pasa por la tienda.» |
| Error | «No pudimos cargar las prendas.» · «Reintentar» |
| Sin conexión | «Sin conexión. Estás viendo lo último que abriste; la disponibilidad puede haber cambiado.» · «Disponibilidad al {fecha y hora}» |
| Número faltante | «Consultar en tienda» |
| Compartir | «Compartir» · «Enlace copiado» |
| Accesibilidad | «Saltar al contenido» · «Abrir menú» · «Cerrar» · «Buscar» · «Foto 2 de 4» |
| Pie | «Precios en MXN.» + (política de apartado/pagos/devoluciones: **[P]**, no se escribe hasta que el dueño la defina) |

Prohibido en cualquier copy: cifras de existencias, «últimas piezas», precios o reseñas de muestra, promesas de entrega o apartado.

---

## 11. Accesibilidad: checklist de aceptación

- Contraste AA con los tokens de §3.2; foco visible con anillo de 2 px `turquesa-texto` + 2 px blanco; el estado nunca depende solo del color o del halo.
- Zonas táctiles ≥ 44×44 con ≥ 8 px entre ellas (tallas 48; hotspots 24 visibles + 44 de área).
- Estructura: `header`, `nav`, `main`, `footer`, un `h1` por pantalla, jerarquía sin saltos. Enlace «Saltar al contenido».
- Tarjetas = un enlace; botones = `<button>`; chips de filtro = `<button aria-pressed>`; tallas = `radiogroup`; hojas y visor = `dialog` con foco atrapado, `Esc` y retorno del foco.
- Resultados y estados de disponibilidad en regiones `aria-live="polite"`; avisos de error en `role="alert"`.
- Imágenes: alt útil en producto (§5.5), `alt=""` en decorativas (logo repetido, halos). El alt de producto nunca repite SKU.
- Texto ≥ 12 px en etiquetas, 16 px en cuerpo e inputs; zoom hasta 200 % sin pérdida de contenido ni scroll horizontal (salvo rieles).
- `prefers-reduced-motion` (§7.3) y sin animaciones > 5 s sin control.
- Hover como mejora; todo operable con teclado y con un dedo; sin gestos obligatorios (el deslizar de la galería tiene flechas).
- Formularios (búsqueda): etiqueta visible o `aria-label`, `inputmode="search"`, `autocomplete="off"`.
- Idioma `lang="es-MX"`; moneda con formato `es-MX` («$1,290 MXN»).

### 11.1 Problemas encontrados en los bocetos (resumen para quien los reuse)

**«LoloShop en blanco»:**

1. Texto y botones turquesa `#22B8B8`: 2.44:1 con blanco; texto blanco sobre ese turquesa (CTA, «Ver prenda», burbujas del chat) también 2.44. Falla AA normal y AA grande.
2. `--tenue #7C8E8D` como texto: 3.44 con blanco, 3.18 con niebla.
3. Foco turquesa 2 px: 2.44, falla el 3:1 de indicador de foco.
4. Estado seleccionado (talla, departamento) = borde + texto turquesa + halo: depende del color.
5. Textos de 9–11 px en mono (`.sub`, `.x`, `.ruta-tour`, `.chat-cab .sim`, `.cap .ts`).
6. Sin semántica: departamentos, piezas, «Entrar a la tienda» y el CTA son `div`/`span`; las tallas son `span`; imposibles con teclado y lector de pantalla.
7. Áreas táctiles < 44: tallas 42 px, hotspot 20 px.
8. Bucles infinitos sin pausa (`respira`, `parp`, `mecer`, `pulso`, `brillo`, `flotar`).
9. `Element.animate()` de «mezclar» y de entrada de rejilla **ignora** `prefers-reduced-motion` (solo está el CSS).
10. Recorrido autoplay de 30 s que se reinicia en bucle (hay pausa, pero arranca solo).
11. Halo (`text-shadow`) sobre textos de 10–16 px; `.depto` con `backdrop-filter` sobre escena sin contraste garantizado.
12. Rendimiento: fuentes por `<link>` a Google (bloquea el render), manchas fijas con `blur(60px)` animadas, `backdrop-filter` repetido, `feGaussianBlur` en SVG.
13. Contenido de muestra: «Since 2020», «64 piezas», «Otoño 26», «SPAY», «te la aparto hasta mañana», código `LS-7Q4K2M-H`.

**«Boceto ficha»:**

1. Muestra el código del producto, cantidades por tienda, «Bodega», «Última» y «Últimas 3 piezas» (viola la regla de datos internos).
2. Insignia «Última»: blanco sobre `#B26A00` 4.24:1 y 9 px.
3. Muestras de color de 34 px; hover como única señal (`.color:hover`).
4. Zoom activado por `pointerup` en toda la foto, sin equivalente de teclado; swipe por `pointermove`.
5. La barra fija se oculta hasta que el CTA sale de pantalla; en 375×640 el CTA principal queda bajo el pliegue.
6. Paleta cobalto y fuentes Archivo/Geist: no es la dirección aprobada.

**«Dónde vive cada foto»:**

1. Lupa solo con puntero; en táctil se enciende con `pointerdown` y se apaga con `pointerup` (no se puede explorar); sin teclado ni `touch-action`.
2. Foto principal con `alt=""`; las tarjetas usan el nombre, pero sin marca ni precio en el nombre accesible.
3. Botón «Guardar» de 30 px, sin estado ni función.
4. Precio turquesa 14 px (2.44:1); sello turquesa de 10.5 px; leyendas de 10.5 px.
5. Hotspots de 22 px; la tarjeta flotante se posiciona en porcentajes y se desborda en bordes.
6. Fondos con blur animado fijo (costo de repintado).

---

## 12. Decisiones

### 12.1 Pendientes del dueño

| # | Decisión | Mi recomendación [A] |
|---|---|---|
| S-1 | **Resuelta 2026-11-05.** Departamentos: Dama, Caballero, Niños, Calzado, Accesorios [D] D6 (tabla editable; crecerá). Ropa interior dentro de Dama por ahora (A4, revisable) | Lanzar con los que tengan prendas publicadas |
| S-2 | **Encuadre 80 % vs 88 %** (§14.1) | **80 %.** Con 80 % el margen de cada lado es 10 %, justo la zona reservada para sellos y guardar; con 88 % queda 6 % y los sellos taparían la prenda. Si el dueño elige 88 %, hay que sacar los sellos de la foto (a la esquina de la tarjeta, debajo) |
| S-3 | **Foto secundaria 3:4** en la ficha (§14.8) | **No en v1.** Fotos 1:1 y 3:4 mezcladas obligan a un contenedor 4:5 (más alto, empuja precio/talla/CTA bajo el pliegue) o a franjas blancas. Todas 1:1 y revisar con ventas reales |
| S-4 | **Foto del neón «lolo»** como portada (aprobar la toma) y corrección de color | Sí; foto con luz de color permitida como imagen de ambiente, no como referencia de producto (§14.6) |
| S-5 | **Texto de políticas** (apartado, pagos, devoluciones, horarios) | No publicar hasta tenerlo; la ficha y el pie no prometen nada |
| S-6 | **Número de WhatsApp** real y mensaje de bienvenida | Necesario antes de abrir el sitio al público |
| S-7 | **Umbral de «Recién llegado»** | 21 días |
| S-8 | **Medición de toques al CTA** (anónima) | Sí, con aviso de privacidad |
| S-9 | **Glosario de sinónimos** de búsqueda | Una lista corta del dueño |
| S-10 | **Interruptor «Solo lo disponible» activo por omisión** | Sí; las agotadas siguen a un toque |

### 12.2 Decisiones tomadas por el diseñador (el dueño puede revertirlas)

1. **Tokens accesibles** (§3.2): `turquesa-texto #0C7C7C`, `tenue-texto #5C6E6D`, `borde-control #7F9392`, CTA con texto `tinta` sobre turquesa, estado seleccionado en `tinta`.
2. **CTA «Consultar por WhatsApp»** en vez de «Pedir por WhatsApp»: no hay checkout y «pedir» sugiere compromiso de compra.
3. **El mensaje no lleva SKU**; lleva el enlace de la ficha y el código público corto (`publicCode`, A6).
4. **Sin cantidades, «Última», «Pieza única», «Bodega»** en ninguna parte pública.
5. **Barra de CTA fija desde la carga** en móvil (no al salir el botón de pantalla).
6. **Sin barra inferior de pestañas**; encabezado + fila de departamentos.
7. **Marcas en texto**, sin logotipos; **índice A–Z** y filtro de marca en la primera fila.
8. **Fuera de v1:** «Guardar», «Mezclar», compra rápida, carrito, cuentas, muestras de color (hasta que haya variantes por color), «Combínala con» (no hay datos de combinaciones).
9. **Botón «Ver más»** (24 por tanda) en vez de scroll infinito.
10. **Halo restringido** a una palabra por pantalla y a decoraciones (§3.4); sin parallax en el sitio.
11. **Recorrido detrás de bandera** hasta que existan panorámicas y hotspots reales; con modo Lista obligatorio.
12. **Departamento vacío no se muestra**; el conteo de prendas solo si es real.
13. **Rutas bajo `/catalogo`**, ficha como página completa (no modal).
14. **Hero con foto real del neón** (con respaldo CSS de logo + aro) y titular debajo, nunca encima de la foto.
15. **Fuentes autoalojadas** (`next/font`), un solo `backdrop-filter` permanente, destellos estáticos.
16. **Caché de 60 s** para la lista pública en lugar de `force-dynamic` (propuesta; la implementa frontend-pwa si está de acuerdo).

---

## 13. Criterios de aceptación

- La ficha en 375×640 muestra foto, marca, nombre, precio, tallas y CTA sin desplazar. [A] Verificar en un Android real.
- Ninguna pantalla pública contiene SKU, cantidad de stock, bodega ni datos de muestra (prueba automática sobre el HTML y las respuestas del servidor).
- Todos los pares texto/fondo de §3.2 cumplen AA; Lighthouse Accesibilidad = 100; recorrido de teclado completo en portada, lista, ficha y búsqueda.
- Con `prefers-reduced-motion`, ninguna animación de transformación se ejecuta, incluidas las de JavaScript.
- Cumple §8 en Slow 4G/CPU 4×; el recorrido no carga hasta abrirse.
- Un toque a «Consultar por WhatsApp» abre WhatsApp con el mensaje correcto, con enlace de la ficha y `publicCode` y sin SKU; si falta el número, el botón cambia a «Consultar en tienda».
- Modo sin conexión: la ficha y listas ya vistas abren con el aviso de §6.
- Revisión conjunta con el dueño en un celular real antes de publicar (regla 1).

---

## 14. Registro de decisiones 2026-11-05

**Del dueño [D] 2026-11-05.** Casi todas afectan a la app interna; en el sitio público aplican así:

| # | Decisión | Efecto en este documento |
|---|---|---|
| D1 | Ventas concurrentes de colaborador y owner en las dos tiendas | Ninguno directo; la disponibilidad pública refleja ventas al instante porque se calcula del stock (§8, caché de 60 s) |
| D2 | Ventas y dashboards antes del Buen Fin; congelamiento durante el Buen Fin y diciembre | El sitio público (P3) no entra en la ventana previa al Buen Fin salvo B1; su lanzamiento se planea fuera del congelamiento |
| D3 | Todos los roles ven importes; mismo dashboard; colaborador solo el día | Ninguno: ningún importe de venta aparece en lo público |
| D4 | Solo el owner anula ventas | Ninguno |
| D5 | No se guardan datos de contacto del cliente | §5.8: el mensaje no lleva datos del cliente; la medición de toques (S-8) sigue sin identificadores |
| D6 | Departamentos Dama, Caballero, Niños, Calzado, Accesorios; tabla editable que crecerá | §4.1, §4.2, §5.1, §9.3, S-1 |
| D7 | El colaborador crea marcas en el alta; el owner edita o fusiona | §5.3 (marca fusionada redirige a la canónica), §9.3 |

**Del autor (decisión del autor, revisable):**

| # | Decisión | Efecto en este documento |
|---|---|---|
| A1 | WhatsApp variante A; sin reserva | §2.2 y §5.8 ya no prometen apartado; se mantiene |
| A2 | Confirmar SPAY: owner y manager | Ninguno |
| A3 | Departamento obligatorio en el alta nueva | Con el tiempo, toda prenda publicada tiene departamento; una prenda sin departamento no se lista en `/catalogo/[departamento]` pero sí en marca y búsqueda |
| A4 | Ropa interior dentro de Dama | S-1 |
| A5 | Umbral de stock bajo | Ninguno (interno) |
| A6 | Código público corto `publicCode` | §5.8 (plantillas), §9.1, §12.2, §13 |
| A7 | Campos públicos de P3 en el ER | §5.1, §5.5, §9.1, §9.3 |

**Siguen abiertos (pendientes del dueño):** merge del worktree `feat/demo-alta-lote`; quién hace el respaldo, la rama de Neon y `DIRECT_URL`. Además, los S-2 a S-10 de §12.1.
