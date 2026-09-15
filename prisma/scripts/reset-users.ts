/**
 * Crea/actualiza las cuentas de acceso con contraseñas tomadas del entorno
 * (SEED_PASSWORD_LOLO, _ENCARGADO, _COLAB1, _COLAB2). A diferencia de seed.ts,
 * NO crea tiendas ni productos: los colaboradores se asignan a tiendas que ya
 * existen, buscadas por nombre (LOCATION_COLAB1 / LOCATION_COLAB2; por defecto
 * la única tienda si solo hay una).
 *
 * Uso: npx tsx prisma/scripts/reset-users.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 10) {
    throw new Error(`${name} no definida o demasiado corta (mínimo 10). Abortando sin cambios.`);
  }
  return v;
}

async function resolveLocation(envVar: string, all: { id: string; name: string }[]): Promise<string> {
  const wanted = process.env[envVar];
  if (wanted) {
    const found = all.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
    if (!found) throw new Error(`${envVar}="${wanted}" no coincide con ninguna tienda: ${all.map((l) => l.name).join(", ")}`);
    return found.id;
  }
  if (all.length === 1) return all[0].id;
  throw new Error(`Hay ${all.length} tiendas; define ${envVar} con el nombre de la tienda.`);
}

async function main() {
  // Validar todo antes de escribir nada.
  const passwords = {
    lolo: requireEnv("SEED_PASSWORD_LOLO"),
    encargado: requireEnv("SEED_PASSWORD_ENCARGADO"),
    colab1: requireEnv("SEED_PASSWORD_COLAB1"),
    colab2: requireEnv("SEED_PASSWORD_COLAB2"),
  };
  const locations = await prisma.location.findMany({ select: { id: true, name: true } });
  if (locations.length === 0) throw new Error("No hay tiendas en la base de datos.");
  const loc1 = await resolveLocation("LOCATION_COLAB1", locations);
  const loc2 = await resolveLocation("LOCATION_COLAB2", locations);

  const users = [
    { username: "lolo", name: "Dueño", role: "owner", locationId: null, plain: passwords.lolo },
    { username: "encargado", name: "Encargado", role: "manager", locationId: null, plain: passwords.encargado },
    { username: "colab1", name: "Colaborador 1", role: "collaborator", locationId: loc1, plain: passwords.colab1 },
    { username: "colab2", name: "Colaborador 2", role: "collaborator", locationId: loc2, plain: passwords.colab2 },
  ] as const;

  for (const u of users) {
    const password = await bcrypt.hash(u.plain, BCRYPT_COST);
    const data = { name: u.name, role: u.role as any, locationId: u.locationId, password };
    await prisma.user.upsert({
      where: { username: u.username },
      update: data,
      create: { username: u.username, ...data },
    });
    const store = u.locationId ? locations.find((l) => l.id === u.locationId)?.name : "todas";
    console.log(`✅ ${u.username} (${u.role}, tienda: ${store})`);
  }

  // Verificación: cada cuenta autentica con su nueva contraseña.
  for (const u of users) {
    const row = await prisma.user.findUnique({ where: { username: u.username } });
    const ok = row ? await bcrypt.compare(u.plain, row.password) : false;
    if (!ok) throw new Error(`Verificación fallida para ${u.username}`);
  }
  console.log("🔐 Verificación OK: las 4 cuentas autentican con sus nuevas contraseñas.");
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
