---
name: PrintBooth Unified Design System
description: Dual-surface IoT printing platform design system. Public customer experience with frosted neomorphic precision, crimson laser accents, and 3D kiosk visualization; platform console with high-density dark obsidian surfaces, metallic radial icon badges, and telemetry canvases.

surfaces:
  # ─────────────────────────────────────────────────────────────
  # SURFACE 1: Customer Web App & Landing Experience (apps/web)
  # ─────────────────────────────────────────────────────────────
  customer-web:
    aesthetic: "Frosted Neo-industrial & Crimson Laser Precision"
    colors:
      ground: "#ffffff"
      neo-bg: "#e0e5ec"
      card-surface: "rgba(255, 255, 255, 0.88)"
      card-hover: "rgba(255, 255, 255, 0.96)"
      border-subtle: "rgba(0, 0, 0, 0.08)"
      border-strong: "rgba(0, 0, 0, 0.15)"
      
      # Crimson Laser Brand Accents
      accent: "#dc2626"
      accent-light: "#ef4444"
      accent-dim: "rgba(220, 38, 38, 0.10)"
      accent-glow: "rgba(220, 38, 38, 0.25)"
      
      # Status
      success: "#059669"
      warning: "#d97706"
      error: "#ef4444"
      info: "#0284c7"
      
      # Text
      text-primary: "#09090b"
      text-secondary: "#1f2937"
      text-muted: "#4b5563"
      text-faint: "#71717a"

    typography:
      font-sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      font-mono: "'Geist Mono', 'JetBrains Mono', monospace"

    motion:
      page-transition: "cubic-bezier(0.16, 1, 0.3, 1)"
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
      laser-sweep-duration: "0.75s"

  # ─────────────────────────────────────────────────────────────
  # SURFACE 2: Admin & Merchant Console (apps/admin)
  # ─────────────────────────────────────────────────────────────
  platform-console:
    aesthetic: "Capitalio Obsidian & Synthetic Lime Telemetry"
    colors:
      bio-black: "#06110D"
      obsidian-ground: "#151517"
      card-surface: "#091a12"
      card-hover: "#0f2a1c"
      border-subtle: "rgba(200, 255, 0, 0.10)"
      border-strong: "rgba(200, 255, 0, 0.22)"
      
      # Synthetic Lime Core
      synthetic-lime: "#c8ff00"
      lime-light: "#d4ff33"
      lime-dim: "rgba(200, 255, 0, 0.15)"
      lime-glow: "rgba(200, 255, 0, 0.30)"
      
      # Data Visualization Palette
      chart-1: "#6366f1"
      chart-2: "#7466f6"
      chart-3: "#ff7a00"
      chart-4: "#00da92"
      chart-5: "#e10b05"
      
      # Metallic Badges
      conic-metal: "conic-gradient(from 90deg, #5e5959 0%, #413f3f 6.25%, #242424 12.5%, #1d1b1b 28.481%, #2c2a2a 31.034%, #3b3838 33.588%, #585656 38.694%, #3e3c3c 46.951%, #242222 55.208%, #353232 62.885%, #464242 70.562%, #353333 76.351%, #242424 82.14%, #413f3f 91.07%, #5e5959 100%)"
      
      # Text
      foreground: "#ffffff"
      text-muted: "#9e9e9e"
      text-faint: "#6b6b72"

    typography:
      font-sans: "'Geist', -apple-system, sans-serif"
      font-mono: "'Geist Mono', monospace"

    elevation:
      shadow-card: "0 4px 20px rgba(0, 0, 0, 0.25)"
      shadow-dropdown: "0 35px 80px -15px rgba(0, 0, 0, 0.95), 0 18px 36px -8px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.16)"
      active-sidebar-glow: "0 0 5px 0 rgba(0, 0, 0, 0.60), inset 0 0 4px 2px rgba(255, 255, 255, 0.03)"
---

# Design System Guidelines

## 1. Architectural Surface Division

### A. Customer-Facing Surface (`apps/web`)
- **Tone**: Tactile, ultra-fast, consumer-friendly, high-precision laser hardware.
- **Hero & 3D Experience**: Interactive Three.js model on right flank with dynamic camera orbit responding to active section.
- **Section Transition Choreography**:
  - Full-viewport panel transition driven by `cubic-bezier(0.16, 1, 0.3, 1)`.
  - Direction-aware momentum (`direction-down` / `direction-up`).
  - Crimson laser sweep line (`#dc2626`) across panel top border on section entry.
  - Phase watermark badge (e.g. `[01 // PRINTBOOTH KIOSK]`) with pulsing indicator dot.
  - Viewport-level `ScrollTelemetryHUD` tracking real-time phase index and system telemetry.
- **Print Flow (`/print`)**: Clean neomorphic cards with soft drop shadows, drag-and-drop file upload, live PDF page preview, duplex toggle, and instant UPI QR modal.

### B. Fleet Management & Merchant Portal (`apps/admin`)
- **Tone**: Technical, authoritative, data-dense, executive dashboard.
- **Pure Obsidian Ground**: Base `#151517` / `#06110D` with hairline `#202020` card borders. Never washed-out gray.
- **Conic Metallic Badges (`.dashboard-icon-badge`)**: Used in metric card headers to establish an industrial hardware aesthetic.
- **Dot-Grid Canvases (`.dashboard-dot-grid`)**: Chart canvases feature a subtle `radial-gradient` dot grid pattern at `1.5rem x 1.5rem` pitch.
- **Metallic Active Sidebar Highlight (`.active-sidebar-item`)**: Active navigation items use a mask-composite metallic hairline gradient border with an inset depth shadow.

## 2. Motion & Physics
- **Universal Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` for snappy, organic responsiveness.
- **Zero Layout Shift**: Interactive overlays (dropdowns, tooltips, modals) render via `position: absolute` or portals with dedicated z-index layering (`z-50` to `z-70`).
- **Progress Meters**: Animated with keyframe `scaleX(0) -> scaleX(1)` from `transform-origin: left`.
- **Accessibility**: Automatic fallback to zero-transform fade when `prefers-reduced-motion: reduce` is detected.

## 3. Anti-Patterns & Quality Floor
- **No generic AI slop**: Prohibit purple-to-blue gradient soups on white cards, generic browser fonts, or bland nested cards.
- **No unstyled tables**: Tables must have clear 11px uppercase headers, hover rows, status badges, and responsive layouts on mobile.
- **No unformatted numbers**: Always format currency (`₹4,210`), percentages (`+14.2%`), and timestamps (`10 mins ago`).
