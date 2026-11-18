import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const fetchLocationsAction = vi.fn();
vi.mock("@/lib/actions", () => ({ fetchLocationsAction: () => fetchLocationsAction() }));

import {
  LOCATIONS_CACHE_KEY,
  pickWorkLocation,
  useWorkLocation,
  WORK_LOCATION_KEY,
} from "@/lib/client/use-work-location";

const LOCS = [
  { id: "a", name: "Alva", type: "store" },
  { id: "l", name: "Lomas", type: "store" },
];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
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

describe("useWorkLocation: nombres guardados para abrir sin red", () => {
  it("al cargar guarda {id, name} en localStorage", async () => {
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(JSON.parse(localStorage.getItem(LOCATIONS_CACHE_KEY) ?? "null")).toEqual([
      { id: "a", name: "Alva" },
      { id: "l", name: "Lomas" },
    ]);
    expect(result.current.cachedLocations).toEqual([
      { id: "a", name: "Alva" },
      { id: "l", name: "Lomas" },
    ]);
  });
  it("deshabilitado (sin red) expone los nombres guardados sin pedirlos al servidor", async () => {
    localStorage.setItem(LOCATIONS_CACHE_KEY, JSON.stringify([{ id: "a", name: "Club Alva" }]));
    const { result } = renderHook(() => useWorkLocation({ assigned: null, enabled: false }));
    await waitFor(() => expect(result.current.cachedLocations).toEqual([{ id: "a", name: "Club Alva" }]));
    expect(fetchLocationsAction).not.toHaveBeenCalled();
    expect(result.current.locations).toEqual([]);
  });
  it("caché dañada o con forma inválida se ignora sin lanzar", async () => {
    localStorage.setItem(LOCATIONS_CACHE_KEY, "{no es json");
    const { result } = renderHook(() => useWorkLocation({ assigned: null, enabled: false }));
    expect(result.current.cachedLocations).toEqual([]);
    localStorage.setItem(LOCATIONS_CACHE_KEY, JSON.stringify([{ id: 1 }, { id: "b", name: "Bosques" }]));
    const again = renderHook(() => useWorkLocation({ assigned: null, enabled: false }));
    await waitFor(() => expect(again.result.current.cachedLocations).toEqual([{ id: "b", name: "Bosques" }]));
  });
  it("sin localStorage disponible la carga sigue", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    fetchLocationsAction.mockResolvedValue(LOCS);
    const { result } = renderHook(() => useWorkLocation({ assigned: "a", enabled: true }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locationId).toBe("a");
  });
});
