---
name: project-data-layer
description: InventoryDataSource interface and FixtureDataSource implementation live in lib/data/, commit 1a310bd
metadata:
  type: project
---

Task 4 complete. `InventoryDataSource` interface defined in `lib/data/source.ts`; `FixtureDataSource` in `lib/data/fixture-source.ts`; fixtures in `lib/data/fixtures.ts`. All implemented on branch `fase-1-cimientos`, commit `1a310bd`.

**Why:** Central architectural contract — all inventory logic flows through this interface; UI never calls Shopify directly. FixtureDataSource is the F1/test double; ShopifyDataSource will implement the same interface in F2+ without touching UI or services.

**How to apply:** When adding new data access methods (e.g., `registerEntry`, `registerExit` in F2), extend `InventoryDataSource` in `source.ts`, add stub to `FixtureDataSource`, then implement in `ShopifyDataSource`. Never bypass the interface.

Fixture inventory quantities (downstream tests depend on these exact values):
- hoodie var-1: loc-1=3, loc-2=5
- hoodie var-2: loc-1=1, loc-2=0
- playera var-3: loc-1=8, loc-2=2

See [[project-domain-layer]] for domain types imported by this layer.
