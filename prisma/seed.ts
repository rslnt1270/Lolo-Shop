import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Contraseñas de desarrollo. En producción, define SEED_PASSWORD_* en el entorno
// antes de correr el seed (ver .env.example).
function passwordFor(envVar: string, devDefault: string): string {
  const value = process.env[envVar];
  if (!value) {
    console.warn(`⚠️  ${envVar} no definida — usando contraseña de desarrollo. No usar en producción.`);
  }
  return bcrypt.hashSync(value || devDefault, 10);
}

async function main() {
  console.log('Iniciando seed...');

  // 1. Tiendas con IDs fijos (las sesiones y colaboradores referencian loc-1 / loc-2)
  const locations = [
    { id: 'loc-1', name: 'Tienda 1', type: 'store' },
    { id: 'loc-2', name: 'Tienda 2', type: 'store' },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({ where: { id: loc.id }, update: { name: loc.name, type: loc.type }, create: loc });
    console.log(`✅ Tienda: ${loc.name} (${loc.id})`);
  }

  // 2. Usuarios con contraseñas hasheadas (bcrypt)
  const users = [
    { username: 'lolo', name: 'Dueño', role: 'owner', locationId: null, password: passwordFor('SEED_PASSWORD_LOLO', 'lolo123') },
    { username: 'encargado', name: 'Encargado', role: 'manager', locationId: null, password: passwordFor('SEED_PASSWORD_ENCARGADO', 'enc123') },
    { username: 'colab1', name: 'Colaborador Tienda 1', role: 'collaborator', locationId: 'loc-1', password: passwordFor('SEED_PASSWORD_COLAB1', 'colab123') },
    { username: 'colab2', name: 'Colaborador Tienda 2', role: 'collaborator', locationId: 'loc-2', password: passwordFor('SEED_PASSWORD_COLAB2', 'colab123') },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { name: user.name, role: user.role, locationId: user.locationId, password: user.password },
      create: user,
    });
    console.log(`✅ Usuario: ${user.username} (${user.role})`);
  }

  // 3. Producto de demostración
  const existing = await prisma.variant.findUnique({ where: { sku: 'TSH-BLK-M-01' } });
  if (!existing) {
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
