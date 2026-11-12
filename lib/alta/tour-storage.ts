export const TOUR_KEY = "loloshop.altaTour.v1";

/** Si el almacenamiento falla, devuelve false: el recorrido aparece y no bloquea el alta. */
export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* modo privado o cuota llena: se mostrará de nuevo, sin error */
  }
}
