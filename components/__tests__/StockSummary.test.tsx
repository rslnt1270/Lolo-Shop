import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StockSummary } from "../inventory/StockSummary";
import { fixtureProducts, fixtureLocations } from "@/lib/data/fixtures";

describe("StockSummary", () => {
  it("muestra el total por tienda", () => {
    render(<StockSummary products={fixtureProducts} locations={fixtureLocations} />);
    // Tienda 1: hoodie loc-1 (3+1=4) + playera loc-1 (8) = 12
    expect(screen.getByTestId("stock-loc-1")).toHaveTextContent("12");
    // Tienda 2: hoodie loc-2 (5+0=5) + playera loc-2 (2) = 7
    expect(screen.getByTestId("stock-loc-2")).toHaveTextContent("7");
  });

  it("tienda con stock muestra Disponible y uds; sin stock muestra Agotado", () => {
    const locs = [
      { ...fixtureLocations[0], id: "loc-vacia", name: "Vacía" },
      fixtureLocations[0],
    ];
    render(<StockSummary products={fixtureProducts} locations={locs} />);
    expect(screen.getByTestId("stock-loc-vacia")).toHaveTextContent("0");
    expect(screen.getAllByText("Agotado")).toHaveLength(1);
    expect(screen.getAllByText("Disponible")).toHaveLength(1);
    expect(screen.getByTestId("stock-loc-1")).toHaveTextContent(/12\s*uds/);
  });
});
