/**
 * main.js — wires together palette, parts, state, viewer2d, and UI.
 *
 * This is the Phase 1 entry point. In Phase 2 (Three.js), only the viewer
 * import changes; palette, parts, state, and pdf modules remain the same.
 */

import { loadPalette, getColors, getColorById } from './palette.js';
import { loadParts, getParts } from './parts.js';
import {
  getState,
  setPartColor,
  setSelectedPart,
  subscribe,
  decodeStateFromURL,
  pushStateToURL,
  loadSelections,
} from './state.js';
import { initViewer, getSVGElement } from './viewer2d.js';
import { exportPDF } from './pdf.js';

async function init() {
  // ── Load data ─────────────────────────────────────────────────────────────
  const [colors, parts] = await Promise.all([loadPalette(), loadParts()]);

  // Expose palette map globally so viewer2d.js can resolve color ids to hex
  window.__paletteMap = {};
  colors.forEach(c => { window.__paletteMap[c.id] = c; });

  // ── Restore state from URL (before init so the viewer gets initial colors) ─
  decodeStateFromURL();

  // Apply default colors for parts that have no URL selection
  const state = getState();
  parts.forEach(part => {
    if (!state.selections[part.id]) {
      setPartColor(part.id, part.defaultColorId);
    }
  });

  // ── Init viewer ──────────────────────────────────────────────────────────
  const viewerEl = document.getElementById('viewer');
  await initViewer(viewerEl);

  // ── Build parts list sidebar ──────────────────────────────────────────────
  const partsList = document.getElementById('parts-list');
  parts.forEach(part => {
    const li = document.createElement('li');
    li.className = 'part-item';
    li.dataset.partId = part.id;
    li.textContent = part.qty > 1 ? `${part.label} (×${part.qty})` : part.label;
    li.addEventListener('click', () => setSelectedPart(part.id));
    partsList.appendChild(li);
  });

  // ── Build color palette grid ──────────────────────────────────────────────
  const paletteGrid = document.getElementById('palette-grid');
  colors.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'color-swatch';
    btn.title = `${color.name} (${color.hex})`;
    btn.dataset.colorId = color.id;
    btn.style.backgroundColor = color.hex;
    btn.setAttribute('aria-label', color.name);

    // White swatch gets a border so it's visible
    if (color.hex.toUpperCase() === '#FFFFFF') {
      btn.style.border = '1px solid #ccc';
    }

    btn.addEventListener('click', () => {
      const { selectedPartId } = getState();
      if (!selectedPartId) {
        _showToast('Select a part first, then choose a color.');
        return;
      }
      setPartColor(selectedPartId, color.id);
    });

    paletteGrid.appendChild(btn);
  });

  // ── Color name tooltip label ──────────────────────────────────────────────
  const colorNameEl = document.getElementById('color-name');
  paletteGrid.addEventListener('mouseover', e => {
    const btn = e.target.closest('.color-swatch');
    if (btn) colorNameEl.textContent = btn.title;
  });
  paletteGrid.addEventListener('mouseleave', () => {
    colorNameEl.textContent = '';
  });

  // ── Reactive UI updates ───────────────────────────────────────────────────
  subscribe(snap => {
    // Highlight selected part in sidebar
    partsList.querySelectorAll('.part-item').forEach(li => {
      li.classList.toggle('selected', li.dataset.partId === snap.selectedPartId);
    });

    // Show color name & swatch for selected part
    const activeColorId = snap.selectedPartId
      ? snap.selections[snap.selectedPartId]
      : null;
    const activeColor = activeColorId ? getColorById(activeColorId) : null;

    const selectedColorEl = document.getElementById('selected-color');
    if (selectedColorEl) {
      if (activeColor) {
        selectedColorEl.textContent = `${activeColor.name} — ${activeColor.hex}`;
        selectedColorEl.style.setProperty('--swatch', activeColor.hex);
      } else {
        selectedColorEl.textContent = '';
      }
    }

    // Highlight active swatch in palette
    paletteGrid.querySelectorAll('.color-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.colorId === activeColorId);
    });

    // Push state to URL for shareability
    pushStateToURL();
  });

  // ── Export PDF button ─────────────────────────────────────────────────────
  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    const svgEl = getSVGElement();
    if (!svgEl) {
      _showToast('Viewer not ready.');
      return;
    }

    // Rasterize SVG to a PNG data URL via canvas
    let previewDataURL = null;
    try {
      previewDataURL = await _svgToDataURL(svgEl);
    } catch (e) {
      console.warn('SVG rasterization failed, exporting without preview:', e);
    }

    await exportPDF({
      previewDataURL,
      selections: getState().selections,
      parts: getParts(),
      colors: getColors(),
    });
  });

  // ── Share URL button ──────────────────────────────────────────────────────
  const btnShare = document.getElementById('btn-share');
  if (btnShare) {
    btnShare.addEventListener('click', () => {
      const url = window.location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => _showToast('Link copied to clipboard!'));
      } else {
        prompt('Copy this link to share your config:', url);
      }
    });
  }
}

/** Convert an inline SVG element to a PNG data URL via canvas. */
async function _svgToDataURL(svgEl) {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Show a brief toast notification. */
function _showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

init().catch(err => {
  console.error('Failed to initialize app:', err);
  document.getElementById('viewer').innerHTML =
    `<p style="color:red;padding:1rem;">Error loading app: ${err.message}</p>`;
});
