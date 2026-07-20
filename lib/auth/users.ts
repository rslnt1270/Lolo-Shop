import bcrypt from "bcryptjs";
import type { Role } from "@/lib/domain/types";
import prisma from "@/lib/prisma";

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  locationId: string | null;
}

export async function findUser(username: string, password: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role as Role,
    locationId: user.locationId,
  };
}
