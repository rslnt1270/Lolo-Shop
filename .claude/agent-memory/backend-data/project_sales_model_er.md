---
name: project-sales-model-er
description: Diseño propuesto 2026-11-05 de Sale/SaleLine, Brand, Department (tabla), imagen, zonas; pendiente de aprobación del dueño, nada migrado
metadata:
  type: project
---

El 2026-11-05 se escribió el spec de modelo de datos con ER (docs/superpowers/specs/2026-11-05-modelo-datos-er.md). Solo docs; schema sin tocar, sin migraciones.

Decisiones propias tomadas ahí: Sale + SaleLine (pago uno por ticket); estado de pago (`status`) separado de estado de stock (`stockCommittedAt`) para soportar ambos flujos de WhatsApp; `Department` como tabla (lista del dueño sin cerrar); `Brand` tabla con `Product.brand` texto conviviendo; `businessDate` en America/Mexico_City y copias brand/department en SaleLine para groupBy sin SQL crudo; venta sin upsert (updateMany condicional `available >= qty`); `MovementType.RETURN` nuevo; zonas en BD (`StoreZone`/`ZoneConnection`/`StoreHotspot`).

**Why:** el dueño no ha decidido quién registra la venta WhatsApp (colaborador al entregar vs owner al confirmar SPAY) ni la lista de departamentos.
**How to apply:** antes de implementar ventas, confirmar con el dueño esas dos decisiones y que el baseline (B5) ya existe; seguir el orden de migraciones del spec §5.2. Ver [[project-data-layer]].
