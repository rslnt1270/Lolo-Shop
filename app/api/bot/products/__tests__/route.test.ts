import { describe, it, expect, vi, beforeEach } from "vitest";
import { FixtureDataSource } from "@/lib/data/fixture-source";
import { getPublicCatalog } from "@/lib/data/public-projection";

const state = vi.hoisted(() => ({ ds: null as unknown as FixtureDataSource }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => state.ds }));

describe("GET /api/bot/products", () => {
  beforeEach(async () => {
    process.env.BOT_API_KEY = "k";
    state.ds = new FixtureDataSource();
    const store = (await state.ds.getLocations()).find((l) => l.type === "store")!;
    await state.ds.createProduct({ barcode: "7501", sku: "LS-SECRET-1", title: "Playera Nike", brand: "Nike", brandId: "b", departmentId: "d", publicCode: "K7Q2M", price: 1, category: "c", initialStock: 5, locationId: store.id, userId: "u" });
  });

  it("exige x-bot-key", async () => {
    const { GET } = await import("../route");
    expect((await GET(new Request("http://x/api/bot/products"))).status).toBe(401);
  });

  it("responde con la misma proyección pública, sin sku ni stock", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://x/api/bot/products", { headers: { "x-bot-key": "k" } }));
    const json = await res.json();
    const expected = (await getPublicCatalog(state.ds)).filter((p) => p.sizes.some((s) => s.available));
    expect(json.data).toEqual(expected);
    const txt = JSON.stringify(json);
    expect(txt).not.toMatch(/LS-SECRET-1|7501|"sku"|"stock"|"barcode"|"inventory"/);
  });

  it("no permite buscar por SKU", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://x/api/bot/products?q=LS-SECRET-1", { headers: { "x-bot-key": "k" } }));
    expect((await res.json()).count).toBe(0);
  });
});
