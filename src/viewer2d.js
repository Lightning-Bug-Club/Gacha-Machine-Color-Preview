/**
 * viewer2d.js — loads the finalized SVG artwork and wires part selection + live recoloring.
 *
 * Phase 1: 2D orthographic viewer.
 * Phase 2: Replace this file with viewer3d.js (Three.js). All other modules
 *          (state, palette, parts, pdf) remain unchanged.
 *
 * LAYER NORMALIZATION:
 *   On load, each finalized SVG's layer <g> elements (identified by id) are
 *   mapped to logical part ids via LAYER_ID_MAP, and a data-part attribute is
 *   added so the [data-part] recolor engine works uniformly across all views.
 *
 * SPECIAL LAYERS (not user-selectable):
 *   Top_Chamber_x5F_Inside      → always white (#FFFFFF)
 *   Top_Chamber_x5F_Inside_x5F_Back → always mirrors Top Chamber user color
 *   Black                       → always #565656
 *
 * LINKED PARTS:
 *   Bottom_Plate__x26__Mouth contains two sub-groups; both receive
 *   data-part="bottom-plate-mouth" so they recolor as one logical part.
 *
 * WINDOWS:
 *   The simulated window overlay in machine-side.svg carries data-part="window".
 *   Visibility (opacity) is controlled by _applyState based on windowsMaterial.
 *   Windows are only shown in the side view; ignored in front/back.
 */

import { subscribe, setSelectedPart, getState } from './state.js';

// Finalized SVG layer id → logical part id
// Illustrator encodes special chars: _ becomes x5F, & becomes x26_, . and space stay
const LAYER_ID_MAP = {
  'Bottom_Chamber':               'bottom-chamber',
  'Bottom_Plate__x26__Mouth':     'bottom-plate-mouth',
  'Coin_Mech._Back_Plate':        'coin-mech-back-plate',
  'Coin_Mech._Gear':              'coin-mech-gear',
  'Coin':                         'coin',
  'Coin_Mech._Front_Plate':       'coin-mech-front-plate',
  'Knob':                         'knob',
  'Top_Chamber_x5F_Outside':      'top-chamber',
  'Main_Gear':                    'main-gear',
  'Hole_Blocker':                 'hole-blocker',
  'Mid-Plate':                    'mid-plate',
  'Lid_Lock':                     'lid-lock',
  'Back_Cover':                   'back-cover',
  'Rear_Lock_Knob':               'rear-lock-knob',
  'Lid':                          'lid',
  'Window_Overlay':               'window',   // simulated window in machine-side.svg
};

// These layers are NOT user-selectable; they get special fixed/follower treatment
const FIXED_LAYERS = {
  'Top_Chamber_x5F_Inside':           '#FFFFFF', // always white
  'Top_Chamber_x5F_Inside_x5F_Back':  null,      // null = mirrors top-chamber color
  'Black':                             '#565656', // always gray
};

const VIEW_PATHS = {
  front: './assets/machine-front.svg',
  side:  './assets/machine-side.svg',
  back:  './assets/machine-back.svg',
};

let _svgRoot = null;
let _containerEl = null;
let _currentView = 'front';
let _unsubscribe = null;

/**
 * Load and inject the layered SVG into `containerEl`.
 * Returns a promise that resolves once the SVG is in the DOM.
 */
export async function initViewer(containerEl, viewName = 'front') {
  _containerEl = containerEl;
  if (!_unsubscribe) {
    _unsubscribe = subscribe(_applyState);
  }
  return setCurrentView(viewName);
}

/**
 * Swap the visible SVG view while keeping the same shared part-color state.
 */
export async function setCurrentView(viewName) {
  const nextView = VIEW_PATHS[viewName] ? viewName : 'front';
  if (!_containerEl) throw new Error('Viewer container is not initialized.');

  const res = await fetch(VIEW_PATHS[nextView]);
  if (!res.ok) throw new Error(`Failed to load ${nextView} SVG: ${res.status}`);
  const svgText = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error(`Invalid ${nextView} SVG: no <svg> root element found.`);

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');

  // Normalize finalized layer ids → data-part attributes
  _normalizeLayers(svgEl);

  _containerEl.innerHTML = '';
  _containerEl.appendChild(svgEl);
  _svgRoot = svgEl;
  _currentView = nextView;

  // Wire click-to-select on colorable parts
  _svgRoot.querySelectorAll('[data-part]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', e => {
      e.stopPropagation();
      const partId = el.getAttribute('data-part');
      setSelectedPart(partId);
    });
  });

  _applyState(getState());
  return svgEl;
}

/**
 * Walk the freshly parsed SVG and map finalized layer <g id="..."> elements to
 * data-part attributes so the [data-part] engine can target them.
 * Also tags fixed/follower layers for special treatment in _applyState.
 */
function _normalizeLayers(svgEl) {
  // Iterate top-level <g> elements (the Illustrator layers)
  svgEl.querySelectorAll(':scope > g[id]').forEach(g => {
    const rawId = g.getAttribute('id');

    if (LAYER_ID_MAP[rawId]) {
      g.setAttribute('data-part', LAYER_ID_MAP[rawId]);
    } else if (FIXED_LAYERS.hasOwnProperty(rawId)) {
      // Mark these so _applyState can find them
      g.setAttribute('data-fixed-layer', rawId);
    }
  });
}

/**
 * Apply color and selection highlight from the current state snapshot to the SVG.
 * Called automatically on every state change via subscribe().
 */
function _applyState(state) {
  if (!_svgRoot) return;

  const topChamberHex = state.selections['top-chamber']
    ? _resolveHex(state.selections['top-chamber'])
    : null;

  // ── Colorable parts (user-selectable) ──────────────────────────────────
  _svgRoot.querySelectorAll('[data-part]').forEach(el => {
    const partId = el.getAttribute('data-part');

    // Windows: visibility controlled by windowsMaterial + current view
    if (partId === 'window') {
      const show = _currentView === 'side' && state.windowsMaterial === 'printed';
      el.style.display = show ? '' : 'none';
      if (show) {
        el.setAttribute('opacity', '0.8');
        const colorId = state.selections['window'];
        if (colorId) _setFillRecursive(el, _resolveHex(colorId));
      }
      // Don't fall through to selection highlight for windows
      return;
    }

    // Recolor
    const colorId = state.selections[partId];
    if (colorId) {
      _setFillRecursive(el, _resolveHex(colorId));
    }

    // Selection highlight
    if (partId === state.selectedPartId) {
      el.setAttribute('stroke', '#FFD700');
      el.setAttribute('stroke-width', '4');
      el.setAttribute('filter', 'drop-shadow(0 0 6px rgba(255,215,0,0.8))');
    } else {
      el.removeAttribute('filter');
      const original = el.getAttribute('data-original-stroke');
      if (original !== null) {
        el.setAttribute('stroke', original);
        el.setAttribute('stroke-width', el.getAttribute('data-original-stroke-width') || '1');
      } else {
        el.setAttribute('data-original-stroke', el.getAttribute('stroke') || '');
        el.setAttribute('data-original-stroke-width', el.getAttribute('stroke-width') || '1');
      }
    }
  });

  // ── Fixed / follower layers ─────────────────────────────────────────────
  _svgRoot.querySelectorAll('[data-fixed-layer]').forEach(el => {
    const rawId = el.getAttribute('data-fixed-layer');
    if (rawId === 'Top_Chamber_x5F_Inside') {
      _setFillRecursive(el, '#FFFFFF');
    } else if (rawId === 'Top_Chamber_x5F_Inside_x5F_Back') {
      if (topChamberHex) _setFillRecursive(el, topChamberHex);
    } else if (rawId === 'Black') {
      _setFillRecursive(el, '#565656');
    }
  });
}

/**
 * Set fill on a group element and all its descendant shape children.
 * Uses inline style so it overrides CSS class-based fills (the finalized SVGs
 * use Illustrator's .stN CSS classes for default fills; inline style wins).
 */
function _setFillRecursive(el, hex) {
  if (el.tagName === 'g' || el.tagName === 'G') {
    el.querySelectorAll('path, polygon, polyline, rect, circle, ellipse').forEach(shape => {
      shape.style.fill = hex;
    });
  } else {
    el.style.fill = hex;
  }
}

/**
 * Resolve a colorId to a hex string.
 * Accepts either "#RRGGBB" or a color id from the palette.
 */
function _resolveHex(colorId) {
  if (/^#[0-9a-fA-F]{3,6}$/.test(colorId)) return colorId;
  if (window.__paletteMap) {
    const entry = window.__paletteMap[colorId];
    if (entry) return entry.hex;
  }
  return colorId;
}

/**
 * Recolor a specific part directly by hex (used internally and for testing).
 */
export function recolorPart(partId, hex) {
  if (!_svgRoot) return;
  _svgRoot.querySelectorAll(`[data-part="${partId}"]`).forEach(el => {
    _setFillRecursive(el, hex);
  });
}

/**
 * Return the SVG DOM element (for pdf.js serialization).
 */
export function getSVGElement() {
  return _svgRoot;
}

export function getCurrentView() {
  return _currentView;
}
