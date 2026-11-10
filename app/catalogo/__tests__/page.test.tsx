import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({ fetchPublicProductsAction: vi.fn().mockResolvedValue([]) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("../CatalogClient", () => ({ default: () => null }));

import * as page from "../page";

describe("/catalogo", () => {
  it("siempre se renderiza en el servidor, nunca estático", () => {
    expect(page.dynamic).toBe("force-dynamic");
  });
});
