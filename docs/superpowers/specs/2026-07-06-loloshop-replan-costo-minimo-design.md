# LoloShop — Replanificación de Costo Mínimo (Bot, Pagos, Identificación de Producto)

**Fecha:** 2026-07-06
**Estado:** Aprobado (diseño) — reemplaza partes de `2026-06-28-loloshop-whatsapp-bot-design.md` y de la sección de etiquetas QR en `2026-06-26-loloshop-design.md`.

---

## Contexto y motivación

El diseño original del bot de WhatsApp (AI Agent con Claude Haiku + N8N + cobro
por Mercado Pago vía link de pago) y del sistema de identificación de producto
(QR propio con branding + barcode de fábrica) representaban costo fijo mensual
y esfuerzo de implementación que el negocio no necesita hoy. Las ventas de
LoloShop son **100% físicas, gestionadas por el encargado**; la tienda online
de Shopify aún no vende. Este documento replantea tres áreas para minimizar
costo real y esfuerzo de desarrollo, sin perder la utilidad del sistema.

**Cambios de alcance (resumen):**

| Área | Antes | Ahora |
|---|---|---|
| Bot WhatsApp | AI Agent (Claude Haiku) + N8N; toma pedidos y cobra | Menú de botones sin IA, sin N8N; **100% informativo** |
| Pagos online | Link de pago Mercado Pago vía N8N (bot) | Mercado Pago como **pasarela dentro del checkout de Shopify** |
| Identificación de producto | Híbrido: QR propio con branding + barcode de fábrica | Solo barcode: de fábrica, o **genérico interno** (= SKU) sin arte |
| Facebook Ads | Apuntaba al bot como embudo de venta | Apunta a redes sociales / WhatsApp informativo; ventas siguen siendo físicas |

**Regla inviolable (sin cambios):** toda la lógica de inventario pasa por
`InventoryDataSource`. Este replanteo en realidad la refuerza: el bot deja de
ser consumidor de la interfaz por completo (ver §4).

---

## 1. Bot de WhatsApp — rediseño informativo

### Objetivo y alcance

Bot de WhatsApp **puramente informativo**, sin IA y sin tomar pedidos ni
pagos. Único propósito: ser un canal de comunicación para:
1. Horarios de atención y ubicación de las tiendas (con link de mapa) para
   recoger en persona.
2. Link al catálogo/tienda online de Shopify.
3. Coordinar entrega: responde info estática y **avisa a un humano del staff**
   para que continúe la conversación.
4. Preguntas frecuentes (envíos, formas de pago en tienda, etc.), respuestas
   estáticas predefinidas.

**Fuera de alcance:** IA/lenguaje natural, toma de pedidos, cobro, consulta de
stock/precio en vivo, cualquier lectura de `InventoryDataSource`.

### Arquitectura

```
Cliente (WhatsApp)
      │ mensaje / selección de botón
      ▼
Meta Webhook ──POST──▶ /api/whatsapp/webhook  (Next.js, Vercel)
                              │
                        lógica de menú (código propio, reglas fijas)
                              │
                              ▼
                  WhatsApp Cloud API (Meta) — enviar mensaje interactivo
                              │
                  (si el cliente eligió "coordinar entrega")
                              ▼
                  WhatsApp Cloud API → notifica al número/staff interno
```

- **Sin N8N.** El webhook lo recibe una API route de Next.js directamente.
  Elimina el costo fijo de N8N (~$6–24 USD/mes) que ya no se justifica sin un
  AI Agent que orquestar.
- **Sin IA.** El menú es un árbol de decisión fijo implementado en código
  (mensajes interactivos tipo *list message* / *reply buttons* de WhatsApp
  Cloud API).
- **Contenido estático:** horarios, direcciones, link de catálogo y FAQ viven
  como constantes en el código del PWA (o un archivo de configuración simple),
  no en una base de datos ni en `InventoryDataSource`.
- **Handoff a staff:** al elegir "coordinar entrega", además de la respuesta
  estática, se envía un mensaje de WhatsApp Cloud API a un número interno
  (ej. el encargado) con el número del cliente, para que un humano continúe.
  No hay persistencia de este evento (no hay BD de pedidos ni de tickets).

### Autenticación del webhook

- Verificación estándar de Meta: el endpoint valida el `hub.challenge` en el
  `GET` de verificación inicial, y valida la firma `X-Hub-Signature-256` en
  cada `POST` entrante usando el App Secret de Meta.
- Ya **no aplica** el header `x-bot-key` del diseño anterior (era para
  autenticar llamadas desde N8N; N8N ya no existe en esta arquitectura).

### Pruebas (Vitest)

- Parsing del payload entrante de WhatsApp Cloud API → selección de opción de
  menú correcta.
- Cada opción de menú devuelve el contenido estático esperado (horarios,
  ubicación, link de catálogo, FAQ).
- "Coordinar entrega" dispara tanto la respuesta al cliente como la
  notificación al staff (verificar ambas llamadas salientes, mockeadas).
- Rechazo de webhook con firma inválida o ausente.
- Verificación de `hub.challenge` en el `GET` inicial de Meta.

### Errores

- Si el envío a WhatsApp Cloud API falla, se registra el error (log) — no hay
  reintentos automáticos en el MVP (bajo volumen, canal no crítico).
- Mensajes fuera del menú (texto libre no reconocido): respuesta fija tipo
  "No entendí, elige una opción:" + reenvío del menú principal.

---

## 2. Pagos — Shopify + Mercado Pago como pasarela

- Se activa el **canal de ventas online de Shopify** (checkout real).
- Dato clave: **Shopify Payments no opera en México**; se requiere una
  pasarela de terceros soportada. Se usa la **app oficial de Mercado Pago
  para Shopify**, conectada como método de pago del checkout.
- **Cero código propio de pagos.** No hay webhook de Mercado Pago que
  mantener, no hay "pedido pendiente" ni notificación manual — todo el flujo
  de cobro, confirmación y aviso vive dentro de Shopify.
- El bot de WhatsApp **no participa** en el flujo de pago.

**Prerrequisito nuevo:** cuenta de Mercado Pago habilitada + activar canal de
ventas online + pasarela en Shopify.

---

## 3. Identificación de producto — solo barcode (sin QR propio)

- **Con barcode de fábrica:** se escanea y se registra contra el `variant` de
  Shopify. Sin cambios respecto al diseño original de inventario.
- **Sin barcode de fábrica:** se asigna un **barcode genérico interno**, cuyo
  valor **es el SKU ya generado** por `generateSku()`
  (`LS-{CAT}-{MARCA}-{TALLA}-{COLOR}`). Se imprime como etiqueta simple
  (código de barras Code128 + texto del SKU), **sin logo, sin colores, sin
  layout de marca**.
- **Se elimina** toda la infraestructura de diseño de etiqueta QR con
  branding planeada para F2/F3 (canvas/arte, layout A4 con logo). Se
  reemplaza por una etiqueta de texto + barra simple, más barata y rápida de
  generar/imprimir.
- El campo `Variant.barcode` (ya existente en `lib/domain/types.ts`) sigue
  siendo la única fuente de verdad para el escaneo, sea de fábrica o interno
  — no hay una codificación distinta para "QR" vs "barcode".

**Impacto en Fase 2:** el trabajo de "generar/imprimir etiqueta" se reduce a
una etiqueta de texto+barra (sin diseño gráfico), y el escaneo sigue
funcionando igual para ambos orígenes de barcode.

---

## 4. Impacto en `InventoryDataSource` (regla inviolable)

Sin cambios en la interfaz. Se refuerza porque **el bot deja de ser
consumidor**: ya no hay endpoints `/api/bot/*` leyendo stock/precio. Los
únicos consumidores de `InventoryDataSource` siguen siendo la PWA (F1, hecho)
y el registro de entrada/salida por barcode (F2).

---

## 5. Facebook Ads (Fase 4) — alcance ajustado

- Los anuncios dirigen a **redes sociales y al WhatsApp informativo** (no a
  un embudo de checkout). Objetivo: awareness y contacto, no conversión
  online directa.
- Las ventas siguen siendo **100% físicas**, gestionadas por el encargado en
  tienda; Facebook Ads no necesita Conversions API de compra por ahora (no
  hay evento de compra online que reportar de forma significativa).
- Esta fase se mantiene de baja prioridad/opcional; no bloquea nada de lo
  anterior.

---

## 6. Costos actualizados

**Fijo mensual ≈ $0–20 USD** (antes $30–60 USD):
- Vercel: $0 (Hobby).
- WhatsApp Business Cloud API: $0 (bot reactivo, dentro de ventana de
  servicio de 24h; sin plantillas de marketing).
- N8N: **$0** — eliminado.
- Claude/IA: **$0** — eliminado, no hay LLM en este bot.

**Variable (sobre ventas online, si llegan a darse):**
- Comisión de Mercado Pago como pasarela de Shopify (misma tarifa de mercado
  que antes: ~3.49% + $4 MXN + IVA por venta), ahora cobrada dentro del
  checkout de Shopify en vez de un link de pago separado.
- Presupuesto de Facebook Ads: a discreción del dueño.

---

## 7. Documentos afectados (a actualizar después de este spec)

- `2026-06-28-loloshop-whatsapp-bot-design.md` — reemplazado por este
  documento en lo referente al bot (dejar nota de deprecación apuntando aquí).
- `2026-06-26-loloshop-design.md` — actualizar sección de identificación de
  producto (quitar QR con branding, dejar solo barcode/SKU).
- `2026-06-28-loloshop-roadmap.md` — actualizar Fase 3 (bot) y Fase 4 (Ads),
  costos y prerrequisitos.
- Memoria del proyecto y presentaciones — fuera de alcance de este spec, se
  actualizan por separado.

---

## Decisiones tomadas (2026-07-06)

| Decisión | Elección | Razón |
|---|---|---|
| Identificación sin barcode de fábrica | Barcode genérico interno = SKU | Reutiliza el generador de SKU ya construido; sin nuevo esquema de IDs |
| Alcance del bot | Puramente informativo (horarios, ubicación, catálogo, coordinar entrega) | El negocio no necesita toma de pedidos/IA; reduce costo y complejidad a casi cero |
| Pasarela de pago en México | Mercado Pago como app/pasarela de Shopify | Shopify Payments no opera en México; evita construir cobro propio |
| Orquestación del bot | Next.js API routes directo (sin N8N) | Sin IA que orquestar, N8N ya no se justifica; ahorra costo fijo |
| Etiquetas | Code128 + texto (sin arte/branding) | Menos esfuerzo de implementación, mismo resultado funcional |
| Facebook Ads | Dirige a redes sociales/WhatsApp informativo | Ventas siguen siendo 100% físicas; no hay embudo online que optimizar aún |
