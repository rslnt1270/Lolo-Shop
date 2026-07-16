import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data/get-source';

// Configuración de Meta Cloud API
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// 1. Verificación del Webhook (Usado por Meta para validar la URL)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado por Meta");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 2. Recepción de Mensajes (Cuando un cliente escribe)
export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          // Solo nos interesan los mensajes entrantes
          if (change.value && change.value.messages) {
            for (const message of change.value.messages) {
              const phoneNumberId = change.value.metadata.phone_number_id;
              const from = message.from; // Número del cliente
              const text = message.text?.body || "";
              
              await processMessage(phoneNumberId, from, text);
            }
          }
        }
      }
      return new NextResponse('OK', { status: 200 });
    }
    return new NextResponse('Not Found', { status: 404 });
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

// 3. Envío de Mensaje hacia el API de Meta (WhatsApp)
async function sendWhatsAppMessage(phoneNumberId: string, to: string, text: string) {
  // Si no hay token de producción, simulamos en consola (Modo Dev)
  if (!WHATSAPP_TOKEN) {
    console.log(`\n🤖 [Bot de WhatsApp Simulado] \nPara: ${to}\nMensaje: ${text}\n`);
    return;
  }
  
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });
}

// 4. Lógica de Flujos Conversacionales (El "Cerebro" del Bot)
async function processMessage(phoneNumberId: string, from: string, text: string) {
  const lowerText = text.toLowerCase();

  // --- Flujo 1: Apartar Producto ---
  if (lowerText.includes("apartar la prenda") || lowerText.includes("apartar")) {
    const skuMatch = text.match(/SKU:\s*([A-Za-z0-9\-]+)/i);
    
    if (skuMatch && skuMatch[1]) {
      const sku = skuMatch[1];
      
      // Primera respuesta rápida de validación
      await sendWhatsAppMessage(phoneNumberId, from, `¡Hola! 👋 ¡Excelente elección! Dame un segundo mientras verifico en nuestro inventario si el SKU ${sku} sigue disponible...`);
      
      // Consultar la Base de Datos Prisma
      const ds = getDataSource();
      const products = await ds.getProducts();
      let foundVariant = null;
      let foundProduct = null;
      
      for (const p of products) {
        const v = p.variants.find(v => v.sku.toLowerCase() === sku.toLowerCase());
        if (v) {
          foundVariant = v;
          foundProduct = p;
          break;
        }
      }

      if (foundVariant) {
        const stock = foundVariant.inventory.reduce((sum, i) => sum + i.available, 0);
        if (stock > 0) {
          await sendWhatsAppMessage(phoneNumberId, from, `¡Buenas noticias! 🎉 Sí lo tenemos disponible. Te lo acabo de apartar a tu nombre por las próximas 24 horas. ⏳\n\nPara asegurar tu compra y coordinar el envío, completa tu pedido seguro en nuestra tienda oficial aquí:\n👉 https://lolo-shop.vercel.app/catalogo\n\n¿O prefieres pasar a recogerlo a nuestra tienda física?`);
        } else {
          await sendWhatsAppMessage(phoneNumberId, from, `Uy, parece que alguien más se nos adelantó y esa prenda acaba de agotarse. 💔 Pero no te preocupes, cada semana nos llegan modelos similares.\n\nPuedes revisar el resto del catálogo aquí 👉 https://lolo-shop.vercel.app/catalogo`);
        }
      } else {
         await sendWhatsAppMessage(phoneNumberId, from, `No logré encontrar ese SKU en nuestro catálogo actual. Revísalo nuevamente aquí 👉 https://lolo-shop.vercel.app/catalogo`);
      }
    } else {
      await sendWhatsAppMessage(phoneNumberId, from, `Hola, vi que quieres apartar una prenda pero no encontré el SKU en tu mensaje. Por favor envíame el SKU o búscalo en 👉 https://lolo-shop.vercel.app/catalogo`);
    }
  }
  // --- Flujo 3: Preguntas Frecuentes (FAQs) ---
  else if (lowerText.includes("envío") || lowerText.includes("envios") || lowerText.includes("mandan")) {
    await sendWhatsAppMessage(phoneNumberId, from, `¡Claro que sí! 📦 Hacemos envíos a todo México. Al finalizar tu compra en nuestra página, el sistema calculará automáticamente el costo y tiempo de entrega basado en tu código postal. ¡Suele ser súper rápido! ⚡`);
  }
  else if (lowerText.includes("ubicación") || lowerText.includes("ubicacion") || lowerText.includes("dónde están") || lowerText.includes("donde estan") || lowerText.includes("tienda física") || lowerText.includes("tienda fisica")) {
    await sendWhatsAppMessage(phoneNumberId, from, `Sí, ¡nos encantaría que nos visitaras! 📍 Estamos ubicados en nuestra Tienda Principal. \nRecuerda que si apartas una prenda por aquí, te la guardamos por 24 horas para que pases a probártela.`);
  }
  // --- Flujo 2: Genérico (Exploración) ---
  else {
    await sendWhatsAppMessage(phoneNumberId, from, `¡Hola! Bienvenido a LoloShop 🧢👟\nTenemos lo mejor en streetwear y marcas exclusivas. Puedes explorar todo nuestro inventario actual interactivo en el siguiente enlace:\n\n🔗 Nuestro Catálogo: https://lolo-shop.vercel.app/catalogo\n\nSi te gusta algo, solo presiona el botón 'Apartar' debajo de la prenda y yo me encargo de reservártela. ¿Buscas alguna marca o talla en específico?`);
  }
}
