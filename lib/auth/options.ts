import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { Role } from "@/lib/domain/types";
import { findUser } from "./users";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize(credentials) {
        if (!credentials) return null;
        const user = findUser(credentials.username, credentials.password);
        if (!user) return null;
        return { id: user.id, name: user.name, role: user.role, locationId: user.locationId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.locationId = (user as { locationId: string | null }).locationId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as Role;
        session.user.locationId = (token.locationId as string | null) ?? null;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
