/**
 * viewer2d.js — loads the layered SVG and wires part selection + live recoloring.
 *
 * Phase 1: 2D orthographic viewer.
 * Phase 2: Replace this file with viewer3d.js (Three.js). All other modules
 *          (state, palette, parts, pdf) remain unchanged.
 *
 * LINKED PARTS: Multiple SVG elements can share the same data-part value to
 * create a single logical part that recolors as one unit. For example, both
 * id="part-bottom-plate" and id="part-mouth" carry data-part="bottom-plate-mouth",
 * so selecting that logical part recolors both elements together.
 */

import { subscribe, setSelectedPart, getState } from './state.js';

const VIEW_PATHS = {
  front: './assets/machine-front.svg',
  side: './assets/machine-side.svg',
  back: './assets/machine-back.svg',
  iso: './assets/machine-iso.svg',
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

  _containerEl.innerHTML = '';
  _containerEl.appendChild(svgEl);
  _svgRoot = svgEl;
  _currentView = nextView;

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
 * Apply color and selection highlight from the current state snapshot to the SVG.
 * Called automatically on every state change.
 */
function _applyState(state) {
  if (!_svgRoot) return;

  _svgRoot.querySelectorAll('[data-part]').forEach(el => {
    const partId = el.getAttribute('data-part');

    // Recolor
    const colorId = state.selections[partId];
    if (colorId) {
      el.setAttribute('fill', _resolveHex(colorId));
    }

    // Selection highlight
    if (partId === state.selectedPartId) {
      el.setAttribute('stroke', '#FFD700');
      el.setAttribute('stroke-width', '3');
      el.setAttribute('filter', 'drop-shadow(0 0 6px rgba(255,215,0,0.8))');
    } else {
      // Restore original stroke (remove inline override)
      el.removeAttribute('filter');
      const original = el.getAttribute('data-original-stroke');
      if (original !== null) {
        el.setAttribute('stroke', original);
        el.setAttribute('stroke-width', el.getAttribute('data-original-stroke-width') || '1');
      } else {
        // First time — save original stroke so we can restore it
        el.setAttribute('data-original-stroke', el.getAttribute('stroke') || '');
        el.setAttribute('data-original-stroke-width', el.getAttribute('stroke-width') || '1');
      }
    }
  });
}

/**
 * Resolve a colorId to a hex string.
 * Accepts either a full hex like "#FF0000" or a color id from the palette.
 * This keeps the viewer decoupled from async palette loading — palette.js is
 * queried by main.js and the colorId is always set to a known id.
 * Falls back to the id itself (allows passing "#RRGGBB" directly).
 */
function _resolveHex(colorId) {
  // If it looks like a hex, use it directly
  if (/^#[0-9a-fA-F]{3,6}$/.test(colorId)) return colorId;
  // Otherwise look up in the palette cache that main.js populates
  if (window.__paletteMap) {
    const entry = window.__paletteMap[colorId];
    if (entry) return entry.hex;
  }
  return colorId;
}

/**
 * Recolor a specific part directly by hex (used internally and for testing).
 * Handles linked parts — all SVG elements sharing the same data-part value
 * are recolored together.
 */
export function recolorPart(partId, hex) {
  if (!_svgRoot) return;
  _svgRoot.querySelectorAll(`[data-part="${partId}"]`).forEach(el => {
    el.setAttribute('fill', hex);
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
