/**
 * viewer2d.js — loads the layered SVG and wires part selection + live recoloring.
 *
 * Phase 1: 2D orthographic viewer.
 * Phase 2: Replace this file with viewer3d.js (Three.js). All other modules
 *          (state, palette, parts, pdf) remain unchanged.
 */

import { subscribe, setSelectedPart, getState } from './state.js';

const SVG_PATH = './assets/machine-front.svg';

let _svgRoot = null;

/**
 * Load and inject the layered SVG into `containerEl`.
 * Returns a promise that resolves once the SVG is in the DOM.
 */
export async function initViewer(containerEl) {
  const res = await fetch(SVG_PATH);
  if (!res.ok) throw new Error(`Failed to load SVG: ${res.status}`);
  const svgText = await res.text();

  // Parse and inject as live DOM so we can target elements by id
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error('Invalid SVG: no <svg> root element found.');

  // Make the SVG scale responsively
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');

  containerEl.innerHTML = '';
  containerEl.appendChild(svgEl);
  _svgRoot = svgEl;

  // Wire click events on every element that has data-part
  _svgRoot.querySelectorAll('[data-part]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', e => {
      e.stopPropagation();
      const partId = el.getAttribute('data-part');
      setSelectedPart(partId);
    });
  });

  // Subscribe to state changes to keep SVG colors and highlight in sync
  subscribe(_applyState);

  // Apply any state that was restored from the URL before init
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
 */
export function recolorPart(partId, hex) {
  if (!_svgRoot) return;
  const el = _svgRoot.querySelector(`[data-part="${partId}"]`);
  if (el) el.setAttribute('fill', hex);
}

/**
 * Return the SVG DOM element (for pdf.js serialization).
 */
export function getSVGElement() {
  return _svgRoot;
}
