import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { isLocalDatabaseUrl } from './local-db';

const PASSWORD_VARS = [
  'SEED_PASSWORD_LOLO',
  'SEED_PASSWORD_ENCARGADO',
  'SEED_PASSWORD_COLAB1',
  'SEED_PASSWORD_COLAB2',
] as const;

/**
 * Valida el entorno antes de escribir nada. Lanza Error en español si el seed
 * no debe correr. `--demo` agrega el producto de demostración.
 */
export function assertSeedAllowed(env: NodeJS.ProcessEnv, argv: string[]): { demo: boolean } {
  if (env.NODE_ENV === 'production') {
    throw new Error('El seed no corre en producción (NODE_ENV=production).');
  }
  const url = env.DATABASE_URL;
  if (!url || !isLocalDatabaseUrl(url)) {
    throw new Error('DATABASE_URL no es local (127.0.0.1, localhost o ::1); el seed se rechaza.');
  }
  for (const name of PASSWORD_VARS) {
    if (!env[name]) {
      throw new Error(`Falta ${name}; el seed no usa contraseñas por omisión.`);
    }
  }
  return { demo: argv.includes('--demo') };
}

function passwordFor(envVar: string): string {
  return bcrypt.hashSync(process.env[envVar] as string, 10);
}

async function main() {
  const { demo } = assertSeedAllowed(process.env, process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    await seed(prisma, demo);
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(prisma: PrismaClient, demo: boolean) {
  console.log('Iniciando seed...');

  // 1. Tiendas con IDs fijos (las sesiones y colaboradores referencian loc-1 / loc-2)
  const locations = [
    { id: 'loc-1', name: 'Tienda 1', type: 'store' },
    { id: 'loc-2', name: 'Tienda 2', type: 'store' },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({ where: { id: loc.id }, update: { name: loc.name, type: loc.type as any }, create: { ...loc, type: loc.type as any } });
    console.log(`✅ Tienda: ${loc.name} (${loc.id})`);
  }

  // 2. Usuarios con contraseñas hasheadas (bcrypt)
  const users = [
    { username: 'lolo', name: 'Dueño', role: 'owner', locationId: null, password: passwordFor('SEED_PASSWORD_LOLO') },
    { username: 'encargado', name: 'Encargado', role: 'manager', locationId: null, password: passwordFor('SEED_PASSWORD_ENCARGADO') },
    { username: 'colab1', name: 'Colaborador Tienda 1', role: 'collaborator', locationId: 'loc-1', password: passwordFor('SEED_PASSWORD_COLAB1') },
    { username: 'colab2', name: 'Colaborador Tienda 2', role: 'collaborator', locationId: 'loc-2', password: passwordFor('SEED_PASSWORD_COLAB2') },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: { ...user, role: user.role as any },
    });
    console.log(`✅ Usuario: ${user.username} (${user.role})`);
  }

  // 3. Departamentos (el alta de productos exige uno). Upsert por slug: idempotente.
  const departments = [
    { slug: 'dama', name: 'Dama', sortOrder: 1 },
    { slug: 'caballero', name: 'Caballero', sortOrder: 2 },
    { slug: 'ninos', name: 'Niños', sortOrder: 3 },
    { slug: 'calzado', name: 'Calzado', sortOrder: 4 },
    { slug: 'accesorios', name: 'Accesorios', sortOrder: 5 },
  ];
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { slug: dept.slug },
      update: { name: dept.name, sortOrder: dept.sortOrder },
      create: dept,
    });
    console.log(`✅ Departamento: ${dept.name}`);
  }

  // 4. Producto de demostración (solo con --demo)
  const existing = demo ? await prisma.variant.findUnique({ where: { sku: 'TSH-BLK-M-01' } }) : null;
  if (demo && !existing) {
    const product = await prisma.product.create({
      data: {
        title: 'Playera Básica',
        brand: 'LoloShop',
        variants: {
          create: [
            {
              title: 'Negra / M',
              sku: 'TSH-BLK-M-01',
              barcode: '123456789012',
              price: 299.0,
            },
          ],
        },
      },
      include: { variants: true },
    });

    await prisma.inventoryLevel.create({
      data: {
        variantId: product.variants[0].id,
        locationId: 'loc-1',
        available: 10,
      },
    });
    console.log(`✅ Producto demo: ${product.title} (10 piezas en loc-1)`);
  }

  console.log('¡Base de datos sembrada con éxito! 🎉');
}

if (typeof require !== 'undefined' && require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
