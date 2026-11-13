---
name: project-fotos-sin-fondo-blanco
description: Owner decision 2026-11-12 removing the white-background photo rule; new site eligibility, catalogPhotosCheckedAt meaning, and the privacy ordering it forces (entrega 2)
metadata:
  type: project
---

On 2026-11-12 the owner removed the white-background requirement: any captured photo is accepted (no frame, no rejection); staff capture fast, the owner edits photos later and replaces them before publishing. Overrides alta spec §1–§3, C14, C15, §8 and decision 5 of entrega 1.

Design chosen (plan C revised, cronograma `docs/superpowers/plans/2026-11-12-entrega-2-cronograma.md`):
- Site eligibility = front + back present, description, stock in a public store; shown only if also `isPublished` (owner/manager "Publicar").
- `catalogPhotosCheckedAt` kept with no migration, informational only ("front and back saved together in the app"), never read for decisions.
- "Por publicar" list in /productos for owner/manager with "Abrir foto", "Reemplazar foto" (gallery, no `capture`) and "Publicar" with a people/prices/customer-data confirmation.

**Why:** without the automatic white check, the only privacy gate for store photos (people, prices) is the human "Publicar"; prod /catalogo at d05d68b still shows any two-photo product regardless of isPublished.

**How to apply:** the publish filter (G18) must merge and ship before or with the capture-removal group (G19); flag any plan that reorders them. Entrega 2 needs no migrations. Related: [[f2-carryover-gates]].
