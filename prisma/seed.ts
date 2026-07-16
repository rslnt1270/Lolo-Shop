import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando el script de prueba (Seeding)...');

  // 1. Crear una Tienda
  const store = await prisma.location.create({
    data: {
      name: 'Tienda Principal',
      type: 'store',
    },
  });
  console.log(`✅ Tienda creada: ${store.name}`);

  // 2. Crear un Usuario Colaborador
  const user = await prisma.user.create({
    data: {
      username: 'colab1',
      password: 'colab123', // En una app real esto iría hasheado
      role: 'collaborator',
      locationId: store.id,
    },
  });
  console.log(`✅ Usuario creado: ${user.username}`);

  // 3. Crear un Producto (Playera)
  const product = await prisma.product.create({
    data: {
      title: 'Playera Básica',
      brand: 'LoloShop',
      variants: {
        create: [
          {
            title: 'Negra / M',
            sku: 'TSH-BLK-M-01',
            barcode: '123456789012', // Código de barras de prueba
            price: 299.00,
          },
        ],
      },
    },
    include: {
      variants: true,
    },
  });
  console.log(`✅ Producto creado: ${product.title}`);

  // 4. Agregar Inventario Inicial (10 piezas en la Tienda)
  const variant = product.variants[0];
  await prisma.inventoryLevel.create({
    data: {
      variantId: variant.id,
      locationId: store.id,
      available: 10,
    },
  });
  console.log(`✅ Inventario añadido: 10 piezas de ${variant.title}`);

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
