---
name: project-f2-carryover-gates
description: Gates/deferrals agreed at the F1 merge review that must be addressed in F2
metadata:
  type: project
---

At the F1 whole-branch merge review (2026-06-28) these items were consciously deferred to F2, not bugs to fix in F1:

- **Loading state before `ShopifyDataSource`.** Home (`app/page.tsx`) has no loading guard. With instant `FixtureDataSource` it's invisible, but async Shopify will flash "Sin alertas de stock." / zero KPIs on first paint. Add a loading state when F2 lands the real data source.
- **Collaborator location scoping not enforced in UI.** `session.user.locationId` exists but the dashboard and products screen show BOTH stores to every role. The plan explicitly intended this for read-only F1 (manual verify expects colab1 to see loc-1=12 and loc-2=7). It diverges from the domain invariant "collaborator solo opera sobre su locationId". Enforce scoping in F2 when write ops (entrada/salida) make it matter.
- **Plaintext passwords.** `lib/auth/users.ts` stores/compares passwords in plaintext. Acceptable for F1 (4 static users, no real store data). Must not reach production with real Shopify data without hashing — address with F2 auth hardening.

**Why:** keeps F2 from re-litigating choices already validated, and prevents these known edges from silently shipping.
**How to apply:** when F2 work touches the data source, dashboard, or auth, treat these as required, not optional.
