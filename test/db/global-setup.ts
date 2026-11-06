import { execSync } from "node:child_process";
import { getTestDatabaseUrl } from "./guard";

// Aplica las migraciones versionadas a la base de pruebas (prisma migrate deploy).
export default function setup() {
  const url = getTestDatabaseUrl();
  if (!url) return;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url },
  });
}
