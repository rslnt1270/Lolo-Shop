---
name: Spatial Light & Glass
colors:
  surface: '#ffffff'
  surface-dim: '#f3f4f6'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: 'rgba(255, 255, 255, 0.6)'
  surface-container: 'rgba(255, 255, 255, 0.4)'
  surface-container-high: 'rgba(255, 255, 255, 0.8)'
  surface-container-highest: '#e5e7eb'
  on-surface: '#111827'
  on-surface-variant: '#4b5563'
  outline: '#d1d5db'
  outline-variant: 'rgba(255, 255, 255, 0.2)'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#f3f4f6'
  on-primary-container: '#000000'
  secondary: '#3cbfbf'
  on-secondary: '#ffffff'
  background: '#f9fafb'
  on-background: '#111827'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 40px
rounded:
  xl: 24px
  full: 9999px
---

## Brand & Style
This design system pivots from heavy brutalism to **Spatial Minimalism**. Inspired by modern spatial interfaces (like visionOS) and ultra-clean editorial layouts, it relies heavily on **Glassmorphism**, generous white space, and soft translucency.

The vibe is light, airy, and highly polished. It should feel like physical frosted glass floating in a bright, clean room.

## Colors & Textures
- **Base:** The background is a very light, warm gray or off-white.
- **Glassmorphism (Frosted Glass):** Panels, sidebars, and main cards should use translucent white backgrounds (`rgba(255, 255, 255, 0.6)`) with a strong backdrop blur (`backdrop-filter: blur(24px)`).
- **Accents:** High contrast black (`#000000`) for primary text and main buttons, with Lolo Teal (`#3CBFBF`) reserved strictly for active states or selected icons.
- **Borders:** Extremely subtle, 1px solid white (`rgba(255, 255, 255, 0.4)`) borders on glass panels to give them a physical edge, simulating light catching the edge of the glass.

## Elevation & Shadows
- Use very soft, diffused drop shadows to separate floating glass panels from the background (e.g., `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05)`).

## Shapes
- **Soft Geometry:** Reversing the previous rule, EVERYTHING is heavily rounded.
- Panels, cards, and large buttons should have `24px` to `32px` border radiuses.
- Small buttons, icons, and badges should be fully pill-shaped (`9999px`).

## Typography
- **Geist** remains the primary font, but used in a much softer, more approachable way. Avoid all-caps brutalism. Use title-case and capitalize naturally. Contrast is achieved through size and weight differences rather than aggressive tracking.
