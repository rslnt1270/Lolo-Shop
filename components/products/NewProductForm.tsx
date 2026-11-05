"use client";
import { useState } from "react";
import { createProductAction, uploadProductImageAction } from "@/lib/actions";
import type { CreateProductInput } from "@/lib/actions";
import { PRODUCT_CATEGORIES, validateNewProduct } from "@/lib/domain/new-product";
import { ProductPhotoCapture } from "./ProductPhotoCapture";

export interface CreatedInfo {
  message: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  noBarcode: boolean;
}

interface NewProductFormProps {
  /** Código escaneado/tecleado; null = prenda sin código (se genera SKU interno). */
  scannedCode: string | null;
  locationId: string;
  onSuccess: (info: CreatedInfo) => void;
  onCancel: () => void;
  /** El código ya existía: ofrece registrar entradas del producto existente. */
  onDuplicate?: (existingVariantId: string) => void;
}

export function NewProductForm({ scannedCode, locationId, onSuccess, onCancel, onDuplicate }: NewProductFormProps) {
  const noBarcode = !scannedCode;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    brand: "",
    size: "",
    price: "",
    category: "",
    initialStock: "0",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDuplicateId(null);

    const input = {
      title: formData.title,
      brand: formData.brand,
      category: formData.category,
      price: parseFloat(formData.price),
      initialStock: Number(formData.initialStock),
      size: formData.size,
    };
    try {
      validateNewProduct(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisa los datos del producto.");
      return;
    }

    setLoading(true);
    try {
      let imageUrl: string | null = null;
      let photoWarning = "";
      if (photo) {
        try {
          const fd = new FormData();
          fd.append("image", photo);
          const up = await uploadProductImageAction(fd);
          if (up.ok) imageUrl = up.url;
          else photoWarning = up.message;
        } catch {
          photoWarning = "No se pudo subir la foto.";
        }
      }

      const payload: CreateProductInput = {
        ...input,
        size: formData.size.trim() || undefined,
        barcode: scannedCode,
        noBarcode,
        locationId,
        imageUrl,
      };
      const result = await createProductAction(payload);

      if (!result.ok) {
        setError(result.message);
        if (result.code === "DUPLICATE" && result.existingVariantId) {
          setDuplicateId(result.existingVariantId);
        }
        return;
      }

      const photoText = photoWarning
        ? `Dado de alta SIN foto: ${photoWarning.trim().replace(/[.\s]+$/, "")}. Agrégala desde /productos.`
        : imageUrl
          ? `"${input.title}" dado de alta con foto.`
          : `"${input.title}" dado de alta sin foto.`;
      onSuccess({
        message: photoText,
        title: input.title.trim(),
        sku: result.sku,
        imageUrl: result.product?.imageUrl ?? imageUrl,
        noBarcode,
      });
    } catch (err) {
      console.error(err);
      setError("No se pudo dar de alta el producto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
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
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700">Código</span>
          {noBarcode ? (
            <p className="mt-1 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Sin código: se generará un SKU interno
            </p>
          ) : (
            <p
              data-testid="codigo-escaneado"
              className="mt-1 rounded-md bg-gray-50 px-3 py-2 font-mono text-sm text-gray-900"
            >
              {scannedCode}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="size" className="block text-sm font-medium text-gray-700">
            Talla <span className="text-gray-400">(opcional)</span>
          </label>
          <input
            type="text"
            id="size"
            name="size"
            value={formData.size}
            onChange={handleChange}
            placeholder="Ej. M, 28, U"
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal"
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

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Categoría
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          >
            <option value="">Elige una categoría</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="initialStock" className="block text-sm font-medium text-gray-700">
            Stock inicial <span className="text-gray-400">(piezas contadas en esta tienda)</span>
          </label>
          <input
            type="number"
            id="initialStock"
            name="initialStock"
            min="0"
            step="1"
            inputMode="numeric"
            value={formData.initialStock}
            onChange={handleChange}
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">
          <p>{error}</p>
          {duplicateId && onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(duplicateId)}
              className="min-h-[44px] rounded-md bg-red-600 px-4 text-white"
            >
              Ver producto y registrar entrada
            </button>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Foto del producto <span className="text-gray-400">(opcional)</span>
        </label>
        <ProductPhotoCapture onCapture={setPhoto} onClear={() => setPhoto(null)} onBusyChange={setPhotoBusy} />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={loading || photoBusy}
          className="min-h-[44px] w-full rounded-md bg-loloteal px-4 py-2 font-semibold text-white transition hover:bg-opacity-90 active:scale-95 disabled:opacity-50 shadow-sm"
        >
          {loading ? "Guardando..." : photoBusy ? "Procesando foto…" : "Dar de alta producto"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="min-h-[44px] w-full rounded-md px-4 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
