import { describe, expect, it } from "vitest";
import { parseIdList, planVisibility } from "../lib/plan-visibility";

const D = new Date("2026-11-01");
const prod = (id: string, o: Record<string, unknown> = {}) => ({
  id, imageUrl: "f", backImageUrl: "b", description: "desc", isPublished: false, catalogPhotosCheckedAt: null as Date | null, ...o,
});
const store = [{ id: "L1", type: "store" as const, isPublic: true }];

describe("planVisibility", () => {
  it("sin CSV ni lista, ningún producto queda publicado", () => {
    const plan = planVisibility({
      products: [prod("a", { isPublished: true }), prod("b", { isPublished: true }), prod("c")],
      locations: store, publishIds: [], forceUnpublishIds: [],
    });
    expect(plan.publish).toEqual([]);
    expect(plan.unpublish.sort()).toEqual(["a", "b"]);
  });

  it("publicar exige imageUrl, backImageUrl y descripción", () => {
    const plan = planVisibility({
      products: [prod("a", { backImageUrl: null }), prod("b", { description: "  " }), prod("c", { imageUrl: null }), prod("d")],
      locations: store, publishIds: ["a", "b", "c", "d"], forceUnpublishIds: [],
    });
    expect(plan.publish).toEqual(["d"]);
    expect(plan.notPublishable.sort()).toEqual(["a", "b", "c"]);
  });

  it("planVisibility reporta ids del CSV que no existen y no cambia nada", () => {
    const plan = planVisibility({ products: [prod("a")], locations: store, publishIds: ["zzz"], forceUnpublishIds: [] });
    expect(plan.unknownIds).toEqual(["zzz"]);
    expect(plan.publish).toEqual([]);
    expect(plan.unpublish).toEqual([]);
    expect(plan.clearChecked).toEqual([]);
  });

  it("ids con BOM y espacios se normalizan", () => {
    expect(parseIdList("﻿id\n  abc \n\n def\n")).toEqual(["abc", "def"]);
  });

  it("forceUnpublishIds gana sobre publishIds", () => {
    const plan = planVisibility({
      products: [prod("a", { isPublished: true, catalogPhotosCheckedAt: D }), prod("b")],
      locations: store, publishIds: ["a", "b"], forceUnpublishIds: ["a"],
    });
    expect(plan.publish).toEqual(["b"]);
    expect(plan.unpublish).toEqual(["a"]);
    expect(plan.clearChecked).toEqual(["a"]);
  });

  it("advierte cuando no hay ninguna Location pública", () => {
    const none = planVisibility({
      products: [], locations: [{ id: "W", type: "warehouse", isPublic: true }, { id: "S", type: "store", isPublic: false }],
      publishIds: [], forceUnpublishIds: [],
    });
    expect(none.warnings).toHaveLength(1);
    expect(planVisibility({ products: [], locations: store, publishIds: [], forceUnpublishIds: [] }).warnings).toEqual([]);
  });

  it("planVisibility es puro: misma entrada, misma salida", () => {
    const input = {
      products: [prod("a", { isPublished: true }), prod("b")], locations: store,
      publishIds: ["b", "x"], forceUnpublishIds: ["a"],
    };
    expect(planVisibility(input)).toEqual(planVisibility(input));
  });

  it("parseIdList quita duplicados y el encabezado solo en la primera línea", () => {
    expect(parseIdList("id\na\na\nb")).toEqual(["a", "b"]);
    expect(parseIdList("")).toEqual([]);
  });
});
