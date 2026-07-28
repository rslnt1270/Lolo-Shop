# LoloShop 🧢

Aplicación integral de gestión de inventario, catálogo interactivo en 3D y bot de WhatsApp automatizado para una tienda de streetwear.

<p align="center">
  <img src="./public/login.jpeg" alt="LoloShop Login" width="30%">
  <img src="./public/dashboard.jpeg" alt="LoloShop Dashboard" width="30%">
  <img src="./public/catalogo.jpeg" alt="LoloShop Catálogo" width="30%">
</p>

## Arquitectura del Sistema

```mermaid
graph TD
    Client[Cliente / Comprador] -->|Navega en 3D| Web[Catálogo Público<br>Next.js PWA]
    Client -->|Escribe Mensaje| WA[WhatsApp<br>Meta Cloud API]
    
    Admin[Staff LoloShop] -->|Escanea / Gestiona| Dashboard[Panel Interno<br>PWA Dashboard]
    
    Web -.->|Click to WhatsApp| WA
    
    WA -->|Webhook /api/whatsapp/webhook| Server[Backend<br>Vercel / Next.js]
    Dashboard -->|Server Actions| Server
    Web -->|Server Actions| Server
    
    Server <-->|Prisma ORM| DB[(PostgreSQL<br>Neon DB)]
```

## Características Principales

1. **Gestión de Inventario (PWA):**
   - Panel de KPIs con métricas en tiempo real.
   - Escáner de código de barras para entradas y salidas rápidas.
   - Alertas visuales de stock bajo.
   - Sincronización instantánea entre sucursales.

2. **Captura de foto unificada (inventario ↔ catálogo):**
   - Al dar de alta un producto escaneado se puede tomar/subir una foto (cámara o galería).
   - Edición automática en el navegador (Canvas): recorte 1:1, redimensionado, auto-niveles y corrección de orientación EXIF — imágenes consistentes sin trabajo manual ni servicios externos.
   - La imagen se sube a **Vercel Blob** y su URL queda en el producto, que aparece completo en el catálogo en el mismo acto de registro. La foto es opcional y también se puede agregar/cambiar después desde `/productos`.

3. **Catálogo Interactivo 3D (`/catalogo`):**
   - Renderizado dinámico usando `framer-motion` a 60 FPS.
   - Efectos físicos realistas de iluminación ("Glare") basados en acelerómetro y posición del mouse.
   - Conexión fluida hacia WhatsApp para apartar prendas ("FOMO").

4. **Bot de WhatsApp Oficial (Meta Cloud API):**
   - Webhook inteligente integrado en Next.js (`/api/whatsapp/webhook`).
   - Lee el catálogo en vivo desde Prisma/Neon.
   - Reserva de prendas lógicamente y redirige al cierre de la venta.
   - Respuestas preconfiguradas para FAQs (envíos y ubicación).

## Stack Tecnológico

- **Frontend:** Next.js 14 (App Router), React, TailwindCSS, Framer Motion
- **Backend:** Node.js, Prisma ORM
- **Base de Datos:** PostgreSQL (Neon)
- **Imágenes de producto:** Vercel Blob (edición en cliente con Canvas API)
- **Infraestructura:** Vercel, PWA (next-pwa)
- **Autenticación:** NextAuth.js

## Flujo de Negocio: WhatsApp Bot

El catálogo público manda a los usuarios a WhatsApp con un SKU prellenado. El bot realiza la lectura de intención:
- Si dicen **"Apartar SKU: XYZ"**: Busca en la BD. Si hay stock, confirma la reserva de 24 horas y manda el link de compra final.
- Si dicen **"Envíos"**: Lanza la macro de envíos y paqueterías.
- Si dicen **"Ubicación"**: Lanza horarios y dirección.

## Configuración local

1. Copia `.env.example` a `.env` y llena los valores (el archivo `.env` **no** se commitea).
2. Sincroniza el esquema y siembra datos iniciales:

```bash
npm install
npm run db:push   # aplica prisma/schema.prisma a la BD
npm run db:seed   # tiendas (loc-1/loc-2), usuarios con bcrypt y producto demo
```

Las contraseñas del seed se pueden definir con `SEED_PASSWORD_*` (ver `.env.example`); sin ellas usa valores de desarrollo.

## Despliegue en Vercel

El proyecto está configurado para Vercel. Asegúrate de configurar las siguientes variables de entorno:
- `DATABASE_URL`
- `NEXTAUTH_SECRET` — genera uno con `openssl rand -base64 32`
- `WHATSAPP_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` — App Secret de Meta; valida la firma de cada webhook entrante
- `BOT_API_KEY` — clave para `/api/bot/products` (n8n); sin ella el endpoint responde 503
- `NEXT_PUBLIC_WHATSAPP_NUMBER` — número del catálogo público, con código de país
- `BLOB_READ_WRITE_TOKEN` — token del store de **Vercel Blob** para las fotos de producto. Crea el store en el proyecto de Vercel (suele inyectar el token automáticamente); sin él, la subida de imágenes falla

**(El comando de postinstall `prisma generate` corre automáticamente en Vercel).**

> ⚠️ **Seguridad:** si alguna credencial llegó a estar commiteada en el historial del repo
> (cadena de conexión de la BD, `NEXTAUTH_SECRET`), considérala comprometida y rótala.
