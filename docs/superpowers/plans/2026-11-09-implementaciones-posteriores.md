# LoloShop: implementaciones posteriores a ventas P1. Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Goal:** sacar a producción el módulo de ventas con el catálogo, el bot y WhatsApp sin datos inventados (P0) y después llevar la tienda digital a datos reales y cerrar las deudas de ventas y plataforma (P1).

**Architecture:** Next.js 14 App Router con server actions; Prisma sobre Postgres (Neon); lo público pasa solo por `PublicProduct` (`lib/data/public-projection.ts`). Por decisión del dueño (2026-11-09), Claude ejecuta todas las tareas, incluida la zona visual (`components/virtual-store/`, `lib/virtual-store/`, aspecto de `/catalogo`), que el spec §3.1 asigna a Antigravity; si Antigravity vuelve, se le devuelve la zona. Los contratos compartidos (§3.2) se mantienen como frontera.

**Tech Stack:** Next.js 14.2, React 18.3, TypeScript, Prisma 5.22, PostgreSQL, next-auth 4, `@vercel/blob` 2.8, framer-motion, Tailwind, Vitest + Testing Library (jsdom), `npm run test:db` para `*.db.test.ts`.

**Spec:** `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md` (autoridad). Datos: `docs/superpowers/specs/2026-11-05-modelo-datos-er.md`. Salida: `docs/runbooks/2026-11-salida-ventas.md`.

## Global Constraints

- Lo público (catálogo, recorrido, modal, bot, WhatsApp) usa **solo** `PublicProduct`: sin SKU, sin código de barras, sin conteos; disponibilidad **sí/no por talla**; solo tiendas, no almacén. Público solo con foto de frente **y** de atrás.
- Nada inventado ante el cliente: ni productos, precios, existencias ni ubicaciones de ejemplo; nada de "apartado" ni "envío a domicilio". Sin datos: "Pronto verás aquí las prendas de la tienda.".
- Permisos en el servidor con el rol releído de la base (`getCurrentUser()` de `lib/auth/current-user.ts`). Colaborador: su tienda, el día, no cambia precios. Manager con tienda: solo esa tienda. Solo el owner anula y devuelve.
- No se guardan contactos de clientes; solo el alias opcional que ya existe.
- Migraciones solo con `prisma migrate`; el SQL lo genera Prisma (`npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script`, porque `migrate dev` pide TTY). **Este plan no necesita migraciones** (1.2 y 1.8 dicen "Sin migración").
- Repo público: ningún secreto, cadena de conexión ni teléfono real. En pruebas: `5210000000000` (y variantes `521000000000X`). La carpeta `.playwright-mcp/` nunca entra al repo.
- Móvil primero: objetivos táctiles ≥ 44 px, uso a 375 px, `prefers-reduced-motion` respetado, textos en español de México.
- Conventional Commits; cada quien commitea solo archivos de su zona (spec §3.1). Rama por tarea desde `feat/demo-alta-lote` (`feat/<tema>`; `feat/3d-<tema>` para la zona visual). Sin commits en `main`, sin `push` ni `--force` sin visto bueno del dueño.
- Terminado = evidencia pegada de `npx tsc --noEmit`, `npm test`, `npm run build` y, si se toca `lib/data` o `lib/sales`, `npm run test:db`. `npm run lint` se suma después de la Tarea 6.
- Congelamientos: Buen Fin (2026-11-13 a 11-16 [C]) y 2026-12-01 a 2027-01-06: no hay salida a producción salvo urgencias; el desarrollo en ramas sigue.

## Review Focus

Los cinco casos de spec §7. Cada uno tiene su prueba en la tarea dueña (marcadas "RF-n").

1. **RF-1. La última pieza se vende mientras un cliente mira o pregunta.** Ningún texto público promete; el mensaje pregunta "¿Sigue disponible?"; el bot dice que la tienda confirma; `/catalogo` sigue `force-dynamic`. Pruebas: Tarea 1, Tarea 2, Tarea 3.
2. **RF-2. Red lenta o recarga en `/pos` a media venta.** El carrito restaurado conserva el `clientRequestId` incierto; con precio cambiado, el colaborador ve "Solo el dueño o el encargado pueden cambiar el precio." y puede descartar. Pruebas: Tarea 12.
3. **RF-3. Un producto deja de ser público mientras está asignado o citado.** El punto desaparece y el resto sigue; agotado ≠ no público ("Agotado"); el bot da la respuesta neutral; el barrido nunca borra una foto referenciada. Pruebas: Tarea 11, Tarea 10, Tarea 8.
4. **RF-4. Más productos que puntos, o el mismo código en dos puntos.** La cuadrícula muestra todos; el recorrido pinta solo los asignados; asignar un código repetido se rechaza diciendo dónde está. Pruebas: Tarea 3, Tarea 8.
5. **RF-5. Tablet compartida o cambio de tienda a media jornada.** El borrador de un usuario no aparece a otro; un borrador de la tienda anterior se rechaza con "Solo puedes vender en tu tienda." sin descontar stock. Pruebas: Tarea 12.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `lib/public/whatsapp.ts` (nuevo) | número, mensaje y enlace de WhatsApp | 1 |
| `lib/public/urls.ts` (nuevo) | `CATALOG_URL` | 2 |
| `lib/public/tour-flag.ts` (nuevo) | si el recorrido se ofrece | 3 |
| `components/virtual-store/CatalogGrid.tsx` (nuevo) | cuadrícula de todos los productos públicos | 3, 17, 18 |
| `lib/virtual-store/types.ts` | contrato: `ZoneConfig`, `HotspotConfig`, `StoreConfig`, `HotspotAssignments`, `BoundHotspot` | 8 |
| `lib/virtual-store/store-config.ts` + `.json` | validador y datos de zonas y puntos | 8 |
| `lib/data/hotspot-assignments.ts` (nuevo) | lectura/validación del `AppSetting` `recorrido.puntos` | 8 |
| `app/recorrido/puntos/` (nuevo) | administración de puntos (owner) | 8 |
| `lib/image/derivatives.ts` (nuevo) | `publicImageAttrs`, `derivativeUrls` | 9 |
| `lib/image/encode.ts` (nuevo, navegador) | JPEG por ancho bajo peso meta | 9 |
| `lib/sales/sale-draft-storage.ts` (nuevo) | serializar/leer/borrar borradores de `/pos` | 12 |
| `components/sales/RefundSalePanel.tsx` (nuevo) | devolución parcial en `/ventas` | 14 |
| `prisma/scripts/sweep-orphan-blobs.ts` (nuevo) | barrido de blobs huérfanos | 11 |
| `.eslintrc.json` (nuevo) | lint con reglas de frontera | 6 |

---

# Fase 1. P0 de código (deben estar en `feat/demo-alta-lote` antes de la fase D)

### Tarea 1 (Claude): número de WhatsApp desde configuración (spec 0.4)

Toca `ProductHotspotModal.tsx` y `ProductCard3D.tsx` porque el número falso rompe la regla 4.

**Files:**
- Create: `lib/public/whatsapp.ts`, `lib/public/__tests__/whatsapp.test.ts`
- Modify: `components/virtual-store/ProductHotspotModal.tsx:27-31`, `components/products/ProductCard3D.tsx` (prop `waLink`)
- Test: `components/__tests__/VirtualStore.test.tsx`, `lib/__tests__/no-fake-number.test.ts` (nuevo)

**Interfaces:**
- Consumes: `PublicProduct` (`lib/data/public-projection.ts`).
- Produces:
  - `getWhatsAppNumber(): string | null` — lee `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER` en cada llamada (literal, para que Next lo incruste); acepta solo `^\d{10,15}$`.
  - `productInquiryMessage(p: PublicProduct, size?: string): string` — ≤ 300 caracteres, nombre recortado a 80.
  - `whatsAppLink(number: string, text: string): string` — `https://wa.me/${number}?text=${encodeURIComponent(text)}`.
  - `NO_WHATSAPP_TEXT = "Consulta disponibilidad en tienda."`
  - `ProductCard3D` prop `waLink: string | null` (null → muestra `NO_WHATSAPP_TEXT`, sin `<a>`).

- [ ] **Step 1: Pruebas del módulo puro** en `lib/public/__tests__/whatsapp.test.ts`:

```ts
const p: PublicProduct = { id: "prod-1", publicCode: "K7Q2M", title: "Playera Test", brand: "Nike", category: "Playeras",
  imageUrl: null, backImageUrl: null, sizes: [{ size: "M", available: true }], price: 350 };
it("sin variable devuelve null", () => { vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", ""); expect(getWhatsAppNumber()).toBeNull(); });
it.each(["52 1000 0000000", "52100000000a0", "123"])("rechaza %s", (v) => { vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", v); expect(getWhatsAppNumber()).toBeNull(); });
it("acepta 5210000000000", () => { vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "5210000000000"); expect(getWhatsAppNumber()).toBe("5210000000000"); });
it("mensaje con talla (RF-1)", () => expect(productInquiryMessage(p, "M"))
  .toBe("Hola, me interesa Nike Playera Test en talla M. ¿Sigue disponible? Código K7Q2M"));
it("mensaje sin talla", () => expect(productInquiryMessage(p))
  .toBe("Hola, me interesa Nike Playera Test. ¿Qué tallas tienen? Código K7Q2M"));
it("sin publicCode omite ' Código …'", () => expect(productInquiryMessage({ ...p, publicCode: null }, "M")).not.toMatch(/Código/));
it("recorta el nombre a 80 y el total a ≤ 300", () => {
  const m = productInquiryMessage({ ...p, title: "x".repeat(200) }, "M");
  expect(m).toContain("x".repeat(80)); expect(m).not.toContain("x".repeat(81)); expect(m.length).toBeLessThanOrEqual(300);
});
it("no contiene id ni promete apartado", () => { const m = productInquiryMessage(p, "M"); expect(m).not.toContain("prod-1"); expect(m).not.toMatch(/apart/i); });
it("arma el enlace", () => expect(whatsAppLink("5210000000000", "a b")).toBe("https://wa.me/5210000000000?text=a%20b"));
```

- [ ] **Step 2:** `npx vitest run lib/public/__tests__/whatsapp.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `lib/public/whatsapp.ts` con las tres funciones y la constante.
- [ ] **Step 4:** Mismo comando → PASS.
- [ ] **Step 5: Pruebas del modal** en `components/__tests__/VirtualStore.test.tsx` (usar `sampleProducts` y `bindProductsToHotspots` existentes):

```ts
it("sin número: no hay enlace wa.me y sí el texto", () => {
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "");
  const { container } = render(<ProductHotspotModal hotspot={bindProductsToHotspots(sampleProducts)[0]} onClose={() => {}} />);
  expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
  expect(screen.getByText("Consulta disponibilidad en tienda.")).toBeInTheDocument();
});
it("número inválido se comporta como sin número", () => { vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "52 1000 abc"); /* mismas aserciones */ });
it("número válido: href con Código y talla elegida, sin SKU, barcode ni id", () => {
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", "5210000000000");
  const { container } = render(<ProductHotspotModal hotspot={bindProductsToHotspots(sampleProducts)[0]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "L" }));
  const href = container.querySelector('a[href^="https://wa.me"]')!.getAttribute("href")!;
  expect(href.startsWith("https://wa.me/5210000000000?text=")).toBe(true);
  const text = decodeURIComponent(href.split("?text=")[1]);
  expect(text).toContain("Código K7Q2M"); expect(text).toContain("talla L");
  expect(text).not.toMatch(/LS-|sku|barcode|prod-1/i);
});
```

Y en `lib/__tests__/no-fake-number.test.ts` (entorno node): recorrer `app/`, `components/`, `lib/` (`fs.readdirSync` recursivo, `.ts`/`.tsx`) y esperar que ningún archivo contenga `"521" + "1234567890"` (se arma por partes para que la prueba no se encuentre a sí misma).

- [ ] **Step 6:** `npx vitest run components/__tests__/VirtualStore.test.tsx lib/__tests__/no-fake-number.test.ts` → FAIL (número falso presente).
- [ ] **Step 7:** En el modal: `const number = getWhatsAppNumber(); const waLink = number && product ? whatsAppLink(number, productInquiryMessage(product, currentSize?.size)) : null;`. En `ProductCard3D`, `waLink: string | null`; con `null` muestra el texto en lugar del botón. Borrar el texto viejo "Hola LoloShop, vi …". En `.env.example`, cambiar el ejemplo del comentario de `NEXT_PUBLIC_WHATSAPP_NUMBER` a `5210000000000`.
- [ ] **Step 8:** `npm test` → PASS; `npx tsc --noEmit` sin errores.
- [ ] **Step 9: Commit**

```bash
git add lib/public components/virtual-store/ProductHotspotModal.tsx components/products/ProductCard3D.tsx components/__tests__/VirtualStore.test.tsx lib/__tests__/no-fake-number.test.ts .env.example
git commit -m "feat(public): número de WhatsApp desde configuración y mensaje con código público"
```

### Tarea 2 (Claude): webhook con firma obligatoria y textos sin promesas (spec 0.7)

**Files:**
- Create: `lib/public/urls.ts`
- Modify: `app/api/whatsapp/webhook/route.ts`
- Test: `app/api/whatsapp/webhook/__tests__/route.test.ts`

**Interfaces:**
- Produces: `export const CATALOG_URL = "https://lolo-shop.vercel.app/catalogo";` en `lib/public/urls.ts` (no se exporta desde `route.ts`: un route handler solo exporta métodos HTTP).
- Contrato HTTP de `POST`: `NODE_ENV === "production"` y sin `WHATSAPP_APP_SECRET` → 503 sin procesar; firma ausente o inválida con secreto → 401; firma válida → 200. Fuera de producción sin secreto se sigue omitiendo con aviso (desarrollo). `GET` sin cambios.

- [ ] **Step 1: Pruebas.** Leer `process.env.WHATSAPP_APP_SECRET` y `NODE_ENV` dentro de `POST` (no al importar) para poder usar `vi.stubEnv`. Cambiar en el archivo el número del remitente a `5210000000000`. Agregar un helper `sign(body, secret)` con `crypto.createHmac("sha256", secret)`. Casos:

```ts
it("producción sin secreto: 503 y no envía nada", async () => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("WHATSAPP_APP_SECRET", "");
  const { res, logs } = await send("hola"); expect(res.status).toBe(503); expect(logs).toBe(""); });
it("firma inválida: 401", async () => { vi.stubEnv("WHATSAPP_APP_SECRET", "s3cr3t-de-prueba"); expect((await send("hola", { signature: "sha256=00" })).res.status).toBe(401); });
it("firma válida: 200", async () => { vi.stubEnv("WHATSAPP_APP_SECRET", "s3cr3t-de-prueba"); expect((await send("hola", { secret: "s3cr3t-de-prueba" })).res.status).toBe(200); });
it.each(["hola", "dónde están", "hacen envíos", "Quiero apartar. Código K7Q2M talla M", "Código K7Q2"])(
  "'%s': sin Tienda Principal, sin apart, sin promesa de envío, con CATALOG_URL donde hay enlace", async (t) => {
  const { logs } = await send(t);
  expect(logs).not.toContain("Tienda Principal"); expect(logs.toLowerCase()).not.toContain("apart");
  expect(logs).not.toMatch(/hacemos envíos|calculará automáticamente/i);
});
it("ubicación responde el texto nuevo", async () => expect((await send("dónde están")).logs)
  .toContain("Escríbenos el código de la prenda y la tienda te confirma por aquí."));
it("bienvenida usa CATALOG_URL", async () => expect((await send("hola")).logs).toContain(CATALOG_URL));
```

`send` devuelve `{ res, logs }` y acepta `{ signature?, secret? }` para poner `x-hub-signature-256`.

- [ ] **Step 2:** `npx vitest run app/api/whatsapp/webhook` → FAIL.
- [ ] **Step 3:** Implementar en `route.ts`: verificación al inicio de `POST` según el contrato; textos:
  - ubicación: `Escríbenos el código de la prenda y la tienda te confirma por aquí.`
  - envíos (decisión de este plan, regla 4): `La tienda te confirma por aquí las opciones de entrega. Escríbenos el código de la prenda.`
  - el confirmado por código ya no menciona apartado; la bienvenida y "no encontrado" usan `CATALOG_URL` importado.
- [ ] **Step 4:** Mismo comando → PASS; `npm test` en verde.
- [ ] **Step 5: Commit**

```bash
git add lib/public/urls.ts app/api/whatsapp/webhook
git commit -m "fix(webhook): firma de Meta obligatoria en producción y textos sin promesas"
```

### Tarea 3 (Claude): `/catalogo` sin datos de ejemplo y con todos los productos (spec 0.8)

Toca `VirtualStoreCatalog.tsx` y `app/catalogo/CatalogClient.tsx`; las Tareas 8, 17 y 18 parten de aquí. No borrar `zones.ts`. No quitar `force-dynamic`.

**Files:**
- Create: `lib/public/tour-flag.ts`, `components/virtual-store/CatalogGrid.tsx`, `lib/public/__tests__/tour-flag.test.ts`
- Modify: `components/virtual-store/VirtualStoreCatalog.tsx` (vista inicial, contador, grid de líneas 248-300), `components/virtual-store/ProductHotspotModal.tsx` (props), `app/catalogo/CatalogClient.tsx`, `.env.example`
- Test: `components/__tests__/CatalogGrid.test.tsx` (nuevo), `app/catalogo/__tests__/page.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `getWhatsAppNumber`, `whatsAppLink`, `productInquiryMessage` (Tarea 1).
- Produces:
  - `isTourEnabled(zones: ReadonlyArray<{ kind?: "virtual" | "real" }>): boolean` — `process.env.NEXT_PUBLIC_SALA_VIRTUAL === "1"` o alguna zona `kind === "real"`.
  - `CatalogGrid({ products, onSelect }: { products: PublicProduct[]; onSelect: (p: PublicProduct) => void })` — una tarjeta por producto (`<li>` en `<ul aria-label="Prendas">`); vacío → "Pronto verás aquí las prendas de la tienda.".
  - `ProductHotspotModal({ product, shelfLabel, onClose }: { product: PublicProduct | null; shelfLabel?: string; onClose: () => void })` — sin `shelfLabel` no muestra la etiqueta de repisa. El recorrido le pasa `hotspot.product` y `hotspot.shelfLabel`.
  - `VirtualStoreCatalog` abre en `"grid"`; con `isTourEnabled(STORE_ZONES) === false` no muestra el cambio de vista, "Ver en Recorrido 3D", el contador de puntos ni `CatalogDrawer`.

- [ ] **Step 1: Pruebas.** `twelve = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `p${i}`, publicCode: null, title: `Prenda ${i + 1}`, brand: "Marca Real", price: 101 + i }))`.

```ts
it("sin variable: 12 tarjetas, sin recorrido ni datos de DEFAULT_HOTSPOTS_CONFIG", () => {
  vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "");
  render(<VirtualStoreCatalog initialProducts={twelve} isLoggedIn={false} />);
  expect(within(screen.getByRole("list", { name: "Prendas" })).getAllByRole("listitem")).toHaveLength(12);
  expect(screen.queryByText(/Ver en Recorrido 3D/)).toBeNull();
  for (const h of DEFAULT_HOTSPOTS_CONFIG) for (const t of [h.shelfLabel, h.title, h.brand]) expect(screen.queryByText(t)).toBeNull();
  expect(screen.queryByText("LoloTech")).toBeNull();
});
it("con NEXT_PUBLIC_SALA_VIRTUAL=1 se ofrece el recorrido", () => { vi.stubEnv("NEXT_PUBLIC_SALA_VIRTUAL", "1"); render(/* … */);
  expect(screen.getAllByText(/Recorrido 3D/).length).toBeGreaterThan(0); });
it("sin productos: texto de vacío", () => { render(<VirtualStoreCatalog initialProducts={[]} isLoggedIn={false} />);
  expect(screen.getByText("Pronto verás aquí las prendas de la tienda.")).toBeInTheDocument(); });
it("el HTML no tiene SKU, barcode ni cifras de stock", () => { const { container } = render(/* twelve */);
  expect(container.innerHTML).not.toMatch(/LS-[A-Z0-9]|sku|barcode|piezas|existencias:/i); });
it("tocar una tarjeta abre el modal de ese producto, sin etiqueta de repisa", () => { /* click en "Prenda 3" → dialog con "Prenda 3"; sin "Maniquí" */ });
```

En `lib/public/__tests__/tour-flag.test.ts`: `[]` sin variable → false; con `"1"` → true; `[{ kind: "real" }]` sin variable → true; `[{ kind: "virtual" }]` → false.

En `app/catalogo/__tests__/page.test.tsx` (RF-1): `import * as page from "../page"; expect(page.dynamic).toBe("force-dynamic");`.

- [ ] **Step 2:** `npx vitest run components/__tests__/CatalogGrid.test.tsx lib/public app/catalogo` → FAIL.
- [ ] **Step 3:** Implementar `isTourEnabled`, `CatalogGrid` (la cuadrícula itera `products`, no `hotspots`; tarjeta con foto de frente, marca, título, precio; objetivo ≥ 44 px), el cambio de props del modal y el arranque en `"grid"`. Agregar a `.env.example` solo la línea `NEXT_PUBLIC_SALA_VIRTUAL=""` con el comentario "1 = ofrecer la sala virtual de prueba (solo previews)".
- [ ] **Step 4:** Las tres rutas → PASS; `npm test` (ajustar las pruebas viejas del modal a las props nuevas) y `npm run build` en verde.
- [ ] **Step 5: Commit**

```bash
git add lib/public components/virtual-store app/catalogo components/__tests__ .env.example
git commit -m "fix(catalogo): cuadrícula con todos los productos y sala virtual solo con bandera"
```

- [ ] **Step 6:** Pedir al dueño el visto bueno y juntar las ramas de las Tareas 1–3 con `feat/demo-alta-lote` (sin `push` hasta que lo autorice). Esto desbloquea la Fase 2.

---

# Fase 2. Salida a producción (sin código nuevo)

### Tarea 4 (Dueño + Claude): fase D, Preview contra `ventas-prueba` (spec 0.2)

**Files:** Modify: `docs/runbooks/2026-11-salida-ventas.md` (solo texto).

- [ ] **Step 1 (Claude):** en la guía, D.1: sumar `NEXT_PUBLIC_WHATSAPP_NUMBER` y "acotar todas las variables de Preview a la rama de Git `feat/demo-alta-lote`"; F.2: "**No correr**: producción ya tiene contraseñas propias (verificado 2026-11-09)"; F.7: `WHATSAPP_APP_SECRET` y `NEXT_PUBLIC_WHATSAPP_NUMBER` deben existir **antes del build**. Commit `docs(runbook): variables acotadas por rama y F.2 omitida`.
- [ ] **Step 2 (Dueño):** configurar Preview según D.1, acotado a la rama; nunca la conexión de producción; sin `DIRECT_URL`.
- [ ] **Step 3 (Dueño):** desplegar la rama (D.2). Esperado: build en verde.
- [ ] **Step 4 (Dueño + Claude):** Fase G en la URL del preview, más: el modal abre `wa.me/<número configurado>` con "Código …" (0.4); un POST al webhook sin firma responde 401 (0.7); `/catalogo` abre en cuadrícula con todos los productos y sin "Maniquí de Vitrina" (0.8).
- [ ] **Step 5 (Claude):** registrar en la guía la fecha y el id del deploy, sin valores.

### Tarea 5 (Dueño + Claude): fases E–G en producción (spec 0.3)

- [ ] **Step 1 (Dueño):** anotar el id del deploy de producción actual y quién autoriza el retroceso (sección "Retroceso").
- [ ] **Step 2 (Dueño):** Fase E firmada; confirmar que la ventana no cae en el Buen Fin (si cae, se pospone).
- [ ] **Step 3 (Dueño + Claude):** Fase F en orden, **saltando F.2**: F.1, F.3 (`No difference detected.`), F.4, F.5 (`Database schema is up to date!`), F.6 (mismas cifras que el ensayo), F.7 con `WHATSAPP_APP_SECRET` y `NEXT_PUBLIC_WHATSAPP_NUMBER` presentes antes del build, F.8.
- [ ] **Step 4 (Dueño + Claude):** Fase G completa y 10 minutos sin errores en Runtime Logs. Si falla, "Retroceso" opción 1 u 2 según la guía.
- [ ] **Step 5 (Claude):** "Limpieza al terminar" y la línea con fecha en `CLAUDE.md`/`AGENTS.md` ("módulo de ventas en producción"), sin valores. Commit `docs: módulo de ventas en producción`.

---

# Fase 3. P1, zona de Claude

Base: `main` después de la Tarea 5 (si aún no salió, `feat/demo-alta-lote`).

### Tarea 6 (Claude): ESLint como filtro con reglas de frontera (spec 1.12)

Va primero para que el resto de la fase pase por `npm run lint`.

**Files:**
- Create: `.eslintrc.json`, `lib/__tests__/eslint-boundaries.test.ts`
- Modify: `package.json` (devDependencies `eslint@8`, `eslint-config-next@14.2.35`, igual a `next`), `package-lock.json`

**Interfaces:**
- Produces: `npm run lint` (ya es `next lint`) sin preguntas y con salida 0 en la base. En `overrides` para `components/virtual-store/**`, `lib/virtual-store/**`, `app/catalogo/**`: `no-restricted-imports` con `paths` `@prisma/client` y `{ name: "@/lib/domain/types", importNames: ["Product"] }`, y `patterns` `@/lib/generated/prisma*`, `@/lib/data/prisma*`, con mensaje "Lo público usa solo PublicProduct (spec §2.3)".

- [ ] **Step 1: Prueba** (`// @vitest-environment node`):

```ts
const eslint = new ESLint({ cwd: process.cwd() });
it.each([
  'import { PrismaClient } from "@prisma/client";',
  'import prisma from "@/lib/data/prisma-source";',
  'import type { Product } from "@/lib/domain/types";',
])("en components/virtual-store/ falla: %s", async (code) => {
  const [r] = await eslint.lintText(code + "\nexport {};\n", { filePath: "components/virtual-store/X.tsx" });
  expect(r.messages.some((m) => m.ruleId === "no-restricted-imports" && m.severity === 2)).toBe(true);
});
it("fuera de la zona pública se permite", async () => {
  const [r] = await eslint.lintText('import { PrismaClient } from "@prisma/client";\nexport {};\n', { filePath: "lib/data/X.ts" });
  expect(r.messages.filter((m) => m.ruleId === "no-restricted-imports")).toHaveLength(0);
});
it("PublicProduct sí se permite en la zona pública", async () => { /* import type { PublicProduct } from "@/lib/data/public-projection" → 0 mensajes de la regla */ });
```

- [ ] **Step 2:** `npx vitest run lib/__tests__/eslint-boundaries.test.ts` → FAIL (sin ESLint).
- [ ] **Step 3:** `npm i -D eslint@8 eslint-config-next@14.2.35`; crear `.eslintrc.json` con `extends: "next/core-web-vitals"` y los `overrides`.
- [ ] **Step 4:** Prueba → PASS. `npm run lint` → salida 0. Arreglar los errores puntuales; en la zona visual **no reformatear en masa** (spec 1.12): si falla, bajar la regla a `warn` para esa carpeta y anotarlo en el PR. Cada `eslint-disable-next-line` lleva `-- <motivo>`.
- [ ] **Step 5: Commit** `chore(lint): ESLint 8 como filtro con fronteras de lo público`.

### Tarea 7 (Claude): departamento en `PublicProduct` (spec 1.1, contrato)

**Files:**
- Modify: `lib/domain/types.ts` (`Product`), `lib/data/prisma-source.ts:47-80` (`getProducts`), `lib/data/fixture-source.ts`, `lib/data/fixtures.ts`, `lib/data/public-projection.ts`, `docs/superpowers/specs/2026-11-09-loloshop-implementaciones-posteriores-design.md` §3.2
- Test: `lib/data/__tests__/public-projection.test.ts`, `lib/data/__tests__/prisma-get-products.test.ts` (nuevo, mock de `../../prisma` como `prisma-create-product.test.ts`), `lib/data/__tests__/fixture-source.test.ts`

**Interfaces:**
- Produces:
  - `Product.department?: { slug: string; name: string; sortOrder: number; isActive: boolean } | null`
  - `PublicProduct.department: { slug: string; name: string; sortOrder: number } | null` (inactivo → `null`).
  - `FIXTURE_DEPARTMENTS` en `fixtures.ts`: los 5 del seed (`dama` 1, `caballero` 2, `ninos` 3, `calzado` 4, `accesorios` 5) con ids `dep-<slug>`; un `departmentId` desconocido → `null`.

- [ ] **Step 1: Pruebas:**

```ts
it("las claves de PublicProduct son exactamente las del contrato", () => {
  expect(Object.keys(toPublicProduct(prod, stores)).sort()).toEqual(
    ["backImageUrl","brand","category","department","id","imageUrl","price","publicCode","sizes","title"]);
});
it("proyecta el departamento sin isActive", () => expect(toPublicProduct({ ...prod, department: { slug: "calzado", name: "Calzado", sortOrder: 4, isActive: true } }, stores).department)
  .toEqual({ slug: "calzado", name: "Calzado", sortOrder: 4 }));
it("departamento inactivo → null", () => { /* isActive: false → department null */ });
// prisma-get-products.test.ts
it("getProducts incluye department en el include y lo mapea", async () => { /* findMany llamado con include.department === true; resultado con department */ });
// fixture-source.test.ts
it("createProduct con departmentId dep-dama devuelve department Dama; con 'd' → null", async () => { /* … */ });
```

- [ ] **Step 2:** `npx vitest run lib/data` → FAIL.
- [ ] **Step 3:** Implementar en los cuatro archivos; actualizar la copia de §3.2 del spec (sumar `department`).
- [ ] **Step 4:** `npx vitest run lib/data` → PASS; `npm test`, `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 5: Commit** `feat(public): departamento en PublicProduct`. La Tarea 17 queda desbloqueada.

### Tarea 8 (Claude): zonas y puntos en `store-config.json`, asignación por código y administración (spec 1.2)

La configuración real (validador y JSON) va primero y la asignación se monta encima, así que no hace falta andamio. La tarea cierra con dos commits: Parte A (configuración y recorrido) y Parte B (asignación y página del dueño).

**Files:**
- Modify: `lib/virtual-store/types.ts`, `lib/virtual-store/zones.ts` (`bindProductsToHotspots`; deja de exportar `DEFAULT_HOTSPOTS_CONFIG`), `components/virtual-store/VirtualStoreCatalog.tsx`, `VirtualStoreCanvas.tsx`, `StoreMinimap.tsx`, `CatalogDrawer.tsx` (de `StoreHotspot` a `BoundHotspot`; quitar `StoreHotspot` cuando nadie lo use), `app/catalogo/page.tsx`, `app/catalogo/CatalogClient.tsx` (prop `assignments`)
- Create: `lib/virtual-store/store-config.ts`, `lib/virtual-store/store-config.json`, `lib/data/hotspot-assignments.ts`, `lib/catalog/hotspot-actions.ts`, `app/recorrido/puntos/page.tsx`, `app/recorrido/puntos/HotspotAssignmentsForm.tsx`
- Test: `lib/virtual-store/__tests__/store-config.test.ts` (nuevo), `lib/virtual-store/__tests__/zones.test.ts`, `components/__tests__/VirtualStore.test.tsx`, `lib/data/__tests__/hotspot-assignments.test.ts`, `lib/catalog/__tests__/hotspot-actions.test.ts`, `app/recorrido/puntos/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `PublicProduct.department` (Tarea 7), `isTourEnabled` (Tarea 3), `normalizePublicCode` (`lib/domain/public-code.ts`), `getPublicCatalog`.
- Produces:

```ts
// lib/virtual-store/types.ts
export type StoreSlug = "lomas" | "clubalva";
export type ZoneConfig = StoreZone & { kind: "virtual" | "real"; categories: string[]; departments: string[]; panoramaUrl?: string };
export interface HotspotConfig { id: string; zoneId: string; yaw: number; pitch: number; shelfLabel: string }
export interface StoreConfig { version: 1; stores: { slug: StoreSlug; label: string; zones: ZoneConfig[]; hotspots: HotspotConfig[] }[] }
/** id de punto → publicCode. */
export type HotspotAssignments = Record<string, string>;
export type BoundHotspot = HotspotConfig & { product: PublicProduct };
```

  - `parseStoreConfig(raw: unknown): StoreConfig` — lanza `Error` con el motivo; `getStoreConfig(): StoreConfig` lo aplica al JSON.
  - JSON: las 4 zonas actuales de `STORE_ZONES` pasan a `stores[slug="lomas", label="LoloShop_Lomas"]` con `kind: "virtual"`, con sus puntos **sin** título, marca, precio ni imagen; `stores[slug="clubalva", label="LoloShop_ClubAlva"]` sin zonas.
  - `bindProductsToHotspots(products: PublicProduct[], hotspots: HotspotConfig[], assignments: HotspotAssignments): BoundHotspot[]` — por `publicCode`; un punto sin código o con un código que no está en `products` no se pinta.
  - `productsForZone(products: PublicProduct[], zone: ZoneConfig): PublicProduct[]` — `category ∈ zone.categories` o `department?.slug ∈ zone.departments`.
  - `HOTSPOT_ASSIGNMENTS_KEY = "recorrido.puntos"`
  - `parseHotspotAssignments(value: unknown): HotspotAssignments` — descarta claves no string y valores que no cumplen `^[0-9A-HJKMNP-TV-Z]{5}$`.
  - `getHotspotAssignments(): Promise<HotspotAssignments>` — lee el `AppSetting` en cada llamada (sin caché).
  - `hotspotLabel(config: StoreConfig, hotspotId: string): string | null` — `"<store.label> › <zone.name> › <shelfLabel>"`.
  - `setHotspotAssignmentAction(hotspotId: string, publicCode: string | null): Promise<{ ok: true; assignments: HotspotAssignments } | { ok: false; code: "FORBIDDEN" | "INVALID"; message: string }>`. **Sin migración.**
  - `VirtualStoreCatalog` y `CatalogClient` reciben `assignments: HotspotAssignments`.

**Parte A. Configuración y recorrido**

- [ ] **Step 1: Pruebas:**

```ts
it("3 puntos, asignaciones para 2 (una a un código no público): se pinta 1 (RF-3, RF-4)", () => {
  expect(bindProductsToHotspots([pK7Q2M], [h1, h2, h3], { h1: "K7Q2M", h2: "ZZZZ9" }).map((b) => b.id)).toEqual(["h1"]);
});
it("el orden de products no cambia el resultado", () => { /* [a, b] y [b, a] → mismo resultado */ });
it("dos valores de asignaciones con la misma config dan dos recorridos distintos", () => { /* { h1: A } vs { h1: B } */ });
it("un producto agotado sigue pintado y el modal dice 'Agotado' (RF-3)", () => { /* sizes todas available:false */ });
it.each([
  ["ids repetidos", dupIds], ["zoneId inexistente", badZone], ["yaw 181", yaw181], ["pitch -91", pitchM91],
  ...["title", "price", "brand", "imageUrl"].map((k) => [`punto con ${k}`, withKey(k)]),
])("validador rechaza %s", (_, raw) => expect(() => parseStoreConfig(raw)).toThrow());
it("el store-config.json del repo es válido y sus puntos no traen productId", () => { /* parseStoreConfig(json); JSON.stringify sin "productId" */ });
it("productsForZone por categoría o departamento", () => { /* … */ });
it("sin NEXT_PUBLIC_SALA_VIRTUAL solo se listan zonas kind 'real'", () => { /* render del recorrido con una zona real y una virtual */ });
it("la vista Lista de una zona muestra su sección sin decir 'en esta repisa'", () => { /* … */ });
it("el recorrido no muestra SKU, barcode ni conteos", () => { /* innerHTML */ });
```

- [ ] **Step 2:** `npx vitest run lib/virtual-store components/__tests__/VirtualStore.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar los tipos, `store-config.ts`, el JSON, `bind` y `productsForZone`. `VirtualStoreCatalog` usa `getStoreConfig()`, `isTourEnabled(zones)` y `bindProductsToHotspots(products, hotspots, assignments)`; sin la bandera solo ofrece zonas `kind: "real"`. Nunca asignar por orden ni por categoría a un punto concreto. No guardar `productId` en el JSON.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** `feat(recorrido): zonas y puntos en store-config.json con asignación por código`.

**Parte B. Asignación en `AppSetting` y página del dueño**

- [ ] **Step 6: Pruebas** (mock de `@/lib/prisma`, `@/lib/auth/current-user`, `@/lib/data/get-source`, `next/cache`; `getStoreConfig` mockeado con un config de prueba de 3 puntos `h1`, `h2`, `h3`):

```ts
it("parse descarta lo inválido", () => expect(parseHotspotAssignments({ h1: "K7Q2M", h2: "kk", h3: 5, h4: "K7Q2I" })).toEqual({ h1: "K7Q2M" }));
it("parse de algo que no es objeto → {}", () => expect(parseHotspotAssignments("x")).toEqual({}));
it("hotspotLabel arma Tienda › Zona › Repisa", () => expect(hotspotLabel(cfg, "h2")).toBe("LoloShop_Lomas › Dama › Repisa 2"));
it.each(["manager", "collaborator"])("%s recibe FORBIDDEN", async (role) => { as(role); expect((await setHotspotAssignmentAction("h1", "K7Q2M")).code).toBe("FORBIDDEN"); });
it("JWT de owner con rol colaborador en la base: FORBIDDEN", async () => { getCurrentUser.mockResolvedValue({ id: "u1", role: "collaborator", locationId: "l1" }); /* FORBIDDEN */ });
it("sin sesión: FORBIDDEN, no lanza", async () => { getCurrentUser.mockRejectedValue(new UnauthenticatedError("x")); /* FORBIDDEN */ });
it("punto inexistente: INVALID", async () => { as("owner"); expect((await setHotspotAssignmentAction("zz", "K7Q2M")).code).toBe("INVALID"); });
it("código inexistente o de solo stock: INVALID", async () => { /* catálogo público sin ese código */ });
it("código ya en otro punto: INVALID con el nombre del punto (RF-4)", async () => {
  appSetting({ h1: "K7Q2M" }); const r = await setHotspotAssignmentAction("h2", "K7Q2M");
  expect(r).toMatchObject({ ok: false, code: "INVALID" }); expect((r as { message: string }).message).toContain("LoloShop_Lomas › Dama › Repisa 1");
});
it("asigna (normaliza minúsculas) y hace upsert con updatedById", async () => { /* "k7q2m" → { h1: "K7Q2M" }; revalidatePath("/catalogo") */ });
it("null quita la asignación", async () => { appSetting({ h1: "K7Q2M" }); expect(await setHotspotAssignmentAction("h1", null)).toEqual({ ok: true, assignments: {} }); });
it("getHotspotAssignments lee la base en cada llamada", async () => { /* dos valores distintos de findUnique → dos resultados distintos */ });
// page.test.tsx
it("owner ve cada punto como Tienda › Zona › Repisa con su código", async () => { /* … */ });
it("no-owner ve 'Solo el dueño puede asignar prendas a los puntos.'", async () => { /* … */ });
it("sin puntos configurados: 'Aún no hay puntos en el recorrido.'", async () => { /* config sin puntos */ });
```

- [ ] **Step 7:** `npx vitest run lib/data/__tests__/hotspot-assignments.test.ts lib/catalog/__tests__/hotspot-actions.test.ts app/recorrido` → FAIL.
- [ ] **Step 8:** Implementar. La acción: rol releído; `hotspotLabel(getStoreConfig(), id)` no nulo; `normalizePublicCode` + regex; el código está en `getPublicCatalog(getDataSource())`; no está en otro punto; `prisma.appSetting.upsert({ where: { key }, create: { key, value, updatedById }, update: { value, updatedById } })`; `revalidatePath("/catalogo")`. La página: server component con `getCurrentUser()`, lista agrupada por tienda y zona, un campo de código por punto (≥ 44 px), botones "Guardar" y "Quitar", errores en `role="alert"`. `/recorrido/*` ya queda protegido por `middleware.ts`. `app/catalogo/page.tsx`: `Promise.all([fetchPublicProductsAction(), getHotspotAssignments().catch(() => ({}))])` y pasa `assignments` a `CatalogClient` → `VirtualStoreCatalog`.
- [ ] **Step 9:** Mismo comando → PASS; `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 10: Commit** `feat(recorrido): asignación de prenda por punto en AppSetting y página del dueño`.

### Tarea 9 (Claude): derivados de imagen (spec 1.5)

**Files:**
- Create: `lib/image/derivatives.ts`, `lib/image/encode.ts`, `lib/image/__tests__/derivatives.test.ts`
- Modify: `lib/image/process.ts` (constantes y tipo), `lib/image/upload.ts`, `lib/actions.ts:269-312` (`uploadProductImageAction`, `updateProductImageAction`), `components/products/ProductPhotoCapture.tsx`, `components/products/NewProductForm.tsx:38-47`, `components/products/ProductPhotoButton.tsx`
- Test: `lib/image/__tests__/upload.test.ts`, `components/__tests__/ProductPhotoCapture.test.tsx`

**Interfaces:**
- Produces:
  - `DERIVATIVE_WIDTHS = [200, 400, 600, 800] as const`; `type DerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number]`
  - `DERIVATIVE_TARGET_BYTES: Record<DerivativeWidth, number> = { 200: 12 * 1024, 400: 35 * 1024, 600: 60 * 1024, 800: 110 * 1024 }`; tolerancia del servidor `1.5 ×`.
  - `interface CapturedPhoto { master: File; derivatives: Partial<Record<DerivativeWidth, File>> }` — `ProductPhotoCapture.onCapture(photo: CapturedPhoto)`. Si el recorte mide < 800 px, `derivatives` va vacío (no se escala hacia arriba) y la subida es la de siempre.
  - FormData: `image` (maestra) y `w200`, `w400`, `w600`, `w800`. Ninguno → subida antigua `productos/<nombre>` (clientes con la PWA vieja). Los cuatro → `productos/v2/<base>.jpg` y `productos/v2/<base>-w<ancho>.jpg`, nombres fijados por el servidor. Cualquier otro subconjunto → error.
  - `uploadImageSet(master: File, derivatives: Record<DerivativeWidth, File>): Promise<string>` en `upload.ts` — valida todo antes de subir; si un `put` falla, `del` de lo ya subido; devuelve la URL de la maestra.
  - `readImageUpload(formData: FormData): Promise<string>` en `upload.ts` — decide antigua/v2; lo usan las dos acciones.
  - `publicImageAttrs(url: string, context: "grid" | "hotspot" | "modal"): { src: string; srcSet?: string; sizes?: string }`
  - `derivativeUrls(url: string): string[]` — las 4 URLs `-w<n>` de una maestra `v2`; `[]` para cualquier otra.
  - `encodeJpegUnder(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob>` en `encode.ts` — calidades 0.8, 0.7, 0.6, 0.5, 0.4; devuelve la primera bajo `maxBytes` o la última.

- [ ] **Step 1: Pruebas** (`derivatives.test.ts`, `V2 = "https://abc.public.blob.vercel-storage.com/productos/v2/123-ab.jpg"`):

```ts
it("grid con v2: srcSet w400, w600, w800 y sizes de 2, 3 y 4 columnas", () => {
  const a = publicImageAttrs(V2, "grid");
  expect(a.src).toBe(V2.replace(".jpg", "-w400.jpg"));
  expect(a.srcSet).toBe(["400","600","800"].map((w) => `${V2.replace(".jpg", `-w${w}.jpg`)} ${w}w`).join(", "));
  expect(a.sizes).toBe("(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw");
});
it("hotspot con v2: solo src w200", () => expect(publicImageAttrs(V2, "hotspot")).toEqual({ src: V2.replace(".jpg", "-w200.jpg") }));
it("modal con v2: w600, w800 y maestra 1080w", () => { const a = publicImageAttrs(V2, "modal");
  expect(a.srcSet).toContain("-w600.jpg 600w"); expect(a.srcSet).toContain(`${V2} 1080w`); expect(a.sizes).toBe("(min-width: 640px) 512px, 100vw"); });
it("URL antigua devuelve solo src", () => { const u = "https://abc.public.blob.vercel-storage.com/productos/1-x.jpg"; expect(publicImageAttrs(u, "grid")).toEqual({ src: u }); });
it("URL que no es de Blob no se transforma", () => expect(publicImageAttrs("https://example.com/productos/v2/a.jpg", "grid")).toEqual({ src: "https://example.com/productos/v2/a.jpg" }));
it("derivativeUrls", () => { expect(derivativeUrls(V2)).toHaveLength(4); expect(derivativeUrls("https://example.com/a.jpg")).toEqual([]); });
```

En `upload.test.ts` (mock de `@vercel/blob` `put`/`del`):

```ts
it("cinco put con el mismo <base> bajo productos/v2/", async () => {
  await uploadImageSet(jpeg(500_000), { 200: jpeg(10_000), 400: jpeg(30_000), 600: jpeg(50_000), 800: jpeg(100_000) });
  const names = put.mock.calls.map((c) => c[0] as string);
  expect(names).toHaveLength(5);
  const base = names[0].match(/^productos\/v2\/([^/]+)\.jpg$/)![1];
  expect(names.sort()).toEqual([`productos/v2/${base}.jpg`, ...[200,400,600,800].map((w) => `productos/v2/${base}-w${w}.jpg`)].sort());
});
it("derivado > 1.5 × meta: rechaza sin ningún put", async () => { /* 200: jpeg(12 * 1024 * 1.5 + 1) → ImageUploadError; put no llamado */ });
it("derivado que no es JPEG: rechaza sin ningún put", async () => { /* type image/png */ });
it("si el tercer put falla, borra los dos subidos y lanza", async () => { /* del llamado con las 2 URLs */ });
it("FormData con solo image: subida antigua productos/<nombre>", async () => { /* readImageUpload */ });
it("FormData con w200 y w400 nada más: ImageUploadError", async () => { /* … */ });
```

En `ProductPhotoCapture.test.tsx` (con los mocks de canvas/`createImageBitmap` que ya usa): imagen de 2000×1500 → `onCapture` recibe `master` JPEG y `derivatives` con claves `200, 400, 600, 800`; imagen de 700×700 → `derivatives` vacío.

- [ ] **Step 2:** `npx vitest run lib/image components/__tests__/ProductPhotoCapture.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. La captura dibuja la maestra como hoy (1080, JPEG, ≤ 1 MB, auto-niveles) y, si el recorte mide ≥ 800, cada derivado reduciendo **desde la maestra** con `encodeJpegUnder(canvas, DERIVATIVE_TARGET_BYTES[w])`. `NewProductForm.uploadPhoto` y `ProductPhotoButton` agregan `w<n>` al FormData. Sin columnas nuevas, sin `next/image`.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 5 (M):** en Chrome con Slow 4G, una tarjeta de cuadrícula pesa ≤ 35 KB y un punto ≤ 12 KB (después de la Tarea 18). Anotarlo en el PR.
- [ ] **Step 6: Commit** `feat(image): derivados JPEG 200–800 px y publicImageAttrs`. La Tarea 18 queda desbloqueada.

### Tarea 10 (Claude): el bot y los artículos de solo stock (spec 1.6, por omisión)

Se construye la propuesta del spec §5.1 (el bot no los conoce). `BOT_STOCK_ONLY_LOOKUP` queda fuera hasta que el dueño diga que sí.

**Files:** Modify: `app/api/whatsapp/webhook/route.ts`. Test: `app/api/whatsapp/webhook/__tests__/route.test.ts`, `app/api/bot/products/__tests__/route.test.ts`.

**Interfaces:** `NEUTRAL_REPLY = "La tienda te confirma por aquí si lo tenemos."` (constante interna de `route.ts`). **Decisión:** se usa también para un código de formato válido que no existe; si no, "no encontrado" frente a "neutral" delataría que el código existe.

- [ ] **Step 1: Pruebas** (crear en el fixture un producto activo `QX3V7` sin `backImageUrl`):

```ts
it("código de solo stock: respuesta neutral, sin talla ni disponibilidad (RF-3)", async () => {
  const out = await send("Código QX3V7 talla M");
  expect(out).toContain("La tienda te confirma por aquí si lo tenemos."); expect(out).not.toMatch(/talla M|disponible/i);
});
it("código inexistente da exactamente la misma respuesta", async () => expect(await send("Código ZZZZ9 talla M")).toBe(await send("Código QX3V7 talla M")));
it("un producto que dejó de ser público (desactivado) da la neutral", async () => { /* desactivar K7Q2M → neutral */ });
// bot/products
it("/api/bot/products no lista el producto de solo stock", async () => { /* respuesta sin QX3V7 */ });
```

- [ ] **Step 2:** `npx vitest run app/api` → FAIL.
- [ ] **Step 3:** En `processMessage`, la rama "no encontrado" responde `NEUTRAL_REPLY`.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`.
- [ ] **Step 5: Commit** `fix(webhook): respuesta neutral para códigos no públicos`.

### Tarea 11 (Claude): blobs huérfanos (spec 1.11)

**Files:**
- Create: `prisma/scripts/sweep-orphan-blobs.ts`, `prisma/scripts/__tests__/sweep-orphan-blobs.test.ts`
- Modify: `lib/image/upload.ts`, `lib/actions.ts:150-265` (`createProductAction`; quitar el `TODO(alta-lote…)`)
- Test: `lib/__tests__/actions-create-product.test.ts`

**Interfaces:**
- Consumes: `derivativeUrls(url)`, `isProductBlobUrl(url)` (Tarea 9, `lib/image/blob-url.ts`).
- Produces:
  - `deleteUnreferencedImages(urls: (string | null | undefined)[]): Promise<void>` en `upload.ts` — filtra `isProductBlobUrl`; descarta las que usa algún `Product` (`imageUrl` o `backImageUrl`); `del([...url, ...derivativeUrls(url)])`; nunca lanza (registra con `console.error`).
  - `planSweep(blobs: { url: string; uploadedAt: Date }[], referenced: ReadonlySet<string>, now: Date): string[]` — URLs a borrar: no referenciadas (el conjunto incluye los derivados de cada referenciada) y con más de 24 h.
  - `main(argv: string[]): Promise<void>` — `list({ prefix: "productos/", cursor })` paginado; sin `--apply` imprime; con `--apply` hace `del`. Lo corre el dueño con su `.env` local.

- [ ] **Step 1: Pruebas:**

```ts
// actions-create-product.test.ts (con Blob simulado)
it("si el alta falla después de subir, borra maestras y derivados", async () => { /* ds.createProduct lanza; del llamado con front, back y sus 4 -w<n> */ });
it("no borra una URL que ya usa otro producto", async () => { /* product.count → 1 para front */ });
it("si del falla, el mensaje al usuario no cambia", async () => { /* message === "No se pudo guardar el producto. Revisa tu conexión e intenta de nuevo." */ });
// sweep-orphan-blobs.test.ts
const now = new Date("2026-11-20T12:00:00Z"); const h = (n: number) => new Date(now.getTime() - n * 3600_000);
it("no borra lo referenciado ni sus derivados (RF-3)", () => expect(planSweep([{ url: REF, uploadedAt: h(100) }, { url: REF.replace(".jpg", "-w400.jpg"), uploadedAt: h(100) }], new Set([REF]), now)).toEqual([]));
it("un huérfano de 25 h se planea; uno de 2 h nunca", () => expect(planSweep([{ url: O25, uploadedAt: h(25) }, { url: O2, uploadedAt: h(2) }], new Set(), now)).toEqual([O25]));
it("sin --apply no llama a del; con --apply sí", async () => { /* mocks de list/del y prisma */ });
```

- [ ] **Step 2:** `npx vitest run lib/__tests__/actions-create-product.test.ts prisma/scripts` → FAIL.
- [ ] **Step 3:** Implementar; en `createProductAction`, llamar `await deleteUnreferencedImages([input.imageUrl, input.backImageUrl])` en cada salida `ok: false` después de validar la sesión y en el `catch` (el formulario vuelve a subir en cada intento, así que borrar es seguro). No exponer ninguna acción "borrar por URL".
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** `feat(image): limpieza de fotos de altas fallidas y barrido de huérfanos`.

### Tarea 12 (Claude): carrito de `/pos` que sobrevive a una recarga (spec 1.7)

**Files:**
- Create: `lib/sales/sale-draft-storage.ts`
- Modify: `lib/sales/use-sale-draft.ts`, `app/pos/page.tsx`, `components/layout/NavBar.tsx:52,97`
- Test: `lib/sales/__tests__/use-sale-draft.test.ts`, `components/__tests__/PosPage.test.tsx`, `components/__tests__/NavBar.test.tsx`

**Interfaces:**
- Consumes: `businessDateMx(at: Date): string` (`lib/domain/sale.ts`).
- Produces:
  - `DRAFT_KEY_PREFIX = "loloshop.pos.borrador."`; `draftKey(userId: string): string` → `loloshop.pos.borrador.v1:<userId>`.
  - `interface DraftContext { locationId: string; channel: SaleChannel; paymentMethod: PaymentMethod }`
  - `interface StoredDraft extends DraftContext { v: 1; userId: string; businessDate: string; lines: DraftLine[]; clientRequestId: string; uncertain: boolean; rejectedSignature: string | null; savedAt: string }` — **nunca** `customerAlias` ni `paymentReference`.
  - `readDraft(storage: Storage | null, userId: string, today: string): StoredDraft | null` — borra la clave si no coincide `userId`/`businessDate`, no hay renglones, `v !== 1` o el JSON está corrupto; nunca lanza.
  - `writeDraft(storage: Storage | null, d: StoredDraft): void` y `clearAllDrafts(storage: Storage | null): void` — tragan excepciones (modo privado, cuota).
  - `useSaleDraft(opts?: { userId?: string | null; context?: DraftContext; storage?: Storage | null; now?: () => Date })` devuelve lo de hoy más `restored: { pieces: number; context: DraftContext } | null`. Sin `userId` no guarda. `reset()` borra la clave.

- [ ] **Step 1: Pruebas** (`renderHook` con un `Storage` en memoria; `now` fijo a `2026-11-20T18:00:00Z`):

```ts
it("2 renglones, desmontar y montar con el mismo usuario: mismos renglones y mismo clientRequestId", () => { /* … */ });
it("con uncertain guardado, requestIdFor(otraFirma) devuelve el mismo id (RF-2)", () => { /* … */ });
it("otro userId empieza vacío y la clave ajena queda intacta (RF-5)", () => { /* … */ });
it("businessDate de ayer empieza vacío y borra la clave", () => { /* … */ });
it.each(["{", JSON.stringify({ v: 2 })])("JSON %s empieza vacío sin excepción", (raw) => { /* … */ });
it("lo guardado no contiene customerAlias ni paymentReference", () => { /* JSON.parse(storage.getItem(key)) sin esas claves */ });
it("si localStorage lanza, el hook funciona sin guardar", () => { /* setItem/getItem lanzan; add() sigue funcionando */ });
it("restored informa piezas (suma de cantidades) y contexto", () => { /* 2 líneas qty 1 y 2 → pieces 3 */ });
// NavBar.test.tsx
it("cerrar sesión borra todas las claves loloshop.pos.borrador.*", () => { /* dos claves de usuarios distintos + otra ajena: quedan solo la ajena */ });
// PosPage.test.tsx
it("al volver muestra 'Recuperamos la venta en curso (3 prendas).' y Descartar vacía el carrito", async () => { /* … */ });
it("colaborador con borrador de otra tienda: cobra con esa tienda y ve 'Solo puedes vender en tu tienda.' (RF-5)", async () => {
  /* borrador locationId "A", sesión colab locationId "B"; createSaleAction mock → { ok:false, code:"FORBIDDEN", message:"Solo puedes vender en tu tienda." };
     expect(createSaleAction).toHaveBeenCalledWith(expect.objectContaining({ locationId: "A" })); mensaje visible; botón Descartar */
});
it("precio cambiado: colaborador ve el mensaje del servidor y puede descartar (RF-2)", async () => { /* INVALID "Solo el dueño o el encargado pueden cambiar el precio." */ });
```

- [ ] **Step 2:** `npx vitest run lib/sales/__tests__/use-sale-draft.test.ts components/__tests__/PosPage.test.tsx components/__tests__/NavBar.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. El hook restaura en el primer render con `userId` (lazy init de `useState` y de los `ref`), guarda en cada cambio de `lines`, id, `uncertain`, rechazo o `context`. `/pos` pasa `userId` y `context`; con `restored`, aplica el contexto (para el colaborador, el `locationId` del borrador manda en el próximo cobro hasta "Descartar") y muestra el aviso en `role="status"` con "Descartar" (≥ 44 px). `NavBar` llama `clearAllDrafts(window.localStorage)` antes de `signOut`. Nada se guarda en el servidor.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** `feat(pos): borrador de venta en localStorage por usuario y día`.

### Tarea 13 (Claude): devoluciones parciales, capa de datos y dashboard (spec 1.8)

**Files:**
- Modify: `lib/data/sales-source.ts`, `lib/data/prisma-sales-source.ts` (nuevo `refundLines`, `getSaleByNumber`; `getDashboard` líneas ~255-360), `lib/data/fixture-sales-source.ts`, `lib/domain/dashboard-scope.ts`
- Test: `lib/data/__tests__/prisma-refund.db.test.ts` (nuevo), `lib/data/__tests__/prisma-dashboard.db.test.ts`, `lib/data/__tests__/fixture-sales.test.ts`, `lib/domain/__tests__/dashboard-scope.test.ts`

**Interfaces:**
- Produces:
  - `interface RefundLineInput { variantId: string; quantity: number; expectedReturned: number }`
  - `SalesDataSource.refundLines(saleId: string, userId: string, lines: RefundLineInput[], reason: string): Promise<SaleRecord>` — una transacción, renglones ordenados por `variantId`. Por renglón: si `expectedReturned + n > quantity` → `SalesRuleError("No puedes devolver más piezas de las vendidas.")`; `saleLine.updateMany({ where: { saleId, variantId, returnedQuantity: expectedReturned, quantity: { gte: expectedReturned + n } }, data: { returnedQuantity: { increment: n } } })`; `count === 0` → `SalesRuleError("Esta devolución ya se registró o la venta cambió; recarga.")` (revierte todo). Luego `inventoryLevel` `increment n` en la tienda de la venta y `Movement` `RETURN +n` con `saleId`, `userId`, `notes = reason`. Todo devuelto → `status = refunded`. Venta `pending_payment` → `SalesRuleError("Anula la venta en su lugar.")`; `cancelled`/`refunded` → `SalesRuleError("Solo se devuelven prendas de una venta pagada.")`. No toca `Sale.total`. **Sin migración.**
  - `SaleDetail { id; number; status; locationId; lines: { variantId; productTitle; size; quantity; returnedQuantity; unitPrice }[] }`; `SalesDataSource.getSaleByNumber(number: number): Promise<SaleDetail | null>`.
  - `DashboardQuery.returnsDate?: string` (lo fija `scopeDashboardQuery` con el día de hoy) y `DashboardData.returnsToday: number` — Σ `Movement RETURN` de ese día × `unitPrice` del renglón, de ventas no `cancelled`.
  - Importes del dashboard (`soldTotal`, `collectedTotal`, `byDay`, `byLocation`, `byChannel`, `byPaymentMethod`) = Σ (quantity − returnedQuantity) × unitPrice por fecha de la venta. Vendido: `paid`, `pending_payment`, `refunded`; cobrado: `paid`, `refunded`. `salesCount` y los conteos no cuentan `refunded`.

- [ ] **Step 1: Pruebas `test:db`** (seed como `prisma-sales.db.test.ts`; venta pagada de 3 piezas a 100; helper `expectLedger()` que verifica `available = inicial + Σ delta` de `Movement`, llamado al final de cada prueba):

```ts
it("devolver 1 de 3: returnedQuantity 1, stock +1, RETURN +1 con saleId y motivo, vendido baja 100", async () => { /* … */ });
it("el mismo envío dos veces en paralelo registra una sola devolución", async () => {
  const r = await Promise.allSettled([dsA.refundLines(id, owner, L, "Talla"), dsB.refundLines(id, owner, L, "Talla")]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1); /* returnedQuantity 1, un solo RETURN */
});
it("devolver 3 de 3 deja refunded y su aporte a vendido en 0", async () => { /* … */ });
it("devolver más de lo vendido: SalesRuleError sin cambios", async () => { /* … */ });
it.each(["pending_payment", "cancelled"])("venta %s: SalesRuleError sin cambios", async (s) => { /* … */ });
it("anular una venta con 1 de 3 devuelta y regresó: reingresa 2", async () => { /* cancelSale ya usa quantity − returnedQuantity */ });
it("dashboard: byDay y soldTotal bajan igual; returnsToday = 100; una venta anulada con RETURN no cuenta", async () => { /* … */ });
```

`dashboard-scope.test.ts`: `scopeDashboardQuery(...)` devuelve `returnsDate` igual al `today` recibido para los tres roles.

- [ ] **Step 2:** `npm run test:db -- lib/data/__tests__/prisma-refund.db.test.ts lib/data/__tests__/prisma-dashboard.db.test.ts` → FAIL.
- [ ] **Step 3:** Implementar en `prisma-sales-source.ts` (`$transaction` interactiva como `cancelSale`) y en el fixture (misma semántica, para las pruebas de UI). Los totales del dashboard pasan a `$queryRaw` parametrizado sobre `SaleLine` unido con `Sale`, como `byBrand`.
- [ ] **Step 4:** `npm run test:db` y `npm test` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(ventas): devoluciones parciales con comparar-y-escribir y totales netos`.

### Tarea 14 (Claude): devoluciones parciales, acción y UI del dueño (spec 1.8)

**Files:**
- Create: `components/sales/RefundSalePanel.tsx`
- Modify: `lib/sales/actions.ts`, `app/ventas/page.tsx`, `components/sales/DashboardCards.tsx`, `components/sales/RecentSales.tsx`
- Test: `lib/sales/__tests__/actions.test.ts`, `components/__tests__/RefundSalePanel.test.tsx` (nuevo), `components/__tests__/VentasPage.test.tsx`

**Interfaces:**
- Consumes: `refundLines`, `getSaleByNumber`, `DashboardData.returnsToday` (Tarea 13); `mapError`, `sessionUser`, `fail` de `lib/sales/actions.ts`.
- Produces:
  - `refundSaleLinesAction(saleId: string, lines: RefundLineInput[], reason: string): Promise<SaleActionResult>` — solo owner (`"Solo el dueño puede registrar devoluciones."`); motivo obligatorio, ≤ `MAX_CANCEL_REASON_LENGTH`; `quantity` entero ≥ 1, `expectedReturned` entero ≥ 0, sin `variantId` repetido; `revalidatePath("/ventas")`; errores con `mapError(err, "devolver")` (ampliar el tipo de `retryVerb`).
  - `getSaleForRefundAction(number: number): Promise<{ ok: true; sale: SaleDetail } | Failure>` — solo owner; `NOT_FOUND` "La venta no existe.".
  - `RefundSalePanel({ onChanged }: { onChanged: () => void })` — folio → renglones con selector 0…(quantity − returnedQuantity) (≥ 44 px) → motivo → "Registrar devolución". Envía `expectedReturned` = `returnedQuantity` leído.

- [ ] **Step 1: Pruebas:**

```ts
// actions.test.ts
it.each([["manager", "l1"], ["collaborator", "l1"]])("%s: FORBIDDEN", async (role, loc) => { as(role, loc); expect((await refundSaleLinesAction("s1", L, "x")).code).toBe("FORBIDDEN"); });
it("JWT de owner con rol colaborador en la base: FORBIDDEN", async () => { /* getCurrentUser → collaborator */ });
it("motivo vacío / cantidad 0 / variantId repetido: INVALID sin llamar a la fuente", async () => { /* … */ });
it("SalesRuleError 'Anula la venta en su lugar.' → INVALID con ese mensaje", async () => { /* … */ });
// RefundSalePanel.test.tsx
it("busca el folio, devuelve 1 de 3 y llama a la acción con expectedReturned leído", async () => { /* … */ });
it("no deja elegir más de lo que queda por devolver", async () => { /* opciones 0..2 si returnedQuantity 1 */ });
// VentasPage.test.tsx
it("solo el owner ve 'Devoluciones' y la cifra 'Devoluciones de hoy'", async () => { /* manager y colaborador no ven el panel */ });
```

- [ ] **Step 2:** `npx vitest run lib/sales components/__tests__/RefundSalePanel.test.tsx components/__tests__/VentasPage.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar; en `RecentSales`, un botón "Devolver" en ventas `paid` (solo owner) abre el panel con ese folio; `DashboardCards` muestra "Devoluciones de hoy". Sin método de reembolso ni folio de devolución.
- [ ] **Step 4:** Mismo comando → PASS; `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ventas): devolución parcial desde /ventas (solo dueño)`.

### Tarea 15 (Claude): menores del ledger (spec 1.9)

**Files:**
- Modify: `lib/catalog/actions.ts:102-125` (`mergeBrandsAction`), `lib/actions.ts:31-34` (`fetchLocationsAction`), `app/page.tsx:22`, `app/escanear/page.tsx:48`, `app/pos/page.tsx:48`, `app/ventas/page.tsx:55`
- Test: `lib/catalog/__tests__/merge-brands.db.test.ts` (nuevo; `vi.mock("@/lib/prisma", async () => ({ default: (await import("../../../test/db/setup")).testPrisma }))` y `getCurrentUser` mockeado como owner), `lib/__tests__/fetch-locations.test.ts` (nuevo), `components/__tests__/PosPage.test.tsx`, `components/__tests__/VentasPage.test.tsx`, `app/escanear/__tests__/page.test.tsx`

**Interfaces:**
- Produces:
  - `mergeBrandsAction` sin cambio de firma: dentro de `prisma.$transaction`, `tx.$queryRaw\`SELECT id, "isActive" FROM "Brand" WHERE id IN (${Prisma.join([a, b])}) ORDER BY id FOR UPDATE\`` (ids ordenados) y valida ahí: las dos existen y las dos activas; si no, `NOT_FOUND` "La marca no existe o ya no está activa.". Sin SQL en migraciones.
  - `fetchLocationsAction(): Promise<Location[] | null>` — `null` sin sesión, sin lanzar. Llamadores con `null` muestran `SESSION_EXPIRED_TEXT` y `LoginLink` (`components/sales/session-expired.tsx`).

- [ ] **Step 1: Pruebas:**

```ts
// merge-brands.db.test.ts
it("A→B y B→C en paralelo: terminan, y ningún Product ni SaleLine queda en una marca inactiva", async () => {
  const r = await Promise.all([mergeBrandsAction(A, B), mergeBrandsAction(B, C)]);
  r.forEach((x) => expect(x.ok || x.code === "NOT_FOUND").toBe(true));
  const inactive = (await testPrisma.brand.findMany({ where: { isActive: false } })).map((b) => b.id);
  expect(await testPrisma.product.count({ where: { brandId: { in: inactive } } })).toBe(0);
  expect(await testPrisma.saleLine.count({ where: { brandId: { in: inactive } } })).toBe(0);
});
// fetch-locations.test.ts
it("sin sesión devuelve null", async () => { getServerSession.mockResolvedValue(null); expect(await fetchLocationsAction()).toBeNull(); });
// PosPage / VentasPage / escanear
it("fetchLocationsAction null muestra 'Tu sesión terminó. Vuelve a iniciar sesión.' con enlace", async () => { /* … */ });
```

- [ ] **Step 2:** `npm run test:db -- lib/catalog` y `npx vitest run lib/__tests__/fetch-locations.test.ts components/__tests__ app/escanear` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mismos comandos → PASS; `npm test`, `npm run lint`.
- [ ] **Step 5 (M):** en Chrome de Android, dejar vencer la sesión, cobrar y confirmar un pago: aparece el mensaje con enlace y no se duplica la venta. Anotarlo en el PR.
- [ ] **Step 6: Commit** `fix(ventas): bloqueo de marcas al fusionar y sesión vencida sin error`.

### Tarea 16 (Claude + dueño): dependencias y PR #17 (spec 1.10)

Fuera de congelamientos; después de la Tarea 6 y de la Tarea 5. `npm audit fix --force` prohibido. No se mezcla con la salida de ventas.

**Files:** Modify: `package.json`, `package-lock.json`.

- [ ] **Step 1:** `npm audit --json > ../audit-loloshop.json` (fuera del repo) y `npm audit --omit=dev`.
- [ ] **Step 2:** tabla de triage en la descripción del PR: paquete, severidad, ¿corre en producción o solo en desarrollo?, acción (actualizar menor/parche, aceptar con motivo, o esperar a PR #17).
- [ ] **Step 3:** aplicar solo actualizaciones menores o de parche que el triage marque, una por commit (`chore(deps): …`).
- [ ] **Step 4:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` en verde; `npm audit --omit=dev` sin críticas o cada excepción explicada en la tabla.
- [ ] **Step 5 (Dueño):** Fase G en un preview. Si cambió el service worker, verificar que `/pos` no sirva datos viejos (recargar tras un cambio de precio).
- [ ] **Step 6:** PR #17 (Next 15, React 19, Serwist) queda para enero (P2), salvo que el triage encuentre una crítica explotable que solo se arregle ahí; en ese caso, avisar al dueño antes de seguir.

---

# Fase 4. P1, zona visual

Zona visual (components/virtual-store/, lib/virtual-store/) la ejecuta Claude por decisión del dueño 2026-11-09; si Antigravity vuelve, se le devuelve la zona.

### Tarea 17 (Claude): filtro por departamento y "Ver más" (spec 1.1)

Requiere la Tarea 7 (`PublicProduct.department`).

**Files:** Modify: `components/virtual-store/CatalogGrid.tsx`. Test: `components/__tests__/CatalogGrid.test.tsx`.

**Interfaces:**
- Produces: `PAGE_SIZE = 24`. Chips `Todo` + los departamentos con al menos un producto, en `sortOrder`, cada uno `<button aria-pressed>` de ≥ 44 px. Tocar un chip filtra y hace `router.replace("?depto=<slug>", { scroll: false })` (`useRouter`, `useSearchParams` de `next/navigation`); `Todo` quita el parámetro. Un producto sin departamento sale solo en `Todo`. "Ver más" suma 24 y desaparece al mostrar todo. Sin conteos en los chips, sin orden al azar, sin consultas nuevas al servidor.

- [ ] **Step 1: Pruebas** (mock de `next/navigation` con `useSearchParams` configurable y `replace` espía):

```ts
it("con 30 productos se ven 24; 'Ver más' lleva a 30 y el botón desaparece", () => { /* … */ });
it("con ?depto=calzado al cargar solo se ve calzado y el chip tiene aria-pressed='true'", () => { /* … */ });
it("un departamento sin productos no tiene chip; los chips van en sortOrder", () => { /* … */ });
it("tocar 'Dama' llama replace('?depto=dama', { scroll: false }); 'Todo' lo quita", () => { /* … */ });
it("producto sin departamento solo aparece en Todo", () => { /* … */ });
it("los chips no muestran números", () => { /* textContent de cada chip sin dígitos */ });
it("el HTML no tiene SKU, barcode ni conteos", () => { /* innerHTML */ });
```

- [ ] **Step 2:** `npx vitest run components/__tests__/CatalogGrid.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; `npm test`, `npm run lint`, `npm run build`; revisar a 375 px.
- [ ] **Step 5: Commit** `feat(3d): filtro por departamento y Ver más en la cuadrícula`.

### Tarea 18 (Claude): aplicar los derivados de imagen (spec 1.5)

Requiere la Tarea 9.

**Files:** Modify: `components/virtual-store/CatalogGrid.tsx`, `components/virtual-store/VirtualStoreCanvas.tsx` (tarjeta del punto), `components/virtual-store/ProductHotspotModal.tsx` y `components/products/ProductCard3D.tsx` (la imagen del modal). Test: `components/__tests__/CatalogGrid.test.tsx`, `components/__tests__/VirtualStore.test.tsx`.

- [ ] **Step 1: Pruebas:** con `imageUrl = "https://abc.public.blob.vercel-storage.com/productos/v2/123-ab.jpg"`, el `img` de la tarjeta tiene `src` terminado en `-w400.jpg`, `srcset` con `-w600.jpg 600w` y `sizes`; el punto usa `-w200.jpg`; con una URL antigua, `src` = la URL y sin `srcset`.
- [ ] **Step 2:** FAIL. **Step 3:** `<img {...publicImageAttrs(url, "grid")} loading="lazy" decoding="async" />` (y `"hotspot"`, `"modal"`). Sin `next/image`. **Step 4:** PASS; `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(3d): imágenes con derivados en cuadrícula, punto y modal`.

### Tarea 19 (Claude): giro frente/atrás (spec 1.3)

Después de la Tarea 18.

**Files:** Create: `components/virtual-store/ProductFlip.tsx`. Modify: `ProductHotspotModal.tsx` (lo usa). Test: `components/__tests__/ProductFlip.test.tsx`.

**Interfaces:**
- Produces: `ProductFlip({ product }: { product: PublicProduct })`. `alt` = `${brand} ${title} de frente` / `… de atrás`. Tocar la foto o "Ver atrás" gira 180° en ≤ 400 ms. Con `prefers-reduced-motion: reduce`: botones "Frente" y "Atrás" con `aria-pressed`, cambio sin animación. La foto trasera se pide solo al abrir el modal. Sin giro en bucle, sin three.js.

- [ ] **Step 1: Pruebas:**

```ts
it("con movimiento reducido: sin transform animado y dos botones con aria-pressed", () => { /* matchMedia mock → matches true */ });
it("sin movimiento reducido: cada toque alterna el alt entre 'de frente' y 'de atrás'", () => { /* … */ });
it("antes de abrir un modal, la cuadrícula no tiene ningún img con backImageUrl", () => { /* render de CatalogGrid */ });
it("backImageUrl null: sin control de giro y sin error", () => { /* … */ });
it("duración de la transición ≤ 400 ms", () => { /* prop transition.duration ≤ 0.4 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** implementar con framer-motion (`useReducedMotion`). **Step 4:** PASS; `npm test`, `npm run build`.
- [ ] **Step 5 (M):** probado en un móvil real a 375 px; anotarlo en el PR.
- [ ] **Step 6: Commit** `feat(3d): giro frente/atrás en el modal`.

### Tarea 20 (Claude + dueño): panorámicas reales (spec 1.4)

Requiere la Tarea 8 y las fotos del dueño (protocolo A.14 del plan global `docs/superpowers/plans/2026-10-27-loloshop-plan-global.md`). Revisión de privacidad antes del merge (C.5 del plan global).

**Files:** Create: `public/recorrido/<storeSlug>/<zoneId>.webp` (4096×2048, ≤ 600 KB), `<zoneId>-blur.webp` (≤ 20 KB), `lib/virtual-store/__tests__/panoramas.test.ts`. Modify: `lib/virtual-store/store-config.json` (`kind: "real"`, `panoramaUrl`, `initialYaw`/`initialPitch`, `yaw`/`pitch` medidos).

- [ ] **Step 1: Pruebas** (entorno node, leyendo el JSON y `public/`):

```ts
it("cada panoramaUrl de una zona real existe y pesa ≤ 600 KB; su -blur ≤ 20 KB", () => { /* fs.statSync */ });
it("ningún archivo de public/recorrido/ trae bloques EXIF ni 'XMP '", () => { /* buffer.includes("EXIF") / ("XMP ") false */ });
```

- [ ] **Step 2:** FAIL (sin archivos). **Step 3:** procesar las fotos aprobadas a WebP sin metadatos, medir `yaw`/`pitch` de cada repisa y configurarlos. **Step 4:** PASS; `npm test`, `npm run build`.
- [ ] **Step 5 (M, dueño):** revisión firmada en el PR: sin personas (ni borrosas), pantallas, tickets, precios legibles ni datos de clientes; nada generado con IA presentado como la tienda.
- [ ] **Step 6 (M):** en móvil, cada punto cae sobre su repisa con ±5°.
- [ ] **Step 7: Commit** `feat(3d): panorámicas reales de Lomas`.

---

## Pasos del dueño (sin tarea de código)

- [ ] **0.5 Autosuspend de Neon:** desactivarlo la víspera del Buen Fin y reactivarlo al terminar; anotar las dos fechas en "Operación durante el Buen Fin" de la guía. Si el plan no lo permite [C], se acepta el arranque en frío; no crear "pings" programados.
- [ ] **0.6 Carga de mercancía:** inventario real en Lomas y ClubAlva; frente y atrás en lo que va al catálogo; fotos sin caras ni otras personas y sin la etiqueta del retailer en cuadro. Verificar 20 prendas por tienda contra `/productos` y que todo lo "para catálogo" salga en `/catalogo`. Reportar errores a Claude. No usar `reset-users.ts`.
- [ ] **Preguntas §5:** responder R18 (bot y solo stock), número de WhatsApp (uno o por tienda), quién decide las repisas, fechas de salida y congelamiento, hosting P-2. El plan construye las propuestas.
- [ ] **Fotos de 1.4:** capturar con el protocolo A.14 y firmar la revisión de privacidad (Tarea 20).
- [ ] **Barrido de blobs:** correr `npx tsx prisma/scripts/sweep-orphan-blobs.ts` (revisar la lista) y luego con `--apply`, con `BLOB_READ_WRITE_TOKEN` en el `.env` local.
- [ ] **Asignar prendas a puntos** en `/recorrido/puntos` cuando haya zonas reales.

## Fuera de este plan

- `BOT_STOCK_ONLY_LOOKUP` y `getStockOnlyAvailability(code)` (1.6 opción "sí"): solo si el dueño lo decide por escrito; ≈ 1 h.
- Probador personal y probador cliente (P2, plan global S-E y S-F).
- Migración de Neon y Blob a la Raspberry Pi 5 (P2, decisión en enero).
- Variantes por color y riel 2.5D con prendas recortadas (P2, C.1, C.2, D-8).
- PR #17 (Next 15) si la Tarea 16 no lo adelanta (P2, enero).
- Maestra de 2048 px y lupa 2× para imágenes aprobadas (P2).
- Tablas `StoreZone`/`StoreHotspot` del ER §2.5 si el JSON se queda corto (P2).
