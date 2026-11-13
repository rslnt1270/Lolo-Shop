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

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("contrast", () => {
  it("tinta on turquesa is at least 5.75:1", () => {
    expect(contrast(colors.tinta, colors.turquesa)).toBeGreaterThanOrEqual(5.75);
  });
  it("tinta on white is at least 14:1", () => {
    expect(contrast(colors.tinta, "#FFFFFF")).toBeGreaterThanOrEqual(14);
  });
  it("turquesa-texto on white is at least 5:1", () => {
    expect(contrast(colors["turquesa-texto"], "#FFFFFF")).toBeGreaterThanOrEqual(5);
  });
  it("ok on white is at least 5.3:1", () => {
    expect(contrast(colors.ok, "#FFFFFF")).toBeGreaterThanOrEqual(5.3);
  });
  it("agotado on white is at least 6.9:1", () => {
    expect(contrast(colors.agotado, "#FFFFFF")).toBeGreaterThanOrEqual(6.9);
  });
  it("turquesa-titular on white is at least 3.69:1 (large text only)", () => {
    expect(contrast(colors["turquesa-titular"], "#FFFFFF")).toBeGreaterThanOrEqual(3.695); // 3.6957, "3.70" redondeado; texto grande exige 3:1
  });
});
