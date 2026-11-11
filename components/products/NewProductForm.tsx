"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createProductAction, uploadProductImageAction } from "@/lib/actions";
import type { CreateProductInput } from "@/lib/actions";
import {
  MAX_DESCRIPTION_LENGTH, MAX_SIZES, validateNewProduct, type EntryMode,
} from "@/lib/domain/new-product";
import { canonicalCode, isValidGtin } from "@/lib/domain/barcode";
import { Scanner } from "@/components/inventory/Scanner";
import { SumToMyStore } from "@/components/inventory/SumToMyStore";
import { SizeRows, type SizeRowDraft } from "./SizeRows";
import { createBrandAction, listBrandsAction, listDepartmentsAction, listProductTypesAction } from "@/lib/catalog/actions";
import type { BrandOption, DepartmentOption, ProductTypeOption } from "@/lib/catalog/actions";
import { typesForDepartment, validateClassification, type Audience } from "@/lib/domain/product-taxonomy";
import { ClassificationFields, type ClassificationValue } from "./ClassificationFields";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { withSession } from "@/lib/client/with-session";
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
  /** Tras "Sumar piezas en tu tienda" sobre el código duplicado. */
  onStockAdded?: (available: number) => void;
  /** Modo con el que arranca el formulario (el alta por lote lo conserva entre artículos). */
  initialMode?: EntryMode;
  onModeChange?: (mode: EntryMode) => void;
}

/** Aviso cuando un DUPLICATE probablemente es el mismo alta que no recibió respuesta. */
export const LIKELY_SAVED_TEXT = "Parece que ya se guardó: revísalo antes de sumar piezas.";

const titleKey = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

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

/**
 * Código de la talla nueva tecleado a mano o "Prenda sin código". Va dentro del
 * <form> del alta, así que no usa otro <form> (ManualCodeEntry): un form
 * anidado propagaría su submit y guardaría el alta completo. Enter usa el código.
 */
function RowCodeEntry({ onCode, onNoBarcode }: { onCode(code: string): void; onNoBarcode(): void }) {
  const [code, setCode] = useState("");
  const inputId = useId();
  const trimmed = code.trim();
  const use = () => {
    if (!trimmed) return;
    onCode(trimmed);
    setCode("");
  };
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">Código de la nueva talla</label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            use();
          }
        }}
        placeholder="Escribe el código"
        className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-loloteal"
      />
      <button
        type="button"
        onClick={use}
        disabled={!trimmed}
        className="min-h-[44px] w-full rounded-lg bg-loloteal px-4 text-sm font-medium text-white active:bg-loloteal-dark disabled:opacity-50"
      >
        Usar este código
      </button>
      <button
        type="button"
        onClick={onNoBarcode}
        className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
      >
        Prenda sin código
      </button>
    </div>
  );
}

let rowSeq = 0;
const newRow = (barcode: string | null, price = ""): SizeRowDraft => ({
  key: `fila-${++rowSeq}`, size: "", barcode, price, initialStock: "0",
});

export function NewProductForm({
  scannedCode, locationId, onSuccess, onCancel, onDuplicate, onStockAdded, initialMode = "stock", onModeChange,
}: NewProductFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [duplicateRowKey, setDuplicateRowKey] = useState<string | null>(null);
  const [stockAdded, setStockAdded] = useState("");
  const [rows, setRows] = useState<SizeRowDraft[]>(() => [newRow(scannedCode ? canonicalCode(scannedCode) : null)]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [mode, setMode] = useState<EntryMode>(initialMode);
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null);
  const [backPhoto, setBackPhoto] = useState<File | null>(null);
  const [frontBusy, setFrontBusy] = useState(false);
  const [backBusy, setBackBusy] = useState(false);
  const photoBusy = frontBusy || backBusy;
  const missingPhotos = mode === "catalog" && (!frontPhoto || !backPhoto);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [classification, setClassification] = useState<ClassificationValue>({ productTypeId: "", style: null, audience: null });
  const [typeCleared, setTypeCleared] = useState("");
  const [brand, setBrand] = useState<BrandOption | null>(null);
  const photosHelpId = useId();
  const [catalogError, setCatalogError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  /**
   * Título del último envío que terminó en ERROR o sin respuesta: el alta pudo
   * guardarse aunque la respuesta se perdiera. Si el siguiente envío choca por
   * código con el mismo título, no se ofrece "Sumar N piezas" (duplicaría stock).
   */
  const uncertainTitleRef = useRef<string | null>(null);
  const [likelySaved, setLikelySaved] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    departmentId: "",
    description: "",
  });
  const canAddRow = rows.length < MAX_SIZES;

  /** "Agregar otra talla": la fila nueva lleva el código escaneado (o ninguno) y el precio de la anterior. */
  const addRowWithCode = (raw: string | null) => {
    const code = raw === null ? null : canonicalCode(raw);
    if (code !== null && !code) return;
    if (code !== null && rows.some((r) => r.barcode === code)) {
      setScanError(`El código ${code} ya está en otra talla de este producto.`);
      return;
    }
    setScanError("");
    setRows((prev) => (prev.length >= MAX_SIZES ? prev : [...prev, newRow(code, prev[prev.length - 1]?.price ?? "")]));
    setScanning(false);
  };

  const changeRows = (next: SizeRowDraft[]) => {
    setRows(next);
    // Al editar, el aviso del código duplicado deja de aplicar a filas que ya no existen.
    setRowErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => next.some((r) => r.key === k))));
  };

  const changeMode = (next: EntryMode) => {
    setMode(next);
    onModeChange?.(next);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([listBrandsAction(), listDepartmentsAction(), listProductTypesAction()])
      .then(([b, d, t]) => {
        if (!alive) return;
        if (!b || !d || !t) {
          setSessionExpired(true);
          return;
        }
        setBrands(b);
        setDepartments(d);
        setProductTypes(t);
      })
      .catch(() => {
        if (alive) setCatalogError("No se pudieron cargar las marcas, los departamentos y los tipos. Recarga la página.");
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
    setDuplicateRowKey(null);
    setRowErrors({});
    setStockAdded("");
    setSessionExpired(false);
    setLikelySaved(false);

    const input = {
      title: formData.title,
      brandId: brand?.id ?? "",
      departmentId: formData.departmentId,
      productTypeId: classification.productTypeId,
      style: classification.style,
      audience: classification.audience,
      sizes: rows.map((r) => ({
        size: r.size,
        barcode: r.barcode,
        price: parseFloat(r.price),
        initialStock: Number(r.initialStock),
      })),
      description: formData.description,
    };
    try {
      validateNewProduct(input);
      const rule = productTypes.find((t) => t.id === classification.productTypeId);
      validateClassification({
        departmentSlug: selectedDepartment?.slug ?? "",
        type: rule
          ? { slug: rule.slug, isActive: true, appliesToDepartment: rule.departmentIds.includes(formData.departmentId) }
          : null,
        style: classification.style,
        audience: classification.audience,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisa los datos del producto.");
      return;
    }
    if (missingPhotos) {
      setError("Para el catálogo se necesitan las dos fotos: frente y atrás.");
      return;
    }

    setLoading(true);
    const sentTitle = titleKey(input.title);
    let sent = false;
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
        locationId,
        mode: effectiveMode,
        imageUrl,
        backImageUrl,
      };
      sent = true;
      const result = withSession(await createProductAction(payload));
      const previousUncertain = uncertainTitleRef.current;
      uncertainTitleRef.current = !result.ok && result.code === "ERROR" ? sentTitle : null;
      const maybeSaved = !result.ok && result.code === "DUPLICATE" && previousUncertain === sentTitle;

      if (!result.ok && result.code === "SESSION") {
        uncertainTitleRef.current = previousUncertain;
        setSessionExpired(true);
        return;
      }
      if (!result.ok) {
        const dupRow = result.code === "DUPLICATE" && result.duplicateBarcode
          ? rows.find((r) => r.barcode !== null && canonicalCode(r.barcode) === result.duplicateBarcode)
          : undefined;
        if (dupRow) {
          // El mensaje va en la fila del código repetido; arriba solo las acciones.
          setRowErrors({ [dupRow.key]: result.message });
          setDuplicateRowKey(dupRow.key);
          setError(maybeSaved
            ? LIKELY_SAVED_TEXT
            : rows.length > 1
              ? "No se guardó ninguna talla. Quita la fila marcada o suma sus piezas al producto que ya tiene ese código."
              : "No se guardó. Puedes sumar las piezas al producto que ya tiene ese código.");
        } else {
          setError(maybeSaved ? `${LIKELY_SAVED_TEXT} ${result.message}` : result.message);
        }
        setLikelySaved(maybeSaved);
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
      const sizesText = rows.length > 1 ? ` (${rows.length} tallas)` : "";
      onSuccess({
        message: photoText.replace(/(dado de alta)/, `$1${sizesText}`),
        title: input.title.trim(),
        sku: result.sku,
        imageUrl: result.product?.imageUrl ?? imageUrl,
        noBarcode: rows.some((r) => r.barcode === null),
      });
    } catch (err) {
      console.error(err);
      // Sin respuesta del servidor: el alta pudo guardarse igual.
      if (sent) uncertainTitleRef.current = sentTitle;
      setError("No se pudo dar de alta el producto. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Fila del código repetido; si el servidor no dijo cuál y solo hay una, es esa.
  const duplicateRow = rows.find((r) => r.key === duplicateRowKey) ?? (rows.length === 1 ? rows[0] : undefined);
  const rowPieces = Number(duplicateRow?.initialStock);
  // Con 0 piezas (o sin número válido) no se inventa una cantidad: el operador la escribe.
  const duplicateQty = Number.isInteger(rowPieces) && rowPieces >= 1 ? rowPieces : undefined;

  /**
   * Tras "Sumar piezas" del código repetido: se quita solo esa fila. Si quedan
   * otras tallas el formulario sigue abierto con un aviso (aún no se guardan);
   * si no queda ninguna, el alta termina.
   */
  const afterStockAdded = (available: number, added: string) => {
    const remaining = duplicateRow ? rows.filter((r) => r.key !== duplicateRow.key) : rows;
    setError("");
    setDuplicateId(null);
    setDuplicateRowKey(null);
    setRowErrors({});
    if (remaining.length === 0) {
      if (onStockAdded) onStockAdded(available);
      else setStockAdded(`Listo: ahora hay ${available} en tu tienda.`);
      setRows([newRow(null)]);
      return;
    }
    setRows(remaining);
    const n = remaining.length;
    setStockAdded(
      `${added} Ahora hay ${available} en tu tienda. ${n === 1 ? "La otra talla aún no se guarda" : `Las otras ${n} tallas aún no se guardan`}: revisa y toca «Guardar producto».`,
    );
  };

  const selectedDepartment = departments.find((d) => d.id === formData.departmentId) ?? null;
  const typesForSelected = selectedDepartment ? typesForDepartment(productTypes, selectedDepartment.id) : [];

  const changeDepartment = (departmentId: string) => {
    const dept = departments.find((d) => d.id === departmentId) ?? null;
    const audience: Audience | null = dept?.slug === "calzado" ? classification.audience : null;
    const current = productTypes.find((t) => t.id === classification.productTypeId);
    const invalid = !!current && (!dept || !current.departmentIds.includes(dept.id));
    setFormData((prev) => ({ ...prev, departmentId }));
    setTypeCleared(invalid && dept ? `El tipo se borró porque no aplica a ${dept.name}.` : "");
    setClassification(invalid ? { productTypeId: "", style: null, audience } : { ...classification, audience });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const fieldClass =
    "mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Nuevo producto</h3>
        <p className="text-sm text-gray-500">Completa los datos y agrega una fila por talla.</p>
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">Tipo de alta</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          {MODE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium transition motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-loloteal has-[:focus-visible]:ring-offset-1 ${
                mode === o.value ? "bg-loloteal text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
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
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Descripción <span className="text-gray-600">(opcional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={formData.description}
            onChange={handleChange}
            placeholder="Ej. Algodón, corte regular, color azul marino"
            className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-loloteal focus:outline-none focus:ring-2 focus:ring-loloteal"
          />
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="departmentId" className="block text-sm font-medium text-gray-700">
              Departamento
            </label>
            <select
              id="departmentId"
              name="departmentId"
              aria-required="true"
              value={formData.departmentId}
              onChange={(e) => changeDepartment(e.target.value)}
              className={fieldClass}
            >
              <option value="">Elige el departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {typeCleared && (
            <p role="status" className="mt-1 text-sm font-medium text-[#9A3B2E]">{typeCleared}</p>
          )}
          <ClassificationFields
            idPrefix="alta"
            departmentSlug={selectedDepartment?.slug ?? null}
            types={typesForSelected}
            value={classification}
            onChange={(v) => {
              setTypeCleared("");
              setClassification(v);
            }}
          />
        </div>

        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700">
            Marca
          </label>
          <BrandCombobox id="brand" brands={brands} value={brand} onChange={setBrand} onCreate={createBrand} />
        </div>
      </div>

      {mode === "catalog" && (
        <section aria-labelledby="fotos-producto" className="space-y-3">
          <h4 id="fotos-producto" className="text-sm font-semibold text-gray-900">Fotos del producto</h4>
          <div role="group" aria-labelledby="foto-frente-label">
            <p className="mb-1 flex items-baseline justify-between text-sm">
              <span id="foto-frente-label" className="font-medium text-gray-700">Foto de frente</span>
              <span className="text-xs font-medium text-loloteal">Obligatoria</span>
            </p>
            <ProductPhotoCapture side="front" onCapture={setFrontPhoto} onClear={() => setFrontPhoto(null)} onBusyChange={setFrontBusy} />
          </div>
          <div role="group" aria-labelledby="foto-atras-label">
            <p className="mb-1 flex items-baseline justify-between text-sm">
              <span id="foto-atras-label" className="font-medium text-gray-700">Foto de atrás</span>
              <span className="text-xs font-medium text-loloteal">Obligatoria</span>
            </p>
            <ProductPhotoCapture side="back" onCapture={setBackPhoto} onClear={() => setBackPhoto(null)} onBusyChange={setBackBusy} />
          </div>
        </section>
      )}

      <section aria-labelledby="tallas-titulo" className="space-y-3">
        <h4 id="tallas-titulo" className="text-sm font-semibold text-gray-900">Tallas</h4>
        <SizeRows rows={rows} onChange={changeRows} rowErrors={rowErrors} />
        {rows.some((r) => r.barcode === null) && (
          <p className="text-sm text-gray-600">Sin código: se generará un SKU interno para imprimir su etiqueta.</p>
        )}

        {scanning ? (
          <div className="space-y-3 rounded-xl border border-loloteal/40 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-800">Escanea la etiqueta de la nueva talla</p>
            <Scanner onScan={addRowWithCode} validate={isValidGtin} autoStart />
            <RowCodeEntry onCode={addRowWithCode} onNoBarcode={() => addRowWithCode(null)} />
            {scanError && (
              <p role="alert" className="text-sm font-medium text-[#9A3B2E]">{scanError}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setScanning(false);
                setScanError("");
              }}
              className="min-h-[44px] w-full rounded-md text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancelar escaneo
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                setScanError("");
                setScanning(true);
              }}
              disabled={!canAddRow}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-loloteal bg-white px-4 font-semibold text-loloteal transition active:bg-gray-100 motion-reduce:transition-none disabled:border-[#7F9392] disabled:text-[#5C6E6D]"
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
              Agregar otra talla
            </button>
            <p className="mt-1 text-center text-sm text-gray-600">
              {canAddRow
                ? "Abre el escáner y copia el precio de la talla anterior."
                : `Llegaste al máximo de ${MAX_SIZES} tallas por alta.`}
            </p>
          </div>
        )}
      </section>

      {sessionExpired && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">
          {SESSION_EXPIRED_TEXT} <LoginLink />
        </p>
      )}
      {catalogError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{catalogError}</p>
      )}

      {error && (
        <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm font-medium text-[#9A3B2E]">
          <p>{error}</p>
          {duplicateId && !likelySaved && (
            <SumToMyStore
              key={`${duplicateId}-${duplicateRowKey ?? ""}`}
              variantId={duplicateId}
              locationId={locationId}
              quantity={duplicateQty}
              defaultQuantity=""
              onDone={(available) =>
                afterStockAdded(
                  available,
                  duplicateRow?.barcode ? `Se sumaron piezas al código ${duplicateRow.barcode}.` : "Se sumaron las piezas.",
                )
              }
            />
          )}
          {duplicateId && onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(duplicateId)}
              className="min-h-[44px] w-full rounded-md border border-[#9A3B2E] bg-white px-4 text-[#9A3B2E]"
            >
              Ver producto y registrar entrada
            </button>
          )}
        </div>
      )}
      {stockAdded && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-800">{stockAdded}</p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-gray-100 bg-white px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="submit"
          disabled={loading || photoBusy || missingPhotos}
          aria-describedby={mode === "catalog" ? photosHelpId : undefined}
          className="min-h-[44px] w-full rounded-md bg-loloteal px-4 py-2 font-semibold text-white shadow-sm transition active:bg-loloteal-dark motion-reduce:transition-none disabled:opacity-50"
        >
          {loading ? "Guardando…" : photoBusy ? "Procesando foto…" : "Guardar producto"}
        </button>
        {mode === "catalog" && (
          <p id={photosHelpId} aria-live="polite" className="text-sm text-gray-600">
            {missingPhotos ? "Para el catálogo se necesitan las dos fotos: frente y atrás." : ""}
          </p>
        )}
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
