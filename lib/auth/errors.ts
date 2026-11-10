/** No hay sesión válida (falta, expiró o el usuario ya no existe). */
export class UnauthenticatedError extends Error {
  constructor(message = "No autorizado: inicia sesión.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Hay sesión, pero el rol o la tienda del usuario no permiten la operación. */
export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para hacer esto.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
