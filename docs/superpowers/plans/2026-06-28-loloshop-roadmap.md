# LoloShop — Roadmap de Implementación (actualizado)

**Fecha:** 2026-06-28
**Estado:** Implementaciones PAUSADAS hasta resolver prerrequisitos (ver §Prerrequisitos).

Este documento unifica todas las fases del proyecto LoloShop: la PWA de
inventario, el bot de WhatsApp con cobro por Mercado Pago, y el módulo de
Facebook Ads. Cada fase tiene (o tendrá) su propio plan detallado.

---

## Estado actual

- **Fase 1 — Cimientos + inventario (lectura):** 6/8 tareas completas en la rama
  `fase-1-cimientos`. Hechas: scaffold, PWA, tipos+SKU, `InventoryDataSource`+
  fixtures, servicio de inventario, autenticación con roles. **Faltan:** Task 7
  (pantalla Productos) y Task 8 (Dashboard).
  - Nota: el **Dashboard (Task 8)** se trabajará con **claude.ai/design**.
  - Plan detallado: `2026-06-26-loloshop-fase1-cimientos.md`.

## Regla inviolable (todas las fases)

Toda la lógica de inventario pasa por la interfaz `InventoryDataSource`. Ni la
UI ni el bot ni los anuncios llaman a Shopify directo. Fixtures hoy →
`ShopifyDataSource` en Fase 2, sin reescribir consumidores.

---

## Fases

### Fase 1 — Cimientos + inventario (lectura) · 6/8
Login por roles, dashboard, productos. Datos con `FixtureDataSource`.
→ Cerrar Task 7 y Task 8.

### Fase 2 — Shopify real + movimientos
- Implementar `ShopifyDataSource` detrás de `InventoryDataSource` (factory
  `getDataSource()` la devuelve cuando exista `SHOPIFY_ACCESS_TOKEN`).
- Escaneo QR/barcode, registrar entrada (alta + SKU + etiqueta), registrar
  salida (descuento de stock).
- Requiere: token de Shopify Admin API + inventario cargado.

### Fase 3 — Bot de WhatsApp + cobro (Mercado Pago)
Diseño aprobado: `2026-06-28-loloshop-whatsapp-bot-design.md`.
- Endpoints `/api/bot/*` en el PWA (TDD, fixtures primero), auth por `x-bot-key`.
- Workflow N8N: WhatsApp Trigger → AI Agent (Claude Haiku) → herramientas HTTP →
  WhatsApp send. Memoria por número.
- Cobro: link de pago **Mercado Pago** (nodo oficial) + webhook → aviso al staff.
- "Go live" con stock real cuando F2 conecte Shopify.

### Fase 4 — Facebook Ads (adquisición)
Diseño en la sección "Módulo Facebook Ads" del spec del bot.
- Campañas **Click-to-WhatsApp** que aterrizan en el bot.
- **Conversions API**: reportar `Purchase` a Meta al confirmarse el pago.
- Catálogo Shopify → Meta (preferir canal nativo de Shopify).
- Panel mínimo: gasto, chats, ventas atribuidas.
- Depende de F3 (el anuncio necesita un bot funcional como destino).

---

## Prerrequisitos (bloquean la puesta en marcha)

| # | Prerrequisito | Habilita |
|---|---|---|
| 1 | Token de Shopify Admin API | F2 (stock real) |
| 2 | Inventario de productos cargado | F2 |
| 3 | Cuenta WhatsApp Business (Cloud API): token + WABA ID | F3 |
| 4 | Cuenta Mercado Pago + access token; community node en N8N | F3 |
| 5 | Instancia de N8N accesible por webhooks + API key de Claude | F3 |
| 6 | Logo/identidad final (carita guiño + teal) para iconos PWA y deck | F1/F3 |
| 7 | Meta Business Manager + cuenta publicitaria + Pixel/CAPI + catálogo | F4 |

---

## Costos de operación (resumen)

**Fijo mensual ≈ $30–60 USD (~$600–1,100 MXN):**
- Vercel: $0 (Hobby) — ~$20 USD si escala.
- N8N: ~$6 USD (self-host VPS) o ~$24 USD (Cloud Starter, 2,500 ejecuciones).
- Claude Haiku 4.5: ~$5–15 USD a volumen bajo ($1/M entrada, $5/M salida; ~$0.02–0.05 por conversación).
- WhatsApp Business Cloud: ~$0 dentro de la ventana de servicio de 24h (bot reactivo).

**Variables (sobre ventas / a discreción):**
- Mercado Pago: 3.49% + $4.00 MXN + IVA por venta (link de pago, dinero al instante).
- Presupuesto de Facebook Ads: lo define el dueño (gasto a Meta).

## Modelo de negocio (asesoría)

Recomendado: **setup + mensualidad gestionada** (cuota única de implementación +
mensualidad que cubre hosting/monitoreo/soporte + margen). Alternativas: % por
venta del bot (3–5%), renta SaaS, o proyecto llave en mano. Detalle y pitch en
la presentación `docs/presentacion/loloshop-presentacion.html`.
