import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = readFileSync(process.cwd() + "/app/globals.css", "utf8");
const reduced = () => css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

describe("button motion", () => {
  it("hover lifts the button 2px only where hover is available", () => {
    expect(css).toMatch(/@media \(hover: ?hover\)\s*\{\s*\.lolo-btn:hover[^{]*\{[^}]*translateY\(-2px\)/);
  });
  it("press scales the button to 0.97", () => {
    expect(css).toMatch(/\.lolo-btn:active[^{]*\{[^}]*scale\(0\.97\)/);
  });
  it("loading spinner rotates with keyframes lolo-spin", () => {
    expect(css).toMatch(/@keyframes lolo-spin/);
    expect(css).toMatch(/\.lolo-btn-spinner\s*\{[^}]*animation:[^;]*lolo-spin/);
  });
  it("check path is drawn with keyframes lolo-draw in 420ms", () => {
    expect(css).toMatch(/@keyframes lolo-draw/);
    expect(css).toMatch(/\.lolo-btn-check path\s*\{[^}]*stroke-dasharray/);
    expect(css).toMatch(/\.lolo-btn-check path[^}]*lolo-draw 420ms/);
  });
  it("reduced motion sets transition and check animation durations to 1ms", () => {
    expect(reduced()).toMatch(/transition-duration:\s*1ms/);
    expect(reduced()).toMatch(/lolo-btn-check path\s*\{[^}]*animation-duration:\s*1ms/);
  });
  it("loading spinner slows down under reduced motion", () => {
    expect(reduced()).toMatch(/lolo-btn-spinner[^}]*animation-duration:\s*1600ms/);
    expect(reduced()).not.toMatch(/lolo-btn-spinner[^}]*animation:\s*none/);
  });
  it("success check is drawn without animation under reduced motion", () => {
    expect(reduced()).toMatch(/lolo-btn-check path\s*\{[^}]*stroke-dashoffset:\s*0/);
  });
  it("reduced motion removes hover lift and press scale displacements", () => {
    expect(reduced()).toMatch(/\.lolo-btn:hover[^{]*\{[^}]*transform:\s*none/);
    expect(reduced()).toMatch(/\.lolo-btn:active[^{]*\{[^}]*transform:\s*none/);
  });
  it("scanner button no longer uses the old #007272", () => {
    expect(css).not.toMatch(/#007272/i);
  });
});
