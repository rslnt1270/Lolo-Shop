import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, testPrisma } from "../../test/db/setup";
import { resetDb } from "../../test/db/reset";
import { backfillBrandDepartment } from "../../prisma/scripts/backfill-brand-department";
import { backfillProductTypes } from "../../prisma/scripts/backfill-product-types";

// Sesión simulada solo en el borde de next-auth: el rol y la tienda se releen de la base real.
const session = vi.hoisted(() => ({ userId: "" as string }));
vi.mock("next-auth", () => ({
  getServerSession: async () => (session.userId ? { user: { id: session.userId } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", async () => ({ default: (await import("../../test/db/setup")).testPrisma }));
vi.mock("../prisma", async () => ({ default: (await import("../../test/db/setup")).testPrisma }));
vi.mock("@/lib/auth/password", () => ({ changePassword: vi.fn() }));

import { PrismaDataSource } from "../data/prisma-source";
import { createProductAction, type CreateProductInput } from "../actions";

const FRONT = "https://abc.public.blob.vercel-storage.com/productos/f.jpg";
const BACK = "https://abc.public.blob.vercel-storage.com/productos/b.jpg";

describe.skipIf(!hasTestDb)("createProductAction: color, descripción, fotos y estado", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  let store: string;
  let otherStore: string;
  let brandId: string;
  let dept: Record<string, string>;
  let type: Record<string, string>;
  let n = 0;

  beforeEach(async () => {
    await resetDb();
    await backfillBrandDepartment(testPrisma);
    await backfillProductTypes(testPrisma);
    store = (await testPrisma.location.create({ data: { name: "Tienda A", type: "store" } })).id;
    otherStore = (await testPrisma.location.create({ data: { name: "Tienda B", type: "store" } })).id;
    session.userId = (await testPrisma.user.create({ data: { username: "owner", password: "x", role: "owner" } })).id;
    brandId = (await testPrisma.brand.create({ data: { name: "Guess", slug: "guess" } })).id;
    dept = Object.fromEntries((await testPrisma.department.findMany()).map((d) => [d.slug, d.id]));
    type = Object.fromEntries((await testPrisma.productType.findMany()).map((t) => [t.slug, t.id]));
  });

  function input(patch: Partial<CreateProductInput> = {}): CreateProductInput {
    n++;
    return {
      title: `Playera ${n}`, brandId, departmentId: dept.dama, productTypeId: type.playera,
      description: "Algodón suave", locationId: store,
      sizes: [{ size: "M", barcode: null, price: 300, initialStock: 2 }],
      ...patch,
    };
  }
  const stored = async (title: string) => testPrisma.product.findFirstOrThrow({ where: { title } });

  it("C9 (db): createProductAction rechaza sin tipo ni marca", async () => {
    expect(await createProductAction(input({ productTypeId: "" }))).toMatchObject({ ok: false, code: "INVALID", message: "Elige el tipo." });
    expect(await createProductAction(input({ brandId: "" }))).toMatchObject({ ok: false, code: "INVALID", message: "Elige la marca." });
    expect(await testPrisma.product.count()).toBe(0);
  });

  it("descripción vacía se rechaza y no escribe", async () => {
    expect(await createProductAction(input({ description: "  " }))).toMatchObject({ ok: false, code: "INVALID", message: "Escribe la descripción." });
    expect(await testPrisma.product.count()).toBe(0);
  });

  it("guarda el color limpio en Playeras", async () => {
    const i = input({ color: "  rosas " });
    expect(await createProductAction(i)).toMatchObject({ ok: true });
    expect((await stored(i.title)).color).toBe("Rosas");
  });

  it("C10 (db): en Accesorios el color se descarta", async () => {
    const i = input({ departmentId: dept.accesorios, productTypeId: type.gorra, color: "Azul" });
    expect(await createProductAction(i)).toMatchObject({ ok: true });
    expect((await stored(i.title)).color).toBeNull();
  });

  it('C13 (db): sin fotos el estado es "Solo stock"', async () => {
    const r = await createProductAction(input({ mode: "catalog" }));
    expect(r).toMatchObject({ ok: true, catalogStatus: "Solo stock" });
  });

  it('C14 (db): una foto blanca deja "Falta completar registro fotográfico"', async () => {
    const i = input({ mode: "catalog", imageUrl: FRONT, photosAnalyzed: true });
    const r = await createProductAction(i);
    expect(r).toMatchObject({ ok: true, catalogStatus: "Falta completar registro fotográfico" });
    const p = await stored(i.title);
    expect(p).toMatchObject({ imageUrl: FRONT, backImageUrl: null, catalogPhotosCheckedAt: null });
  });

  it('C15 (db): frente y atrás con existencias dejan "Listo para catálogo"', async () => {
    const i = input({ mode: "catalog", imageUrl: FRONT, backImageUrl: BACK, photosAnalyzed: true });
    expect(await createProductAction(i)).toMatchObject({ ok: true, catalogStatus: "Listo para catálogo" });
    expect((await stored(i.title)).catalogPhotosCheckedAt).not.toBeNull();
  });

  it("fotos con existencias en cero: estado sin existencias y aun así revisadas", async () => {
    const i = input({
      mode: "catalog", imageUrl: FRONT, backImageUrl: BACK, photosAnalyzed: true,
      sizes: [{ size: "M", barcode: null, price: 300, initialStock: 0 }],
    });
    expect(await createProductAction(i)).toMatchObject({ ok: true, catalogStatus: "Fotos completas, sin existencias" });
  });

  it("fotos sin photosAnalyzed o con URL ajena no crean producto ni marcan revisión", async () => {
    const a = await createProductAction(input({ mode: "catalog", imageUrl: FRONT, backImageUrl: BACK }));
    expect(a).toMatchObject({ ok: false, code: "INVALID", message: "La foto no pasó la revisión de fondo blanco. Tómala de nuevo." });
    const b = await createProductAction(input({ mode: "catalog", imageUrl: "https://evil.example/x.jpg", photosAnalyzed: true }));
    expect(b).toMatchObject({ ok: false, code: "INVALID" });
    expect(await testPrisma.product.count()).toBe(0);
  });

  it("colaborador solo da de alta en su tienda (rol y tienda releídos de la base)", async () => {
    session.userId = (await testPrisma.user.create({
      data: { username: "colab", password: "x", role: "collaborator", locationId: store },
    })).id;
    expect(await createProductAction(input({ locationId: otherStore }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await createProductAction(input({ locationId: store }))).toMatchObject({ ok: true });
  });

  it("review: alta con foto subida y fallo posterior no deja producto a medias", async () => {
    // Otra tableta registra el mismo código entre la revisión y la escritura: la transacción
    // inserta el producto, choca en el código de la talla y revierte todo.
    const barcode = "4006381333931";
    const first = input({ sizes: [{ size: "M", barcode, price: 300, initialStock: 1 }] });
    expect(await createProductAction(first)).toMatchObject({ ok: true });
    const before = { variants: await testPrisma.variant.count(), moves: await testPrisma.movement.count() };

    vi.spyOn(PrismaDataSource.prototype, "getProductByBarcode").mockResolvedValueOnce(null);
    const second = input({
      mode: "catalog", imageUrl: FRONT, backImageUrl: BACK, photosAnalyzed: true,
      sizes: [{ size: "L", barcode, price: 300, initialStock: 3 }],
    });
    expect(await createProductAction(second)).toMatchObject({ ok: false, code: "DUPLICATE" });

    expect(await testPrisma.product.count({ where: { title: second.title } })).toBe(0);
    expect(await testPrisma.variant.count()).toBe(before.variants);
    expect(await testPrisma.movement.count()).toBe(before.moves);
  });
});
