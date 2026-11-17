import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OfflineBanner, formatSnapshotAge } from "@/components/sales/OfflineBanner";

const MIN = 60 * 1000;
const H = 60 * MIN;
const BANNER = "Sin internet. Las ventas se guardan en este teléfono y se envían solas al volver la conexión.";

describe("formatSnapshotAge", () => {
  it("minutos y horas", () => {
    expect(formatSnapshotAge(20 * 1000)).toBe("menos de 1 min");
    expect(formatSnapshotAge(5 * MIN)).toBe("5 min");
    expect(formatSnapshotAge(2 * H + 10 * MIN)).toBe("2 h");
  });
});

describe("OfflineBanner", () => {
  it("muestra la banda sin internet y la edad de la copia", () => {
    render(<OfflineBanner snapshotAgeMs={2 * H} pendingCount={0} />);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(screen.getByText("Precios y existencias de hace 2 h")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin copia no inventa una edad", () => {
    render(<OfflineBanner snapshotAgeMs={null} pendingCount={0} />);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    expect(screen.queryByText(/Precios y existencias de hace/)).toBeNull();
  });

  it('con cola muestra "N por enviar" que abre la hoja', () => {
    const onOpenQueue = vi.fn();
    render(<OfflineBanner snapshotAgeMs={5 * MIN} pendingCount={3} onOpenQueue={onOpenQueue} />);
    fireEvent.click(screen.getByRole("button", { name: "3 por enviar" }));
    expect(onOpenQueue).toHaveBeenCalled();
  });
});
