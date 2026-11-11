# Alta de producto en tienda: escanear, fotografiar y describir (2026-11-11)

**Estado:** borrador en diseño. Decisiones tomadas con el solicitante; falta detallar pantallas, instrucciones y criterios de aceptación.
**Relacionado:** `2026-11-11-paleta-botones-catalogo-design.md` (paleta, botones, catálogo sincronizado, favoritos locales).

## 1. Intención

Registrar una prenda nueva en tienda en un solo recorrido con el mismo celular: escanear la etiqueta, decidir si va al catálogo, tomar las fotos sobre fondo blanco y escribir la descripción. El stock queda registrado aunque la prenda no tenga fotos. El catálogo público solo recibe prendas con fotos blancas.

## 2. Secuencia (aprobada)

1. **Escanear** la etiqueta de la prenda (la app pide la tienda activa de quien registra).
2. **Decidir si va al catálogo.** Primera decisión, antes de cualquier dato. Dos opciones:
   - *Solo stock:* registra inventario, sin fotos.
   - *Catálogo:* prepara el alta para publicar, con fotos blancas y descripción.
3. **Fotos** (solo en modo catálogo):
   - De frente y de atrás, sobre fondo blanco, en el mismo celular.
   - Recomendadas, no obligatorias para registrar. Obligatorias para publicar: sin ellas la prenda no entra al catálogo.
4. **Descripción** y datos del producto (título, marca, departamento, tipo). Los campos de tipo siguen la taxonomía en curso (tarea 3.8).
5. **Tallas y piezas** (existente, ver spec v2 tarea 1.5).
6. **Guardar.** Muestra qué quedó en stock y qué queda pendiente para el catálogo.

## 3. Reglas aprobadas

- **Fondo blanco.** Las fotos que entran al catálogo son de fondo blanco. Motivo: el procesamiento posterior se reduce y el catálogo se ve uniforme.
- **Fotos de WhatsApp** (fondo de tienda) no entran al catálogo. Sirven para avisos. Se reemplazan al pasar por tienda.
- **Stock sin fotos** se registra sin problema.
- **Publicar** requiere foto de frente y de atrás en fondo blanco, y que la prenda tenga existencias.

## 4. Pendiente de definir

1. **Instrucciones en pantalla (decidido):** un recorrido corto de 3 pasos que se puede saltar.
   - La primera vez que alguien entra al alta, aparece el recorrido.
   - Se puede saltar en cualquier momento, con un botón visible "Saltar".
   - Después, no vuelve a aparecer solo. Se reabre desde un enlace "¿Cómo registrar?" en el alta.
   - *Mi decisión:* el recorrido se guarda como "visto" en el navegador (`localStorage`, con `try/catch`). Si no hay almacenamiento, se muestra cada vez; no bloquea el alta.
   - *Propuesta de contenido (por confirmar):* 1) escanear la etiqueta; 2) elegir si va al catálogo; 3) tomar fotos sobre fondo blanco. La descripción y las tallas aparecen después del paso 3.
2. **Captura de fotos (decidido):**
   - Guía de encuadre y de fondo blanco en pantalla.
   - Análisis en el navegador de los bordes de la imagen (uniformes y claros = pasa). Sin servidor y sin costo. Es un apoyo, no garantía: una pared blanca también pasa.
   - Si la foto no pasa, la app avisa en el momento: "El fondo no está en blanco. Repite la foto con la prenda sobre una superficie blanca." Solo se puede repetir; no se guarda para catálogo.
   - *Mi decisión:* el análisis vive en `lib/image/process.ts`, junto al procesamiento existente. El recorte automático de fondo queda fuera (visual-3d).
3. **Estado del catálogo después de guardar (decidido):**
   - "Solo stock": inventario sin fotos.
   - "Falta completar registro fotográfico": tiene foto de frente o de atrás en blanco, pero no las dos.
   - "Listo para catálogo": frente y atrás en blanco, con existencias.
4. **Edición posterior (decidido):** las fotos se agregan buscando la ficha del producto en `/productos`. No hay acceso directo desde la lista. Aplica la misma guía de fondo blanco y el mismo aviso de fondo de tienda que en el alta.
5. **Animaciones (decidido, con movimiento):**
   - **Transición entre pasos del recorrido:** el paso que sale se desvanece y se desplaza 16 px a la izquierda; el que entra llega desde la derecha. 280 ms, curva de desaceleración. Los puntos de progreso se llenan con el mismo ritmo.
   - **Foto que se acomoda:** al tomarla, la miniatura aparece desde el borde de su casilla con un escalado de 0.96 a 1 en 220 ms. Si el análisis de fondo falla, la casilla hace un movimiento corto horizontal (3 veces, 240 ms en total) junto al aviso "Repite la foto con la prenda sobre una superficie blanca".
   - **Check al guardar:** el botón pasa a carga (giro), luego se dibuja un check en 420 ms y aparece el estado en la tarjeta (solo stock, falta registro fotográfico o listo para catálogo). Se mantiene 1.4 s y el estado queda visible.
   - **Quien reduce movimiento** (ajuste del sistema): se eliminan los desplazamientos y el rebote. Los cambios de estado siguen, con transiciones de 1 ms; el giro de carga se hace más lento, no se quita.
6. **Criterios de aceptación:** ver §7. Pruebas en celular real, cuando haya pruebas en tienda.

## 5. Qué no entra en este spec

- Recorte automático de fondo y procesamiento avanzado de imágenes (visual-3d).
- Recorrido 3D y animaciones de prendas (ya planeados en sesiones previas).
- Modo oscuro (después de cerrar componentes).

## 6. Referencia del producto (aprobado el 2026-11-11)

La referencia sirve para encontrar la prenda al vender sin código. Se arma al dar de alta.

- **Campos:**
  - **Tipo** (obligatorio): viene de la taxonomía (tarea 3.8).
  - **Marca** (obligatoria): viene del catálogo de marcas existente.
  - **Color** (opcional): se oculta en perfumes y accesorios, donde no aplica.
- **Título sugerido:** tipo + marca + color, por ejemplo "Leggins ALO rosa". La persona puede editarlo.
- **Sin color:** el título queda como tipo + marca (por ejemplo "Perfume Hugo Boss"). Se permite registrar sin llenar color ni otra referencia.
- **Regla:** no se puede registrar sin tipo y marca. El color nunca bloquea el alta.
- **Venta sin código:** el buscador de `/pos` encuentra por tipo, marca, color o código interno.

*Mi decisión (marcada):* el color se guarda en un campo propio (`Product.color`, texto opcional de hasta 40 caracteres) y no solo dentro del título. Así el buscador lo filtra. Es un cambio aditivo de base, hecho con `prisma migrate`.

*Decidido: lista de colores dinámica.*
- Hay una lista fija de colores base (negro, blanco, gris, azul, rojo, rosa, verde, café, beige, naranja, amarillo, morado y similares).
- Si el color no está en la lista, la persona puede escribir otro. Ese color se agrega a la lista para que la siguiente persona lo encuentre.
- Antes de agregarlo se normaliza (minúsculas, sin acentos, sin plural) para no duplicar "rosa" con "rosado" o "rosas".
- La referencia no tiene que encajar al 100 %: sirve para encontrar la prenda, no para describirla.

## 7. Criterios de aceptación

Cada criterio se verifica con una prueba automática (T) o manual en celular (M).

**Recorrido de primera vez**
- C1 (T): la primera vez que alguien entra al alta, aparece el recorrido de 3 pasos.
- C2 (T): "Saltar" cierra el recorrido en cualquier paso y no vuelve a aparecer sin un clic en "¿Cómo registrar?".
- C3 (M): sin almacenamiento disponible, el recorrido aparece cada vez y el alta sigue funcionando.

**Escaneo y decisión de catálogo**
- C4 (T): el escáner lee EAN-13, UPC-A, UPC-E, EAN-8, Code 128, Code 39 y QR. Un código no legible se escribe a mano.
- C5 (T): el paso "¿Va al catálogo?" aparece antes que los datos del producto.

**Fotos**
- C6 (T): una foto con fondo claro y uniforme en los bordes pasa el análisis; una con fondo de color o sombras no pasa.
- C7 (T): una foto que no pasa no se guarda como foto de catálogo y muestra el aviso de repetir.
- C8 (M): la foto de frente y la de atrás se toman en el mismo celular, sin salir del alta.

**Referencia del producto**
- C9 (T): no se puede guardar sin tipo ni marca.
- C10 (T): el color es opcional y se oculta en perfumes y accesorios.
- C11 (T): un color nuevo se normaliza (minúsculas, sin acentos, sin plural) antes de agregarse a la lista; "Rosa" y "rosas" no crean dos colores.
- C12 (T): el título sugerido es tipo + marca + color, y se puede editar.

**Estado después de guardar**
- C13 (T): sin fotos, el estado es "Solo stock".
- C14 (T): con una foto blanca, el estado es "Falta completar registro fotográfico".
- C15 (T): con frente y atrás blancas y existencias, el estado es "Listo para catálogo".
- C16 (T): una prenda sin existencias no aparece en el catálogo aunque tenga fotos.

**Edición de fotos posterior**
- C17 (T): las fotos solo se agregan desde la ficha del producto, no desde la lista de `/productos`.
- C18 (T): se aplica el mismo análisis de fondo que en el alta.

**Movimiento**
- C19 (M): las transiciones, la captura y el check se ven con movimiento según §5.
- C20 (M): con "reducir movimiento" activo, no hay desplazamientos ni rebote, y el estado sigue cambiando.

**Venta sin código**
- C21 (T): "Sin código" en `/pos` busca entre productos dados de alta por tipo, marca, color o código interno, y no acepta texto libre.
- C22 (T): vender por esa vía descuenta la talla del inventario.

## 8. Decisiones de la revisión (2026-11-11)

Resuelven las preguntas del revisor independiente.

- **Fotos de tienda:** se eliminan. Las fotos de catálogo son obligatoriamente de fondo blanco; una foto de tienda no entra al catálogo ni al sitio.
- **Catálogo automático:** cuando una prenda cumple las condiciones (fotos blancas de frente y atrás, descripción y existencias), entra al catálogo sin pasos extra. *Lectura mía (confirmar):* el botón "Publicar" queda solo para decidir qué aparece en el **sitio web**, no para el catálogo interno.
- **Descripción obligatoria.** *Lectura mía (confirmar):* se pide en todas las altas, también en "Solo stock".
- **Guardar sin foto:** permitido. Queda como "Solo stock".
- **Permisos:** el colaborador puede editar precios. Cambio de permisos: se aplica en el servidor (`lib/auth/permissions.ts`) y se prueba.
- **Marcas:** se pueden crear en el alta, igual que los colores.
- **Taxonomía:** el alta espera la tarea 3.8 (tipo obligatorio). Consecuencia: la 3.8 tiene que estar lista antes de la demo del 19 de noviembre.
- **Conexión:** el alta requiere internet. Si falla la subida, muestra error claro y conserva los datos en pantalla.
- **Ventas sin internet:** sí pueden funcionar. Se guardan en el celular y se sincronizan al recuperar conexión. Las reglas de conflicto quedan pendientes (ver spec de ventas sin conexión).
