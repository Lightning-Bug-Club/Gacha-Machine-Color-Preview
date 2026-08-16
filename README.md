# Gata-Gata Gacha Machine — Phase 1 2D Color Customizer

A car-configurator-style 2D SVG app for assigning Bambu Lab PLA colors to the 15 printable parts of the Gata-Gata gacha machine. Pick a part, choose a filament color, preview the SVG live, and export a build-blueprint PDF with the rendered preview and part/color legend.

## Run locally

No build step is required.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` in your browser.

## Module map

- `src/main.js` — boots the app, loads data, builds the UI, and triggers PDF export
- `src/viewer2d.js` — injects the layered SVG, handles part clicks, and applies live recoloring
- `src/state.js` — stores the logical `partId -> colorId` selection state and shareable URL encoding
- `src/parts.js` — loads `data/parts.json`
- `src/palette.js` — loads `data/bambu-pla-colors.json`
- `src/pdf.js` — exports the blueprint PDF
- `src/styles.css` — Phase 1 UI styling

## Data files

### `data/parts.json`

`data/parts.json` is the single source of truth for the printable parts list. Each entry uses this schema:

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
| `id` | Logical part id used by the UI, URL state, and PDF legend |
| `label` | Human-readable part name |
| `qty` | Quantity required for the build (`Window` is `2`; every other current part is `1`) |
| `defaultColorId` | Default palette entry id from `data/bambu-pla-colors.json` |
| `svgIds` | One or more SVG element ids that should recolor together |

### Bottom Plate / Mouth linked-color behavior

`Bottom Plate / Mouth` is one logical part even though the placeholder SVG exposes two recolorable elements:

```json
{
  "id": "bottom-plate-mouth",
  "label": "Bottom Plate / Mouth",
  "qty": 1,
  "defaultColorId": "basic-pla-dark-gray",
  "svgIds": ["part-bottom-plate", "part-mouth"]
}
```

Choosing a color for this part recolors both `part-bottom-plate` and `part-mouth` together. The PDF legend lists it once. `Window` also remains one logical part, but its quantity is `2` so the legend renders `Window (×2)`.

### `data/bambu-pla-colors.json`

The palette is compiled from:
- **Primary source:** <https://3dfilamentprofiles.com/filaments/bambu-lab/pla>
- **Cross-reference:** Bambu Lab store <https://store.bambulab.com>

#### Series coverage

| Series | Count | `finish` tag |
|---|---:|---|
| Basic PLA | 30 | `basic` |
| PLA Matte | 25 | `matte` |
| PLA Silk | 18 | `silk` |
| PLA Basic Gradient | 8 | `gradient` |
| PLA CF | 7 | `matte` |
| PLA Sparkle | 6 | `sparkle` |
| PLA Wood | 6 | `wood` |
| PLA Translucent | 10 | `gloss` |
| PLA Glow | 5 | `glow` |
| PLA Metal | 5 | `metal` |
| PLA Galaxy | 4 | `galaxy` |
| PLA Marble | 2 | `marble` |

#### JSON schema

Each entry in `data/bambu-pla-colors.json` follows this structure:

```json
{
  "id": "basic-pla-jade-white",
  "name": "Jade White",
  "hex": "#FFFFFF",
  "series": "Basic PLA",
  "finish": "basic",
  "url": "https://store.bambulab.com/products/pla-basic-filament",
  "hexes": ["#9CDBD9", "#FFFFFF"],
  "notes": "optional effect / approximation notes"
}
```

Required fields are `id`, `name`, `hex`, `series`, `finish`, and `url`. Optional `hexes` and `notes` fields are used for gradient, dual-color, sparkle, galaxy, marble, wood, and other specialty filaments where extra context helps.

#### Scraper / maintenance script

`scripts/fetch_bambu_pla.py` is included for refreshing the committed palette data. The frontend does **not** require it.

```bash
pip install -r requirements.txt
python scripts/fetch_bambu_pla.py
python scripts/fetch_bambu_pla.py --dry-run
python scripts/fetch_bambu_pla.py --no-scrape
```

The script writes `data/bambu-pla-colors.json` and depends on the scraper-only packages declared in `requirements.txt`.

## Replacing the placeholder SVG

The placeholder file is `assets/machine-front.svg`. When swapping in the real layered artwork:

1. Keep each recolorable area on its own SVG element or group.
2. Give the recolorable element an id in the form `id="part-<svg-fragment-id>"`.
3. Add `data-part="<logical-part-id>"` so clicks map back to the logical part from `data/parts.json`.
4. If one logical part spans multiple SVG elements, keep distinct element ids and list them together in `svgIds`.

Example for the linked Bottom Plate / Mouth part:

```xml
<rect id="part-bottom-plate" data-part="bottom-plate-mouth" ... />
<rect id="part-mouth" data-part="bottom-plate-mouth" ... />
```

## PDF export

The **Export PDF** action generates a build blueprint containing:
- the current machine preview
- one legend row per logical part
- part label and quantity when relevant (for example `Window (×2)`)
- the selected Bambu color name, hex, and product URL

## Roadmap

- **Phase 1** — this 2D SVG color customizer
- **Phase 2** — a Three.js 3D viewer that reuses the shared `state`, `palette`, `parts`, and `pdf` modules
- **Phase 3** — order integration for `lightningbugclub.com`
