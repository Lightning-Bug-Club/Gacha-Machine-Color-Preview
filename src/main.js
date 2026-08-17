/**
 * main.js — wires together palette, parts, state, viewer2d, and UI.
 *
 * Phase 1 entry point. In Phase 2 (Three.js), only the viewer import changes.
 */

import { loadPalette, getColors, getColorById } from './palette.js';
import { loadParts, getParts } from './parts.js';
import {
  getState,
  setPartColor,
  setSelectedPart,
  setWindowsMaterial,
  subscribe,
  decodeStateFromURL,
  pushStateToURL,
} from './state.js';
import {
  initViewer,
  getCurrentView,
  setCurrentView,
  createPreviewSVG,
  zoomIn,
  zoomOut,
  resetViewTransform,
} from './viewer2d.js';
import { exportPDF } from './pdf.js';

const SERIES_ORDER = [
  'Basic PLA',
  'PLA Matte',
  'PLA Silk',
  'PLA Wood',
  'PLA Translucent',
  'PLA Glow',
];

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
  await initViewer(viewerEl, 'front');
  _wireViewSelector();
  _wireZoomControls();

  // ── Build parts list sidebar ──────────────────────────────────────────────
  const partsList = document.getElementById('parts-list');
  // Exclude 'window' from the main parts list (it's controlled via the windows selector)
  const displayParts = parts.filter(p => p.id !== 'window');
  displayParts.forEach(part => {
    const li = document.createElement('li');
    li.className = 'part-item';
    li.dataset.partId = part.id;
    li.textContent = part.label;
    li.addEventListener('click', () => setSelectedPart(part.id));
    partsList.appendChild(li);
  });

  // ── Windows material selector ─────────────────────────────────────────────
  _wireWindowsSelector();

  // ── Build color palette grid ──────────────────────────────────────────────
  const paletteGrid = document.getElementById('palette-grid');
  _renderPaletteGroups(paletteGrid, colors);

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

    // Disable window color picking when "Clear acrylic" is selected
    const windowsPrinted = snap.windowsMaterial === 'printed';
    paletteGrid.querySelectorAll('.color-swatch').forEach(btn => {
      if (snap.selectedPartId === 'window' && !windowsPrinted) {
        btn.disabled = true;
        btn.style.opacity = '0.35';
        btn.style.cursor = 'not-allowed';
      } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
      }
    });

    // Push state to URL for shareability
    pushStateToURL();
  });

  // ── Export PDF button ─────────────────────────────────────────────────────
  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    try {
      const previewDataURLs = await _renderPreviewSet();

      await exportPDF({
        previewDataURLs,
        selections: getState().selections,
        windowsMaterial: getState().windowsMaterial,
        parts: getParts(),
        colors: getColors(),
      });
      _showToast('PDF exported with Front, Side, and Back previews.');
    } catch (err) {
      console.error('PDF export failed:', err);
      _showToast(err.message || 'PDF export failed. Please try again.');
    }
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

function _wireViewSelector() {
  const selector = document.getElementById('view-selector');
  if (!selector) return;

  selector.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nextView = btn.dataset.view;
      if (!nextView || nextView === getCurrentView()) return;

      try {
        await setCurrentView(nextView);
        _syncViewTabs();
      } catch (err) {
        console.error('Failed to switch view:', err);
        _showToast(`Could not load the ${_viewLabel(nextView)} view.`);
      }
    });
  });

  _syncViewTabs();
}

function _wireZoomControls() {
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => zoomOut());
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => resetViewTransform());
}

function _syncViewTabs() {
  document.querySelectorAll('.view-tab').forEach(btn => {
    const isActive = btn.dataset.view === getCurrentView();
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
}

function _wireWindowsSelector() {
  const radios = document.querySelectorAll('input[name="windows-material"]');
  if (!radios.length) return;

  // Sync radio to current state
  const currentMaterial = getState().windowsMaterial;
  radios.forEach(r => { r.checked = r.value === currentMaterial; });

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setWindowsMaterial(radio.value);
        // If switching to acrylic, deselect window part so palette isn't confusing
        if (radio.value === 'acrylic' && getState().selectedPartId === 'window') {
          setSelectedPart(null);
        }
      }
    });
  });

  // Keep radios in sync with state (e.g. URL restore)
  subscribe(snap => {
    radios.forEach(r => { r.checked = r.value === snap.windowsMaterial; });
  });
}

function _renderPaletteGroups(containerEl, colors) {
  const grouped = colors.reduce((map, color) => {
    const key = color.series || 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(color);
    return map;
  }, new Map());

  const sortedSeries = Array.from(grouped.keys()).sort((a, b) => {
    const aIndex = SERIES_ORDER.indexOf(a);
    const bIndex = SERIES_ORDER.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex)
        - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    }
    return a.localeCompare(b);
  });

  sortedSeries.forEach(series => {
    const section = document.createElement('section');
    section.className = 'palette-series';

    const heading = document.createElement('h3');
    heading.className = 'palette-series-title';
    heading.textContent = series;
    section.appendChild(heading);

    const groupGrid = document.createElement('div');
    groupGrid.className = 'palette-series-grid';

    grouped.get(series).forEach(color => {
      const btn = document.createElement('button');
      btn.className = 'color-swatch';
      btn.title = `${color.name} (${color.hex})`;
      btn.dataset.colorId = color.id;
      btn.style.backgroundColor = color.hex;
      btn.setAttribute('aria-label', `${series}: ${color.name}`);

      if (color.hex.toUpperCase() === '#FFFFFF') {
        btn.style.border = '1px solid #ccc';
      }

      btn.addEventListener('click', () => {
        const { selectedPartId, windowsMaterial } = getState();
        if (!selectedPartId) {
          _showToast('Select a part first, then choose a color.');
          return;
        }
        // Block window color selection when acrylic is chosen
        if (selectedPartId === 'window' && windowsMaterial === 'acrylic') {
          _showToast('Switch to "3D printed windows" to choose a window color.');
          return;
        }
        setPartColor(selectedPartId, color.id);
      });

      groupGrid.appendChild(btn);
    });

    section.appendChild(groupGrid);
    containerEl.appendChild(section);
  });
}

/** Convert the current inline SVG view to a PNG data URL via canvas. */
async function _svgToDataURL(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const viewBox = clone.viewBox?.baseVal;
  const width = Math.max(1, Math.round(viewBox?.width || svgEl.clientWidth || 600));
  const height = Math.max(1, Math.round(viewBox?.height || svgEl.clientHeight || 800));
  clone.setAttribute('viewBox', clone.getAttribute('viewBox') || `0 0 ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const svgStr = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not create a canvas context for PDF export.'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not render the current SVG view for PDF export.'));
    img.src = url;
  });
}

async function _renderPreviewSet() {
  const state = getState();
  const labels = ['front', 'side', 'back'];
  const previews = {};

  const results = await Promise.allSettled(labels.map(async viewName => {
    const previewSvg = await createPreviewSVG(viewName, state);
    return { viewName, dataURL: await _svgToDataURL(previewSvg) };
  }));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      previews[result.value.viewName] = result.value.dataURL;
      return;
    }

    const failedView = labels[index];
    console.warn(`SVG rasterization failed for ${failedView} view, continuing PDF export:`, result.reason);
    previews[failedView] = null;
  });

  return previews;
}

function _viewLabel(viewName) {
  return ({ front: 'Front', side: 'Side', back: 'Back' })[viewName] || 'Front';
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
