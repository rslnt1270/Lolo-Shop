import { useState } from "react";
import { createProductAction } from "@/lib/actions";

interface NewProductFormProps {
  scannedCode: string;
  locationId: string;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

export function NewProductForm({ scannedCode, locationId, onSuccess, onCancel }: NewProductFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    brand: "",
    sku: scannedCode || "",
    price: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createProductAction({
        barcode: scannedCode,
        title: formData.title,
        brand: formData.brand,
        price: parseFloat(formData.price),
        sku: formData.sku,
        locationId
      });
      
      onSuccess("Producto dado de alta exitosamente.");
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Nuevo Producto</h3>
        <p className="text-sm text-gray-500">Completa los datos para dar de alta el producto.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Título del producto
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="Ej. Playera Básica"
            className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700">
            Marca
          </label>
          <input
            type="text"
            id="brand"
            name="brand"
            required
            value={formData.brand}
            onChange={handleChange}
            placeholder="Ej. Tommy Hilfiger"
            className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
            Talla / SKU
          </label>
          <input
            type="text"
            id="sku"
            name="sku"
            required
            value={formData.sku}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-gray-50 text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">
            Precio
          </label>
          <div className="relative mt-1 rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="text-gray-500 sm:text-sm">$</span>
            </div>
            <input
              type="number"
              id="price"
              name="price"
              required
              min="0"
              step="0.01"
              value={formData.price}
              onChange={handleChange}
              placeholder="0.00"
              className="block w-full rounded-md border border-gray-200 pl-7 pr-3 py-2 text-sm font-mono focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-loloteal px-4 py-2 font-semibold text-white transition hover:bg-opacity-90 active:scale-95 disabled:opacity-50 shadow-sm"
        >
          {loading ? "Guardando..." : "Dar de alta producto"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
