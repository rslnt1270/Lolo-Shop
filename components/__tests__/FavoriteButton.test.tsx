import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { FavoriteButton, SaveFailedStatus } from "../favorites/FavoriteButton";
import { useFavorites } from "../favorites/useFavorites";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const base = { productId: "p1", title: "Playera", disabled: false, onToggle: () => {} };

describe("FavoriteButton", () => {
  it("muestra Guardar en favoritos cuando no está guardada", () => {
    render(<FavoriteButton {...base} saved={false} />);
    expect(screen.getByText("Guardar en favoritos")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });
  it("muestra En favoritos con aria-pressed true cuando está guardada", () => {
    render(<FavoriteButton {...base} saved />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
  it("el nombre accesible contiene el texto visible y no cambia con el estado (WCAG 2.5.3)", () => {
    const { rerender } = render(<FavoriteButton {...base} saved={false} />);
    const btn = screen.getByRole("button");
    const visible = btn.textContent!.trim();
    expect(btn.getAttribute("aria-label")).toBe("Guardar en favoritos: Playera");
    expect(btn.getAttribute("aria-label")!.toLowerCase()).toContain(visible.toLowerCase());
    rerender(<FavoriteButton {...base} saved />);
    const after = screen.getByRole("button");
    expect(after.getAttribute("aria-label")).toBe("Guardar en favoritos: Playera");
    expect(after.textContent!.trim()).toBe(visible);
  });
  it("guardada cambia de variante (contorno) sin cambiar el nombre", () => {
    const { rerender } = render(<FavoriteButton {...base} saved={false} />);
    expect(screen.getByRole("button").className).toContain("bg-turquesa");
    rerender(<FavoriteButton {...base} saved />);
    const b = screen.getByRole("button");
    expect(b.className).toContain("border-turquesa-texto");
    expect(b.className).not.toMatch(/(^|\s)bg-turquesa(\s|$)/);
    expect(b.getAttribute("aria-label")).toBe("Guardar en favoritos: Playera");
  });
  it("SaveFailedStatus avisa de forma cortés solo cuando falla", () => {
    const { rerender } = render(<SaveFailedStatus failed={false} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-live")).toBe("polite");
    rerender(<SaveFailedStatus failed />);
    expect(screen.getByRole("status").textContent).toBe("No se pudo guardar en este navegador.");
  });
  it("al tocar llama onToggle y no propaga el clic", () => {
    const onToggle = vi.fn();
    const parent = vi.fn();
    render(
      <div onClick={parent}>
        <FavoriteButton {...base} saved={false} onToggle={onToggle} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
  it("deshabilitada muestra el texto explicativo y no llama onToggle", () => {
    const onToggle = vi.fn();
    render(<FavoriteButton {...base} saved={false} disabled onToggle={onToggle} />);
    expect(screen.getByText("Tu navegador no permite guardar favoritos.")).toBeTruthy();
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("useFavorites", () => {
  it("useFavorites no lee localStorage durante el render del servidor", () => {
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem: vi.fn() });
    function Probe() {
      const f = useFavorites();
      return <p>{f.ready ? "listo" : "cargando"}</p>;
    }
    const html = renderToString(<Probe />);
    expect(html).toContain("cargando");
    expect(getItem).not.toHaveBeenCalled();
  });
  it("toggle antes de estar listo no escribe nada (no pisa lo guardado)", () => {
    window.localStorage.clear();
    window.localStorage.setItem("loloshop.favoritos.v1", '["a"]');
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    function Probe() {
      const f = useFavorites();
      f.toggle("x"); // en render, antes del efecto
      return null;
    }
    renderToString(<Probe />);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("lee después de montar y guarda al alternar", () => {
    window.localStorage.clear();
    window.localStorage.setItem("loloshop.favoritos.v1", '["a"]');
    const { result } = renderHook(() => useFavorites());
    expect(result.current.ready).toBe(true);
    expect(result.current.isSaved("a")).toBe(true);
    act(() => result.current.toggle("b"));
    expect(JSON.parse(window.localStorage.getItem("loloshop.favoritos.v1")!)).toEqual(["a", "b"]);
  });
  it("useFavorites: si localStorage lanza, storageOk es false y el toggle no rompe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const { result } = renderHook(() => useFavorites());
    expect(result.current.storageOk).toBe(false);
    act(() => result.current.toggle("a"));
    expect(result.current.isSaved("a")).toBe(true);
    expect(result.current.storageOk).toBe(false);
  });
});
