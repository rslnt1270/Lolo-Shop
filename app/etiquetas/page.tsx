"use client";
import { useEffect, useState } from "react";
import Barcode from "react-barcode";
import { fetchProductsAction } from "@/lib/actions";
import type { Product } from "@/lib/domain/types";

export default function EtiquetasPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProductsAction().then(setProducts);
  }, []);

  const variantsToPrint = products.flatMap(p => 
    p.variants.map(v => ({ product: p, variant: v }))
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Generador de Etiquetas</h1>
        <button 
          onClick={() => window.print()}
          className="rounded bg-loloteal px-4 py-2 font-semibold text-white shadow-sm hover:bg-opacity-90"
        >
          Imprimir Etiquetas
        </button>
      </div>
      
      <p className="text-sm text-gray-600">
        Esta vista genera automáticamente códigos de barras (Code128) para toda tu mercancía sin código de fábrica, 
        listos para imprimir en una etiquetadora térmica o en papel autoadherible.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 pt-4">
        {variantsToPrint.map(({ product, variant }) => (
          <div key={variant.id} className="flex flex-col items-center justify-center p-4 border rounded-xl bg-white shadow-sm space-y-1">
            <span className="font-bold text-xs uppercase text-center leading-tight">
              LoloShop
            </span>
            <span className="text-[10px] text-center text-gray-500 leading-tight">
              {product.title}
            </span>
            <span className="text-xs font-semibold text-center leading-tight">
              {variant.title} - ${variant.price}
            </span>
            <div className="mt-2 scale-75 transform origin-top">
              {/* Si tiene barcode de fábrica, mostramos ese, si no, su SKU */}
              <Barcode 
                value={variant.barcode || variant.sku} 
                width={1.5} 
                height={40} 
                fontSize={12} 
                margin={0} 
                displayValue={true} 
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
