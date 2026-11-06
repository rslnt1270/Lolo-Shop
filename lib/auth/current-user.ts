import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import prisma from "@/lib/prisma";
import type { Role } from "@/lib/domain/types";

export interface CurrentUser {
  id: string;
  role: Role;
  locationId: string | null;
}

/**
 * Usuario de la sesión con rol y tienda releídos de la base: el JWT puede
 * estar desactualizado (rol cambiado o usuario dado de baja).
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) throw new Error("No autorizado: inicia sesión.");
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, locationId: true },
  });
  if (!user) throw new Error("No autorizado: el usuario ya no existe.");
  return { id: user.id, role: user.role as Role, locationId: user.locationId };
}
