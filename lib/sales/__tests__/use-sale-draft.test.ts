import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { newRequestId, useSaleDraft } from "../use-sale-draft";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Navegador sin `crypto.randomUUID` (HTTP en la red local o Safari viejo). */
function withoutRandomUUID() {
  const real = globalThis.crypto;
  vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real), randomUUID: undefined });
}

describe("newRequestId", () => {
  it("usa crypto.randomUUID si existe", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    expect(newRequestId()).toMatch(UUID_V4);
    expect(spy).toHaveBeenCalled();
  });

  it("sin randomUUID arma un UUID v4 válido con getRandomValues", () => {
    withoutRandomUUID();
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("fija versión y variante aunque los bytes sean todo unos o todo ceros", () => {
    for (const fill of [0x00, 0xff]) {
      vi.stubGlobal("crypto", {
        randomUUID: undefined,
        getRandomValues: (a: Uint8Array) => a.fill(fill),
      });
      expect(newRequestId()).toMatch(UUID_V4);
    }
  });
});

describe("useSaleDraft", () => {
  it("funciona sin crypto.randomUUID", () => {
    withoutRandomUUID();
    const { result } = renderHook(() => useSaleDraft());
    expect(result.current.clientRequestId).toMatch(UUID_V4);
    const before = result.current.clientRequestId;
    act(() => result.current.reset());
    expect(result.current.clientRequestId).toMatch(UUID_V4);
    expect(result.current.clientRequestId).not.toBe(before);
  });

  it("requestIdFor: mismo id sin rechazo previo, aunque cambie la firma", () => {
    const { result } = renderHook(() => useSaleDraft());
    const a = result.current.requestIdFor("A");
    expect(result.current.requestIdFor("B")).toBe(a);
  });

  it("requestIdFor: tras un rechazo, la misma firma conserva el id y otra lo renueva una sola vez", () => {
    const { result } = renderHook(() => useSaleDraft());
    const a = result.current.requestIdFor("A");
    act(() => result.current.markRejected("A"));
    expect(result.current.requestIdFor("A")).toBe(a);
    let b = "";
    act(() => {
      b = result.current.requestIdFor("B");
    });
    expect(b).not.toBe(a);
    expect(result.current.requestIdFor("C")).toBe(b);
  });

  it("renewRequestId da un id nuevo y olvida el rechazo", () => {
    const { result } = renderHook(() => useSaleDraft());
    const a = result.current.requestIdFor("A");
    let b = "";
    act(() => {
      result.current.markRejected("A");
      b = result.current.renewRequestId();
    });
    expect(b).not.toBe(a);
    expect(result.current.clientRequestId).toBe(b);
    expect(result.current.requestIdFor("Z")).toBe(b);
  });
});
