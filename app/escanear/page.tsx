"use client";
import { useState } from "react";
import { Scanner } from "@/components/inventory/Scanner";
import { NewProductForm } from "@/components/products/NewProductForm";
import { fetchProductsAction, getProductByBarcodeAction, getProductByVariantIdAction, adjustInventoryAction } from "@/lib/actions";
import type { VariantMatch } from "@/lib/data/source";
import { useSession } from "next-auth/react";

export default function EscanearPage() {
  const { data: session } = useSession();
  const [match, setMatch] = useState<VariantMatch | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");

  const handleScan = async (code: string) => {
    setScannedCode(code);
    setMessage("");
    
    let result = await getProductByBarcodeAction(code);
    if (!result) {
      result = await getProductByVariantIdAction(code);
      if (!result) {
        const products = await fetchProductsAction();
        for (const p of products) {
          const v = p.variants.find(v => v.sku === code || v.id === code);
          if (v) {
            result = { product: p, variant: v };
            break;
          }
        }
      }
    }
    setMatch(result);
  };

  const handleMovement = async (type: "in" | "out") => {
    if (!match || !session?.user?.locationId) {
      setMessage("Error: No se encontró el producto o no tienes tienda asignada.");
      return;
    }

    const qty = Math.floor(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      setMessage("Error: La cantidad debe ser un número entero mayor o igual a 1.");
      return;
    }

    const delta = type === "in" ? qty : -qty;
    try {
      await adjustInventoryAction(match.variant.id, session.user.locationId, delta);
      setMessage(`Movimiento exitoso: ${delta > 0 ? '+' : ''}${delta} ${match.product.title}`);
      setMatch(null);
      setScannedCode(null);
      setQuantity(1);
    } catch (e) {
      setMessage("Error al actualizar inventario.");
    }
  };

  if (!session?.user?.locationId) {
    return <main className="p-4 text-center">Debes ser colaborador para registrar entradas/salidas.</main>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-xl font-bold">Escanear Producto</h1>

      {!scannedCode && (
        <Scanner onScan={handleScan} />
      )}

      {scannedCode && (
        <div className="rounded-xl border p-4 shadow-sm bg-white">
          <p className="text-sm text-gray-500 mb-2">Código escaneado: {scannedCode}</p>
          
          {match ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{match.product.title}</h2>
                <p className="text-sm text-gray-600">{match.variant.title} - {match.product.brand}</p>
                <p className="text-sm font-mono mt-1">Precio: ${match.variant.price}</p>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Cantidad:</label>
                <input 
                  type="number" min="1" value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-20 rounded border p-1"
                />
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => handleMovement("out")}
                  className="flex-1 rounded bg-loloteal px-4 py-2 font-semibold text-white hover:bg-opacity-90"
                >
                  Registrar Salida
                </button>
                <button 
                  onClick={() => handleMovement("in")}
                  className="flex-1 rounded border border-loloteal text-loloteal px-4 py-2 font-semibold hover:bg-loloteal/10"
                >
                  Registrar Entrada
                </button>
              </div>
              
              <button 
                onClick={() => { setScannedCode(null); setMatch(null); setMessage(""); }}
                className="w-full text-sm text-gray-500 hover:text-gray-800"
              >
                Cancelar y escanear otro
              </button>
            </div>
          ) : (
            <NewProductForm 
              scannedCode={scannedCode} 
              locationId={session.user.locationId}
              onSuccess={(msg) => {
                setMessage(msg);
                setScannedCode(null);
                setMatch(null);
              }}
              onCancel={() => {
                setScannedCode(null);
                setMatch(null);
                setMessage("");
              }}
            />
          )}
        </div>
      )}
      
      {message && <div className="p-3 bg-green-100 text-green-800 rounded">{message}</div>}
    </main>
  );
}
