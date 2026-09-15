// Reglas puras de contraseña: sin dependencias de servidor, importable desde el cliente.
export const MIN_PASSWORD_LENGTH = 10;

/** Devuelve un mensaje de error o null si la contraseña es aceptable. */
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe combinar letras y números.";
  }
  return null;
}
