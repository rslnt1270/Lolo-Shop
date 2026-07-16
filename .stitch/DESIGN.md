# Design System: LoloShop

## 1. Visual Theme & Atmosphere
A clean, retail-focused PWA with "Daily App Balanced" density. The atmosphere is professional yet approachable, built for high-speed scanning and quick interactions. Motion is fluid and snappy (spring physics) to make the app feel natively installed on mobile.

## 2. Color Palette & Roles
- **Canvas White** (`#F9FAFB`) — Primary background surface
- **Pure Surface** (`#FFFFFF`) — Card and container fill
- **Charcoal Ink** (`#18181B`) — Primary text, deep depth
- **Muted Steel** (`#71717A`) — Secondary text, metadata
- **Whisper Border** (`rgba(226,232,240,0.5)`) — Structural lines, bottom nav borders
- **Lolo Teal** (`#2DD4BF`) — The signature accent. Used for active states, scanner target overlays, and primary buttons. Saturation is controlled, no neon glows.

## 3. Typography Rules
- **Display:** `Outfit` or `Geist` — Clean, modern sans-serif. Hierarchy through weight.
- **Body:** `Geist` — Relaxed leading for readability.
- **Mono:** `JetBrains Mono` — For SKUs, barcodes, and pricing.
- **Banned:** Emojis, generic system fonts (Times New Roman), AI purple glowing text.

## 4. Component Stylings
* **Bottom Navigation (Mobile):** Fixed to bottom, pure white surface, whisper border top. Icons use muted steel, active icon uses Lolo Teal with a subtle -2px translate Y spring animation.
* **Scanner Viewfinder:** Full width/height. Semi-transparent black overlay outside the scanning box. Clean white corners for the targeting reticle. No "Powered by ScanApp" text.
* **Buttons:** Flat, solid Teal. Tactile push feedback.
* **Loading States:** Smooth opacity transitions or skeletal shimmers.

## 5. Layout Principles
- Mobile-first architecture. 
- Desktop views center the main content in a `max-w-md` or `max-w-2xl` container to mimic mobile proportions for scanning workflows.
- No horizontal scrolling.

## 6. Motion & Interaction
- Spring physics for the bottom nav icons.
- Instant camera initialization with a smooth fade-in for the video feed.

## 7. Anti-Patterns (Banned)
- No horizontal top-nav on mobile (crowded text).
- No generic "Select Camera" dropdowns in the scanner (auto-select environment facing).
- No pure black (`#000000`).
- No neon glows or heavy drop shadows.
