import type { Role } from "@/lib/domain/types";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      role: Role;
      locationId: string | null;
    };
  }
  interface User {
    role: Role;
    locationId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    locationId?: string | null;
  }
}
