import { getDataSource } from "@/lib/data/get-source";
import Link from "next/link";
import { ProductCard3D } from "@/components/products/ProductCard3D";

export const revalidate = 60; // Revalidar la página cada 60 segundos (ISR)

export default async function CatalogoPage() {
  // Obtenemos los productos directo de la base de datos para renderizarlos en el servidor (SEO Friendly)
  const products = await getDataSource().getProducts();

  // Número de WhatsApp al que llegarán los mensajes (Debe incluir código de país, ej: 5215555555555)
  const WHATSAPP_NUMBER = "5210000000000"; // Reemplaza esto con tu número real

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header Público */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-loloteal rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">LoloShop</h1>
          </div>
          <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-loloteal transition-colors">
            Acceso Socios
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Nuestro Catálogo</h2>
          <p className="mt-4 max-w-2xl text-lg text-gray-500 mx-auto">
            Explora nuestros artículos premium. ¿Te gusta algo? Apártalo al instante por WhatsApp y asegura tu pieza antes de que se agote.
          </p>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-lg">Aún no hay productos en el catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-y-10 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
            {products.map((product) => {
              // Por ahora tomamos la primera variante para mostrar el precio
              const mainVariant = product.variants[0];
              if (!mainVariant) return null;

              // Generar URL de WhatsApp pre-llenada
              const mensajeWa = encodeURIComponent(
                `¡Hola! Me gustaría apartar el producto:\n\n*${product.title}*\nMarca: ${product.brand}\nPrecio: $${mainVariant.price}\nSKU: ${mainVariant.sku}\n\n¿Aún lo tienen disponible?`
              );
              const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${mensajeWa}`;

              return (
                <ProductCard3D 
                  key={product.id}
                  product={product} 
                  mainVariant={mainVariant} 
                  waLink={waLink} 
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
