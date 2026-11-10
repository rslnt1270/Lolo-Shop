import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDataSource } from "@/lib/data/get-source";
import { getPublicCatalog, matchesPublicQuery } from "@/lib/data/public-projection";

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

    // 2. Proyección pública: sin SKU, barcode ni conteos (B1).
    const catalog = await getPublicCatalog(getDataSource());
    const optimizedProducts = catalog.filter(
      (p) => matchesPublicQuery(p, q) && p.sizes.some((s) => s.available),
    );

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
