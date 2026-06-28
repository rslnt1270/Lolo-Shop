import type { Role } from "@/lib/domain/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
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
