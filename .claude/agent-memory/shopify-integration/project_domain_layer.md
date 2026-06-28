---
name: domain-layer-task3
description: Task 3 completed — pure domain types and SKU generator are live in lib/domain/
metadata:
  type: project
---

Task 3 shipped in commit 66ce1f7 on branch fase-1-cimientos.

Files created:
- `lib/domain/types.ts` — Role, Location, InventoryLevel, Variant, Product
- `lib/domain/sku.ts` — generateSku(SkuInput): string, format LS-{CAT}-{MARCA}-{TALLA}-{COLOR}
- `lib/domain/__tests__/sku.test.ts` — 5 vitest cases, all green

**Why:** These types are the shared vocabulary for the entire app. All subsequent tasks (data source, fixtures, services, UI) import from here.

**How to apply:** When writing Tasks 4+, import types from `lib/domain/types.ts` and use `generateSku` from `lib/domain/sku.ts`. Do not redefine these types elsewhere. The SkuInput interface is exported from sku.ts.

SKU size behavior: natural length up to 3 chars (M→1, XL→2, Única→3); all other segments fixed at 3, padded with X.
