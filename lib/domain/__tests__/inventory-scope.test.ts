import { describe, it, expect } from "vitest";
import { scopeInventory, scopeVariantMatch } from "../inventory-scope";
import type { Product, Variant } from "../types";

const variant = (): Variant => ({
  id: "v1", sku: "S1", title: "M", size: "M", color: "", price: 10, barcode: null,
  inventory: [{ locationId: "loc-1", available: 3 }, { locationId: "loc-2", available: 5 }],
});
const product = (): Product =>
  ({ id: "p1", title: "Playera", brand: "X", category: "Ropa", variants: [variant()] }) as unknown as Product;

describe("inventory-scope", () => {
  it("colaborador: solo queda la fila de su tienda", () => {
    const out = scopeInventory(product(), { role: "collaborator", locationId: "loc-1" });
    expect(out.variants[0].inventory).toEqual([{ locationId: "loc-1", available: 3 }]);
    const m = scopeVariantMatch({ product: product(), variant: variant() }, { role: "collaborator", locationId: "loc-1" });
    expect(m.variant.inventory).toEqual([{ locationId: "loc-1", available: 3 }]);
    expect(m.product.variants[0].inventory).toHaveLength(1);
  });

  it("colaborador sin tienda: ninguna fila", () => {
    const out = scopeInventory(product(), { role: "collaborator", locationId: null });
    expect(out.variants[0].inventory).toEqual([]);
  });

  it("owner y manager: sin cambios", () => {
    const p = product();
    expect(scopeInventory(p, { role: "owner", locationId: null })).toBe(p);
    expect(scopeInventory(p, { role: "manager", locationId: "loc-1" })).toBe(p);
    const m = { product: p, variant: variant() };
    expect(scopeVariantMatch(m, { role: "manager", locationId: "loc-1" })).toBe(m);
  });

  it("no muta la entrada", () => {
    const p = product();
    scopeInventory(p, { role: "collaborator", locationId: "loc-1" });
    expect(p.variants[0].inventory).toHaveLength(2);
  });
});
