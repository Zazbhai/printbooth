# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (responsive desktop & mobile) + self-service kiosk touchscreen

## Users

1. **Students & Walk-in Customers**: University students, college faculty, and retail walk-ins who need fast, self-service printing for assignments, project reports, ID documents, and forms. They upload documents via web/mobile or scan a QR code at the kiosk, select print options (B&W / Color, copies, duplex), pay instantly via UPI/QR, and collect prints in under 20 seconds.
2. **Merchant Partners**: Cafe owners, university stationery shops, and campus retail hubs hosting PrintBooth hardware. They track daily footfall, live kiosk telemetry, paper/toner levels, and receive automated 18% commission payouts.
3. **Platform Administrators**: Fleet operators managing multi-campus kiosk hardware, pricing engines, alert telemetry, printer supply replenishment, and merchant partner payouts.

## Product Purpose

PrintBooth replaces frustrating print shops and error-prone USB drives with an automated, cloud-connected self-service printing kiosk network. 

Success is measured by:
- **Customer Print Speed**: End-to-end order-to-print execution in < 20 seconds.
- **Fleet Reliability**: 99.5%+ uptime across all university and retail kiosks.
- **Merchant Transparency**: Real-time commission reporting and zero-hassle automatic settlements.
- **Design & UX Quality**: High-grade consumer experience combining interactive 3D kiosk visualization with a refined Capitalio dark obsidian dashboard.

## Positioning

PrintBooth bridges physical IoT hardware with frictionless fintech and modern digital interfaces. It pairs an engaging 3D hardware hero experience with a professional, data-dense Capitalio executive dashboard. It is engineered to feel like the Stripe + Apple of physical printing.

## Operating Context

- **Customer Web App (`apps/web`)**: Interactive landing page with Three.js 3D kiosk model, dynamic scroll reveal effects, document upload, print configuration modal, and instant checkout flow.
- **Platform Console (`apps/admin`)**: Dual-portal dashboard serving both **Admin Console** (`/admin/dashboard`) and **Merchant Partner Portal** (`/merchant/dashboard`). Features Capitalio dark obsidian aesthetic, metallic conic badges, `.dashboard-dot-grid` telemetry charts, and floating pillowy activity notifications.
- **Kiosk Interface (`apps/kiosk`)**: Touchscreen terminal software running on kiosk hardware for on-site QR scanning and hardware print job dispatch.

## Capabilities and Constraints

- **Real-time Telemetry**: Hardware paper tray (A4), toner capacity, printer connectivity (ONLINE / ATTENTION / OFFLINE).
- **Dual Portal Routing**: Role-based access with instant switching between Fleet Admin and Merchant Store views.
- **Data Visualization**: Hourly revenue and print throughput area charts with benchmark curves, print format allocation donut, and status breakdown tables.
- **Floating Overlays**: Zero-layout-shift UI overlays (e.g., Activity Dropdown) using absolute positioning with spring-physics motion.

## Brand Commitments

- **Tone & Voice**: Authoritative, reliable, precise, and tech-forward. Clean, clear data presentation without fluff.
- **Aesthetic Principles**: Dark obsidian elegance (`#151517`), subtle hairline borders (`#202020`), vibrant data accents (Emerald `#00DA92`, Electric Indigo `#4F46E5`, Amber `#FF7A00`), metallic conic icon badges, and smooth motion physics.
- **Anti-References**: Never look like generic Bootstrap, cluttered legacy enterprise software, or generic "AI slop" (no purple-blue gradient soup, no unstyled tables, no jarring layout shifts).
