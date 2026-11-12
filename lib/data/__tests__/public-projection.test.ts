import { describe, it, expect } from "vitest";
import { FixtureDataSource } from "../fixture-source";
import { findPublicByCode, getPublicCatalog, publicStoreIds, toPublicProduct } from "../public-projection";
import { parsePublicCodeRequest } from "@/lib/domain/public-code";
import type { Location, Product } from "@/lib/domain/types";
import type { InventoryDataSource } from "../source";

const base = {
  title: "Playera", brand: "Nike", brandId: "b1", departmentId: "d1",
  publicCode: "K7Q2M", category: "Playeras", locationId: "loc-1", userId: "u1",
  imageUrl: "https://a/f.jpg" as string | null, backImageUrl: "https://a/b.jpg" as string | null,
  variants: [{ barcode: "7501", sku: "LS-000001-1", size: "", price: 250, initialStock: 7 }],
};
/** Una talla con otro sku y código (antes `sku` y `barcode` iban sueltos en el alta). */
const one = (sku: string, barcode: string) => [{ ...base.variants[0], sku, barcode }];

describe("proyección pública (B1)", () => {
  it("no expone sku, barcode, inventory, locationId ni cifras de stock", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    (await ds.createProduct({ ...base, locationId: store.id, description: "d" })).product.isPublished = true;
    const json = JSON.stringify(await getPublicCatalog(ds));
    for (const k of ["sku", "barcode", "inventory", "locationId", "LS-000001-1", "7501", '"available":7']) {
      expect(json).not.toContain(k);
    }
    const [p] = (await getPublicCatalog(ds)).filter((x) => x.publicCode === "K7Q2M");
    expect(p.sizes).toEqual([{ size: "U", available: true, price: 250 }]);
    expect(p.price).toBe(250);
  });

  it("disponible solo con stock en tiendas, no en bodegas", () => {
    const p = {
      id: "p", title: "t", brand: "b", category: "c", imageUrl: null, publicCode: "AAAAA",
      variants: [{ id: "v", sku: "s", title: "t", size: "M", color: "x", price: 1, barcode: null,
        inventory: [{ locationId: "wh", available: 9 }, { locationId: "st", available: 0 }] }],
    };
    expect(toPublicProduct(p, new Set(["st"])).sizes).toEqual([{ size: "M", available: false, price: 1 }]);
  });

  it("excluye variantes inactivas y productos sin variantes activas (los productos inactivos los filtra la fuente)", async () => {
    const variant = (id: string, size: string, isActive?: boolean) => ({
      id, sku: `S-${id}`, title: size, size, color: "x", price: 100, barcode: null,
      ...(isActive === undefined ? {} : { isActive }),
      inventory: [{ locationId: "st", available: 3 }],
    });
    const product = (id: string, publicCode: string, variants: ReturnType<typeof variant>[], isActive?: boolean) => ({
      id, title: `t-${id}`, brand: "b", category: "c", imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg", publicCode, variants,
      description: "d", isPublished: true,
      ...(isActive === undefined ? {} : { isActive }),
    });
    const products: Product[] = [
      product("activo", "AAAAA", [variant("a1", "M", true), variant("a2", "L", false)]),
      product("sin-variantes-activas", "CCCCC", [variant("c1", "M", false)], true),
    ];
    const ds = {
      getCatalogProducts: async () => products,
      getLocations: async () => [{ id: "st", name: "Tienda", type: "store" as const }],
    } as unknown as InventoryDataSource;

    const catalog = await getPublicCatalog(ds);
    expect(catalog.map((p) => p.publicCode)).toEqual(["AAAAA"]);
    // La variante inactiva (L) no aparece aunque tenga stock.
    expect(catalog[0].sizes).toEqual([{ size: "M", available: true, price: 100 }]);
  });
});

describe("tallas públicas: orden y precio", () => {
  const v = (id: string, size: string, price: number, available: number, isActive = true) => ({
    id, sku: `S-${id}`, title: size, size, color: "x", price, barcode: null, isActive,
    inventory: [{ locationId: "st", available }],
  });
  const prod = (variants: ReturnType<typeof v>[]) => ({
    id: "p", title: "t", brand: "b", category: "c", imageUrl: "f", backImageUrl: "b", publicCode: "AAAAA", variants,
  });
  const stores = new Set(["st"]);

  it("ordena con sortSizes y trae el precio de cada talla", () => {
    const p = toPublicProduct(prod([v("1", "XL", 400, 1), v("2", "S", 300, 0), v("3", "M", 350, 2)]), stores);
    expect(p.sizes).toEqual([
      { size: "S", available: false, price: 300 },
      { size: "M", available: true, price: 350 },
      { size: "XL", available: true, price: 400 },
    ]);
    expect(p.price).toBe(300);
  });

  it("dos variantes activas con la misma talla: precio menor y disponible si alguna lo está", () => {
    const p = toPublicProduct(prod([v("1", "M", 350, 0), v("2", "M", 320, 1)]), stores);
    expect(p.sizes).toEqual([{ size: "M", available: true, price: 320 }]);
    const q = toPublicProduct(prod([v("1", "M", 350, 0), v("2", "M", 320, 0)]), stores);
    expect(q.sizes).toEqual([{ size: "M", available: false, price: 320 }]);
  });

  it("el precio del producto ignora las variantes inactivas", () => {
    const p = toPublicProduct(prod([v("1", "M", 350, 1), v("2", "L", 100, 1, false)]), stores);
    expect(p.price).toBe(350);
  });
});

describe("parsePublicCodeRequest", () => {
  it("lee código y talla sin importar mayúsculas", () => {
    expect(parsePublicCodeRequest("hola, quiero apartar. código k7q2m talla m")).toEqual({ kind: "ok", code: "K7Q2M", size: "M" });
    expect(parsePublicCodeRequest("Codigo K7Q2M")).toEqual({ kind: "ok", code: "K7Q2M", size: null });
  });
  it("marca inválido el formato incorrecto y none si no hay código", () => {
    expect(parsePublicCodeRequest("Código K7Q2")).toEqual({ kind: "invalid" });
    expect(parsePublicCodeRequest("Código K7Q2U")).toEqual({ kind: "invalid" });
    expect(parsePublicCodeRequest("quiero apartar")).toEqual({ kind: "none" });
  });
});

describe("catálogo público: solo productos con las dos fotos", () => {
  it("un producto de solo stock no aparece; con frente y atrás sí, con backImageUrl", async () => {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    const pub = async (data: Parameters<typeof ds.createProduct>[0]) => {
      const { product } = await ds.createProduct({ ...data, description: "d" });
      product.isPublished = true;
    };
    await pub({ ...base, imageUrl: null, backImageUrl: null, locationId: store.id, publicCode: "AAAA1", variants: one("S-1", "9001") });
    await pub({
      ...base, locationId: store.id, publicCode: "BBBB2", variants: one("S-2", "9002"),
      imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg",
    });
    await pub({
      ...base, locationId: store.id, publicCode: "CCCC3", variants: one("S-3", "9003"), imageUrl: "https://a/f.jpg", backImageUrl: null,
    });
    const codes = (await getPublicCatalog(ds)).map((p) => p.publicCode);
    expect(codes).not.toContain("AAAA1");
    expect(codes).not.toContain("CCCC3");
    const both = (await getPublicCatalog(ds)).find((p) => p.publicCode === "BBBB2")!;
    expect(both.imageUrl).toBe("https://a/f.jpg");
    expect(both.backImageUrl).toBe("https://a/b.jpg");
  });
});

describe("findPublicByCode", () => {
  async function seed() {
    const ds = new FixtureDataSource();
    const store = (await ds.getLocations()).find((l) => l.type === "store")!;
    const photos = { imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" };
    const a = await ds.createProduct({ ...base, ...photos, description: "d", locationId: store.id, publicCode: "AAAA1", variants: one("S-1", "9001") });
    const b = await ds.createProduct({ ...base, ...photos, description: "d", locationId: store.id, publicCode: "BBBB2", variants: one("S-2", "9002") });
    a.product.isPublished = true;
    b.product.isPublished = true;
    return { ds, a: a.product, b: b.product };
  }

  it("devuelve el producto público sin SKU ni conteos", async () => {
    const { ds } = await seed();
    const res = await findPublicByCode(ds, "AAAA1");
    expect(res?.publicCode).toBe("AAAA1");
    expect(JSON.stringify(res)).not.toMatch(/sku|barcode|inventory|available":\d/i);
  });

  it("el código de un producto unido devuelve el que se quedó", async () => {
    const { ds, a, b } = await seed();
    await ds.mergeProducts(a.id, [b.id], "u");
    expect((await findPublicByCode(ds, "BBBB2"))?.id).toBe(a.id);
  });

  it("código inexistente, producto sin las dos fotos o inactivo: null", async () => {
    const { ds, a } = await seed();
    expect(await findPublicByCode(ds, "ZZZZZ")).toBeNull();
    a.backImageUrl = null;
    expect(await findPublicByCode(ds, "AAAA1")).toBeNull();
    a.backImageUrl = "https://a/b.jpg";
    a.isActive = false;
    expect(await findPublicByCode(ds, "AAAA1")).toBeNull();
  });
});

describe("departamento público", () => {
  const prod = (department?: { slug: string; name: string; sortOrder: number; isActive: boolean } | null) => ({
    id: "p", title: "t", brand: "b", category: "c", imageUrl: "f", backImageUrl: "b", publicCode: "AAAAA",
    ...(department === undefined ? {} : { department }),
    variants: [{ id: "v", sku: "s", title: "M", size: "M", color: "x", price: 1, barcode: null,
      inventory: [{ locationId: "st", available: 1 }] }],
  });
  const stores = new Set(["st"]);

  it("proyecta slug, name y sortOrder (sin isActive)", () => {
    const p = toPublicProduct(prod({ slug: "dama", name: "Dama", sortOrder: 1, isActive: true }), stores);
    expect(p.department).toEqual({ slug: "dama", name: "Dama", sortOrder: 1 });
  });

  it("departamento inactivo, ausente o null -> null", () => {
    expect(toPublicProduct(prod({ slug: "x", name: "X", sortOrder: 9, isActive: false }), stores).department).toBeNull();
    expect(toPublicProduct(prod(null), stores).department).toBeNull();
    expect(toPublicProduct(prod(), stores).department).toBeNull();
  });
});

describe("clasificación fuera de lo público", () => {
  it("PublicProduct no trae productTypeId, style ni audience y sus claves no cambian", () => {
    const p = toPublicProduct(
      {
        id: "p", title: "t", brand: "b", category: "Playeras", imageUrl: "f", backImageUrl: "b", publicCode: "AAAAA",
        productTypeId: "type-playera", style: "polo", audience: "nino",
        variants: [{ id: "v", sku: "s", title: "M", size: "M", color: "x", price: 1, barcode: null,
          inventory: [{ locationId: "st", available: 1 }] }],
      },
      new Set(["st"]),
    );
    expect(Object.keys(p).sort()).toEqual(
      ["backImageUrl", "brand", "category", "department", "id", "imageUrl", "price", "publicCode", "sizes", "title"],
    );
    expect(JSON.stringify(p)).not.toMatch(/productTypeId|style|audience|type-playera|polo/);
  });
});

describe("stock sincronizado con el catálogo", () => {
  const variant = (available: number, size = "M", id = "v") => ({
    id, sku: `S-${id}`, title: size, size, color: "x", price: 100, barcode: null,
    inventory: [{ locationId: "st", available }],
  });
  const product = (id: string, code: string, variants: ReturnType<typeof variant>[]): Product => ({
    id, title: `t-${id}`, brand: "b", category: "c", imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg",
    publicCode: code, description: "desc", isPublished: true, variants,
  });
  const dsWith = (products: Product[], locations: Location[]) =>
    ({ getCatalogProducts: async () => products, getLocations: async () => locations }) as unknown as InventoryDataSource;
  const store: Location = { id: "st", name: "Tienda", type: "store" };

  it("tienda con isPublic false no cuenta para la disponibilidad", async () => {
    const ds = dsWith([product("a", "AAAAA", [variant(3)])], [{ ...store, isPublic: false }]);
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
  it("bodega pública no cuenta: solo type store", async () => {
    const ds = dsWith([product("a", "AAAAA", [variant(3)])], [{ id: "st", name: "B", type: "warehouse", isPublic: true }]);
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
  it("sin tiendas públicas, getPublicCatalog devuelve [] sin lanzar", async () => {
    await expect(getPublicCatalog(dsWith([product("a", "AAAAA", [variant(3)])], []))).resolves.toEqual([]);
  });
  it("una prenda con todas sus tallas sin stock no aparece en getPublicCatalog", async () => {
    const ds = dsWith([product("a", "AAAAA", [variant(0, "M", "1"), variant(0, "L", "2")])], [store]);
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
  it("una prenda con una talla con stock aparece y las demás conservan available false", async () => {
    const ds = dsWith([product("a", "AAAAA", [variant(0, "M", "1"), variant(2, "L", "2")])], [store]);
    const [p] = await getPublicCatalog(ds);
    expect(p.sizes).toEqual([
      { size: "M", available: false, price: 100 },
      { size: "L", available: true, price: 100 },
    ]);
  });
  it("publicStoreIds excluye bodegas y tiendas con isPublic false", () => {
    const ids = publicStoreIds([
      store,
      { id: "priv", name: "P", type: "store", isPublic: false },
      { id: "wh", name: "W", type: "warehouse" },
      { id: "def", name: "D", type: "store", isPublic: true },
    ]);
    expect([...ids].sort()).toEqual(["def", "st"]);
  });
  it("C16: producto con fotos y sin existencias no entra al catálogo público", async () => {
    const ds = new FixtureDataSource();
    const st = (await ds.getLocations()).find((l) => l.type === "store")!;
    const { product: p } = await ds.createProduct({ ...base, locationId: st.id, description: "d", variants: [{ ...base.variants[0], initialStock: 0 }] });
    p.isPublished = true;
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
});

describe("publicación y elegibilidad en el sitio", () => {
  async function seed() {
    const ds = new FixtureDataSource();
    const st = (await ds.getLocations()).find((l) => l.type === "store")!;
    const { product } = await ds.createProduct({ ...base, locationId: st.id, description: "Playera de algodón" });
    return { ds, product, st };
  }

  it("producto con fotos y existencias sin publicar no aparece en el sitio", async () => {
    const { ds } = await seed();
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
  it("publicado y completo aparece", async () => {
    const { ds, product } = await seed();
    product.isPublished = true;
    expect((await getPublicCatalog(ds)).map((p) => p.publicCode)).toEqual(["K7Q2M"]);
  });
  it("producto publicado sin descripción no aparece", async () => {
    const { ds, product } = await seed();
    product.isPublished = true;
    product.description = "  ";
    expect(await getPublicCatalog(ds)).toEqual([]);
  });
  it("producto publicado que se queda sin existencias desaparece sin despublicar", async () => {
    const { ds, product } = await seed();
    product.isPublished = true;
    expect(await getPublicCatalog(ds)).toHaveLength(1);
    for (const v of product.variants) for (const l of v.inventory) l.available = 0;
    expect(await getPublicCatalog(ds)).toEqual([]);
    expect(product.isPublished).toBe(true);
  });
  it("findPublicByCode no devuelve un producto sin publicar ni uno sin existencias", async () => {
    const { ds, product } = await seed();
    expect(await findPublicByCode(ds, "K7Q2M")).toBeNull();
    product.isPublished = true;
    expect((await findPublicByCode(ds, "K7Q2M"))?.publicCode).toBe("K7Q2M");
    for (const v of product.variants) for (const l of v.inventory) l.available = 0;
    expect(await findPublicByCode(ds, "K7Q2M")).toBeNull();
  });
  it("findPublicByCode: sin descripción tampoco", async () => {
    const { ds, product } = await seed();
    product.isPublished = true;
    product.description = null;
    expect(await findPublicByCode(ds, "K7Q2M")).toBeNull();
  });
});
