import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDataSource } from '@/lib/data/get-source';
import { getPublicCatalog } from '@/lib/data/public-projection';
import { parsePublicCodeRequest } from '@/lib/domain/public-code';

// Configuración de Meta Cloud API
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const CATALOG_URL = 'https://lolo-shop.vercel.app/catalogo';

// Valida la firma X-Hub-Signature-256 que Meta manda en cada POST.
// Sin WHATSAPP_APP_SECRET configurado, se omite (solo para desarrollo local).
function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) {
    console.warn("⚠️ WHATSAPP_APP_SECRET no configurado: firma del webhook NO validada.");
    return true;
  }
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
    const rawBody = await req.text();
    if (!isValidSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      return new NextResponse('Invalid signature', { status: 401 });
    }
    const body = JSON.parse(rawBody);

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
    console.log(`\n🤖 [Bot de WhatsApp Simulado]\nMensaje: ${text}\n`);
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

  // --- Flujo 1: Consultar una prenda por su código público ---
  if (lowerText.includes("apartar") || /c[oó]digo/.test(lowerText)) {
    const req = parsePublicCodeRequest(text);

    if (req.kind === "ok") {
      // Solo se consulta la base con un código de formato válido.
      const catalog = await getPublicCatalog(getDataSource());
      const product = catalog.find((p) => p.publicCode === req.code);
      const sizes = product ? (req.size ? product.sizes.filter((s) => s.size.toUpperCase() === req.size) : product.sizes) : [];

      if (product && sizes.some((s) => s.available)) {
        await sendWhatsAppMessage(phoneNumberId, from, `¡Hola! Recibimos tu solicitud de "${product.title}" (código ${req.code}). La tienda te confirmará por este medio si está disponible. Mientras tanto, puedes ver el catálogo aquí 👉 ${CATALOG_URL}`);
      } else if (product && req.size) {
        await sendWhatsAppMessage(phoneNumberId, from, `Recibimos tu solicitud de "${product.title}", pero no vemos la talla ${req.size} disponible en tienda por ahora. La tienda te confirmará por este medio si hay alternativas.`);
      } else if (product) {
        await sendWhatsAppMessage(phoneNumberId, from, `Recibimos tu solicitud de "${product.title}" (código ${req.code}). La tienda te confirmará por este medio si está disponible.`);
      } else {
        await sendWhatsAppMessage(phoneNumberId, from, `No encontramos una prenda con ese código. Revísalo y vuelve a escribirlo, o mira el catálogo 👉 ${CATALOG_URL}`);
      }
    } else if (req.kind === "invalid") {
      await sendWhatsAppMessage(phoneNumberId, from, `Ese código no es válido: debe tener 5 caracteres, por ejemplo "Código K7Q2M talla M". Revísalo e inténtalo de nuevo.`);
    } else {
      await sendWhatsAppMessage(phoneNumberId, from, `Hola, para consultar una prenda escríbenos su código, por ejemplo "Código K7Q2M talla M", o búscala en 👉 ${CATALOG_URL}`);
    }
  }
  // --- Flujo 3: Preguntas Frecuentes (FAQs) ---
  else if (lowerText.includes("envío") || lowerText.includes("envios") || lowerText.includes("mandan")) {
    await sendWhatsAppMessage(phoneNumberId, from, `¡Claro que sí! 📦 Hacemos envíos a todo México. Al finalizar tu compra en nuestra página, el sistema calculará automáticamente el costo y tiempo de entrega basado en tu código postal. ¡Suele ser súper rápido! ⚡`);
  }
  else if (lowerText.includes("ubicación") || lowerText.includes("ubicacion") || lowerText.includes("dónde están") || lowerText.includes("donde estan") || lowerText.includes("tienda física") || lowerText.includes("tienda fisica")) {
    await sendWhatsAppMessage(phoneNumberId, from, `Sí, ¡nos encantaría que nos visitaras! 📍 Estamos ubicados en nuestra Tienda Principal. \nEscríbenos el código de la prenda y la tienda te confirma por aquí si está disponible.`);
  }
  // --- Flujo 2: Genérico (Exploración) ---
  else {
    await sendWhatsAppMessage(phoneNumberId, from, `¡Hola! Bienvenido a LoloShop 🧢👟\nTenemos lo mejor en streetwear y marcas exclusivas. Puedes explorar todo nuestro inventario actual interactivo en el siguiente enlace:\n\n🔗 Nuestro Catálogo: https://lolo-shop.vercel.app/catalogo\n\nSi te gusta algo, escríbenos su código (por ejemplo "Código K7Q2M talla M") y la tienda te confirmará por aquí si está disponible. ¿Buscas alguna marca o talla en específico?`);
  }
}
