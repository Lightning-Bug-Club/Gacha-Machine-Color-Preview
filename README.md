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

The preview also supports **zooming and panning**:
- Mouse-wheel zoom centered on the cursor
- On-screen **+ / − / Reset** controls
- Click-and-drag panning while zoomed in
- Zoom/pan state stays active while switching between Front / Side / Back

> **Isometric view has been removed.** Only Front, Side, and Back are available.

### Parts list & color palette

Click a part in the sidebar, then click a swatch in the color palette to recolor it.  
The current color name and hex code are shown in the palette panel header.  
Colors are grouped by Bambu PLA series. The selectable palette intentionally excludes:
- PLA Basic Gradient
- PLA CF
- PLA Sparkle
- PLA Metal
- PLA Galaxy
- PLA Marble

The remaining groups keep **Basic PLA** first, followed by **PLA Matte**, **PLA Silk**, **PLA Wood**, **PLA Translucent**, **PLA Glow**, and any other non-excluded series.

### Your Colors tray + smarter randomize

The palette panel includes a **Your Colors** tray with 4 slots.
- Click a slot to make it active, then click any palette swatch to assign that color to the slot.
- Use **Clear Slot** to remove the active slot color.
- Slot choices are saved in browser storage so they persist on refresh.

Randomize now works with the harmony selector and your slots together:
- If 0 slots are chosen: randomize uses pure harmony generation (analogous, complementary, split-complementary, triad, square, monochromatic).
- If 1–4 slots are chosen: randomize uses only those selected slot colors (no auto-fill).
- The selected colors are then shuffled and randomly placed across parts each click.
- If windows are set to **Clear acrylic**, the window part is skipped.

### Saved Builds (localStorage, max 5)

The palette panel also includes a **Saved Builds** section.
- Save the current configuration (name + all part color selections + windows material).
- Load a saved build at any time to restore viewer + share URL state.
- Delete saved builds you no longer need.
- Up to 5 saved builds are stored per browser using `localStorage` key `gatagata.savedBuilds.v1`.
- If the browser storage is unavailable/corrupt, the app gracefully falls back to an empty saved-build list.

### Top Chamber — multi-layer follower

The sidebar shows a single **Top Chamber** part.  
Behind the scenes it governs three SVG layers:

| Layer | Behavior |
|-------|----------|
| `Top Chamber_Outside` | User's chosen color |
| `Top Chamber_Inside_Back` | Always mirrors the user's chosen color |
| `Top Chamber_Inside` | On-screen: viewer background gray (`#b7b7b7`) to appear see-through; PDF preview path: white (`#FFFFFF`) |

### Black layer — always fixed gray

The `Black` layer is always rendered as `#565656` regardless of any user action.  
It is not selectable and does not appear in the parts list.

### Windows material selector

Directly above the parts list is a prominent **Windows** section with two options:

| Option | Behavior |
|--------|----------|
| **3D printed windows** (default) | The user can pick a PLA color for the windows. Windows appear at **80% opacity** in the **Side view only**, visually covering the top chamber inside opening. Windows are never shown in Front or Back views. |
| **Clear acrylic windows** | Windows are fully transparent — no overlay is shown. The window color picker is disabled. |

> **Note:** The finalized SVGs currently contain no separate window geometry. Windows are **simulated** as a rounded-rectangle overlay in the side view. After the SVG is mounted, the overlay is resized to the **`Top_Chamber_Inside`** layer's bounding box, with a graceful fallback to the older union-bbox sizing if that layer is unavailable.

### Default white loadout + instruction banner

All machine parts, including the printed windows, now default to **Basic PLA Jade White** (`basic-pla-jade-white`) on first load.  
To keep white parts readable, the SVG viewer preserves visible outlines/strokes, and the page shows a top instruction banner telling the user to click a part first and then choose a color.  
The overall UI text sizing has also been increased for readability while preserving the Win95 look.

### Shareable URL

The **Share** button copies a URL that encodes all current color selections **and** the windows material choice (`?c=...&w=printed|acrylic`). Pasting this URL restores the exact configuration.

### Export PDF

The **Export PDF** button generates a build blueprint PDF containing:
- Framed **Front / Side / Back** raster previews in a single row on page 1, each scaled proportionally to avoid distortion
- A legend table with part names, color swatches, hex codes, and per-part **Filament Usage** values for **Bitty** and **Biggy** (grams)
- For windows: `Windows: Clear acrylic` (no color) or `Windows (×2)` with the chosen color
- A **Filament Needed by Color** summary table listing each distinct color in use with Bitty/Biggy gram totals
- Notes that coin usage estimates are for 25 coins and Lid Lock usage is an estimated 6 g

The previews remain resilient during export: if one view fails to rasterize, the PDF still downloads.

### Visual style

The app now uses a **Windows 95-inspired** interface:
- system gray background
- beveled raised/inset panels and buttons
- classic blue title bars
- retro system-font styling for the parts list, palette, view tabs, zoom controls, and action buttons

---

## File layout

```
/
├── index.html               # App shell
├── src/
│   ├── main.js              # UI wiring, view selector, palette, windows selector
│   ├── viewer2d.js          # SVG loader, layer normalizer, recolor engine
│   ├── state.js             # Shared state (selections, selectedPartId, windowsMaterial)
│   ├── palette.js           # Palette loader
│   ├── parts.js             # Parts loader
│   ├── pdf.js               # PDF export
│   ├── builds.js            # Saved builds (localStorage) helpers
│   └── styles.css           # App styles
├── assets/
│   ├── machine-front.svg    # Finalized front-view artwork
│   ├── machine-side.svg     # Finalized side-view artwork (with simulated window overlay)
│   └── machine-back.svg     # Finalized back-view artwork
├── data/
│   ├── parts.json           # Part definitions with logical ids, labels, qty, defaultColorId
│   ├── bambu-pla-colors.json # Bambu PLA color catalog
│   └── filament-usage.json  # Per-part filament usage estimates (bitty/biggy grams)
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
| `Top_Chamber_x5F_Inside` | On-screen `#b7b7b7` (viewer background match), white in PDF preview rendering |
| `Top_Chamber_x5F_Inside_x5F_Back` | Always mirrors `top-chamber` user color |
| `Black` | Always `#565656` |

---

## Roadmap

- **Phase 2:** Replace `viewer2d.js` with a Three.js 3D viewer (`viewer3d.js`).  
  All other modules (state, palette, parts, pdf) remain unchanged.
- **Phase 3:** Order submission integration.
