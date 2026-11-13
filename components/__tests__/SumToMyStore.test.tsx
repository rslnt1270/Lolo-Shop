import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/actions", () => ({ recordStockMovementAction: vi.fn() }));

import { SumToMyStore } from "@/components/inventory/SumToMyStore";

afterEach(cleanup);

describe("SumToMyStore label", () => {
  it("label sustituye el texto del botón; sin label usa sumLabel", () => {
    const { unmount } = render(<SumToMyStore variantId="v1" locationId="l1" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "Sumar 1 pieza en tu tienda" })).toBeTruthy();
    unmount();
    render(<SumToMyStore variantId="v1" locationId="l1" label="Agregar nuevamente" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: "Agregar nuevamente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sumar/i })).toBeNull();
  });
});
