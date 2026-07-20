import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDataSource } from "@/lib/data/get-source";
import { filterProducts } from "@/lib/data/filter";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  // 1. Validación de seguridad (Autenticación del Bot)
  const expectedKey = process.env.BOT_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "Endpoint no disponible: BOT_API_KEY no está configurada." },
      { status: 503 }
    );
  }

  const botKey = request.headers.get("x-bot-key");
  if (!botKey || !safeEqual(botKey, expectedKey)) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or missing x-bot-key header." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";

    // 2. Obtener los productos desde nuestra capa de datos (Prisma/Neon)
    let products = await getDataSource().getProducts();

    // 3. Filtrar si la IA envía un término de búsqueda (ej. q="playera negra")
    if (q) {
      products = filterProducts(products, q, null);
    }

    // 4. Formatear la respuesta optimizada para el LLM (menos tokens = menos costo)
    const optimizedProducts = products.map((product) => {
      // Devolver solo variantes que tengan stock > 0
      const availableVariants = product.variants
        .map((v) => {
          const totalStock = v.inventory.reduce((acc, level) => acc + level.available, 0);
          return {
            sku: v.sku,
            title: v.title,
            size: v.size || "N/A",
            color: v.color || "N/A",
            price: v.price,
            stock: totalStock,
          };
        })
        .filter((v) => v.stock > 0);

      return {
        id: product.id,
        title: product.title,
        brand: product.brand,
        category: product.category,
        availableVariants,
      };
    }).filter(product => product.availableVariants.length > 0); // Excluir productos sin stock

    return NextResponse.json({
      success: true,
      count: optimizedProducts.length,
      data: optimizedProducts,
    });
  } catch (error) {
    console.error("Error en /api/bot/products:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
