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

### Fase 3 — Bot de WhatsApp (Informativo)
Diseño actualizado: `2026-07-06-loloshop-replan-costo-minimo-design.md`.
- Bot de WhatsApp puramente informativo con respuestas pre-configuradas (sin IA ni N8N).
- Endpoint webhook en Next.js (`/api/whatsapp/webhook`) para manejar interacciones de menú.
- Contenido estático: ubicación, horarios, link de catálogo.
- Notifica a un humano del staff para coordinar entregas o dudas complejas.

### Fase 4 — Facebook Ads (adquisición)
Diseño actualizado: `2026-07-06-loloshop-replan-costo-minimo-design.md`.
- Anuncios apuntan a redes sociales o al WhatsApp informativo.
- Ventas son 100% físicas o por Shopify, sin Conversions API para el bot de WhatsApp.
- Catálogo Shopify → Meta (preferir canal nativo de Shopify).

---

## Prerrequisitos (bloquean la puesta en marcha)

| # | Prerrequisito | Habilita |
|---|---|---|
| 1 | Token de Shopify Admin API | F2 (stock real) |
| 2 | Inventario de productos cargado | F2 |
| 3 | Cuenta WhatsApp Business (Cloud API): token + WABA ID | F3 |
| 4 | Cuenta Mercado Pago + Checkout habilitado en Shopify | F2/F3 |
| 5 | Logo/identidad final (carita guiño + teal) para iconos PWA y deck | F1/F3 |
| 6 | Meta Business Manager + cuenta publicitaria + catálogo | F4 |

---

## Costos de operación (resumen)

**Fijo mensual ≈ $0–20 USD:**
- Vercel: $0 (Hobby) — ~$20 USD si escala.
- WhatsApp Business Cloud: ~$0 dentro de la ventana de servicio de 24h (bot reactivo).
- N8N y Claude eliminados para minimizar costos.

**Variables (sobre ventas / a discreción):**
- Mercado Pago: 3.49% + $4.00 MXN + IVA por venta (link de pago, dinero al instante).
- Presupuesto de Facebook Ads: lo define el dueño (gasto a Meta).

## Modelo de negocio (asesoría)

Recomendado: **setup + mensualidad gestionada** (cuota única de implementación +
mensualidad que cubre hosting/monitoreo/soporte + margen). Alternativas: % por
venta del bot (3–5%), renta SaaS, o proyecto llave en mano. Detalle y pitch en
la presentación `docs/presentacion/loloshop-presentacion.html`.
