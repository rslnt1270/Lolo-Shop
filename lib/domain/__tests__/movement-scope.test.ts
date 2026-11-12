import { describe, it, expect } from "vitest";
import { mexicoRangeToUtc } from "../movement-scope";

describe("mexicoRangeToUtc", () => {
  it("el día de México va de 06:00Z a 06:00Z del día siguiente", () => {
    const { gte, lt } = mexicoRangeToUtc("2026-11-10", "2026-11-10");
    expect(gte.toISOString()).toBe("2026-11-10T06:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-11-11T06:00:00.000Z");
  });
  it("un movimiento a las 23:30 de México del día 10 (05:30Z del 11) cae en el 10, no en el 11", () => {
    const at = new Date("2026-11-11T05:30:00Z").getTime();
    const d10 = mexicoRangeToUtc("2026-11-10", "2026-11-10");
    const d11 = mexicoRangeToUtc("2026-11-11", "2026-11-11");
    expect(at >= d10.gte.getTime() && at < d10.lt.getTime()).toBe(true);
    expect(at >= d11.gte.getTime() && at < d11.lt.getTime()).toBe(false);
  });
  it("00:10 de México del día 11 (06:10Z) cae en el 11", () => {
    const at = new Date("2026-11-11T06:10:00Z").getTime();
    const d11 = mexicoRangeToUtc("2026-11-11", "2026-11-11");
    expect(at >= d11.gte.getTime() && at < d11.lt.getTime()).toBe(true);
  });
});
