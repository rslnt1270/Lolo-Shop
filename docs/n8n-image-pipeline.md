# Arquitectura de Flujo de Imágenes (IA / n8n)

Este documento describe la arquitectura y el flujo técnico utilizado para el procesamiento de imágenes de productos y su integración en el sistema LoloShop.

## 1. Webhook de n8n
El proceso comienza cuando se invoca un Webhook en **n8n**. Este trigger puede provenir de la creación de un nuevo producto en LoloShop o de una carga manual de imágenes desde la interfaz de usuario.
- **Entrada:** Imagen del producto original y metadatos (como `productId` y credenciales necesarias).
- **Proceso:** n8n recibe la solicitud y la encamina hacia los diferentes nodos de procesamiento de imágenes.

## 2. Remoción de Fondo (IA)
La imagen recibida es enviada a un servicio de Inteligencia Artificial (IA) especializado en remover fondos (por ejemplo, **Photoroom** o **Remove.bg**).
- **Objetivo:** Eliminar cualquier fondo distractor para lograr una imagen limpia del producto sobre un fondo transparente o blanco sólido.
- **Integración:** Se utiliza una API REST desde n8n hacia el servicio de IA, enviando la imagen y esperando como respuesta la imagen sin fondo.

## 3. Ajuste de Iluminación y Textura
Una vez que el fondo es removido, la imagen puede pasar por un paso opcional de mejora para estandarizar su calidad.
- **Proceso:** n8n envía la imagen a un modelo de IA o un servicio de procesamiento de imágenes (como **Cloudinary** transformaciones on-the-fly, o APIs de mejora de imágenes) para:
  - Ajustar la iluminación (brillo y contraste).
  - Mejorar la nitidez y textura del producto para mayor claridad y atractivo visual.

## 4. Almacenamiento en la Nube (S3 / Cloudinary)
La imagen procesada y mejorada debe ser almacenada de manera permanente en un servicio de almacenamiento en la nube, optimizado para la distribución web (CDN).
- **Proveedores sugeridos:** Amazon S3 o Cloudinary.
- **Acción en n8n:** El nodo correspondiente sube la imagen optimizada al bucket o repositorio, obteniendo como resultado una URL pública o un identificador de la imagen.

## 5. Actualización en la Base de Datos (Prisma)
El último paso del flujo consiste en asociar la nueva URL de la imagen con el producto correspondiente dentro de la base de datos de LoloShop.
- **Acción:** n8n realiza una petición HTTP (API REST o GraphQL) a un endpoint interno de LoloShop o interactúa directamente si está configurado, proporcionando el `productId` y la `imageUrl`.
- **Actualización:** El sistema (usando **Prisma**) actualiza el modelo `Product`, estableciendo o actualizando el campo `imageUrl`.

---

### Resumen del Pipeline (Diagrama Lógico)

1. **(Input)** -> `Webhook n8n` (Recibe la imagen cruda).
2. `Nodo de IA (Remove.bg / Photoroom)` -> Extrae el fondo.
3. `Nodo de Procesamiento` -> Ajusta la luz y resalta detalles del producto.
4. `Nodo de Almacenamiento (S3/Cloudinary)` -> Guarda la imagen y genera URL pública.
5. `Llamada API a LoloShop` -> **Prisma** actualiza `Product.imageUrl`.
6. **(Output)** -> Producto actualizado con imagen procesada.
