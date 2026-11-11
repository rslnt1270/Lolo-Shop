import { describe, it, expect } from "vitest";
import { SCAN_FORMAT_NAMES } from "../scan-formats";

describe("formatos de escaneo", () => {
  it("C4: los formatos de escaneo son exactamente los siete del spec", () => {
    expect([...SCAN_FORMAT_NAMES].sort()).toEqual(
      ["EAN_13", "UPC_A", "UPC_E", "EAN_8", "CODE_128", "CODE_39", "QR_CODE"].sort()
    );
  });
});
