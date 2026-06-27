# LoloShop — Diseño del Sistema de Gestión de Inventario

**Fecha:** 2026-06-26  
**Desarrollador:** Portfolio personal  
**Cliente:** LoloShop (@lolo.bshop)  
**Estado:** Aprobado

---

## Contexto del Negocio

LoloShop es una tienda de ropa y accesorios con presencia en Instagram (@lolo.bshop, 2,353 seguidores), envíos a toda la República Mexicana y entregas físicas en Texcoco/CDMX. Opera con mayoreo y menudeo. Cuenta con tienda en Shopify (sin ventas online concretadas aún) y 2 tiendas físicas donde se concentra la mayoría de las ventas.

**Productos:** Playeras, Pantalones, Hoodies, Tenis, Accesorios, Perfumes, Raquetas de Padel (más categorías a futuro).

---

## Problema

No existe un sistema de control de inventario. La mercancía es nueva y se necesita construir el stock desde cero. Las ventas físicas no se reflejan en Shopify, lo que genera descontrol entre lo disponible y lo vendido. Los colaboradores en tienda no tienen herramienta para registrar entradas ni salidas.

---

## Solución

Una **Progressive Web App (PWA)** instalable en el celular que usa **Shopify como backend** mediante su Admin API. La app permite registrar mercancía nueva, consultar stock y registrar ventas físicas, manteniendo Shopify como única fuente de verdad para inventario online y físico.

---

## Usuarios y Roles

| Rol | Cantidad | Acceso |
|---|---|---|
| Dueño | 1 | Ambas tiendas, reportes, precios, eliminar productos |
| Encargado | 1 | Ambas tiendas, gestión completa excepto eliminar y reportes financieros |
| Colaborador | 2 (uno por tienda) | Solo su tienda asignada: escanear, entradas, salidas |

---

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│                  LOLOSHOP PWA                   │
│           (Next.js, instalable en celular)      │
├──────────────┬──────────────┬───────────────────┤
│   Dueño      │  Encargado   │  Colaborador x2   │
└──────┬───────┴──────┬───────┴────────┬──────────┘
       └───────────────▼────────────────┘
                Shopify Admin API (GraphQL)
                ┌──────────────────────┐
                │        SHOPIFY       │
                ├──────────────────────┤
                │ Products & Variants  │
                │ Inventory Levels     │
                ├──────────┬───────────┤
                │ Tienda 1 │ Tienda 2  │  ← Locations
                └──────────┴───────────┘
```

**Stack:**
- **PWA:** Next.js 14 + TypeScript
- **API:** Shopify Admin API (GraphQL)
- **Escaneo:** `html5-qrcode` (cámara del celular)
- **QR Generator:** `qrcode` npm package
- **Auth:** NextAuth.js con roles
- **Deploy:** Vercel (tier gratuito)

---

## Sistema de Identificación de Productos (Híbrido)

- **Mercancía nueva sin barcode:** Se genera e imprime una etiqueta QR con branding de LoloShop
- **Mercancía con barcode de fábrica:** Se escanea el barcode existente y se registra en el variant de Shopify
- El QR contiene el **Variant ID de Shopify** para mapeo directo a producto + talla + color
- Las etiquetas QR se generan en formato imprimible (A4, múltiples por hoja) desde la misma app

**Formato de etiqueta QR:**
```
┌─────────────────┐
│  [LOGO LOLOSHOP]│
│  Hoodie NY      │
│  Talla: M       │
│  Color: Negro   │
│  $450.00        │
│     [QR CODE]   │
└─────────────────┘
```

---

## Modelo de Datos (Shopify)

```
PRODUCT
├── title: "Hoodie NY Yankees"
├── category/tags: ["Hoodies", "NY Yankees", "LoloShop"]
├── vendor: marca
├── images[]
│
├── VARIANTS[]
│   ├── title: "M / Negro"
│   ├── SKU: "LS-HOO-NYY-M-NEG"   ← generado automáticamente
│   ├── price: 450.00
│   ├── barcode: (fábrica si tiene, vacío si no)
│   └── INVENTORY_LEVELS
│       ├── location: Tienda 1 → quantity: 3
│       └── location: Tienda 2 → quantity: 5
│
└── METAFIELDS
    └── qr_label_url: enlace a etiqueta imprimible
```

**SKU automático:** `LS-{CAT}-{MARCA}-{TALLA}-{COLOR}`  
Ejemplo: `LS-PLA-GUE-M-BLA` = LoloShop / Playera / Guess / M / Blanco

**Categorías iniciales:** Playeras, Pantalones, Hoodies, Tenis, Accesorios, Perfumes, Raquetas de Padel

---

## Pantallas y Flujos

### Home (Dashboard)
- Stock total por tienda
- Alertas de productos con stock bajo (umbral configurable)
- Últimas entradas y salidas del día
- Accesos rápidos: Escanear | Entrada | Salida

### Escanear
- Abre cámara → apunta a QR o barcode
- Muestra: foto, nombre, talla, color, precio, stock por tienda
- Acciones: Registrar Entrada | Registrar Salida | Editar producto

### Productos
- Lista con búsqueda en tiempo real
- Filtros: categoría, talla, color, tienda
- Vista de detalle con todas las variantes y niveles de stock

### Registrar Entrada (nueva mercancía)
1. Escanear QR/barcode O buscar manualmente
2. Si el producto **no existe** → formulario de creación:
   - Nombre, categoría, marca, precio
   - Variantes (talla + color)
   - Genera SKU automático
   - Genera e imprime etiqueta QR
3. Si el producto **ya existe** → seleccionar variante + cantidad + tienda

### Registrar Salida (venta física)
1. Escanear QR/barcode del producto
2. Confirmar variante y cantidad
3. Descuenta inventario en Shopify (tienda asignada al colaborador)
4. Registra timestamp y usuario que realizó la operación

### Generar / Imprimir QR
- Vista previa de etiquetas listas para imprimir
- Incluye: logo LoloShop, nombre, talla, color, precio, QR
- Formato A4 (múltiples etiquetas por hoja)

### Reportes (Dueño y Encargado)
- Stock actual por tienda y total
- Productos más vendidos (por salidas registradas)
- Historial de entradas y salidas con filtro de fecha
- Exportar a CSV/Excel

---

## Decisiones Técnicas Clave

| Decisión | Elección | Razón |
|---|---|---|
| PWA vs App nativa | PWA | Sin App Store, instalable, cámara disponible, costo cero |
| Backend propio vs Shopify | Shopify como backend | Ya está pagado, una sola fuente de verdad |
| Offline vs Online-only | Online-only | Buena señal en ambas tiendas |
| QR vs Barcode | Híbrido | Flexibilidad: QR para nueva merch, barcode cuando ya existe |
| Auth | NextAuth.js | Simple, soporta roles, compatible con Next.js |

---

## Lo que está fuera del alcance (por ahora)

- Módulo de caja / cobro (no es un POS)
- Facturación electrónica (CFDI)
- Integración con proveedores
- App móvil nativa (iOS/Android)
- Más de 2 tiendas físicas
