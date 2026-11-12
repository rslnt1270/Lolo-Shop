"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createProductAction, uploadProductImageAction } from "@/lib/actions";
import type { CreateProductInput } from "@/lib/actions";
import {
  ALLOWED_IMAGE_TYPES, MAX_DESCRIPTION_LENGTH, MAX_IMAGE_BYTES, MAX_SIZES, validateNewProduct, type EntryMode,
} from "@/lib/domain/new-product";
import {
  buildSuggestedTitle, colorApplies, resolveColorLabel, productPhotoStatus, validateReference, type PhotoStatus,
} from "@/lib/domain/product-reference";
import { canonicalCode, isValidGtin } from "@/lib/domain/barcode";
import { Scanner } from "@/components/inventory/Scanner";
import { SumToMyStore } from "@/components/inventory/SumToMyStore";
import { SizeRows, type SizeRowDraft } from "./SizeRows";
import {
  createBrandAction, createColorAction, listBrandsAction, listColorsAction, listDepartmentsAction, listProductTypesAction,
} from "@/lib/catalog/actions";
import type { BrandOption, DepartmentOption, ProductTypeOption } from "@/lib/catalog/actions";
import { typesForDepartment, validateClassification, type Audience } from "@/lib/domain/product-taxonomy";
import { ClassificationFields, type ClassificationValue } from "./ClassificationFields";
import { LoginLink, SESSION_EXPIRED_TEXT } from "@/components/sales/session-expired";
import { withSession } from "@/lib/client/with-session";
import { BrandCombobox } from "./BrandCombobox";
import { ProductPhotoCapture } from "./ProductPhotoCapture";
import { Button } from "@/components/ui/Button";
import { AltaTour } from "./AltaTour";
import { hasSeenTour, markTourSeen } from "@/lib/alta/tour-storage";

export interface CreatedInfo {
  message: string;
  title: string;
  sku: string;
  imageUrl: string | null;
  noBarcode: boolean;
  /** Estado del registro fotográfico tras guardar. */
  catalogStatus: PhotoStatus;
}

interface NewProductFormProps {
  /** Código escaneado/tecleado; null = prenda sin código (se genera SKU interno). */
  scannedCode: string | null;
  locationId: string;
  /** Nombre de la tienda activa, para "Registrando en: …". */
  locationName?: string;
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
  { value: "catalog", label: "Catálogo" },
];

export const OFFLINE_TEXT = "Sin internet no se puede guardar. Tus datos siguen aquí.";
const NETWORK_TEXT = "No se pudo dar de alta el producto. Revisa tu conexión e inténtalo de nuevo.";
const STOCK_FALLBACK_HINT = "Puedes reintentar o guardar como Solo stock y agregar las fotos después.";

/** Revisa en el cliente lo que el servidor rechazaría de una foto, antes de subirla. */
function photoProblem(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Formato de imagen no permitido: usa JPG, PNG o WebP.";
  if (file.size === 0) return "La imagen está vacía.";
  if (file.size > MAX_IMAGE_BYTES) return "La imagen pesa más de 4 MB. Toma la foto de nuevo o redúcela.";
  return null;
}

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
        className="min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-turquesa-texto"
      />
      <Button
        onClick={use}
        disabled={!trimmed} className="w-full">
        Usar este código
      </Button>
      <Button variant="outline"
        onClick={onNoBarcode} className="w-full">
        Prenda sin código
      </Button>
    </div>
  );
}

let rowSeq = 0;
const newRow = (barcode: string | null, price = ""): SizeRowDraft => ({
  key: `fila-${++rowSeq}`, size: "", barcode, price, initialStock: "0",
});

export function NewProductForm({
  scannedCode, locationId, locationName, onSuccess, onCancel, onDuplicate, onStockAdded, initialMode = "stock", onModeChange,
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
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [classification, setClassification] = useState<ClassificationValue>({ productTypeId: "", style: null, audience: null });
  const [typeCleared, setTypeCleared] = useState("");
  const [brand, setBrand] = useState<BrandOption | null>(null);
  const photosHelpId = useId();
  const colorListId = useId();
  const [colors, setColors] = useState<string[]>([]);
  const [colorText, setColorText] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  /** Si la subida o el guardado fallan en catálogo, el alta puede salir como Solo stock. */
  const [offerStock, setOfferStock] = useState(false);
  const submittingRef = useRef(false);
  /** Fotos ya subidas (por archivo): un reintento no vuelve a subirlas ni deja blobs huérfanos. */
  const uploadsRef = useRef(new Map<File, string>());
  const [catalogError, setCatalogError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  /**
   * Título del último envío que terminó en ERROR o sin respuesta: el alta pudo
   * guardarse aunque la respuesta se perdiera. Si el siguiente envío choca por
   * código con el mismo título, no se ofrece "Sumar N piezas" (duplicaría stock).
   */
  const uncertainTitleRef = useRef<string | null>(null);
  const [likelySaved, setLikelySaved] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (!hasSeenTour()) setTourOpen(true);
  }, []);
  const howRef = useRef<HTMLButtonElement>(null);
  const tourWasOpen = useRef(false);
  useEffect(() => {
    if (tourWasOpen.current && !tourOpen) {
      const a = document.activeElement;
      if (!a || a === document.body) howRef.current?.focus();
    }
    tourWasOpen.current = tourOpen;
  }, [tourOpen]);
  const closeTour = () => {
    markTourSeen();
    setTourOpen(false);
  };
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
    Promise.all([listBrandsAction(), listDepartmentsAction(), listProductTypesAction(), listColorsAction()])
      .then(([b, d, t, c]) => {
        if (!alive) return;
        if (!b || !d || !t || !c) {
          setSessionExpired(true);
          return;
        }
        setBrands(b);
        setDepartments(d);
        setProductTypes(t);
        setColors(c);
      })
      .catch(() => {
        if (alive) setCatalogError("No se pudieron cargar las marcas, los departamentos, los tipos y los colores. Recarga la página.");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  /** `forceStock`: guarda como Solo stock aunque el formulario esté en catálogo (sin fotos). */
  const submit = async (forceStock: boolean) => {
    // El ref cierra el doble toque aunque el estado aún no se haya pintado.
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await run(forceStock);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const run = async (forceStock: boolean) => {
    setError("");
    setDuplicateId(null);
    setDuplicateRowKey(null);
    setRowErrors({});
    setStockAdded("");
    setSessionExpired(false);
    setLikelySaved(false);
    setOfferStock(false);

    // El alta requiere internet: sin red no se intenta nada y los datos siguen en pantalla.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(OFFLINE_TEXT);
      return;
    }
    if (!locationId) {
      setError("Elige una tienda para guardar el producto.");
      return;
    }

    const catalog = mode === "catalog" && !forceStock;
    const photos = catalog ? [frontPhoto, backPhoto].filter((f): f is File => f !== null) : [];
    const rule = productTypes.find((t) => t.id === classification.productTypeId);
    const colorRaw = showColor ? colorText : "";

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
    // Todo lo que se pueda validar en el cliente va ANTES de subir fotos o crear colores.
    try {
      validateNewProduct(input);
      validateClassification({
        departmentSlug: selectedDepartment?.slug ?? "",
        type: rule
          ? { slug: rule.slug, isActive: true, appliesToDepartment: rule.departmentIds.includes(formData.departmentId) }
          : null,
        style: classification.style,
        audience: classification.audience,
      });
      validateReference({
        brand: brand?.name ?? "", color: colorRaw || null,
        departmentSlug: selectedDepartment?.slug ?? null, typeSlug: rule?.slug ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revisa los datos del producto.");
      return;
    }
    for (const photo of photos) {
      const problem = photoProblem(photo);
      if (problem) {
        setError(`${problem} ${STOCK_FALLBACK_HINT}`);
        setOfferStock(true);
        return;
      }
    }

    setLoading(true);
    const sentTitle = titleKey(input.title);
    let sent = false;
    try {
      // El color escrito se resuelve con la lista: "rosas" se guarda como "Rosa".
      let color: string | null = null;
      const typed = colorRaw.trim();
      if (typed) {
        const resolved = resolveColorLabel(typed, colors);
        if (resolved && colors.includes(resolved)) color = resolved;
        else {
          const made = await createColorAction(typed);
          if (!made?.ok) {
            setError(made?.message ?? SESSION_EXPIRED_TEXT);
            return;
          }
          color = made.label;
          const label = made.label;
          setColors((prev) => (prev.includes(label) ? prev : [...prev, label]));
        }
      }

      let imageUrl: string | null = null;
      let backImageUrl: string | null = null;
      if (photos.length > 0) {
        const urls = new Map<File, string>();
        for (const photo of photos) {
          const cached = uploadsRef.current.get(photo);
          if (cached) {
            urls.set(photo, cached);
            continue;
          }
          const up = await uploadPhoto(photo);
          if (!up.url) {
            // Se detiene en la primera falla: nada más se sube y el alta no se pierde.
            setError(`${up.warning.trim().replace(/[.\s]+$/, "")}. ${STOCK_FALLBACK_HINT}`);
            setOfferStock(true);
            return;
          }
          uploadsRef.current.set(photo, up.url);
          urls.set(photo, up.url);
        }
        imageUrl = frontPhoto ? urls.get(frontPhoto) ?? null : null;
        backImageUrl = backPhoto ? urls.get(backPhoto) ?? null : null;
      }

      const payload: CreateProductInput = {
        ...input,
        color,
        locationId,
        mode: catalog ? "catalog" : "stock",
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
        if (photos.length > 0 && result.code !== "DUPLICATE") setOfferStock(true);
        return;
      }

      const status: PhotoStatus = result.catalogStatus ?? productPhotoStatus({
        hasFront: Boolean(imageUrl),
        hasBack: Boolean(backImageUrl),
        hasStock: rows.some((r) => Number(r.initialStock) > 0),
      });
      const sizesText = rows.length > 1 ? ` (${rows.length} tallas)` : "";
      onSuccess({
        message: `"${input.title.trim()}" dado de alta${sizesText}. Estado: ${status}.${status === "Listo para catálogo" ? " Queda en «Por publicar» hasta que el dueño o el encargado lo publiquen." : ""}`,
        title: input.title.trim(),
        sku: result.sku,
        imageUrl: result.product?.imageUrl ?? imageUrl,
        noBarcode: rows.some((r) => r.barcode === null),
        catalogStatus: status,
      });
    } catch (err) {
      console.error(err);
      // Sin respuesta del servidor: el alta pudo guardarse igual. Los datos siguen en pantalla.
      if (sent) uncertainTitleRef.current = sentTitle;
      setError(NETWORK_TEXT);
      if (photos.length > 0) setOfferStock(true);
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
  const selectedType = productTypes.find((t) => t.id === classification.productTypeId) ?? null;
  const showColor = colorApplies({ departmentSlug: selectedDepartment?.slug ?? null, typeSlug: selectedType?.slug ?? null });

  // Título sugerido = tipo + marca + color; deja de sincronizarse tras la primera edición manual.
  useEffect(() => {
    if (titleEdited) return;
    const suggested = buildSuggestedTitle({
      typeName: selectedType?.name ?? "",
      brand: brand?.name ?? "",
      color: showColor ? resolveColorLabel(colorText, colors) : null,
    });
    setFormData((prev) => (prev.title === suggested ? prev : { ...prev, title: suggested }));
  }, [titleEdited, selectedType?.name, brand?.name, showColor, colorText, colors]);

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
    if (name === "title") setTitleEdited(true);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const fieldClass =
    "mt-1 block min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Nuevo producto</h3>
        {locationName && <p className="text-sm font-medium text-gray-800">Registrando en: {locationName}</p>}
        <p className="text-sm text-gray-500">Completa los datos y agrega una fila por talla.</p>
        <button
          ref={howRef}
          type="button"
          onClick={() => setTourOpen(true)}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-turquesa-texto underline"
        >
          ¿Cómo registrar?
        </button>
      </div>
      <AltaTour open={tourOpen} onClose={closeTour} />

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">¿Va al catálogo?</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          {MODE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium transition motion-reduce:transition-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-turquesa-texto has-[:focus-visible]:ring-offset-1 ${
                mode === o.value ? "bg-turquesa text-tinta shadow-sm" : "text-gray-600 hover:text-gray-900"
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

      {mode === "catalog" && (
        <section aria-labelledby="fotos-producto" className="space-y-3">
          <h4 id="fotos-producto" className="text-sm font-semibold text-gray-900">Fotos del producto</h4>
          <p id={photosHelpId} className="text-sm text-gray-600">
            Recomendadas: frente y atrás. Sin las dos fotos el producto queda en «Falta completar registro fotográfico».
          </p>
          <div role="group" aria-labelledby="foto-frente-label">
            <p className="mb-1 flex items-baseline justify-between text-sm">
              <span id="foto-frente-label" className="font-medium text-gray-700">Foto de frente</span>
              <span className="text-xs font-medium text-turquesa-texto">Recomendada</span>
            </p>
            <ProductPhotoCapture side="front" onCapture={setFrontPhoto} onClear={() => setFrontPhoto(null)} onBusyChange={setFrontBusy} />
          </div>
          <div role="group" aria-labelledby="foto-atras-label">
            <p className="mb-1 flex items-baseline justify-between text-sm">
              <span id="foto-atras-label" className="font-medium text-gray-700">Foto de atrás</span>
              <span className="text-xs font-medium text-turquesa-texto">Recomendada</span>
            </p>
            <ProductPhotoCapture side="back" onCapture={setBackPhoto} onClear={() => setBackPhoto(null)} onBusyChange={setBackBusy} />
          </div>
        </section>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Descripción <span className="text-gray-600">(obligatoria)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={formData.description}
            onChange={handleChange}
            placeholder="Ej. Algodón, corte regular, color azul marino"
            className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:border-turquesa-texto focus:outline-none focus:ring-2 focus:ring-turquesa-texto"
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
            <p role="status" className="mt-1 text-sm font-medium text-agotado">{typeCleared}</p>
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

        {showColor && (
          <div>
            <label htmlFor="color" className="block text-sm font-medium text-gray-700">
              Color <span className="text-gray-600">(opcional)</span>
            </label>
            <input
              type="text"
              id="color"
              list={colorListId}
              autoComplete="off"
              maxLength={40}
              value={colorText}
              onChange={(e) => setColorText(e.target.value)}
              placeholder="Elige de la lista o escribe uno nuevo"
              className={fieldClass}
            />
            <datalist id={colorListId}>
              {colors.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Título del producto <span className="text-gray-600">(sugerido, puedes editarlo)</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="Ej. Playeras ALO rosa"
            className={fieldClass}
          />
        </div>
      </div>

      <section aria-labelledby="tallas-titulo" className="space-y-3">
        <h4 id="tallas-titulo" className="text-sm font-semibold text-gray-900">Tallas</h4>
        <SizeRows rows={rows} onChange={changeRows} rowErrors={rowErrors} />
        {rows.some((r) => r.barcode === null) && (
          <p className="text-sm text-gray-600">Sin código: se generará un SKU interno para imprimir su etiqueta.</p>
        )}

        {scanning ? (
          <div className="space-y-3 rounded-xl border border-turquesa-texto bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-800">Escanea la etiqueta de la nueva talla</p>
            <Scanner onScan={addRowWithCode} validate={isValidGtin} autoStart />
            <RowCodeEntry onCode={addRowWithCode} onNoBarcode={() => addRowWithCode(null)} />
            {scanError && (
              <p role="alert" className="text-sm font-medium text-agotado">{scanError}</p>
            )}
            <Button variant="outline"
              onClick={() => {
                setScanning(false);
                setScanError("");
              }} className="w-full">
              Cancelar escaneo
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="outline"
              onClick={() => {
                setScanError("");
                setScanning(true);
              }}
              disabled={!canAddRow} className="w-full">
              <Plus aria-hidden="true" className="h-5 w-5" />
              Agregar otra talla
            </Button>
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
        <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm font-medium text-agotado">
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
            <Button variant="danger"
              onClick={() => onDuplicate(duplicateId)} className="w-full">
              Ver producto y registrar entrada
            </Button>
          )}
        </div>
      )}
      {stockAdded && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-800">{stockAdded}</p>
      )}

      <div className="sticky bottom-[var(--bottom-nav-offset)] md:bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-gray-100 bg-white px-4 pb-[max(0.5rem,var(--sticky-safe-pb))] pt-2">
        <Button type="submit" loading={loading} disabled={photoBusy} className="w-full">
          {loading ? "Guardando…" : photoBusy ? "Procesando foto…" : "Guardar producto"}
        </Button>
        {offerStock && mode === "catalog" && (
          <Button variant="outline" onClick={() => void submit(true)} loading={loading} className="w-full">
            Guardar como Solo stock
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} disabled={loading} className="w-full">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
