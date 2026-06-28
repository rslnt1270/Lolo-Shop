---
name: nextauth-role-cast
description: Brief uses `token.role as string` in session callback but session.user.role is typed as Role — must cast as Role
metadata:
  type: feedback
---

In `lib/auth/options.ts` session callback, the brief writes `session.user.role = token.role as string`. With `types/next-auth.d.ts` declaring `session.user.role: Role`, TypeScript strict rejects `string` as not assignable to `Role`.

**Why:** `Role = "owner" | "manager" | "collaborator"` is a union literal, not `string`. TypeScript strict mode does not allow widening an assignment.

**How to apply:** When implementing or updating NextAuth options, import `Role` from `@/lib/domain/types` and cast `token.role as Role` in the session callback. Same pattern if `locationId` or other custom token fields are typed as non-string in the session.
