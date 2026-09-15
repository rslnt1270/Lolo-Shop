import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { validateNewPassword } from "./password-rules";

// Coste bcrypt para contraseñas nuevas (el seed usa 10; aquí subimos a 12).
const BCRYPT_COST = 12;
export { validateNewPassword } from "./password-rules";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Cambia la contraseña del usuario autenticado. Exige la contraseña actual
 * para que una sesión abierta en un dispositivo ajeno no baste para tomar la cuenta.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Usuario no encontrado." };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return { ok: false, error: "La contraseña actual no es correcta." };

  const problem = validateNewPassword(newPassword);
  if (problem) return { ok: false, error: problem };

  if (newPassword === currentPassword) {
    return { ok: false, error: "La nueva contraseña debe ser distinta a la actual." };
  }

  const password = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({ where: { id: userId }, data: { password } });
  return { ok: true };
}
