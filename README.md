# LoloShop 🧢

Aplicación integral de gestión de inventario, catálogo interactivo en 3D y bot de WhatsApp automatizado para una tienda de streetwear.

<p align="center">
  <img src="./public/login.jpeg" alt="LoloShop Login" width="30%">
  <img src="./public/dashboard.jpeg" alt="LoloShop Dashboard" width="30%">
  <img src="./public/catalogo.jpeg" alt="LoloShop Catálogo" width="30%">
</p>

## Características Principales

1. **Gestión de Inventario (PWA):**
   - Panel de KPIs con métricas en tiempo real.
   - Escáner de código de barras para entradas y salidas rápidas.
   - Alertas visuales de stock bajo.
   - Sincronización instantánea entre sucursales.

2. **Catálogo Interactivo 3D (`/catalogo`):**
   - Renderizado dinámico usando `framer-motion` a 60 FPS.
   - Efectos físicos realistas de iluminación ("Glare") basados en acelerómetro y posición del mouse.
   - Conexión fluida hacia WhatsApp para apartar prendas ("FOMO").

3. **Bot de WhatsApp Oficial (Meta Cloud API):**
   - Webhook inteligente integrado en Next.js (`/api/whatsapp/webhook`).
   - Lee el catálogo en vivo desde Prisma/Neon.
   - Reserva de prendas lógicamente y redirige al cierre de la venta.
   - Respuestas preconfiguradas para FAQs (envíos y ubicación).

## Stack Tecnológico

- **Frontend:** Next.js 14 (App Router), React, TailwindCSS, Framer Motion
- **Backend:** Node.js, Prisma ORM
- **Base de Datos:** PostgreSQL (Neon)
- **Infraestructura:** Vercel, PWA (next-pwa)
- **Autenticación:** NextAuth.js

## Flujo de Negocio: WhatsApp Bot

El catálogo público manda a los usuarios a WhatsApp con un SKU prellenado. El bot realiza la lectura de intención:
- Si dicen **"Apartar SKU: XYZ"**: Busca en la BD. Si hay stock, confirma la reserva de 24 horas y manda el link de compra final.
- Si dicen **"Envíos"**: Lanza la macro de envíos y paqueterías.
- Si dicen **"Ubicación"**: Lanza horarios y dirección.

## Despliegue en Vercel

El proyecto está configurado para Vercel. Asegúrate de configurar las siguientes variables de entorno:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `WHATSAPP_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`

**(El comando de postinstall `prisma generate` corre automáticamente en Vercel).**
