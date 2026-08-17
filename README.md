# Gata-Gata Gacha Machine — Color Customizer

A Phase 1 2D orthographic color-customizer web app for the Lightning Bug Club Gata-Gata Gacha Machine.  
Built with vanilla JS / HTML / CSS. No build step — served directly via `python -m http.server`.

## Running the app

```bash
python -m http.server 8080
# Open http://localhost:8080
```

---

## Features

### Views: Front / Side / Back

The view selector offers three orthographic views of the machine.  
Switching views re-applies all current color selections immediately — all three views share the same logical color state keyed by part id.

> **Isometric view has been removed.** Only Front, Side, and Back are available.

### Parts list & color palette

Click a part in the sidebar, then click a swatch in the color palette to recolor it.  
The current color name and hex code are shown in the palette panel header.  
Colors are grouped by Bambu PLA series (Basic, Matte, Silk, Wood, Translucent, Glow, then any remaining supported series).  
The following series are intentionally excluded from selection: **PLA Basic Gradient, PLA CF, PLA Sparkle, PLA Metal, PLA Galaxy, PLA Marble**.

### Zoom & pan preview

Use the mouse wheel or the **+ / − / Reset** controls above the preview to zoom in and out.  
When zoomed in, click-and-drag the machine preview to pan around the current view.  
Zoom and pan carry across Front / Side / Back changes for the current browser session, but are not stored in the share URL.

### Top Chamber — multi-layer follower

The sidebar shows a single **Top Chamber** part.  
Behind the scenes it governs three SVG layers:

| Layer | Behavior |
|-------|----------|
| `Top Chamber_Outside` | User's chosen color |
| `Top Chamber_Inside_Back` | Always mirrors the user's chosen color |
| `Top Chamber_Inside` | Always white (`#FFFFFF`) — fixed, never editable |

### Black layer — always fixed gray

The `Black` layer is always rendered as `#565656` regardless of any user action.  
It is not selectable and does not appear in the parts list.

### Windows material selector

Below the parts list is a **Windows** section with two options:

| Option | Behavior |
|--------|----------|
| **3D printed windows** (default) | The user can pick a PLA color for the windows. Windows appear at **80% opacity** in the **Side view only**, visually covering the top chamber interior opening. Windows are never shown in Front or Back views. |
| **Clear acrylic windows** | Windows are fully transparent — no overlay is shown. The window color picker is disabled. |

> **Note:** The finalized SVGs currently contain no window geometry. Windows are **simulated** as a rounded-rectangle overlay in the side view. On load, the overlay is sized to the live bounding box of the `Top_Chamber_x5F_Inside` layer, with a safe fallback if that layer is unavailable. The default window color is **Basic PLA Jade White** (`basic-pla-jade-white`).

### Default colors & instructions

All colorable parts — including windows — start as **Basic PLA Jade White** when no URL seed is present.  
The page also shows a persistent instruction banner at the top telling the user to click a machine part first, then pick a color from the palette.

### Shareable URL

The **Share** button copies a URL that encodes all current color selections **and** the windows material choice (`?c=...&w=printed|acrylic`). Pasting this URL restores the exact configuration.

### Export PDF

The **Export PDF** button generates a build blueprint PDF containing:
- Framed **Front / Side / Back** previews in one row on page 1
- A legend table with part names, color swatches, hex codes, and blank **Filament Usage** columns for **Bitty** and **Biggy**
- For windows: `Windows: Clear acrylic` (no color) or `Windows (×2)` with the chosen color

---

## File layout

```
/
├── index.html               # App shell
├── src/
│   ├── main.js              # UI wiring, view selector, zoom controls, palette, windows selector
│   ├── viewer2d.js          # SVG loader, layer normalizer, recolor engine, zoom/pan
│   ├── state.js             # Shared state (selections, selectedPartId, windowsMaterial)
│   ├── palette.js           # Palette loader
│   ├── parts.js             # Parts loader
│   ├── pdf.js               # PDF export
│   └── styles.css           # App styles
├── assets/
│   ├── machine-front.svg    # Finalized front-view artwork
│   ├── machine-side.svg     # Finalized side-view artwork (with simulated window overlay)
│   └── machine-back.svg     # Finalized back-view artwork
├── data/
│   ├── parts.json           # Part definitions with logical ids, labels, qty, defaultColorId
│   └── bambu-pla-colors.json # Bambu PLA color catalog
├── vendor/
│   └── jspdf.umd.min.js     # Local jsPDF bundle for offline/static serving
└── scripts/
    └── fetch_bambu_pla.py   # Scraper for updating the color catalog
```

---

## SVG layer normalization

The finalized SVGs use Adobe Illustrator layer naming conventions.  
On load, `viewer2d.js` walks each SVG and maps recognized layer `id` attributes to `data-part` logical part ids:

| SVG layer id | Logical part id |
|---|---|
| `Bottom_Chamber` | `bottom-chamber` |
| `Bottom_Plate__x26__Mouth` | `bottom-plate-mouth` |
| `Coin_Mech._Back_Plate` | `coin-mech-back-plate` |
| `Coin_Mech._Gear` | `coin-mech-gear` |
| `Coin` | `coin` |
| `Coin_Mech._Front_Plate` | `coin-mech-front-plate` |
| `Knob` | `knob` |
| `Top_Chamber_x5F_Outside` | `top-chamber` |
| `Main_Gear` | `main-gear` |
| `Hole_Blocker` | `hole-blocker` |
| `Mid-Plate` | `mid-plate` |
| `Lid_Lock` | `lid-lock` |
| `Back_Cover` | `back-cover` |
| `Rear_Lock_Knob` | `rear-lock-knob` |
| `Lid` | `lid` |
| `Window_Overlay` | `window` |

Fixed/follower layers are tagged with `data-fixed-layer` and handled separately (not user-selectable):

| SVG layer id | Fixed behavior |
|---|---|
| `Top_Chamber_x5F_Inside` | Always `#FFFFFF` |
| `Top_Chamber_x5F_Inside_x5F_Back` | Always mirrors `top-chamber` user color |
| `Black` | Always `#565656` |

---

## Roadmap

- **Phase 2:** Replace `viewer2d.js` with a Three.js 3D viewer (`viewer3d.js`).  
  All other modules (state, palette, parts, pdf) remain unchanged.
- **Phase 3:** Order submission integration.
