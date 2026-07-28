import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";

describe("FixtureDataSource", () => {
  const ds = new FixtureDataSource();

  it("devuelve las dos tiendas", async () => {
    const locs = await ds.getLocations();
    expect(locs.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
  });

  it("devuelve todos los productos", async () => {
    const products = await ds.getProducts();
    expect(products).toHaveLength(2);
  });

  it("encuentra producto y variante por variantId", async () => {
    const match = await ds.getProductByVariantId("var-3");
    expect(match?.product.title).toBe("Playera Guess");
    expect(match?.variant.sku).toBe("LS-PLA-GUE-M-BLA");
  });

  it("encuentra una variante del primer producto (path salta-luego-encuentra)", async () => {
    const match = await ds.getProductByVariantId("var-1");
    expect(match?.product.title).toBe("Hoodie NY Yankees");
    expect(match?.variant.sku).toBe("LS-HOO-NYY-M-NEG");
  });

  it("los inventarios tienen las cantidades exactas de carga", async () => {
    const products = await ds.getProducts();
    const var1 = products[0].variants[0]; // LS-HOO-NYY-M-NEG
    expect(var1.inventory).toEqual([
      { locationId: "loc-1", available: 3 },
      { locationId: "loc-2", available: 5 },
    ]);
    const var2 = products[0].variants[1]; // LS-HOO-NYY-L-NEG
    expect(var2.inventory).toEqual([
      { locationId: "loc-1", available: 1 },
      { locationId: "loc-2", available: 0 },
    ]);
    const var3 = products[1].variants[0]; // LS-PLA-GUE-M-BLA
    expect(var3.inventory).toEqual([
      { locationId: "loc-1", available: 8 },
      { locationId: "loc-2", available: 2 },
    ]);
  });

  it("devuelve null si el variantId no existe", async () => {
    const match = await ds.getProductByVariantId("inexistente");
    expect(match).toBeNull();
  });
});

describe("FixtureDataSource.updateProductImage", () => {
  it("actualiza el imageUrl del producto indicado", async () => {
    const ds = new FixtureDataSource();
    const { product } = await ds.createProduct({
      barcode: "TEST-IMG-001",
      title: "Producto Test Imagen",
      brand: "TestBrand",
      price: 100,
      locationId: "loc-1",
    });

    await ds.updateProductImage(product.id, "https://blob.example/x.jpg");

    const all = await ds.getProducts();
    const updated = all.find((p) => p.id === product.id);
    expect(updated?.imageUrl).toBe("https://blob.example/x.jpg");
  });

  it("lanza si el producto no existe", async () => {
    const ds = new FixtureDataSource();
    await expect(
      ds.updateProductImage("no-existe", "https://blob.example/x.jpg")
    ).rejects.toThrow();
  });
});
