/**
 * El recorrido 3D solo se ofrece en previews (`NEXT_PUBLIC_SALA_VIRTUAL=1`) o
 * cuando alguna zona sea de una sala real (hoy ninguna): las salas virtuales
 * de prueba no se muestran al cliente.
 */
export function isTourEnabled(zones: ReadonlyArray<{ kind?: "virtual" | "real" }>): boolean {
  return process.env.NEXT_PUBLIC_SALA_VIRTUAL === "1" || zones.some((z) => z.kind === "real");
}
