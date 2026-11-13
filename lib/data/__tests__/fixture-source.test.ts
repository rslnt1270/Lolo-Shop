import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { getPublicCatalog } from "../public-projection";

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
      userId: "u1",
      title: "Producto Test Imagen",
      brand: "TestBrand",
      brandId: "b1",
      departmentId: "d1",
      publicCode: "K7Q2M",
      category: "Playeras",
      locationId: "loc-1",
      variants: [{ barcode: "TEST-IMG-001", sku: "LS-IMG001-0", size: "U", price: 100, initialStock: 1 }],
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

describe("FixtureDataSource.createLocation", () => {
  it("crea una tienda nueva y la devuelve en getLocations", async () => {
    const ds = new FixtureDataSource();
    const created = await ds.createLocation({ name: "Tienda Centro" });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Tienda Centro");
    expect(created.type).toBe("store");
    const locs = await ds.getLocations();
    expect(locs.map((l) => l.name)).toContain("Tienda Centro");
  });

  it("acepta tipo bodega y recorta espacios del nombre", async () => {
    const ds = new FixtureDataSource();
    const created = await ds.createLocation({ name: "  Bodega Norte  ", type: "warehouse" });
    expect(created.name).toBe("Bodega Norte");
    expect(created.type).toBe("warehouse");
  });

  it("rechaza nombre vacío", async () => {
    const ds = new FixtureDataSource();
    await expect(ds.createLocation({ name: "   " })).rejects.toThrow(/nombre/i);
  });

  it("no altera las tiendas de otras instancias (fixtures inmutables)", async () => {
    const a = new FixtureDataSource();
    await a.createLocation({ name: "Solo en A" });
    const b = new FixtureDataSource();
    expect((await b.getLocations()).map((l) => l.name)).not.toContain("Solo en A");
  });
});

describe("FixtureDataSource.createProduct", () => {
  it("guarda la categoría y el stock inicial indicados", async () => {
    const ds = new FixtureDataSource();
    const { product, variants } = await ds.createProduct({
      userId: "u1",
      title: "Gorra Snapback",
      brand: "LoloShop",
      brandId: "b1",
      departmentId: "d1",
      publicCode: "ABCDE",
      category: "Accesorios",
      locationId: "loc-2",
      variants: [{ barcode: "TEST-CAT-001", sku: "LS-CAT001-0", size: "U", price: 420, initialStock: 0 }],
    });

    expect(product.category).toBe("Accesorios");
    expect(variants[0].inventory).toEqual([{ locationId: "loc-2", available: 0 }]);
  });

  it("photosChecked sin las dos URL no escribe catalogPhotosCheckedAt", async () => {
    const ds = new FixtureDataSource();
    const base = {
      userId: "u1", title: "Gorra", brand: "L", brandId: "b1", departmentId: "d1", category: "Accesorios",
      locationId: "loc-2", photosChecked: true,
    };
    const one = await ds.createProduct({
      ...base, publicCode: "AAAA2", imageUrl: "https://example.invalid/f.jpg", backImageUrl: null,
      variants: [{ barcode: "T-1", sku: "S-1", size: "U", price: 1, initialStock: 0 }],
    });
    expect(one.product.catalogPhotosCheckedAt).toBeNull();
    const both = await ds.createProduct({
      ...base, publicCode: "AAAA3", imageUrl: "https://example.invalid/f.jpg", backImageUrl: "https://example.invalid/b.jpg",
      variants: [{ barcode: "T-2", sku: "S-2", size: "U", price: 1, initialStock: 0 }],
    });
    expect(both.product.catalogPhotosCheckedAt).not.toBeNull();
  });
});

describe("FixtureDataSource: catálogo público y departamentos", () => {
  const input = (code: string, departmentId: string, loc: string) => ({
    title: `P ${code}`, brand: "M", brandId: "b", departmentId, category: "Polos", publicCode: code,
    imageUrl: "https://example.invalid/f.jpg", backImageUrl: "https://example.invalid/b.jpg",
    locationId: loc, userId: "u", description: "Descripción",
    variants: [{ size: "M", price: 100, initialStock: 1, sku: `SKU-${code}`, barcode: `${code}1` }],
  });

  it("un producto inactivo no aparece en getPublicCatalog", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    const { product } = await ds.createProduct(input("AAAA1", "dep-dama", store.id));
    product.isPublished = true;
    expect((await getPublicCatalog(ds)).map((p) => p.publicCode)).toContain("AAAA1");
    await ds.setProductActive(product.id, false);
    expect((await getPublicCatalog(ds)).map((p) => p.publicCode)).not.toContain("AAAA1");
  });

  it("resuelve el departamento por id (dep-<slug>) y getPublicCatalog lo proyecta", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    (await ds.createProduct(input("BBBB1", "dep-calzado", store.id))).product.isPublished = true;
    (await ds.createProduct(input("CCCC1", "dep-desconocido", store.id))).product.isPublished = true;
    const cat = await getPublicCatalog(ds);
    expect(cat.find((p) => p.publicCode === "BBBB1")?.department).toEqual({ slug: "calzado", name: "Calzado", sortOrder: 4 });
    expect(cat.find((p) => p.publicCode === "CCCC1")?.department).toBeNull();
  });
  describe("searchProducts (paridad con Prisma, «Sin código»)", () => {
    it("encuentra por tipo, marca, título o SKU interno; texto que no es producto no devuelve nada", async () => {
      const f = new FixtureDataSource();
      expect((await f.searchProducts("hoodies")).map((h) => h.title)).toEqual(["Hoodie NY Yankees"]);
      expect((await f.searchProducts("guess")).map((h) => h.title)).toEqual(["Playera Guess"]);
      expect((await f.searchProducts("ls-pla-gue-m-bla")).map((h) => h.title)).toEqual(["Playera Guess"]);
      expect(await f.searchProducts("zzzz-no-existe")).toEqual([]);
    });
  });
});
