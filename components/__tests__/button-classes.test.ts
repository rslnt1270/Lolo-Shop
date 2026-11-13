import { expect, it } from "vitest";
import { buttonClasses, disabledClasses } from "../ui/button-classes";

it("primary button uses turquesa fill and tinta text, never white", () => {
  const c = buttonClasses("primary");
  expect(c).toContain("bg-turquesa");
  expect(c).toContain("text-tinta");
  expect(c).not.toContain("text-white");
});
it("outline button uses white background with turquesa-texto border and text", () => {
  const c = buttonClasses("outline");
  expect(c).toContain("bg-white");
  expect(c).toContain("border-turquesa-texto");
  expect(c).toContain("text-turquesa-texto");
});
it("danger button uses agotado outline and text", () => {
  const c = buttonClasses("danger");
  expect(c).toContain("border-agotado");
  expect(c).toContain("text-agotado");
  expect(c).not.toContain("bg-agotado");
});
it("every variant has min-h-11 (44px)", () => {
  for (const v of ["primary", "outline", "danger"] as const) expect(buttonClasses(v)).toContain("min-h-11");
});
it("disabled primary uses BFE9E9 fill and 5C6E6D text", () => {
  const c = buttonClasses("primary", { disabled: true });
  expect(c).toContain("disabled:bg-[#BFE9E9]");
  expect(c).toContain("text-[#5C6E6D]");
});
it("disabled outline uses borde-control border", () => {
  expect(buttonClasses("outline", { disabled: true })).toContain("disabled:border-borde-control");
});
it("disabled danger keeps a white fill", () => {
  const c = buttonClasses("danger", { disabled: true });
  expect(c).toContain("disabled:bg-white");
  expect(c).toContain("disabled:border-borde-control");
  expect(c).not.toContain("BFE9E9");
});
it("buttonClasses never emits lolo-btn-success, with or without loading", () => {
  expect(buttonClasses("primary", { success: true })).not.toContain("lolo-btn-success");
  expect(buttonClasses("primary", { success: true, loading: true })).not.toContain("lolo-btn-success");
});
it("disabledClasses gives primary the turquoise fill and others an outline treatment", () => {
  expect(disabledClasses("primary")).toContain("disabled:bg-[#BFE9E9]");
  expect(disabledClasses("outline")).toContain("disabled:bg-white");
  expect(disabledClasses("danger")).toBe(disabledClasses("outline"));
  expect(disabledClasses("danger")).not.toContain("BFE9E9");
});
