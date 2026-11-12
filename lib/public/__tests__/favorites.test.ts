import { describe, expect, it } from "vitest";
import { FAVORITES_KEY, readFavorites, toggleFavorite, writeFavorites } from "../favorites";

function fakeStorage(initial: Record<string, string> = {}, opts: { getThrows?: boolean; setThrows?: boolean } = {}) {
  const data = { ...initial };
  const s = {
    getItem: (k: string) => {
      if (opts.getThrows) throw new Error("bloqueado");
      return k in data ? data[k] : null;
    },
    setItem: (k: string, v: string) => {
      if (opts.setThrows) throw new Error("lleno");
      data[k] = v;
    },
    data,
  };
  return s as unknown as Storage & { data: Record<string, string> };
}

describe("favoritos: almacenamiento local", () => {
  it("lee lista vacía si no hay nada guardado", () => {
    expect(readFavorites(fakeStorage())).toEqual([]);
  });
  it("ignora JSON corrupto y devuelve []", () => {
    expect(readFavorites(fakeStorage({ [FAVORITES_KEY]: "{no es json" }))).toEqual([]);
  });
  it("ignora un valor que no es arreglo", () => {
    expect(readFavorites(fakeStorage({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual([]);
  });
  it("descarta elementos que no son string y los duplicados", () => {
    expect(readFavorites(fakeStorage({ [FAVORITES_KEY]: '["a",1,null,"a","b"]' }))).toEqual(["a", "b"]);
  });
  it("si getItem lanza, readFavorites devuelve [] sin romper", () => {
    expect(readFavorites(fakeStorage({}, { getThrows: true }))).toEqual([]);
  });
  it("si setItem lanza, writeFavorites devuelve false", () => {
    expect(writeFavorites(fakeStorage({}, { setThrows: true }), ["a"])).toBe(false);
  });
  it("writeFavorites con storage null devuelve false", () => {
    expect(writeFavorites(null, ["a"])).toBe(false);
    expect(readFavorites(null)).toEqual([]);
  });
  it("toggleFavorite agrega si falta y quita si está", () => {
    expect(toggleFavorite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(["a", "b"], "a")).toEqual(["b"]);
  });
  it("lo guardado son solo IDs de texto, nada más", () => {
    const s = fakeStorage();
    expect(writeFavorites(s, ["a", "b"])).toBe(true);
    expect(JSON.parse(s.data[FAVORITES_KEY])).toEqual(["a", "b"]);
  });
});
