/**
 * main.js — wires together palette, parts, state, viewer2d, and UI.
 *
 * Phase 1 entry point. In Phase 2 (Three.js), only the viewer import changes.
 */

import { loadPalette, getAllColors, getColorById } from './palette.js';
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
  createPreviewSVG,
  getCurrentView,
  setCurrentView,
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

const PDF_VIEWS = ['front', 'side', 'back'];

async function init() {
  const [colors, parts] = await Promise.all([loadPalette(), loadParts()]);
  const allColors = getAllColors();

  window.__paletteMap = {};
  allColors.forEach(c => { window.__paletteMap[c.id] = c; });

  decodeStateFromURL();

  const state = getState();
  parts.forEach(part => {
    if (!state.selections[part.id]) {
      setPartColor(part.id, part.defaultColorId);
    }
  });

  const viewerEl = document.getElementById('viewer');
  await initViewer(viewerEl, 'front');
  _wireViewSelector();
  _wireZoomControls();

  const partsList = document.getElementById('parts-list');
  const displayParts = parts.filter(p => p.id !== 'window');
  displayParts.forEach(part => {
    const li = document.createElement('li');
    li.className = 'part-item';
    li.dataset.partId = part.id;
    li.textContent = part.label;
    li.addEventListener('click', () => setSelectedPart(part.id));
    partsList.appendChild(li);
  });

  _wireWindowsSelector();

  const paletteGrid = document.getElementById('palette-grid');
  _renderPaletteGroups(paletteGrid, colors);

  const colorNameEl = document.getElementById('color-name');
  paletteGrid.addEventListener('mouseover', e => {
    const btn = e.target.closest('.color-swatch');
    if (btn) colorNameEl.textContent = btn.title;
  });
  paletteGrid.addEventListener('mouseleave', () => {
    colorNameEl.textContent = '';
  });

  subscribe(snap => {
    partsList.querySelectorAll('.part-item').forEach(li => {
      li.classList.toggle('selected', li.dataset.partId === snap.selectedPartId);
    });

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
        selectedColorEl.style.removeProperty('--swatch');
      }
    }

    paletteGrid.querySelectorAll('.color-swatch').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.colorId === activeColorId);
    });

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

    pushStateToURL();
  });

  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    try {
      const previewDataURLs = await _buildPDFPreviews();
      await exportPDF({
        previewDataURLs,
        selections: getState().selections,
        windowsMaterial: getState().windowsMaterial,
        parts: getParts(),
        colors: getAllColors(),
      });
      _showToast('PDF exported.');
    } catch (err) {
      console.error('PDF export failed:', err);
      _showToast(err.message || 'PDF export failed. Please try again.');
    }
  });

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

  const currentMaterial = getState().windowsMaterial;
  radios.forEach(r => { r.checked = r.value === currentMaterial; });

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setWindowsMaterial(radio.value);
        if (radio.value === 'acrylic' && getState().selectedPartId === 'window') {
          setSelectedPart(null);
        }
      }
    });
  });

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
      btn.type = 'button';
      btn.title = `${color.name} (${color.hex})`;
      btn.dataset.colorId = color.id;
      btn.style.backgroundColor = color.hex;
      btn.setAttribute('aria-label', `${series}: ${color.name}`);

      if (color.hex.toUpperCase() === '#FFFFFF') {
        btn.classList.add('is-white');
      }

      btn.addEventListener('click', () => {
        const { selectedPartId, windowsMaterial } = getState();
        if (!selectedPartId) {
          _showToast('Select a part first, then choose a color.');
          return;
        }
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

async function _buildPDFPreviews() {
  const state = getState();
  const previews = [];

  for (const viewName of PDF_VIEWS) {
    try {
      const svgEl = await createPreviewSVG(viewName, state);
      const dataURL = await _svgToDataURL(svgEl);
      previews.push({ view: viewName, dataURL });
    } catch (err) {
      console.warn(`Skipping ${viewName} PDF preview after rasterization failure:`, err);
    }
  }

  return previews;
}

/** Convert an SVG view to a PNG data URL via canvas. */
async function _svgToDataURL(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const viewBox = clone.viewBox?.baseVal;
  const width = Math.max(1, Math.round(viewBox?.width || 1224));
  const height = Math.max(1, Math.round(viewBox?.height || 792));
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
    img.onerror = () => reject(new Error('Could not render an SVG view for PDF export.'));
    img.src = url;
  });
}

function _viewLabel(viewName) {
  return ({ front: 'Front', side: 'Side', back: 'Back' })[viewName] || 'Front';
}

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
    `<p style="color:#800000;padding:1rem;">Error loading app: ${err.message}</p>`;
});
