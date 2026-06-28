import type { Role } from "@/lib/domain/types";

export interface AppUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  locationId: string | null;
}

// Fase 1: usuarios estáticos. Fase 2+: mover a almacenamiento real.
const USERS: AppUser[] = [
  { id: "u1", username: "lolo", password: "lolo123", name: "Dueño", role: "owner", locationId: null },
  { id: "u2", username: "encargado", password: "enc123", name: "Encargado", role: "manager", locationId: null },
  { id: "u3", username: "colab1", password: "colab123", name: "Colaborador Tienda 1", role: "collaborator", locationId: "loc-1" },
  { id: "u4", username: "colab2", password: "colab123", name: "Colaborador Tienda 2", role: "collaborator", locationId: "loc-2" },
];

export function findUser(username: string, password: string): Omit<AppUser, "password"> | null {
  const user = USERS.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}
