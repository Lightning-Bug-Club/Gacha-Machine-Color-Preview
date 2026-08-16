# Gacha Machine Color Configurator

An interactive **3D color configurator** you can embed on any website. Pick colours for each part of your Gacha Machine vending machine, switch between matte / gloss / metallic finishes, and download a screenshot — all in the browser, with no server required.

---

## Table of Contents

1. [Project overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Folder structure](#folder-structure)
4. [Bambu Lab PLA colour data](#bambu-lab-pla-colour-data)
5. [STL → GLB conversion with `convert.py`](#stl--glb-conversion)
6. [Naming mesh parts in Blender](#naming-mesh-parts-in-blender)
7. [Adding an HDRI for better lighting](#adding-an-hdri-for-better-lighting)
8. [Running locally](#running-locally)
9. [Embedding in your website](#embedding-in-your-website)
10. [Customising colour presets and parts](#customising-colour-presets-and-parts)

---

## Project overview

| Feature | Detail |
|---|---|
| 3D engine | [three.js](https://threejs.org/) r160+ via CDN |
| Format | GLB / glTF for web delivery |
| Materials | PBR `MeshStandardMaterial` |
| Lighting | HDRI environment map (with procedural fallback) |
| Controls | Orbit / zoom / pan via `OrbitControls` |
| No build step | Just open `index.html` in a browser |

---

## Prerequisites

* **Python 3.8+** — only needed for the STL → GLB conversion step
* **A modern browser** — Chrome, Firefox, Edge, Safari (ES modules required)
* Internet connection on first load (three.js is fetched from the CDN)

---

## Folder structure

```
/
├── index.html          ← main embeddable viewer page
├── viewer.js           ← three.js scene, loader, color logic
├── style.css           ← dark-themed responsive UI
├── convert.py          ← Python STL → GLB pipeline
├── requirements.txt    ← Python dependencies
├── models/
│   └── gacha-machine.glb   ← drop your exported GLB here
├── data/
│   └── bambu-pla-colors.json  ← Bambu Lab PLA colour palette
├── scripts/
│   └── fetch_bambu_pla.py     ← optional palette updater / scraper
└── hdri/
    └── environment.hdr     ← optional HDRI lighting file
```

---

## Bambu Lab PLA colour data

### Source

The palette is compiled from:
- **Primary:** <https://3dfilamentprofiles.com/filaments/bambu-lab/pla> (all pages)
- **Cross-reference:** Bambu Lab official store <https://store.bambulab.com> and community data at <https://github.com/piitaya/bambu-filaments> and <https://github.com/DBorsheim/bambu-labs-filament-list>

### Series covered

| Series | Finish tag | Notes |
|---|---|---|
| Basic PLA | `basic` | 30 solid colours |
| PLA Matte | `matte` | 25 flat-finish colours |
| PLA Silk / Silk+ | `silk` | 13 single-colour + 5 dual-colour |
| PLA Metal | `metal` | 5 metallic-effect colours |
| PLA Galaxy | `galaxy` | 4 colours with glitter particles |
| PLA Sparkle | `sparkle` | 6 fine-glitter colours |
| PLA Marble | `marble` | 2 marble-texture colours |
| PLA Wood | `wood` | 6 wood-fibre composite colours |
| PLA Glow | `glow` | 5 glow-in-the-dark colours |
| PLA Basic Gradient | `gradient` | 8 dual-tone gradient colours |
| PLA Translucent | `gloss` | 10 semi-translucent colours |
| PLA CF | `matte` | 7 carbon-fibre reinforced colours |

### JSON schema

Each entry in `data/bambu-pla-colors.json`:

```jsonc
{
  "id":     "basic-pla-jade-white",
  "name":   "Jade White",
  "hex":    "#FFFFFF",
  "series": "Basic PLA",
  "finish": "basic",
  "url":    "https://store.bambulab.com/products/pla-basic-filament",
  // optional:
  "hexes":  ["#9CDBD9","#FFFFFF"],
  "notes":  "Teal to white gradient"
}
```

Fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique, lowercase, kebab-case, series-prefixed (e.g. `matte-pla-ivory-white`) |
| `name` | string | ✅ | Human-readable colour name |
| `hex` | string | ✅ | Best-available `#RRGGBB`. For multi-colour filaments, the primary representative hex. |
| `series` | string | ✅ | Human-readable series label (see table above) |
| `finish` | string | ✅ | One of: `basic` `matte` `silk` `metal` `galaxy` `sparkle` `marble` `wood` `glow` `gradient` `gloss` |
| `url` | string | ✅ | Bambu Lab store product page |
| `hexes` | string[] | optional | Component colours for gradient/dual-silk/marble/galaxy filaments |
| `notes` | string | optional | Effect description or `"hex approximate"` if the hex cannot be reliably determined |

### Refreshing the palette

A maintenance script is provided that scrapes the live source and regenerates the JSON:

```bash
# Install scraper dependencies (NOT required for the frontend)
pip install requests beautifulsoup4

# Fetch all pages and overwrite data/bambu-pla-colors.json
python scripts/fetch_bambu_pla.py

# Dry-run: print JSON to stdout, do not write file
python scripts/fetch_bambu_pla.py --dry-run

# Use static fallback only (no network request)
python scripts/fetch_bambu_pla.py --no-scrape

# Write to a custom path
python scripts/fetch_bambu_pla.py --out path/to/output.json
```

---

## STL → GLB conversion

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Convert a single STL file

```bash
python convert.py path/to/your-machine.stl
# Output: models/your-machine.glb
```

### 3. Specify the output path

```bash
python convert.py path/to/your-machine.stl --output models/gacha-machine.glb
```

### 4. Convert all STLs in a directory

```bash
python convert.py --dir ./stl_files
```

### 5. Reduce polygon count for web performance

The `--decimate` flag accepts a ratio between 0 and 1, where `0.5` keeps 50% of the original faces.

```bash
python convert.py input.stl --decimate 0.5
python convert.py --dir ./stl_files --decimate 0.3 --models-dir models
```

The script prints a summary table:

```
====================================================================
  Conversion Summary (1 file(s))
====================================================================
  IN  : input.stl
  OUT : models/gacha-machine.glb  [312.4 KB]  (↓ 50.0% faces)
        Verts 48,220 → 24,110   Faces 96,440 → 48,220
====================================================================
```

> **Tip:** Aim for 20k–50k faces for smooth real-time rendering in a browser.

---

## Naming mesh parts in Blender

The viewer looks for mesh names that **start with** one of four part names (case-insensitive):

| Part key | What it controls | Example Blender names |
|---|---|---|
| `Body` | Main cabinet body | `Body`, `Body_001`, `body_main` |
| `Door` | Front panel / door | `Door`, `Door_glass`, `door_panel` |
| `Trim` | Frame, border strips | `Trim`, `Trim_top`, `trim_edge` |
| `Accent` | Buttons, decals, details | `Accent`, `Accent_coin_slot` |

**Steps in Blender:**

1. Import your STL (`File → Import → STL`).
2. In the *Outliner*, rename each object to match the table above.
3. Export: `File → Export → glTF 2.0`.
   * Format: **GLB** (binary)
   * Include: ✅ Mesh, ✅ Materials
4. Drop the `.glb` into the `models/` directory, naming it `gacha-machine.glb`.

Meshes that don't match any part name are still rendered; they just won't respond to the per-part colour pickers.

---

## Adding an HDRI for better lighting

1. Download a free HDR file from [Poly Haven](https://polyhaven.com/hdris) — a 1K or 2K resolution is plenty for a web preview.
2. Rename it to `environment.hdr`.
3. Place it in the `hdri/` directory.

The viewer automatically detects and loads it on startup. If no HDRI is present it falls back to a procedural hemisphere + directional light setup.

---

## Running locally

### Option A — open directly in browser

Double-click `index.html`.  
> **Note:** Some browsers block local `fetch()` requests (CORS). If the model doesn't load, use Option B.

### Option B — Python dev server (recommended)

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Embedding in your website

### `<iframe>` embed (recommended)

```html
<iframe
  src="https://your-site.com/gacha-configurator/index.html"
  width="900"
  height="600"
  style="border:none; border-radius:12px;"
  allow="fullscreen"
  title="Gacha Machine Color Configurator"
></iframe>
```

### Self-hosted page

Copy the entire project folder to your web host and link directly to `index.html`.

---

## Customising colour presets and parts

### Change default colours

In `viewer.js`, edit the `PART_DEFAULTS` object:

```js
const PART_DEFAULTS = {
  Body:   '#e63946', // ← change to any hex colour
  Door:   '#457b9d',
  Trim:   '#1d3557',
  Accent: '#f1c40f',
};
```

### Add or rename parts

1. Add an entry to `PART_DEFAULTS` in `viewer.js`.
2. Add a matching colour picker row in `index.html` (copy an existing `.picker-row` block and update the `data-part` attribute).
3. Name your Blender mesh objects with the new part key as a prefix.

### Change preset swatches

In `index.html` find the `id="preset-swatches"` section and add / remove `.swatch` `<button>` elements with `data-color` attributes:

```html
<button class="swatch" data-color="#ff6b6b" title="Coral" style="background:#ff6b6b"></button>
```

### Adjust finish presets

In `viewer.js`, edit `FINISH_PRESETS`:

```js
const FINISH_PRESETS = {
  matte:    { roughness: 0.9, metalness: 0.0 },
  gloss:    { roughness: 0.1, metalness: 0.1 },
  metallic: { roughness: 0.3, metalness: 0.9 },
};
```

---

*Built with ❤️ using [three.js](https://threejs.org/)*
