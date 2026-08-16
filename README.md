# Gata-Gata Gacha Machine — Color Customizer

A web-based color customizer for the [Gata-Gata gachapon vending machine](https://www.lightningbugclub.com/product/gatagata-gacha-machine-100-3d-printable/W4J4ZBI4S6XYEYQWZHEMS6OJ).  
Select a part, choose a Bambu Lab PLA filament color, preview the result live, and export a build blueprint PDF.

---

## Quick Start

No build step is required for development. Open `index.html` directly, or serve with any static file server:

```bash
# Python (built in)
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code — use Live Server extension
```

Then open `http://localhost:8080` in your browser.

> **Note:** ES modules require a server (not `file://`). Use one of the commands above.

---

## Project Structure

```
├── index.html                   # App shell
├── src/
│   ├── main.js                  # Entry point — wires everything together
│   ├── palette.js               # Loads Bambu PLA color data
│   ├── parts.js                 # Loads parts definitions
│   ├── state.js                 # Config state + URL encode/decode (shared)
│   ├── viewer2d.js              # 2D SVG viewer — loads SVG, wires recoloring
│   ├── pdf.js                   # PDF blueprint export (decoupled from viewer)
│   └── styles.css               # App styles
├── data/
│   ├── bambu-pla-colors.json    # Bambu Lab PLA filament palette
│   └── parts.json               # Colorable parts definitions
├── assets/
│   └── machine-front.svg        # Placeholder layered SVG (replace with real art)
├── scripts/
│   └── (optional Python scraper — see below)
└── README.md
```

---

## How to Replace the Placeholder SVG

The placeholder `assets/machine-front.svg` is a stylized stand-in for the real machine art. To swap in your real layered SVG:

### Convention

Every colorable region in your SVG **must** have:
- `id="part-<partId>"` — where `<partId>` matches an `"id"` entry in `data/parts.json`
- `data-part="<partId>"` — same value, used by `viewer2d.js` for event wiring

Example:
```xml
<path id="part-lid" data-part="lid" fill="#00AE42" d="…" />
<g    id="part-top-chamber" data-part="top-chamber">…</g>
```

### Steps

1. Create your layered SVG (e.g. in Inkscape or Illustrator — one layer per colorable part).
2. Name each part's element/group with the `id` and `data-part` convention above.
3. Replace `assets/machine-front.svg` with your file.
4. Update `data/parts.json` if your parts differ from the placeholder set.
5. No code changes needed — `viewer2d.js` discovers parts via `[data-part]` selectors.

---

## Data Files

### `data/parts.json`

Array of colorable part definitions:

```json
[
  { "id": "lid",   "label": "Lid",   "defaultColorId": "bambu-green" },
  …
]
```

| Field           | Description                                    |
|-----------------|------------------------------------------------|
| `id`            | Must match `data-part` in the SVG              |
| `label`         | Human-readable name shown in the parts sidebar |
| `defaultColorId`| Initial color (must match a color `id`)         |

Parts were extracted from the included reference PDF (`Gacha Machine Color Picker Reference.pdf`):
`lid`, `lid-lock`, `top-chamber`, `window`, `hole-blocker`, `mid-plate`, `main-gear`,
`coin-mech-back-plate`, `coin-mech-front-plate`, `coin-mech-gear`, `knob`, `mouth`,
`bottom-chamber`, `rear-lock-knob`, `bottom-plate`, `back-cover`.

### `data/bambu-pla-colors.json`

Array of Bambu Lab PLA filament colors:

```json
[
  { "id": "bambu-green", "name": "Bambu Green", "hex": "#00AE42", "series": "Basic PLA", "url": "…" },
  …
]
```

To add more colors (e.g. Matte PLA, Silk PLA), append entries with a unique `id`.

---

## Architecture

### Module Map

```
main.js
  ├─ palette.js    ← loads bambu-pla-colors.json
  ├─ parts.js      ← loads parts.json
  ├─ state.js      ← selections { partId: colorId }, URL encode/decode
  ├─ viewer2d.js   ← fetches machine-front.svg, wires clicks → state
  └─ pdf.js        ← jsPDF blueprint (preview image + legend table)
```

### Shared Modules (Phase 1 → Phase 2 → Phase 3)

`state.js`, `palette.js`, `parts.js`, and `pdf.js` are **viewer-agnostic**.  
When Phase 2 (Three.js) is added, only `viewer2d.js` is replaced with `viewer3d.js`.  
When Phase 3 (ordering) is added, `state.js`'s `getSelections()` output is POSTed directly to the order endpoint.

### URL State

The current color configuration is encoded into the URL query string as `?c=partId:colorId,…`.  
Sharing the URL restores the exact configuration in any browser.

---

## Roadmap

| Phase | Description                                                      | Status      |
|-------|------------------------------------------------------------------|-------------|
| **1** | 2D orthographic viewer (this PR) — layered SVG + Bambu palette + PDF export | ✅ Done |
| **2** | Three.js 3D viewer — load GLB with named meshes, reuse state/palette/pdf | 🗓 Planned |
| **3** | Order integration — POST config to lightningbugclub.com checkout | 🗓 Planned |

### Phase 2 Notes (Three.js)

1. Export the machine model to GLB with each colorable part as a **named mesh** (same `id` convention as SVG parts).
2. Create `src/viewer3d.js` — load GLB via `THREE.GLTFLoader`, assign `MeshStandardMaterial` per mesh, wire color changes from state.
3. Capture preview: `renderer.domElement.toDataURL('image/png')` → pass to `pdf.js` unchanged.
4. Replace the `viewer2d` import in `main.js` with `viewer3d`.

### Phase 3 Notes (Order Integration)

`state.getSelections()` returns `{ partId: colorId }` — this is the order payload.  
Add a "Submit Order" button that POSTs this object (plus customer info) to the shop's API.

---

## PDF Export

The "Export PDF" button generates a **build blueprint** containing:
- Machine preview image (rasterized SVG)
- Table: Part label | Bambu color name | Hex value | Product URL

Powered by [jsPDF](https://github.com/parallax/jsPDF) (loaded via CDN).

---

## Scripts (Optional)

A Python scraper can be added under `scripts/update-colors.py` to refresh `data/bambu-pla-colors.json` from [3dfilamentprofiles.com](https://3dfilamentprofiles.com/filaments/bambu-lab/pla).  
The frontend is **not** dependent on this script — the JSON file is committed and served statically.

---

## License

See repository for license details.  
Machine design © Lightning Bug Club.
