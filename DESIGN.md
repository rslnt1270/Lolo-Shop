# Design System: LoloShop (Streetwear PWA & 3D Catalog)

## 1. Visual Theme & Atmosphere
A dark, cinematic, and premium streetwear atmosphere (Dark Mode). The vibe is a mix between a high-end fashion editorial and a modern tech command center. It features confident asymmetric layouts, deep contrast, and fluid spring-physics motion. The catalog feels immersive ("FOMO-inducing"), while the internal POS dashboard feels like a precise, tactical tool.

## 2. Color Palette & Roles
- **Abyss Background** (#09090B) — Primary background surface (Zinc 950).
- **Surface Elevation** (#18181B) — Card and container fill, subtle distinction from the background.
- **Titanium White** (#FAFAFA) — Primary text, high contrast for readability.
- **Muted Ash** (#A1A1AA) — Secondary text, descriptions, metadata, and disabled states.
- **Whisper Border** (rgba(255, 255, 255, 0.1)) — Card borders, 1px structural lines for separation.
- **Lolo Teal** (#3CBFBF) — Single accent color for primary CTAs, active states, focus rings, and WhatsApp triggers. (No neon glows, flat premium application).

## 3. Typography Rules
- **Display:** Geist — Track-tight, controlled scale, weight-driven hierarchy. Used for marketing copy and product titles.
- **Body:** Geist — Relaxed leading, 65ch max-width, neutral secondary color for product descriptions.
- **Mono:** Geist Mono — For all inventory numbers, prices, SKUs, barcode data, and dashboard telemetry. Gives the "Command Center" look.
- **Banned:** Inter, generic system fonts, and all serif fonts.

## 4. Component Stylings
* **Buttons (POS & Dashboard):** Flat, tactile. Heavy spring physics (stiffness: 100, damping: 20) on active state (acts like a heavy physical switch). Lolo Teal fill for primary actions (e.g., "Escanear", "Apartar").
* **Cards:** Slightly rounded corners (0.75rem). No heavy drop shadows; rely on 'Whisper Border' and 'Surface Elevation' for hierarchy. High-density inventory lists use border-top dividers instead of full cards.
* **Inputs/Scanner:** Borderless scanner UI with rounded corners. Focus rings in Lolo Teal. Minimalist text inputs with labels above.
* **Loaders:** Skeletal shimmer matching exact layout dimensions. No generic circular spinners.
* **Empty States:** Composed, illustrated compositions with a streetwear vibe (e.g., a minimalist hanger graphic for "No products found").

## 5. Layout Principles
Grid-first responsive architecture.
- **Public Catalog:** Asymmetric splits for Hero sections, incorporating cinematic video loops or dynamic 3D backgrounds. No overlapping elements.
- **Internal Dashboard:** High-density, utilitarian layouts.
- **Responsive:** Strict single-column collapse below 768px. No horizontal scroll on mobile. Max-width containment (1400px) on desktop.

## 6. Motion & Interaction
- **Spring Physics:** Used for all interactive elements (buttons, modals).
- **Perpetual Micro-loops:** Subtle floating or breathing effects on 3D catalog items to maintain a cinematic feel.
- **Staggered Orchestration:** List of products or inventory logs reveal via waterfall cascades, never instantly mounted.
- **Hardware Acceleration:** Animations exclusively via `transform` and `opacity`.

## 7. Anti-Patterns (Banned)
- No emojis anywhere.
- No Inter font.
- No generic serif fonts.
- No pure black (`#000000`) or pure white (`#FFFFFF`) backgrounds.
- No neon glows or drop shadows with blur.
- No AI copywriting clichés ("Elevate", "Next-Gen", "Seamless").
- No filler UI text ("Scroll to explore", bouncing arrows).
- No overlapping elements — clean spatial separation always.
- No fake data or statistics in mockups.
