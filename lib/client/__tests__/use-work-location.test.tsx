import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const fetchLocationsAction = vi.fn();
vi.mock("@/lib/actions", () => ({ fetchLocationsAction: () => fetchLocationsAction() }));

import { pickWorkLocation, useWorkLocation, WORK_LOCATION_KEY } from "@/lib/client/use-work-location";

const LOCS = [
  { id: "a", name: "Alva", type: "store" },
  { id: "l", name: "Lomas", type: "store" },
];

beforeEach(() => {
  sessionStorage.clear();
  fetchLocationsAction.mockReset();
  vi.restoreAllMocks();
});

describe("pickWorkLocation", () => {
  it("usa la guardada si existe", () => {
    expect(pickWorkLocation(LOCS, "l", "a")).toBe("l");
  });
  it("guardada inexistente cae a la asignada", () => {
    expect(pickWorkLocation(LOCS, "zzz", "a")).toBe("a");
  });
  it("sin guardada ni asignada válida devuelve vacío", () => {
    expect(pickWorkLocation(LOCS, null, null)).toBe("");
    expect(pickWorkLocation(LOCS, "zzz", "yyy")).toBe("");
  });
});

describe("useWorkLocation", () => {
  it("carga, preselecciona la asignada y persiste al elegir", async () => {
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("a");
    expect(result.current.locationName).toBe("Alva");
    act(() => result.current.choose("l"));
    expect(result.current.locationId).toBe("l");
    expect(sessionStorage.getItem(WORK_LOCATION_KEY)).toBe("l");
  });

  it("migra la clave vieja una sola vez", async () => {
    sessionStorage.setItem("loloshop:pos:location", "l");
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("l");
    expect(sessionStorage.getItem(WORK_LOCATION_KEY)).toBe("l");
  });

  it("la tienda guardada que ya no existe no se envía: pide elegir", async () => {
    sessionStorage.setItem(WORK_LOCATION_KEY, "borrada");
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: null, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("");
    expect(result.current.locationName).toBeNull();
  });

  it("sin sessionStorage (getItem lanza) sigue funcionando", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("a");
    act(() => result.current.choose("l"));
    expect(result.current.locationId).toBe("l");
  });

  it("null del servidor es sesión vencida; un rechazo es error y retry recarga", async () => {
    fetchLocationsAction.mockResolvedValueOnce(null);
    const s = renderHook(() => useWorkLocation({ assigned: null, enabled: true }));
    await waitFor(() => expect(s.result.current.status).toBe("session"));

    fetchLocationsAction.mockReset();
    fetchLocationsAction.mockRejectedValueOnce(new Error("red")).mockResolvedValueOnce(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("a");
  });

  it("enabled=false no consulta", async () => {
    renderHook(() => useWorkLocation({ assigned: "a", enabled: false }));
    await Promise.resolve();
    expect(fetchLocationsAction).not.toHaveBeenCalled();
  });
});
