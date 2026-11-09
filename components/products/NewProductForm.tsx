"use client";
import { useEffect, useState } from "react";
import { createProductAction, uploadProductImageAction } from "@/lib/actions";
import type { CreateProductInput } from "@/lib/actions";
import { MAX_DESCRIPTION_LENGTH, PRODUCT_CATEGORIES, validateNewProduct, type EntryMode } from "@/lib/domain/new-product";
import { createBrandAction, listBrandsAction, listDepartmentsAction } from "@/lib/catalog/actions";
import type { BrandOption, DepartmentOption } from "@/lib/catalog/actions";
import { BrandCombobox } from "./BrandCombobox";
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
  /** Modo con el que arranca el formulario (el alta por lote lo conserva entre artículos). */
  initialMode?: EntryMode;
  onModeChange?: (mode: EntryMode) => void;
}

const MODE_OPTIONS: { value: EntryMode; label: string }[] = [
  { value: "stock", label: "Solo stock" },
  { value: "catalog", label: "Para catálogo" },
];

async function uploadPhoto(file: File): Promise<{ url: string | null; warning: string }> {
  try {
    const fd = new FormData();
    fd.append("image", file);
    const up = await uploadProductImageAction(fd);
    return up.ok ? { url: up.url, warning: "" } : { url: null, warning: up.message };
  } catch {
    return { url: null, warning: "No se pudo subir la foto." };
  }
}

export function NewProductForm({ scannedCode, locationId, onSuccess, onCancel, onDuplicate, initialMode = "stock", onModeChange }: NewProductFormProps) {
  const noBarcode = !scannedCode;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null);
  const [backPhoto, setBackPhoto] = useState<File | null>(null);
  const [frontBusy, setFrontBusy] = useState(false);
  const [backBusy, setBackBusy] = useState(false);
  const photoBusy = frontBusy || backBusy;
  const missingPhotos = mode === "catalog" && (!frontPhoto || !backPhoto);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [brand, setBrand] = useState<BrandOption | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [formData, setFormData] = useState({
    title: "",
    departmentId: "",
    size: "",
    price: "",
    category: "",
    initialStock: "0",
    description: "",
  });

  const changeMode = (next: EntryMode) => {
    setMode(next);
    onModeChange?.(next);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([listBrandsAction(), listDepartmentsAction()])
      .then(([b, d]) => {
        if (!alive) return;
        setBrands(b);
        setDepartments(d);
      })
      .catch(() => {
        if (alive) setCatalogError("No se pudieron cargar las marcas y los departamentos. Recarga la página.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const createBrand = async (name: string) => {
    const r = await createBrandAction(name);
    if (r.ok) setBrands((prev) => (prev.some((b) => b.id === r.brand.id) ? prev : [...prev, r.brand]));
    return r;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDuplicateId(null);

    const input = {
      title: formData.title,
      brandId: brand?.id ?? "",
      departmentId: formData.departmentId,
      category: formData.category,
      price: parseFloat(formData.price),
      initialStock: Number(formData.initialStock),
      size: formData.size,
      description: formData.description,
    };
    try {
      validateNewProduct(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisa los datos del producto.");
      return;
    }
    if (missingPhotos) {
      setError("Para el catálogo se necesitan las dos fotos: frente y atrás.");
      return;
    }

    setLoading(true);
    try {
      let effectiveMode = mode;
      let imageUrl: string | null = null;
      let backImageUrl: string | null = null;
      let photoWarning = "";
      if (mode === "catalog" && frontPhoto && backPhoto) {
        const [front, back] = await Promise.all([uploadPhoto(frontPhoto), uploadPhoto(backPhoto)]);
        if (front.url && back.url) {
          imageUrl = front.url;
          backImageUrl = back.url;
        } else {
          // Sin las dos fotos no puede entrar al catálogo: se da de alta solo en inventario.
          effectiveMode = "stock";
          photoWarning = front.warning || back.warning;
        }
      }

      const payload: CreateProductInput = {
        ...input,
        size: formData.size.trim() || undefined,
        barcode: scannedCode,
        noBarcode,
        locationId,
        mode: effectiveMode,
        imageUrl,
        backImageUrl,
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
        ? `Dado de alta SIN fotos: ${photoWarning.trim().replace(/[.\s]+$/, "")}. Agrégalas desde /productos.`
        : imageUrl
          ? `"${input.title}" dado de alta para el catálogo con foto de frente y de atrás.`
          : `"${input.title}" dado de alta en inventario.`;
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Nuevo Producto</h3>
        <p className="text-sm text-gray-500">Completa los datos para dar de alta el producto.</p>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">Tipo de alta</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          {MODE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-loloteal has-[:focus-visible]:ring-offset-1 ${
                mode === o.value ? "bg-white text-loloteal shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <input
                type="radio"
                name="entryMode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => changeMode(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
        {mode === "stock" && (
          <p className="mt-2 text-sm text-gray-600">
            Se registra en inventario; no aparece en el catálogo hasta agregar las dos fotos.
          </p>
        )}
      </fieldset>

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
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Descripción <span className="text-gray-400">(opcional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={formData.description}
            onChange={handleChange}
            placeholder="Ej. Algodón, corte regular, color azul marino"
            className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700">
            Marca
          </label>
          <BrandCombobox id="brand" brands={brands} value={brand} onChange={setBrand} onCreate={createBrand} />
        </div>

        <div>
          <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700">
            Departamento
          </label>
          <select
            id="departmentId"
            name="departmentId"
            aria-required="true"
            value={formData.departmentId}
            onChange={handleChange}
            className="mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal bg-white text-gray-900"
          >
            <option value="">Elige el departamento</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
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
              className="block min-h-[44px] w-full rounded-md border border-gray-200 pl-7 pr-3 py-2 text-sm font-mono focus:border-loloteal focus:outline-none focus:ring-1 focus:ring-loloteal bg-white text-gray-900"
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

      {catalogError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{catalogError}</p>
      )}

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

      {mode === "catalog" && (
        <div className="space-y-3">
          <div role="group" aria-labelledby="foto-frente-label">
            <span id="foto-frente-label" className="mb-1 block text-sm font-medium text-gray-700">Foto de frente</span>
            <ProductPhotoCapture onCapture={setFrontPhoto} onClear={() => setFrontPhoto(null)} onBusyChange={setFrontBusy} />
          </div>
          <div role="group" aria-labelledby="foto-atras-label">
            <span id="foto-atras-label" className="mb-1 block text-sm font-medium text-gray-700">Foto de atrás</span>
            <ProductPhotoCapture onCapture={setBackPhoto} onClear={() => setBackPhoto(null)} onBusyChange={setBackBusy} />
          </div>
          {missingPhotos && (
            <p className="text-sm text-gray-600">Para el catálogo se necesitan las dos fotos: frente y atrás.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={loading || photoBusy || missingPhotos}
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
