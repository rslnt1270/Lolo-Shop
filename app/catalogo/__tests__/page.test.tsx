import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchPublicProductsAction = vi.fn();
const clientProps = vi.fn();
vi.mock("@/lib/actions", () => ({ fetchPublicProductsAction: () => fetchPublicProductsAction() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("../CatalogClient", () => ({ default: (p: unknown) => (clientProps(p), null) }));

import * as page from "../page";

type Element = { props: Record<string, unknown> };

beforeEach(() => {
  fetchPublicProductsAction.mockReset();
  clientProps.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/catalogo", () => {
  it("siempre se renderiza en el servidor, nunca estático", () => {
    expect(page.dynamic).toBe("force-dynamic");
  });

  it("si la base falla, pasa loadError al cliente (no el vacío)", async () => {
    fetchPublicProductsAction.mockRejectedValue(new Error("db down"));
    const el = (await page.default()) as unknown as Element;
    expect(el.props).toMatchObject({ products: [], loadError: true });
  });

  it("sin error, loadError es false aunque no haya productos", async () => {
    fetchPublicProductsAction.mockResolvedValue([]);
    const el = (await page.default()) as unknown as Element;
    expect(el.props).toMatchObject({ products: [], loadError: false });
  });
});
