import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Lolo", role: "owner", locationId: null } },
    status: "authenticated",
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const actions = vi.hoisted(() => ({
  lookupCodeAction: vi.fn(),
  fetchLocationsAction: vi.fn(),
  createSaleAction: vi.fn(),
  scannerRenders: vi.fn(),
  onScan: { current: null as null | ((c: string) => void) },
}));
vi.mock("@/lib/actions", () => ({
  lookupCodeAction: actions.lookupCodeAction,
  fetchLocationsAction: actions.fetchLocationsAction,
}));
vi.mock("@/lib/sales/actions", () => ({ createSaleAction: actions.createSaleAction }));
vi.mock("@/components/inventory/Scanner", () => ({
  Scanner: ({ onScan, continuous }: { onScan: (c: string) => void; continuous?: boolean }) => {
    actions.scannerRenders();
    actions.onScan.current = onScan;
    return <div data-testid="scanner" data-continuous={continuous ? "1" : "0"} />;
  },
}));

import POSPage from "@/app/pos/page";

const found = (id: string, size: string, stock?: { available: number; sold: boolean }, title = "Playera") => ({
  found: true as const,
  variantId: id,
  ...(stock ? { stock } : {}),
  product: {
    id: `p-${id}`,
    title,
    category: "Ropa",
    brand: "Acme",
    imageUrl: null,
    variants: [{ id, sku: `SKU-${id}`, title: size, size, color: null, price: 100, barcode: null, inventory: [] }],
  },
});

const scan = (code: string) => act(() => actions.onScan.current!(code));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  actions.fetchLocationsAction.mockResolvedValue([{ id: "l1", name: "Centro" }]);
  actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 5, sold: false }));
});

async function ready() {
  render(<POSPage />);
  await screen.findByDisplayValue("Centro");
}

describe("/pos escaneo continuo", () => {
  it("escanear no vuelve a montar el escáner: el mock de Scanner se renderiza una sola vez", async () => {
    await ready();
    const first = screen.getByTestId("scanner");
    expect(first).toHaveAttribute("data-continuous", "1");
    scan("111");
    await screen.findByText(/Agregado: Playera/);
    expect(screen.getByTestId("scanner")).toBe(first);
  });

  it("escanear muestra la fila pendiente del código y, al llegar la consulta, agrega 'Agregado: … ×1'", async () => {
    let resolve!: (v: unknown) => void;
    actions.lookupCodeAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await ready();
    scan("111");
    expect(await screen.findByText("Buscando 111…")).toBeInTheDocument();
    resolve(found("v1", "M", { available: 5, sold: false }));
    expect(await screen.findByText("Agregado: Playera (M) · ×1")).toBeInTheDocument();
    expect(screen.queryByText("Buscando 111…")).toBeNull();
    expect(actions.lookupCodeAction).toHaveBeenCalledWith("111", "l1");
  });

  it("mismo código dos veces muestra '×2' y no crea una línea nueva", async () => {
    await ready();
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×1");
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×2");
    expect(screen.getAllByText("Playera")).toHaveLength(1);
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("talla sin existencias en la tienda elegida no agrega la línea y muestra 'Sin existencias de la talla M en esta tienda'", async () => {
    actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 0, sold: false }));
    await ready();
    scan("111");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay prendas en la venta")).toBeInTheDocument();
  });

  it("lectura con error de red deja la fila del código en Reintentar y no la duplica", async () => {
    actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
    await ready();
    scan("111");
    const retry = await screen.findByRole("button", { name: "Reintentar 111" });
    expect(screen.getAllByRole("button", { name: /reintentar 111/i })).toHaveLength(1);
    fireEvent.click(retry);
    await screen.findByText("Agregado: Playera (M) · ×1");
    expect(actions.lookupCodeAction).toHaveBeenCalledTimes(2);
    expect(actions.lookupCodeAction).toHaveBeenLastCalledWith("111", "l1");
    expect(screen.queryByRole("button", { name: /reintentar 111/i })).toBeNull();
  });

  it("prenda vendida sin piezas en /pos muestra solo 'Sin existencias de la talla M en esta tienda'", async () => {
    actions.lookupCodeAction.mockResolvedValue(found("v1", "M", { available: 0, sold: true }));
    await ready();
    scan("111");
    expect(await screen.findByText("Sin existencias de la talla M en esta tienda")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar nuevamente" })).toBeNull();
  });

  it("una segunda lectura del mismo código mientras busca no abre otra consulta", async () => {
    let resolve!: (v: unknown) => void;
    actions.lookupCodeAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await ready();
    scan("111");
    scan("111");
    expect(actions.lookupCodeAction).toHaveBeenCalledTimes(1);
    resolve(found("v1", "M"));
    await waitFor(() => expect(screen.getByText("Playera")).toBeInTheDocument());
  });

  describe("cobro y lecturas simultáneas", () => {
    const okSale = { ok: true, sale: { number: 7, status: "paid" } };
    const defer = () => {
      let resolve!: (v: unknown) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const cobrar = () => fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));

    it("una consulta que llega durante el cobro espera y entra al carrito nuevo tras el éxito", async () => {
      const sale = defer();
      actions.createSaleAction.mockReturnValueOnce(sale.promise);
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      cobrar();
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      actions.lookupCodeAction.mockResolvedValueOnce(found("v2", "L", { available: 3, sold: false }, "Camisa"));
      scan("222");
      expect(await screen.findByText("Pendiente para la siguiente venta: 222")).toBeInTheDocument();
      expect(screen.queryByText("Camisa")).toBeNull();
      await act(async () => sale.resolve(okSale));
      expect(await screen.findByText("Camisa")).toBeInTheDocument();
      expect(screen.queryByText("Playera")).toBeNull();
      const sent = actions.createSaleAction.mock.calls[0][0];
      expect(sent.lines).toEqual([{ variantId: "v1", quantity: 1, unitPrice: 100 }]);
    });

    it("con cobro incierto la lectura sigue en espera y el reintento manda lo mismo con el mismo id", async () => {
      const sale = defer();
      actions.createSaleAction.mockReturnValueOnce(sale.promise).mockResolvedValueOnce(okSale);
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      cobrar();
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      actions.lookupCodeAction.mockResolvedValueOnce(found("v2", "L", { available: 3, sold: false }, "Camisa"));
      scan("222");
      await screen.findByText("Pendiente para la siguiente venta: 222");
      await act(async () => sale.reject(new Error("red")));
      await screen.findByText(/no se duplicará/i);
      expect(screen.getByText("Pendiente para la siguiente venta: 222")).toBeInTheDocument();
      expect(screen.queryByText("Camisa")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Reintentar cobro" }));
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(2));
      const [first, second] = actions.createSaleAction.mock.calls.map((c) => c[0]);
      expect(second).toEqual(first);
      expect(second.lines).toHaveLength(1);
      expect(await screen.findByText("Camisa")).toBeInTheDocument();
    });

    it("Cobrar está deshabilitado mientras una consulta está en curso", async () => {
      const lookup = defer();
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      actions.lookupCodeAction.mockReturnValueOnce(lookup.promise);
      scan("222");
      await screen.findByText("Buscando 222…");
      expect(screen.getByRole("button", { name: /^cobrar/i })).toBeDisabled();
      await act(async () => lookup.resolve(found("v2", "L", { available: 3, sold: false }, "Camisa")));
      await screen.findByText("Camisa");
      expect(screen.getByRole("button", { name: /^cobrar/i })).toBeEnabled();
    });
  });

  describe("avisos que no se pierden", () => {
    const okSale = { ok: true, sale: { number: 9, status: "paid" } };
    const defer = () => {
      let resolve!: (v: unknown) => void;
      const promise = new Promise((r) => (resolve = r));
      return { promise, resolve };
    };
    const cobrar = () => fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    async function chargingWithOneLine() {
      const sale = defer();
      actions.createSaleAction.mockReturnValueOnce(sale.promise);
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      cobrar();
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      return sale;
    }

    it("al vaciar la cola tras el cobro, un rechazo no queda tapado por un Agregado", async () => {
      const sale = await chargingWithOneLine();
      actions.lookupCodeAction
        .mockResolvedValueOnce(found("v2", "L", { available: 0, sold: false }, "Camisa"))
        .mockResolvedValueOnce(found("v3", "XL", { available: 3, sold: false }, "Falda"));
      scan("222");
      await screen.findByText("Pendiente para la siguiente venta: 222");
      scan("333");
      await screen.findByText("Pendiente para la siguiente venta: 333");
      await act(async () => sale.resolve(okSale));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Venta #9 registrada");
      expect(alert).toHaveTextContent("Sin existencias de la talla L en esta tienda: Camisa. Se agregó 1 prenda.");
      expect(screen.getByText("Falda")).toBeInTheDocument();
      expect(screen.queryByText("Camisa")).toBeNull();
    });

    it("venta registrada con una lectura rechazada y una fila en error: el aviso conserva la venta, los códigos y el rechazo", async () => {
      const sale = await chargingWithOneLine();
      actions.lookupCodeAction
        .mockResolvedValueOnce(found("v2", "L", { available: 0, sold: false }, "Camisa"))
        .mockRejectedValueOnce(new Error("red"));
      scan("222");
      await screen.findByText("Pendiente para la siguiente venta: 222");
      scan("444");
      await screen.findByRole("button", { name: "Reintentar 444" });
      await act(async () => sale.resolve(okSale));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Venta #9 registrada");
      expect(alert).toHaveTextContent("No se agregaron: 444");
      expect(alert).toHaveTextContent("Sin existencias de la talla L en esta tienda: Camisa.");
    });

    it("un aviso PRICE_CHANGED no lo reemplaza un Agregado de la cola", async () => {
      const sale = await chargingWithOneLine();
      actions.lookupCodeAction.mockResolvedValueOnce(found("v2", "L", { available: 3, sold: false }, "Camisa"));
      scan("222");
      await screen.findByText("Pendiente para la siguiente venta: 222");
      await act(async () => sale.resolve({ ok: false, code: "PRICE_CHANGED", message: "x", lines: [{ variantId: "v1", price: 150 }] }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("El precio de Playera cambió");
      expect(alert).toHaveTextContent("Agregado: Camisa (L) · ×1");
    });

    it("dos piezas con la consulta fallida: Reintentar conserva el ×2", async () => {
      let fail!: (e: unknown) => void;
      actions.lookupCodeAction.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
      await ready();
      scan("111");
      await screen.findByText("Buscando 111…");
      scan("111");
      await screen.findByText("Otra pieza de 111 en espera (×2).");
      await act(async () => fail(new Error("red")));
      expect(await screen.findByText("No se pudo buscar 111. · ×2 en espera")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Reintentar 111" }));
      expect(await screen.findByText("Agregado: Playera (M) · ×2")).toBeInTheDocument();
    });

    it("segunda pieza del mismo código durante el cobro queda en espera ×2 y se suma al terminar", async () => {
      const sale = await chargingWithOneLine();
      actions.lookupCodeAction.mockResolvedValueOnce(found("v2", "L", { available: 5, sold: false }, "Camisa"));
      scan("222");
      await screen.findByText("Pendiente para la siguiente venta: 222");
      scan("222");
      expect(await screen.findByText("Otra pieza de 222 en espera (×2).")).toBeInTheDocument();
      expect(screen.getByText("Pendiente para la siguiente venta: 222 · ×2 en espera")).toBeInTheDocument();
      await act(async () => sale.resolve(okSale));
      expect(await screen.findByRole("status")).toHaveTextContent(/Venta #9 registrada\. Agregado: Camisa \(L\) · ×2/);
      expect(actions.lookupCodeAction).toHaveBeenCalledTimes(2);
      expect(screen.getByText("×2")).toBeInTheDocument();
    });

    it("segunda pieza del mismo código mientras su consulta carga suma ×2 al llegar", async () => {
      const lookup = defer();
      actions.lookupCodeAction.mockReturnValueOnce(lookup.promise);
      await ready();
      scan("111");
      await screen.findByText("Buscando 111…");
      scan("111");
      expect(await screen.findByText("Otra pieza de 111 en espera (×2).")).toBeInTheDocument();
      expect(actions.lookupCodeAction).toHaveBeenCalledTimes(1);
      await act(async () => lookup.resolve(found("v1", "M", { available: 5, sold: false })));
      expect(await screen.findByText("Agregado: Playera (M) · ×2")).toBeInTheDocument();
    });

    it("segunda pieza en espera sin existencias suficientes: entra una y se avisa el rechazo de la otra", async () => {
      const lookup = defer();
      actions.lookupCodeAction.mockReturnValueOnce(lookup.promise);
      await ready();
      scan("111");
      await screen.findByText("Buscando 111…");
      scan("111");
      await screen.findByText("Otra pieza de 111 en espera (×2).");
      await act(async () => lookup.resolve(found("v1", "M", { available: 1, sold: false })));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Sin existencias de la talla M en esta tienda: Playera. Se agregó 1 prenda.");
      expect(screen.queryByText("×2")).toBeNull();
      expect(screen.getByText("Playera")).toBeInTheDocument();
    });

    it("fila de error creada durante el cobro se avisa al registrar la venta", async () => {
      const sale = await chargingWithOneLine();
      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("444");
      await screen.findByRole("button", { name: "Reintentar 444" });
      await act(async () => sale.resolve(okSale));
      expect(
        await screen.findByText("Venta #9 registrada. No se agregaron: 444. Escanéalos de nuevo si van en otra venta."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar 444" })).toBeNull();
    });
  });

  it("al cambiar de tienda se borran las existencias conocidas y se descarta la consulta de la tienda anterior", async () => {
    actions.fetchLocationsAction.mockResolvedValue([
      { id: "l1", name: "Centro" },
      { id: "l2", name: "Plaza" },
    ]);
    let resolve!: (v: unknown) => void;
    actions.lookupCodeAction.mockResolvedValueOnce(found("v1", "M", { available: 1, sold: false }));
    await ready();
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×1");
    // con 1 pieza conocida la "+" está deshabilitada; tras cambiar de tienda ya no se limita por ella
    expect(screen.getByRole("button", { name: /sumar una pieza de playera/i })).toBeDisabled();
    actions.lookupCodeAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    scan("222");
    await screen.findByText("Buscando 222…");
    fireEvent.change(document.getElementById("tienda")!, { target: { value: "l2" } });
    await act(async () => resolve(found("v2", "L", { available: 3, sold: false }, "Camisa")));
    await waitFor(() => expect(screen.queryByText("Buscando 222…")).toBeNull());
    expect(screen.queryByText("Camisa")).toBeNull();
    expect(screen.getByRole("button", { name: /sumar una pieza de playera/i })).toBeEnabled();
  });

  it("incierto: las lecturas en espera entran al carrito nuevo al empezar otra venta", async () => {
    actions.createSaleAction.mockRejectedValueOnce(new Error("red"));
    await ready();
    scan("111");
    await screen.findByText("Agregado: Playera (M) · ×1");
    fireEvent.click(screen.getByRole("button", { name: /^cobrar/i }));
    await screen.findByText(/no sabemos si la venta se registró/i);
    actions.lookupCodeAction.mockResolvedValueOnce(found("v2", "L", { available: 3, sold: false }, "Camisa"));
    scan("222");
    await screen.findByText("Pendiente para la siguiente venta: 222");
    expect(screen.queryByText("Camisa")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ya revisé en ventas/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, empezar otra venta/i }));
    expect(await screen.findByText("Camisa")).toBeInTheDocument();
    expect(screen.queryByText("Playera")).toBeNull();
    expect(screen.queryByText(/Pendiente para la siguiente venta/)).toBeNull();
  });

  describe("revisión final", () => {
    const okSale = { ok: true, sale: { number: 9, status: "paid" } };
    const cobrarBtn = () => screen.getByRole("button", { name: /^cobrar/i });

    async function withErrorRow() {
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("222");
      await screen.findByRole("button", { name: "Reintentar 222" });
    }

    it("una fila en error bloquea Cobrar hasta Reintentar o Descartar", async () => {
      await withErrorRow();
      expect(cobrarBtn()).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Descartar 222" }));
      expect(screen.queryByRole("button", { name: "Reintentar 222" })).toBeNull();
      expect(cobrarBtn()).toBeEnabled();

      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("333");
      fireEvent.click(await screen.findByRole("button", { name: "Reintentar 333" }));
      await screen.findByText("Agregado: Playera (M) · ×2");
      expect(cobrarBtn()).toBeEnabled();
    });

    it("las filas en error se borran tras una venta exitosa", async () => {
      actions.createSaleAction.mockResolvedValue(okSale);
      await withErrorRow();
      fireEvent.click(screen.getByRole("button", { name: "Descartar 222" }));
      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("333");
      await screen.findByRole("button", { name: "Reintentar 333" });
      // La fila de error queda en pantalla pero el cobro exige resolverla; se simula una que aparece durante el cobro.
      fireEvent.click(screen.getByRole("button", { name: "Descartar 333" }));
      const sale = (() => {
        let resolve!: (v: unknown) => void;
        const promise = new Promise((r) => (resolve = r));
        return { promise, resolve };
      })();
      actions.createSaleAction.mockReset();
      actions.createSaleAction.mockReturnValueOnce(sale.promise);
      fireEvent.click(cobrarBtn());
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("444");
      await screen.findByRole("button", { name: "Reintentar 444" });
      await act(async () => sale.resolve(okSale));
      await screen.findByText(/Venta #9 registrada/);
      expect(screen.queryByRole("button", { name: "Reintentar 444" })).toBeNull();
    });

    it("las filas en error se borran al empezar otra venta", async () => {
      actions.createSaleAction.mockRejectedValueOnce(new Error("red"));
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      fireEvent.click(cobrarBtn());
      await screen.findByText(/no sabemos si la venta se registró/i);
      actions.lookupCodeAction.mockRejectedValueOnce(new Error("red"));
      scan("222");
      await screen.findByRole("button", { name: "Reintentar 222" });
      fireEvent.click(screen.getByRole("button", { name: /ya revisé en ventas/i }));
      fireEvent.click(screen.getByRole("button", { name: /sí, empezar otra venta/i }));
      expect(screen.queryByRole("button", { name: "Reintentar 222" })).toBeNull();
    });

    it("con el cobro sin resolver, carrito, pago y 'empezar otra venta' quedan deshabilitados", async () => {
      let resolve!: (v: unknown) => void;
      actions.createSaleAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      fireEvent.click(cobrarBtn());
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("button", { name: /sumar una pieza de playera/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /quitar playera/i })).toBeDisabled();
      expect(screen.getByLabelText("Tarjeta")).toBeDisabled();
      expect(screen.getByLabelText("WhatsApp")).toBeDisabled();
      await act(async () => resolve({ ok: false, code: "UNAVAILABLE", message: "Lento." }));
      const b = await screen.findByRole("button", { name: /ya revisé en ventas/i });
      expect(b).toBeEnabled();
    });

    it("'Ya revisé en Ventas' está deshabilitado mientras se reintenta el cobro", async () => {
      let resolve!: (v: unknown) => void;
      actions.createSaleAction
        .mockRejectedValueOnce(new Error("red"))
        .mockReturnValueOnce(new Promise((r) => (resolve = r)));
      await ready();
      scan("111");
      await screen.findByText("Agregado: Playera (M) · ×1");
      fireEvent.click(cobrarBtn());
      fireEvent.click(await screen.findByRole("button", { name: "Reintentar cobro" }));
      await waitFor(() => expect(actions.createSaleAction).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("button", { name: /ya revisé en ventas/i })).toBeDisabled();
      await act(async () => resolve(okSale));
    });
  });
});
