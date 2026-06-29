# Premortem — LoloShop (PWA + Bot WhatsApp + Mercado Pago + Facebook Ads)

**Fecha:** 2026-06-28
**Propósito:** Asumir que el proyecto **fracasó** y trabajar hacia atrás las causas, para
retroalimentar la implementación. Cada riesgo lleva: Probabilidad (B/M/A), Impacto (B/M/A),
señal temprana y mitigación. Las prioridades para accionar ya están en §Top riesgos.

> Marco: "Es Q1 2027. LoloShop nunca llegó a operar de verdad (o se abandonó). ¿Qué salió mal?"

---

## 1. Prerrequisitos / accesos (la causa #1 más probable)

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| El **token de Shopify** y las cuentas (WhatsApp Business, Mercado Pago, Meta) nunca se consiguen → el sistema se queda en fixtures y nadie lo usa | **A** | **A** | Semanas sin avance en §Prerrequisitos del roadmap | Convertir los prereqs en un checklist con responsable y fecha; bloquear cada fase a su acceso; tener un "demo con fixtures" como entregable intermedio que no dependa de accesos |
| **Verificación de WhatsApp Business / número** se atora en Meta (revisión, número ya usado) | M | A | El número no pasa a "aprobado" | Iniciar la verificación primero; usar un número dedicado nuevo; plan B: número de prueba para demo |
| Mercado Pago pide **validación de negocio/KYC** y se retrasa el cobro real | M | M | Cuenta MP en revisión | Crear y validar la cuenta MP al inicio, en paralelo |

## 2. Técnicos

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| Se **rompe la regla `InventoryDataSource`**: el bot/UI termina llamando a Shopify directo (atajo bajo presión) → doble fuente de verdad, stock desincronizado | M | **A** | PRs que importan el cliente Shopify fuera de `lib/data/` | Revisión que rechace imports de Shopify fuera de `ShopifyDataSource`; lint/test de arquitectura; los endpoints `/api/bot/*` SOLO usan `getDataSource()` |
| **ShopifyDataSource (F2)** no calza con la interfaz (paginación, rate limits, GraphQL costoso) y obliga a cambiar la interfaz → rompe consumidores | M | A | Métodos que necesitan params nuevos | Validar la interfaz contra la API real de Shopify ANTES de F3; mockear respuestas reales en tests |
| **Stock incorrecto**: el bot promete disponibilidad que ya no existe (ventas físicas no descontadas aún en F1/F3) | **A** | A | Clientes que pagan algo agotado | Mensaje del bot: disponibilidad "sujeta a confirmación"; fulfillment manual con humano (ya es el diseño MVP); priorizar F2 (descuento real) |
| **Webhook de Mercado Pago** sin validar firma → confirmaciones de pago falsas | M | A | Pedidos "pagados" sin dinero | Validar firma/secreto del webhook (ya en el spec); conciliar contra el estado real de MP |
| **N8N** se cae / la instancia self-host muere → el bot deja de responder sin que nadie note | M | A | Mensajes sin respuesta | Monitoreo/health-check del workflow; alerta al staff si N8N no responde; considerar N8N Cloud por confiabilidad |
| **Costos de Claude** se disparan por prompts largos / loops del agente | B | M | Factura Anthropic creciente | Usar Haiku; prompt caching; `max_tokens` acotado; límite de turnos; alertas de gasto |

## 3. Producto / adopción

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| **El staff no adopta la PWA**: siguen llevando stock "de memoria" → los datos quedan desactualizados y el bot miente | **A** | **A** | Entradas/salidas no se registran | UX súper simple (escaneo); capacitación corta; arrancar con UN flujo (salidas) bien hecho; el dueño exige su uso |
| **El bot frustra al cliente** (respuestas erróneas, no entiende, alucina precios) → daña la marca en su canal principal (Instagram/WhatsApp) | M | **A** | Quejas, abandono de chats | Restricción dura: el bot solo da datos de herramientas; pruebas con conversaciones reales; "hablar con humano" siempre disponible; piloto controlado |
| **Pago por WhatsApp genera desconfianza** (link de pago percibido como fraude) | M | M | Clientes que no completan el pago | Usar dominio/cuenta MP verificada; explicar el flujo; ofrecer también pago contra entrega |

## 4. Negocio / relación con el cliente (el amigo)

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| **Mezclar amistad y negocio sin acuerdo escrito** → expectativas difusas, scope creep infinito (ya van: bot, MP, Ads…), trabajo no pagado, fricción personal | **A** | **A** | Pedidos nuevos constantes sin re-cotizar (este patrón ya ocurre) | Acuerdo simple por escrito: alcance por fase, qué incluye la mensualidad, cómo se cotiza lo nuevo; congelar alcance por fase |
| **Scope creep** hunde los tiempos: cada semana una integración nueva → nunca se entrega F1 | **A** | A | Tareas a medias acumuladas (F1 lleva 6/8 y ya hay 3 módulos nuevos) | "Definition of done" por fase; terminar F1 antes de F3/F4; backlog explícito para lo nuevo |
| **El dueño no quiere pagar la mensualidad** una vez ve los costos → el proyecto queda como favor sin retorno | M | M | Resistencia al hablar de dinero | Anclar al valor (canal de venta nuevo); piloto con métricas; modelo claro (setup + mensualidad) |
| **Como portafolio no luce** si nunca llega a producción real | M | M | Se queda en demo | Aun sin cliente, dejar la demo pulida (ya existe) como pieza de portafolio independiente |

## 5. Facebook Ads (F4)

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| **Gasto en Ads sin retorno** (CTWA trae curiosos, no compradores) → el dueño culpa al sistema | M | M | CPA alto, chats que no compran | Empezar con presupuesto bajo; optimizar con Conversions API (reportar `Purchase`); medir ventas atribuidas, no clics |
| **Atribución rota**: la venta no se liga al anuncio → Meta no optimiza y no se puede demostrar ROI | M | M | CAPI sin eventos `Purchase` | Definir atribución (ref del anuncio / número) antes de implementar; probar el evento end-to-end |
| **Bloqueo de cuenta publicitaria de Meta** (política, pago) | B | A | Rechazo de anuncios | Cuenta y métodos de pago en regla; no depender 100% de Ads |

## 6. Operación / seguridad

| Riesgo | P | I | Señal temprana | Mitigación |
|---|---|---|---|---|
| **Secretos filtrados** (token Shopify, `BOT_API_KEY`, secreto NextAuth, keys MP/Meta) en el repo o logs | M | **A** | Claves en git/commits | `.env*.local` ya gitignored; revisar que nada de eso entre al repo; rotar si se filtra |
| **Sin respaldo/registro de pedidos** (MVP solo notifica) → se pierden ventas si el staff no anota | M | M | Pedidos perdidos en el chat | Plan para persistir pedidos (F-siguiente) o crear draft order en Shopify (F2) |
| **Datos de clientes** (WhatsApp, teléfono) sin tratamiento claro | B | M | — | Minimizar datos guardados; aviso de privacidad básico |

---

## Top riesgos a accionar AHORA (alimentan el plan)

1. **Acuerdo escrito + congelar alcance por fase.** El scope creep (bot → MP → Ads en días) y la dinámica amigo-cliente son el riesgo combinado más alto. Antes de codear más: alcance, qué cubre la mensualidad y cómo se cotiza lo nuevo.
2. **Convertir los prerrequisitos en checklist con dueño y fecha**, y arrancar verificaciones lentas (WhatsApp, MP, Meta) en paralelo desde ya.
3. **Terminar F1 (Productos + Dashboard) antes de F3/F4.** No abrir más frentes hasta cerrar cimientos.
4. **Blindar la regla `InventoryDataSource`** con revisión/lint que prohíba Shopify fuera de su capa.
5. **Honestidad de stock**: el bot debe marcar disponibilidad como "a confirmar" hasta que F2 descuente inventario real; mantener el humano en el loop (ya es el diseño).
6. **Validar firma del webhook de Mercado Pago** y conciliar pagos.

## Cómo retroalimentar la implementación

- Releer este premortem al inicio de cada fase y antes de aceptar features nuevas.
- Cada mitigación marcada como "antes de implementar" es un gate de la fase correspondiente en `2026-06-28-loloshop-roadmap.md`.
- Revisar al cierre de cada fase qué riesgos se materializaron y actualizar este documento.
