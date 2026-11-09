/** No hay sesión válida (falta, expiró o el usuario ya no existe). */
export class UnauthenticatedError extends Error {
  constructor(message = "No autorizado: inicia sesión.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}
