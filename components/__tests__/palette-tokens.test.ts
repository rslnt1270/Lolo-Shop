import { describe, expect, it } from "vitest";
import config from "../../tailwind.config";

const colors = (config.theme as any).extend.colors as Record<string, string>;

const SPEC: Record<string, string> = {
  turquesa: "#22B8B8",
  tinta: "#16302F",
  "turquesa-texto": "#0C7C7C",
  "turquesa-titular": "#0E9494",
  "turquesa-luz": "#5FE0DE",
  niebla: "#F3F7F7",
  ok: "#1F7A4A",
  agotado: "#9A3B2E",
  "borde-control": "#7F9392",
};

describe("palette tokens", () => {
  it("defines every spec token with the exact hex value", () => {
    for (const [name, hex] of Object.entries(SPEC)) {
      expect(colors[name], name).toBe(hex);
    }
  });

  it("keeps loloteal as an alias of turquesa-texto, not of the turquoise fill", () => {
    expect(colors["loloteal"]).toBe("#0C7C7C");
  });

  it("primary maps to turquesa-texto so text and borders using it meet contrast", () => {
    expect(colors["primary"]).toBe("#0C7C7C");
  });
});
