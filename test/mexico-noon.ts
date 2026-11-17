import { afterEach, beforeEach, vi } from "vitest";
import { businessDateMx } from "@/lib/domain/sale";

/**
 * Fija `Date` al mediodía de México (18:00 UTC) del día real, con el reloj
 * avanzando. Las ventas sin internet de otro día de negocio van a revisión;
 * con esto "hace 1 h" nunca cruza la medianoche de México y las pruebas no
 * dependen de la hora en que se corren. Solo se finge `Date` (sin timers).
 */
export function pinMexicoNoon(): void {
  beforeEach(() => {
    const today = businessDateMx(new Date());
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(`${today}T18:00:00.000Z`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
