# Impeccable Design Quality & Craftsmanship Rules

These rules enforce out-of-distribution craft for all frontend UI and design tasks in the PrintBooth project.

## 1. Ground Truth & System Tokens
- Always consult [DESIGN.md](file:///c:/Users/zgarm/OneDrive/Desktop/printer_automation/DESIGN.md) and [PRODUCT.md](file:///c:/Users/zgarm/OneDrive/Desktop/printer_automation/PRODUCT.md) before designing or refining UI.
- **Customer Web (`apps/web`)**: Clean, laser-red (`#dc2626`) & frosted neomorphic surface aesthetic with 3D hardware presence.
- **Console Dashboard (`apps/admin`)**: Capitalio Obsidian dark aesthetic (`#151517` / `#06110D`), metallic conic badges, and synthetic lime accents (`#c8ff00`).

## 2. Motion & Physics
- Universal easing: `cubic-bezier(0.16, 1, 0.3, 1)` for snappy, organic responsiveness.
- Section page transitions: Direction-aware momentum with entrance blur resolution.
- Respect `prefers-reduced-motion: reduce` unconditionally.

## 3. Zero Layout Shift
- Interactive popovers, notification menus (`ActivityDropdown`), and modals must NEVER push document flow.
- Always use dedicated z-index elevation (`z-50` to `z-70`) and absolute/portal rendering.

## 4. Craft Floor & Anti-Patterns
- **No generic AI slop**: Never use generic purple-to-blue gradient soups on white cards, generic system fonts without token styling, or boring nested cards.
- **No unstyled tables**: Always include uppercase 11px headers, row hover states, status pills, and mobile responsiveness.
- **No raw unformatted numbers**: Always format currency, percentages, and relative timestamps.
