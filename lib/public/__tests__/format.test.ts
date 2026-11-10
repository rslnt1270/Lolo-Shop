import { describe, expect, it } from "vitest";
import { formatPrice } from "../format";

describe("formatPrice", () => {
  it("enteros sin decimales", () => {
    expect(formatPrice(350)).toBe("$350");
    expect(formatPrice(1250)).toBe("$1,250");
  });
  it("con centavos, siempre dos decimales", () => {
    expect(formatPrice(1250.5)).toBe("$1,250.50");
  });
});
