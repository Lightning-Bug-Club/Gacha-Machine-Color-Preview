# Gata-Gata Gacha Machine — Color Customizer

A car-configurator-style **2D SVG color customizer** for the [Gata-Gata gachapon vending machine](https://www.lightningbugclub.com/product/gatagata-gacha-machine-100-3d-printable/W4J4ZBI4S6XYEYQWZHEMS6OJ) by Lightning Bug Club.

Select one of the 16 colorable parts, choose a Bambu Lab PLA filament color from the comprehensive palette, see the SVG recolor live across four placeholder views, and export a build-blueprint PDF listing every part with its chosen filament color and product URL.

---

## Quick Start

No build step required. Serve with any static file server (ES modules require a server — `file://` will not work):

```bash
# Python
python -m http.server 8080

# Python 3
python3 -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080` in your browser.

---

## How It Works

1. **Select a part** from the sidebar (or click directly on the SVG).
2. **Switch views** with the Front / Side / Back / Isometric selector to compare angles.
3. **Choose a color** from the grouped PLA palette — the active SVG recolors live.
4. **Export PDF** to download a build blueprint with a color legend. The PDF uses the currently visible view when preview rasterization succeeds, and still exports the legend if the preview image cannot be rendered.

The current URL is updated with a `?c=` parameter encoding all selections so builds can be bookmarked and shared.

---

## Module Map

```
├── index.html                  # App shell — loads src/main.js as an ES module
├── src/
│   ├── main.js                 # Entry point — wires palette, parts, state, viewer, UI
│   ├── viewer2d.js             # 2D SVG viewer — swaps Front/Side/Back/Iso SVGs,
│   │                           #   wires click + live recoloring
│   │                           #   Supports linked parts: multiple SVG elements can share
│   │                           #   the same data-part value to recolor as one logical unit
│   ├── state.js                # Config state + URL encode/decode (shared across phases)
│   ├── parts.js                # Loads data/parts.json
│   ├── palette.js              # Loads data/bambu-pla-colors.json
│   ├── pdf.js                  # PDF blueprint export via jsPDF (decoupled from viewer)
│   └── styles.css              # App styles
├── data/
│   ├── parts.json              # 16 colorable parts (see schema below)
│   └── bambu-pla-colors.json  # ~126 Bambu Lab PLA colors (see below)
├── assets/
│   ├── machine-front.svg       # Layered front SVG placeholder
│   ├── machine-side.svg        # Layered right-side SVG placeholder
│   ├── machine-back.svg        # Layered back SVG placeholder
│   └── machine-iso.svg         # Layered isometric SVG placeholder
└── scripts/
    └── fetch_bambu_pla.py      # Optional color dataset updater (see below)
```

---

## Data Files

### `data/parts.json`

Array of 16 part objects:

```json
{
  "id": "window",
  "label": "Window",
  "qty": 2,
  "defaultColorId": "basic-pla-cyan",
  "svgIds": ["part-window"]
}
```

| Field | Description |
|---|---|
| `id` | Logical part identifier (used as the state key) |
| `label` | Human-readable name shown in the sidebar and PDF legend |
| `qty` | Print quantity — `Window` is 2; all other parts are 1 |
| `defaultColorId` | Starting color — **must** be a valid `id` from `bambu-pla-colors.json` |
| `svgIds` | Array of SVG element ids (`id="part-<x>"`) driven by this part |

**Linked parts — Bottom Plate / Mouth:**  
`bottom-plate-mouth` is a single logical part whose `svgIds` contains two elements — `part-bottom-plate` and `part-mouth`. Both SVG elements carry `data-part="bottom-plate-mouth"`, so selecting this part and choosing a color recolors *both* regions together in one action.

**Separate part — Bottom Chamber:**  
`bottom-chamber` is its own independent part (`data-part="bottom-chamber"`). It is **not** linked to Bottom Plate / Mouth and recolors independently.

**Window qty 2:**  
Window has `qty: 2` because two identical pieces are printed. The PDF legend renders it as `Window (×2)`.

### `data/bambu-pla-colors.json`

Source: <https://3dfilamentprofiles.com/filaments/bambu-lab/pla>

~126 Bambu Lab PLA colors across 12 series. The UI groups swatches dynamically by each entry's `series` value so new series appear automatically:

| Series | Examples |
|---|---|
| Basic PLA | Jade White, Black, Cyan, Cobalt Blue, Bambu Green, Gold, Red … |
| PLA Matte | Ivory White, Marine Blue, Grass Green … |
| PLA Silk | White, Gold, Rose Gold, Baby Blue … |
| PLA Basic Gradient | Blueberry Bubblegum, Sakura … |
| PLA CF | Matcha Green, Jeans Blue, Royal Blue … |
| PLA Sparkle | Classic Gold, Alpine Green … |
| PLA Wood | White Oak … |
| PLA Translucent | Ice Blue, Blue, Light Jade … |
| PLA Glow | Glow Green, Glow Blue … |
| PLA Metal | Cobalt Blue Metallic, Oxide Green Metallic, Iridium Gold Metallic … |
| PLA Galaxy | Green … |
| PLA Marble | White Marble … |

JSON schema per entry:

```json
{
  "id": "basic-pla-cyan",
  "name": "Cyan",
  "hex": "#0086D6",
  "series": "Basic PLA",
  "finish": "basic",
  "url": "https://store.bambulab.com/products/pla-basic-filament"
}
```

Multi-color filaments (gradients, dual-silk) may include optional fields:
- `hexes`: array of hex strings for the component colors
- `notes`: human-readable description

---

## SVG Replacement Convention

To swap in the real layered SVG artwork, give every colorable region in each view:

```svg
<path id="part-<id>" data-part="<partId>" fill="<defaultFill>" … />
```

- `id` must be unique in the document (e.g. `part-lid`, `part-window`).
- `data-part` must match the logical `id` in `parts.json`.
- For linked parts, both elements share the same `data-part` value:
  ```svg
  <rect id="part-bottom-plate" data-part="bottom-plate-mouth" … />
  <rect id="part-mouth"        data-part="bottom-plate-mouth" … />
  ```
- No code changes needed — `viewer2d.js` detects all recolorable elements via `[data-part]`.
- The current repo ships with **placeholder** front / side / back / isometric art; production illustrations only need to preserve the same `id` / `data-part` mapping.

---

## Scraper — Updating the Color Dataset

`scripts/fetch_bambu_pla.py` scrapes `3dfilamentprofiles.com` and rewrites `data/bambu-pla-colors.json`. It is **not** required for the frontend — the JSON is checked in.

```bash
pip install requests beautifulsoup4
python scripts/fetch_bambu_pla.py              # overwrites data/bambu-pla-colors.json
python scripts/fetch_bambu_pla.py --dry-run    # print JSON to stdout only
python scripts/fetch_bambu_pla.py --out path/to/output.json
```

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| **1 — 2D (current)** | 2D SVG customizer, Bambu PLA palette, PDF export | ✅ In progress |
| **2 — 3D** | Three.js viewer reusing `state.js` / `palette.js` / `pdf.js`; replace `viewer2d.js` with `viewer3d.js` | Planned |
| **3 — Order integration** | Submit build configuration to lightningbugclub.com | Planned |

---

## Removed Legacy 3D Files

The abandoned Three.js prototype files have been removed from the root app layout so the repo reflects the current Phase 1 2D app:

- `viewer.js`
- `style.css`
- `convert.py`
- empty `models/` and `hdri/` directories

The scraper, checked-in JSON data, reference documents, and SVG assets remain part of the supported workflow.

---

## License

© Lightning Bug Club. All rights reserved.
