# Ideas de visualización para el catálogo y la tienda digital

- **Fecha:** 2026-10-27 · **Estado:** investigación para decisión (no es un spec de implementación) · **Sin secretos** (repo público)
- **Fuentes:** publicaciones del perfil `velvetica.studio` (Instagram, revisadas desde la sesión del dueño el 2026-10-27) y búsqueda web.
- **Convención:** **[V]** visto en la publicación o en la fuente citada; **[C]** claim de un proveedor o de la publicación, sin verificar; **[A]** juicio propio para LoloShop.
- **Uso:** insumo para `2026-10-27-loloshop-maestro-design.md` y `plans/2026-10-27-loloshop-plan-global.md`.

---

## 1. Resumen

El perfil de `velvetica.studio` es una agencia de Shopify que muestra sus trabajos en Reels y carruseles. No es una tienda física: sirve como **referencia visual**, no como competencia directa. Sus publicaciones muestran patrones de visualización que se pueden replicar en LoloShop sin IA, sobre el catálogo y el recorrido de la tienda.

De 23 publicaciones se revisaron 20 con su contenido. Quedan sin revisar: dos imágenes de la última fila (una con "3.8%" de conversión y otra con un teléfono de pago) y un Reel de zapatos Luka 5 que parece el mismo de un Reel ya revisado [A]. Ver §7.

---

## 2. Ideas de visualización de producto y catálogo

### 2.1 Riel de perchero interactivo
- **Fuente:** Reels `De8-9tBtNKt` (el mecanismo) y `Degpd1kt_ZZ` (el riel en acción, con el recuadro "Product") [V].
- **Mecanismo:** al pasar el cursor, la prenda se gira hacia el espectador. Al hacer clic se levanta en 3D. Luego se elige talla y se agrega al carrito. Deslizar la vista pasa por el riel sin hacer clic.
- **Advertencia:** el Reel `De6sr5Nt8ww` (tutorial del riel en 20 min) tiene un comentario que dice que el riel se rompe con muchas prendas [C]. **Implicación [A]:** el riel necesita filtro o paginación por categoría.
- **Para LoloShop:** es la visualización más cercana a `/catalogo` y a los hotspots del recorrido. Prioridad alta.

### 2.2 Giro orbital del producto (visor 360°)
- **Fuente:** Reel `DettiT9tnR5` ("When nike rotates in orbit"), 489 me gusta, 54 comentarios [V].
- **Mecanismo:** un tenis gira alrededor de su eje en una tienda Shopify. Es un visor de producto, no un recorrido.
- **Comentarios:** varios piden el código o la demo. Un comentario señala que la mayoría de visitas de su tienda son desde móvil [V].
- **Para LoloShop:** segunda etapa. Requiere fotos de 360° del producto (o modelo 3D) por prenda, lo que suma trabajo de captura. Ver §5.

### 2.3 Armar tu paquete (bundle builder)
- **Fuente:** Reel `DerUDSaNizz` ("Choose your essentials", "Choose at least 2 of 2 chosen") [V]; Reel `DYcxb8rjYxB` (paquetes de bloques con precio por volumen) [V].
- **Mecanismo:** el cliente elige productos de una cuadrícula y el total se actualiza. Hay un mínimo de piezas y un descuento por volumen.
- **Para LoloShop:** útil para combos de playeras o accesorios. Requiere reglas de precio, que hoy no existen. Tercera etapa.

### 2.4 Selector de color y compra rápida
- **Fuente:** Foto `DezFhrojejv` (rediseño HEZAK): "Color swatches & seamless quick-add" [V].
- **Mecanismo:** muestras de color en la cuadrícula y botón "agregar" sin abrir la ficha.
- **Advertencia:** un comentario advierte que, en móvil, la compra rápida no debe ocultar precio, talla seleccionada ni aviso de poco stock, porque ese detalle genera devoluciones [C].
- **Para LoloShop:** directamente aplicable a la cuadrícula de `/catalogo`. Requiere que el catálogo tenga variantes por color, que hoy es un campo fijo `"General"` en el modelo de variante [V].

### 2.5 Buscador de talla
- **Fuente:** Reel `Delt0SAN-xi` ("Size Chart in 2027"): silueta, altura, peso y pecho, y una recomendación de talla [V].
- **Mecanismo:** dos pasos. El cliente ingresa medidas y el sistema sugiere una talla por prenda.
- **Advertencia:** el propio reel dice que reduce devoluciones [C].
- **Para LoloShop:** requiere tablas de talla por prenda. Cuarta etapa, después de contar con datos de talla confiables.

### 2.6 Sala virtual con pestañas por sección ("Nike Virtual Store")
- **Fuente:** Reel compartido por el dueño el 2026-10-27, de `adexbuilds` y `bildyard`, "New age shopping concept 2026", con 7,575 me gusta [V en el video]. Es un concepto, no un producto de Nike [A].
- **Mecanismo:** cuarto blanco renderizado con el logo arriba, un riel de ropa y repisas con tenis. Pestañas Store, Clothing, Caps, Bags y Shoes: al elegir una, la cámara se mueve a esa sección. Al seleccionar una prenda se acerca, con el aviso "pick a view to turn" (vistas de la prenda, no un modelo 3D completo). Panel con categoría, nombre, precio, color, tallas XS–XXL y "Add to Cart".
- **Para LoloShop (decisión D-9, opción C):** la sala virtual es la **primera etapa de pruebas**. La meta es el mismo recorrido con **fotos reales del local organizadas por sus secciones** (playeras, chamarras, accesorios, gorras). El aviso "elige una vista para girarla" se logra con foto frontal y trasera de cada prenda (D-10).

---

## 3. Ideas de ficha de producto y carrito

### 3.1 Ficha que convierte
- **Fuentes:** Foto `DasFl1AtW0q` ("Built to convert": reseñas arriba del pliegue, precio con paquete, insignias de confianza) [V]; texto `DeMX_uFDcIe` (la ficha pierde ventas antes de "agregar al carrito") [V].
- **Para LoloShop:** la ficha del hotspot del recorrido (`ProductHotspotModal`) debe mostrar precio, talla disponible y "consultar en tienda" arriba del pliegue, sin cifras de stock inventadas (ver spec de la demo §5.2).

### 3.2 Cajón de carrito con progreso
- **Fuente:** Foto `DeMNP-sNAmS` (barra de progreso de regalo, recomendaciones, fecha de entrega estimada, cantidad editable) [V].
- **Para LoloShop:** no aplica todavía, porque el canal de compra es WhatsApp y no hay carrito (decisión de los specs del bot). Se queda como referencia para una fase futura con cobro.

---

## 4. Popups y captación con juego

- **Fuentes:** Reels `De9nxz4tPQu` y `DeOYv-ctOfr` (cupón "rascar para revelar"); Reel `DeuNIcztQaD` ("Shoot 3, win up to 15% off", arrastrar el balón al aro) [V].
- **Mecanismo:** un juego sencillo (rascar o encestar) da un descuento a cambio del correo.
- **Para LoloShop:** no es visualización de catálogo. Puede servir en la demo para captar correos de clientes de tienda, pero **choca con la privacidad** de los specs (captura de datos y consentimiento). Requiere decisión del dueño y aviso de privacidad. Fuera de la demo por ahora.

---

## 5. Rediseños y antes/después

- **Fuentes:** Fotos `DXqq-XEDZzr` ("Renovation journey"), `DaSgiS8jem3` (galería de looks de un tema de moda), `Dar2-Z9jR9L` (rediseño no oficial de una marca real) y `DezFhrojejv` (HEZAK) [V].
- **Mecanismo:** carrusel de capturas antes/después, con texto de qué cambió y por qué.
- **Para LoloShop:** sirve para mostrar el recorrido renovado frente a la tienda actual. **Cuidado:** el rediseño de la marca real `Dar2-Z9jR9L` se presenta como experimento no oficial. Si hacemos algo similar con una marca de cliente, necesita permiso de esa marca.

---

## 6. Cómo se relaciona con la tienda física (recorrido 3D)

Las publicaciones de Velvetica no muestran recorridos de tienda física. Sus visualizaciones son de tienda en línea. Lo que sí podemos tomar es el **lenguaje de hotspots** (recuadro "Product" sobre cada prenda, Reel `Degpd1kt_ZZ`) y el **riel como metáfora de perchero** (Reel `De8-9tBtNKt`). Lo demás del recorrido (Gaussian Splatting, panorámicas) sale de la investigación web de §8.

---

## 7. Pendientes de revisión

- Foto de la última fila con **"3.8%" de conversión en ficha de producto**: cifra de proveedor, no verificada [C].
- Foto de la última fila con **teléfono y checkout**: sin revisar.
- Reel "Nike should hire us" (Luka 5): probablemente el mismo de §2.2 (`DettiT9tnR5`) [A]. Confirmar.

---

## 8. Investigación web (apoyo)

| Tema | Hallazgo | Fuente | Confianza |
|---|---|---|---|
| Visor 3D de calzado | Proveedores ofrecen visores 360° para tiendas de tenis; no hay evidencia de que Nike lo use en su sitio | [FittingBox](https://footwear.fittingbox.com/3d-viewer-of-shoes), [Threekit](https://www.threekit.com/3d-product-library/sneaker) | [C] |
| Concepto Nike | Diseño de agencia de una web de Nike con modelos 3D; no es un producto de Nike | [Blacklead Studio](https://creativepool.com/blacklead-studio/projects/concept-nike) | [V] como concepto |
| Gaussian Splatting para comercio | Prototipo de showroom con cámara XGRIDS, SuperSplat y visor web | [WeGetAround](https://www.wegetaroundnetwork.com/topic/21364/rd-interactive-3d-retail-experience--no-code-workflow-with-xgrids) | [C] |
| Splats en Shopify | Existe una app de pago para cargarlos (precio por año y prueba de 14 días) | [Radiance Fields](https://radiancefields.com/how-to-load-gaussian-splatting-in-shopify) | [C] verificar precio |
| Limitación de splats | Se ven bien desde los puntos de captura, pero no sirven para medir ni para CAD | [SkyeBrowse](https://www.skyebrowse.com/news/posts/gaussian-splatting.md) | [C] |
| Hotspots "shoppables" | Foto con puntos que abren panel de producto; vendido como app en Shopify | [Shopify App](https://apps.shopify.com/shoppable-image-hotspots), [guía](https://tagembed.com/blog/?p=21904) | [C] |
| Etiquetado automático | Un proveedor usa IA para colocar hotspots en la imagen | [Amplience](https://amplience.com/marketplace/shoppable-image/) | [C], costo de pago |

---

## 9. Recomendación para LoloShop

| Prioridad | Idea | Fase | Por qué |
|---|---|---|---|
| 1 | Riel con hover, giro y clic 3D (§2.1) | Demo (Sprint D2) | Es la visualización más cercana a la tienda física. Sin IA |
| 2 | Hotspots con panel de producto (§6 y spec de la demo) | Demo (Sprint D2) | Ya planeado. Lenguaje de Velvetica |
| 3 | Compra rápida y color en la cuadrícula (§2.4) | Después de la demo | Requiere variantes por color en el modelo |
| 4 | Visor 360° por producto (§2.2) | Segunda etapa | Requiere captura por prenda |
| 5 | Buscador de talla (§2.5) | Después | Requiere tablas de talla confiables |
| 6 | Bundles (§2.3) | Después | Requiere reglas de precio |
| — | Popups con juego (§4) | Pendiente de decisión | Choca con privacidad |

**Reglas de diseño [A]:**
- Mobile primero: todas las visualizaciones se prueban en un teléfono real antes de aceptarse.
- Sin cifras de stock en lo público: "disponible / agotado" solamente (decisión D-5 del spec de la demo).
- Ningún dato de conversión de proveedores se usa como argumento de venta sin verificarlo.
