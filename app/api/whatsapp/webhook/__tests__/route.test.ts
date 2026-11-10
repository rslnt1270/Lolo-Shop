import { describe, it, expect, vi, beforeEach } from "vitest";
import { FixtureDataSource } from "@/lib/data/fixture-source";

const state = vi.hoisted(() => ({ ds: null as unknown as FixtureDataSource, spy: null as unknown as ReturnType<typeof vi.fn> }));
vi.mock("@/lib/data/get-source", () => ({ getDataSource: () => state.ds }));

async function send(text: string) {
  const { POST } = await import("../route");
  const body = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ from: "5215512345678", text: { body: text } }] } }] }] };
  const logs: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(a.join(" ")); });
  await POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body: JSON.stringify(body) }));
  log.mockRestore();
  return logs.join("\n");
}

describe("webhook WhatsApp", () => {
  beforeEach(async () => {
    state.ds = new FixtureDataSource();
    const store = (await state.ds.getLocations()).find((l) => l.type === "store")!;
    await state.ds.createProduct({ title: "Playera Nike", brand: "Nike", brandId: "b", departmentId: "d", publicCode: "K7Q2M", category: "c", variants: [{ barcode: "1", sku: "LS-1", size: "M", price: 1, initialStock: 3 }], locationId: store.id, userId: "u", imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" });
    state.spy = vi.spyOn(state.ds, "getProducts") as never;
  });

  it("encuentra el producto con 'Código K7Q2M talla M' y no promete apartado", async () => {
    const out = await send("Quiero apartar. Código K7Q2M talla M");
    expect(state.spy).toHaveBeenCalled();
    expect(out).toContain("Playera Nike");
    expect(out.toLowerCase()).not.toMatch(/aparté|apartado|24 horas|te lo aparto/);
    expect(out).toContain("confirmará");
    expect(out).not.toContain("5215512345678");
  });

  it.each(["¿me la puedes apartar?", "apártame una", "la quiero apartada", "¿puedes apartarla?"])(
    "'%s' dispara el flujo de consulta por código",
    async (msg) => {
      const out = await send(msg);
      expect(out).toContain("escríbenos su código");
    },
  );

  it.each(["aparte, ¿hacen envíos?", "busco un apartamento"])("'%s' no dispara el flujo de consulta por código", async (msg) => {
    const out = await send(msg);
    expect(out).not.toContain("para consultar una prenda escríbenos su código");
  });

  it("código malformado K7Q2 no consulta la base", async () => {
    const out = await send("Código K7Q2");
    expect(state.spy).not.toHaveBeenCalled();
    expect(out).toContain("no es válido");
  });
});

describe("webhook WhatsApp: producto unido", () => {
  it("tras unir B en A, el código de B contesta con el título de A", async () => {
    state.ds = new FixtureDataSource();
    const store = (await state.ds.getLocations()).find((l) => l.type === "store")!;
    const mk = (title: string, code: string, size: string) =>
      state.ds.createProduct({ title, brand: "Nautica", brandId: "b", departmentId: "d", publicCode: code, category: "c", variants: [{ barcode: null, sku: `LS-${code}`, size, price: 1, initialStock: 3 }], locationId: store.id, userId: "u", imageUrl: "https://a/f.jpg", backImageUrl: "https://a/b.jpg" });
    const a = await mk("Polo Nautica", "AAAAA", "M");
    const b = await mk("Polo Nautica L", "BBBBB", "L");
    await state.ds.mergeProducts(a.product.id, [b.product.id], "u");
    const out = await send("Código BBBBB talla M");
    expect(out).toContain('"Polo Nautica"');
    expect(out).not.toContain("Polo Nautica L");
  });
});
