# LoloShop — Bot de WhatsApp (Atención + Venta) — Diseño del Sistema

**Fecha:** 2026-06-28
**Desarrollador:** Portfolio personal
**Cliente:** LoloShop (@lolo.bshop)
**Estado:** Aprobado (diseño) — implementación pausada hasta resolver prerrequisitos

---

## Contexto

LoloShop ya tiene en construcción una PWA de inventario sobre Shopify (ver
`2026-06-26-loloshop-design.md`). Este documento define un **bot de WhatsApp
de cara al cliente** que reutiliza la misma capa de datos y se convierte en el
**primer canal de venta online real** de LoloShop (la tienda Shopify aún no ha
concretado ventas online).

---

## Objetivo y alcance

Bot conversacional en WhatsApp que:
1. **FAQ** — responde dudas frecuentes (horarios, ubicación, envíos, formas de pago).
2. **Consulta de stock/precios** — el cliente pregunta por productos, tallas, colores, disponibilidad y precio.
3. **Pedidos + cobro** — arma el pedido y genera un **link de pago de Mercado Pago**; al confirmarse el pago, notifica al staff para la entrega (fulfillment manual).

**Fuera de alcance (MVP):**
- Registro de movimientos de inventario por staff vía WhatsApp.
- Base de datos de pedidos / pantalla de gestión de pedidos en la PWA.
- Descuento automático de stock al pagar.
- Idiomas distintos al español.
- Campañas / broadcasts de marketing, analítica avanzada, ruteo multi-número.

---

## Regla inviolable del proyecto (respetada)

Toda la lógica de inventario pasa por la interfaz `InventoryDataSource`. El bot
**nunca** llama a Shopify directamente: lee a través de endpoints `/api/bot/*`
del PWA, que internamente usan `getDataSource()` → `FixtureDataSource` hoy,
`ShopifyDataSource` en Fase 2. Cuando llegue el token de Shopify, **el workflow
de N8N no cambia**.

---

## Arquitectura

```
Cliente (WhatsApp)
      │  mensaje entrante
      ▼
WhatsApp Trigger (N8N)
      ▼
AI Agent ── Anthropic Chat Model (Claude Haiku) + Memoria por número de WhatsApp
   │   herramientas (HTTP Request → API del PWA):
   │     • buscar_productos        GET  /api/bot/products?q=
   │     • detalle_disponibilidad  GET  /api/bot/products/:id
   │     • crear_link_pago         (nodo oficial @mercadopago/n8n-nodes-mercadopago)
   ▼
WhatsApp Business Cloud (N8N) → respuesta al cliente

Webhook de Mercado Pago (pago confirmado)
      ▼
N8N (valida firma) → notifica al staff (WhatsApp/email) + confirma al cliente
```

**Stack del bot:**
- **Orquestación:** N8N (cloud o self-host) accesible por webhooks.
- **IA:** Claude (Anthropic Chat Model en N8N), modelo **Haiku** por costo/volumen.
- **Mensajería:** WhatsApp Business Cloud API (Meta) — nodos nativos `WhatsApp Trigger` + `WhatsApp Business Cloud`.
- **Pagos:** Mercado Pago — community node oficial (`@mercadopago/n8n-nodes-mercadopago`), operación *crear Checkout Preference (link de pago)*. Métodos: tarjeta, OXXO, SPEI, saldo MP.
- **Datos:** API del PWA Next.js respaldada por `InventoryDataSource`.

---

## Componentes nuevos en el PWA (Next.js)

### Endpoints `/api/bot/*`
- `GET /api/bot/products?q=<texto>&category=<cat>` — lista/búsqueda de productos. Reusa `filterProducts` y el servicio de inventario (`productStock`, `variantStock`).
- `GET /api/bot/products/:id` — detalle de un producto con variantes, precios y stock por tienda.

Respuesta (forma): `{ id, title, brand, category, variants: [{ id, sku, title, size, color, price, available }] }` con `available` agregado (o por tienda) según necesidad del bot.

### Autenticación del bot
- Header `x-bot-key: <BOT_API_KEY>` (secreto compartido en variable de entorno). **No** es sesión NextAuth.
- `middleware.ts` debe **excluir `/api/bot`** del redirect de login; cada endpoint valida la key y responde `401` si falta o no coincide.

### Pruebas (Vitest, contra fixtures)
- Forma de respuesta de `/api/bot/products` y `/api/bot/products/:id`.
- Búsqueda por texto/categoría devuelve los productos esperados.
- Rechazo `401` sin `x-bot-key` o con key inválida.

---

## Flujo de pedido + pago

1. Claude arma el pedido (productos, cantidades, total) confirmándolo con el cliente en lenguaje natural.
2. Llama al nodo de Mercado Pago → genera **Checkout Preference (link de pago)**.
3. Envía el link por WhatsApp; el cliente paga (tarjeta / OXXO / SPEI / saldo MP).
4. Mercado Pago dispara un **webhook** a N8N. N8N **valida la firma/secreto**, y:
   - **Notifica al staff** (WhatsApp y/o email) con: productos, cantidades, datos del cliente y confirmación de pago.
   - Responde al cliente: "Pago recibido, te contactamos para coordinar la entrega".
5. **No se descuenta stock ni se persiste el pedido** en el MVP — la fulfillment es manual. En Fase 2 se puede ligar a *draft orders* de Shopify para registro centralizado.

---

## Manejo de errores

- **Producto no encontrado:** el bot ofrece alternativas; nunca inventa stock ni precios.
- **API/Shopify caído:** mensaje de disculpa; el bot no entrega datos falsos (restricción dura en el system prompt: solo datos provenientes de herramientas).
- **Pago no completado:** no se notifica al staff (recordatorio opcional a futuro).
- **Webhook de MP:** validar firma/secreto para evitar confirmaciones falsas de pago.
- **Memoria por número:** el contexto de conversación se mantiene por número de WhatsApp.

---

## Prerrequisitos (configuración, fuera de código) — PENDIENTES

Estos bloquean la puesta en marcha y deben resolverse antes de implementar:
1. **Inventario real de productos** cargado (aún no montado).
2. **Token de Shopify Admin API** (para que el bot lea stock real vía `ShopifyDataSource` en F2).
3. **Cuenta WhatsApp Business** + número aprobado en Meta (Cloud API): Permanent Access Token, WABA ID, OAuth2 para el trigger.
4. **Cuenta Mercado Pago** + access token; instalar el community node en N8N.
5. **Instancia de N8N** accesible por webhooks; **API key de Claude (Anthropic)**.

---

## Relación con el roadmap

Iniciativa **paralela a Fase 2**. Orden sugerido de implementación (cuando se
levante la pausa):
1. Endpoints `/api/bot/*` en el PWA (TDD, contra fixtures) — funcionan de
   extremo a extremo con datos de prueba.
2. Workflow de N8N + cableado WhatsApp / Mercado Pago + guía de setup.
3. "Go live" con stock real cuando F2 conecte Shopify.

---

## Módulo Facebook Ads (nuevo — por integrar)

Capa de adquisición que alimenta al bot. Acoplado al bot porque el destino del
anuncio es la conversación de WhatsApp.

**Alcance propuesto:**
1. **Click-to-WhatsApp Ads (CTWA):** anuncios en Facebook/Instagram con CTA
   "Enviar WhatsApp" que abren un chat con el número del bot. El `ref`/contexto
   del anuncio puede llegar en el primer mensaje para atribuir la conversación.
2. **Conversions API (CAPI):** al confirmarse un pago (webhook de Mercado Pago en
   N8N), reportar el evento `Purchase` a Meta para optimización y atribución.
   El nodo/HTTP de N8N envía el evento con el identificador de la conversación.
3. **Catálogo de productos:** sincronizar Shopify → Meta (catálogo de
   Facebook/Instagram). Shopify ya ofrece el canal de Meta; preferir esa vía
   sobre reimplementar.
4. **Panel de resultados (mínimo):** gasto, nº de chats iniciados y ventas
   atribuidas. Puede ser un reporte simple, no una BI completa.

**Costos:** el **presupuesto publicitario** que se paga a Meta es un gasto
variable que define el dueño (ej. $100–200 MXN/día), **no** entra en el costo
fijo del sistema. La integración (montaje + optimización) es trabajo del
desarrollador.

**Decisiones a confirmar (antes de implementar):**
- ¿La atribución de venta se hace por `ref` del anuncio, por número de WhatsApp,
  o ambos?
- ¿El catálogo se sincroniza por el canal nativo de Shopify-Meta o por API?
- ¿Quién administra el Business Manager y la cuenta publicitaria (cliente vs
  desarrollador)?

**Prerrequisitos adicionales:** Meta Business Manager, cuenta publicitaria,
Pixel/Dataset para CAPI, y el número de WhatsApp ya verificado (compartido con
el bot).

**Fase:** posterior al bot (el anuncio necesita un bot funcional como destino).
Ver el roadmap `2026-06-28-loloshop-roadmap.md`.

## Decisiones tomadas (2026-06-28)

| Decisión | Elección | Razón |
|---|---|---|
| Audiencia del bot | Clientes finales | Atención + venta online (FAQ, stock/precio, pedidos) |
| Fuente de datos | API del PWA (InventoryDataSource) | Una sola fuente de verdad; respeta la regla inviolable; fixtures hoy, Shopify en F2 |
| Estilo de interacción | AI Agent puro (Claude) | Conversación natural en español; menos nodos; aprovecha Anthropic de lleno |
| Manejo de pedido | Pedido pendiente + aviso a humano | No es un POS; nada se descuenta sin intervención humana |
| Persistencia de pedidos | Solo notificar (MVP) | El PWA aún no tiene BD; seguimiento manual |
| Cobro | Link de pago Mercado Pago vía N8N | Funciona ya, sin depender de Shopify; OXXO/SPEI/tarjeta |
| Modelo de Claude | Haiku | Volumen de chat con costo bajo |
