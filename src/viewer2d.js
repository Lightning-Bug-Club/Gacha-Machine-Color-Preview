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

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;
const PAN_THRESHOLD_PX = 4;

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
  'Window_Overlay':               'window',
};

// These layers are NOT user-selectable; they get special fixed/follower treatment
const FIXED_LAYERS = {
  'Top_Chamber_x5F_Inside':           '#FFFFFF',
  'Top_Chamber_x5F_Inside_x5F_Back':  null,
  'Black':                             '#565656',
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
let _suppressPartClickUntil = 0;
let _viewportState = {
  zoom: 1,
  centerXRatio: 0.5,
  centerYRatio: 0.5,
};

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

  const svgEl = await _loadViewSVG(nextView);
  _containerEl.innerHTML = '';
  _containerEl.appendChild(svgEl);

  _svgRoot = svgEl;
  _currentView = nextView;

  if (nextView === 'side') {
    _fitWindowOverlay(svgEl);
  }

  _wireInteractions(svgEl);
  _applyViewportToSVG(svgEl);
  _applyState(getState());
  return svgEl;
}

export async function createPreviewSVG(viewName, state = getState()) {
  const nextView = VIEW_PATHS[viewName] ? viewName : 'front';
  const svgEl = await _loadViewSVG(nextView);

  _withMeasurementMount(svgEl, () => {
    if (nextView === 'side') {
      _fitWindowOverlay(svgEl);
    }
    _applyStateToSVG(svgEl, state, nextView, { includeSelection: false });
    _resetSVGViewport(svgEl);
  });

  return svgEl;
}

export function zoomIn() {
  if (!_svgRoot) return;
  _zoomFromCurrentBox(_clampZoom(_viewportState.zoom * ZOOM_STEP));
}

export function zoomOut() {
  if (!_svgRoot) return;
  _zoomFromCurrentBox(_clampZoom(_viewportState.zoom / ZOOM_STEP));
}

export function resetViewTransform() {
  _viewportState = {
    zoom: 1,
    centerXRatio: 0.5,
    centerYRatio: 0.5,
  };
  if (_svgRoot) {
    _applyViewportToSVG(_svgRoot);
  }
}

function _wireInteractions(svgEl) {
  svgEl.querySelectorAll('[data-part]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', e => {
      if (performance.now() < _suppressPartClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      const partId = el.getAttribute('data-part');
      setSelectedPart(partId);
    });
  });

  svgEl.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const currentBox = _getCurrentViewBox(svgEl);
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const anchorX = currentBox.x + currentBox.width * fx;
    const anchorY = currentBox.y + currentBox.height * fy;
    const nextZoom = _clampZoom(
      e.deltaY < 0 ? _viewportState.zoom * ZOOM_STEP : _viewportState.zoom / ZOOM_STEP
    );

    _setZoomWithAnchor(nextZoom, { anchorX, anchorY, fx, fy });
  }, { passive: false });

  let panState = null;

  const endPan = pointerId => {
    if (!panState) return;
    if (panState.moved) {
      _suppressPartClickUntil = performance.now() + 120;
    }
    if (pointerId !== undefined) {
      try {
        svgEl.releasePointerCapture(pointerId);
      } catch (_) { /* ignore */ }
    }
    panState = null;
    if (_svgRoot) {
      _updatePanCursor(false);
    }
  };

  svgEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || _viewportState.zoom <= 1) return;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    panState = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBox: _getCurrentViewBox(svgEl),
      rect,
      moved: false,
    };
    svgEl.setPointerCapture(e.pointerId);
    _updatePanCursor(true);
  });

  svgEl.addEventListener('pointermove', e => {
    if (!panState || !_svgRoot || e.pointerId !== panState.pointerId) return;
    const dxPx = e.clientX - panState.startClientX;
    const dyPx = e.clientY - panState.startClientY;
    if (!panState.moved && Math.hypot(dxPx, dyPx) < PAN_THRESHOLD_PX) return;

    panState.moved = true;
    const dx = dxPx * (panState.startBox.width / panState.rect.width);
    const dy = dyPx * (panState.startBox.height / panState.rect.height);
    const nextBox = _clampViewBox({
      x: panState.startBox.x - dx,
      y: panState.startBox.y - dy,
      width: panState.startBox.width,
      height: panState.startBox.height,
    }, _getDefaultViewBox(_svgRoot));

    _setViewportFromBox(nextBox, _getDefaultViewBox(_svgRoot));
    _applyViewportToSVG(_svgRoot);
  });

  svgEl.addEventListener('pointerup', e => {
    if (panState && e.pointerId === panState.pointerId) {
      endPan(e.pointerId);
    }
  });
  svgEl.addEventListener('pointercancel', e => {
    if (panState && e.pointerId === panState.pointerId) {
      endPan(e.pointerId);
    }
  });

  _updatePanCursor(false);
}

function _updatePanCursor(isDragging) {
  if (!_svgRoot) return;
  const cursor = _viewportState.zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : '';
  _svgRoot.style.cursor = cursor;
}

async function _loadViewSVG(viewName) {
  const res = await fetch(VIEW_PATHS[viewName]);
  if (!res.ok) throw new Error(`Failed to load ${viewName} SVG: ${res.status}`);

  const svgText = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error(`Invalid ${viewName} SVG: no <svg> root element found.`);

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');

  _normalizeLayers(svgEl);
  _storeDefaultViewBox(svgEl);
  _resetSVGViewport(svgEl);
  return svgEl;
}

function _normalizeLayers(svgEl) {
  let windowOverlayEl = null;

  svgEl.querySelectorAll(':scope > g[id]').forEach(g => {
    const rawId = g.getAttribute('id');

    if (LAYER_ID_MAP[rawId]) {
      g.setAttribute('data-part', LAYER_ID_MAP[rawId]);
      if (rawId === 'Window_Overlay') windowOverlayEl = g;
    } else if (Object.prototype.hasOwnProperty.call(FIXED_LAYERS, rawId)) {
      g.setAttribute('data-fixed-layer', rawId);
    }
  });

  if (windowOverlayEl && svgEl.lastElementChild !== windowOverlayEl) {
    svgEl.appendChild(windowOverlayEl);
  }
}

function _fitWindowOverlay(svgEl) {
  const CORNER_RADIUS = 8;
  const HARDCODED_FALLBACK = { x: 476, y: 155, width: 230, height: 240 };

  const overlayGroup = svgEl.querySelector('[data-part="window"]');
  if (!overlayGroup) return;

  const overlayRect = overlayGroup.querySelector('rect');
  if (!overlayRect) return;

  const insideLayer = svgEl.querySelector('[data-fixed-layer="Top_Chamber_x5F_Inside"], #Top_Chamber_x5F_Inside');
  const insideBox = _safeGetBBox(insideLayer);
  const unionBox = _unionPartBoxes(svgEl, ['hole-blocker', 'main-gear', 'mid-plate']);
  const box = insideBox || unionBox || HARDCODED_FALLBACK;

  overlayRect.setAttribute('x', box.x);
  overlayRect.setAttribute('y', box.y);
  overlayRect.setAttribute('width', box.width);
  overlayRect.setAttribute('height', box.height);
  overlayRect.setAttribute('rx', CORNER_RADIUS);
  overlayRect.setAttribute('ry', CORNER_RADIUS);
}

function _unionPartBoxes(svgEl, partIds) {
  let union = null;

  partIds.forEach(partId => {
    const box = _safeGetBBox(svgEl.querySelector(`[data-part="${partId}"]`));
    if (!box) return;

    if (!union) {
      union = { x: box.x, y: box.y, x2: box.x + box.width, y2: box.y + box.height };
      return;
    }

    union.x = Math.min(union.x, box.x);
    union.y = Math.min(union.y, box.y);
    union.x2 = Math.max(union.x2, box.x + box.width);
    union.y2 = Math.max(union.y2, box.y + box.height);
  });

  return union
    ? { x: union.x, y: union.y, width: union.x2 - union.x, height: union.y2 - union.y }
    : null;
}

function _safeGetBBox(el) {
  if (!el) return null;

  try {
    const box = el.getBBox();
    if (!box || (!box.width && !box.height)) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch (_) {
    return null;
  }
}

function _applyState(state) {
  if (!_svgRoot) return;
  _applyStateToSVG(_svgRoot, state, _currentView, { includeSelection: true });
}

function _applyStateToSVG(svgRoot, state, viewName, { includeSelection }) {
  const topChamberHex = state.selections['top-chamber']
    ? _resolveHex(state.selections['top-chamber'])
    : null;

  svgRoot.querySelectorAll('[data-part]').forEach(el => {
    const partId = el.getAttribute('data-part');

    if (partId === 'window') {
      const show = viewName === 'side' && state.windowsMaterial === 'printed';
      el.style.display = show ? '' : 'none';
      if (show) {
        el.setAttribute('opacity', '0.8');
        const colorId = state.selections.window || 'basic-pla-jade-white';
        _setFillRecursive(el, _resolveHex(colorId));
      }
      return;
    }

    const colorId = state.selections[partId];
    if (colorId) {
      _setFillRecursive(el, _resolveHex(colorId));
    }

    if (!includeSelection) {
      el.removeAttribute('filter');
      return;
    }

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

  svgRoot.querySelectorAll('[data-fixed-layer]').forEach(el => {
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

function _setFillRecursive(el, hex) {
  if (el.tagName === 'g' || el.tagName === 'G') {
    el.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line').forEach(shape => {
      shape.style.fill = hex;
      if (shape.tagName === 'line' || shape.tagName === 'polyline') {
        shape.style.stroke = '#000000';
      }
    });
  } else {
    el.style.fill = hex;
  }
}

function _resolveHex(colorId) {
  if (/^#[0-9a-fA-F]{3,6}$/.test(colorId)) return colorId;
  if (window.__paletteMap) {
    const entry = window.__paletteMap[colorId];
    if (entry) return entry.hex;
  }
  return colorId;
}

function _storeDefaultViewBox(svgEl) {
  const raw = svgEl.getAttribute('viewBox');
  if (raw) {
    svgEl.setAttribute('data-default-viewbox', raw);
  }
}

function _resetSVGViewport(svgEl) {
  const raw = svgEl.getAttribute('data-default-viewbox');
  if (raw) {
    svgEl.setAttribute('viewBox', raw);
  }
}

function _applyViewportToSVG(svgEl) {
  const base = _getDefaultViewBox(svgEl);
  const width = base.width / _viewportState.zoom;
  const height = base.height / _viewportState.zoom;
  const centerX = base.x + base.width * _viewportState.centerXRatio;
  const centerY = base.y + base.height * _viewportState.centerYRatio;

  const clamped = _clampViewBox({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  }, base);

  svgEl.setAttribute('viewBox', `${clamped.x} ${clamped.y} ${clamped.width} ${clamped.height}`);
  _setViewportFromBox(clamped, base);
  _updatePanCursor(false);
}

function _zoomFromCurrentBox(nextZoom) {
  if (!_svgRoot) return;
  const current = _getCurrentViewBox(_svgRoot);
  _setZoomWithAnchor(nextZoom, {
    anchorX: current.x + current.width / 2,
    anchorY: current.y + current.height / 2,
    fx: 0.5,
    fy: 0.5,
  });
}

function _setZoomWithAnchor(nextZoom, { anchorX, anchorY, fx, fy }) {
  if (!_svgRoot || nextZoom === _viewportState.zoom) return;
  const base = _getDefaultViewBox(_svgRoot);
  const nextWidth = base.width / nextZoom;
  const nextHeight = base.height / nextZoom;
  const nextBox = _clampViewBox({
    x: anchorX - nextWidth * fx,
    y: anchorY - nextHeight * fy,
    width: nextWidth,
    height: nextHeight,
  }, base);

  _viewportState.zoom = nextZoom;
  _setViewportFromBox(nextBox, base);
  _applyViewportToSVG(_svgRoot);
}

function _setViewportFromBox(box, base) {
  _viewportState = {
    zoom: _clampZoom(base.width / box.width),
    centerXRatio: (box.x + box.width / 2 - base.x) / base.width,
    centerYRatio: (box.y + box.height / 2 - base.y) / base.height,
  };
}

function _clampViewBox(box, base) {
  const minX = box.width > base.width ? base.x - (box.width - base.width) / 2 : base.x;
  const maxX = box.width > base.width ? minX : base.x + base.width - box.width;
  const minY = box.height > base.height ? base.y - (box.height - base.height) / 2 : base.y;
  const maxY = box.height > base.height ? minY : base.y + base.height - box.height;

  return {
    x: _clamp(box.x, minX, maxX),
    y: _clamp(box.y, minY, maxY),
    width: box.width,
    height: box.height,
  };
}

function _getDefaultViewBox(svgEl) {
  return _parseViewBox(svgEl.getAttribute('data-default-viewbox') || svgEl.getAttribute('viewBox'));
}

function _getCurrentViewBox(svgEl) {
  return _parseViewBox(svgEl.getAttribute('viewBox'));
}

function _parseViewBox(raw) {
  const values = (raw || '0 0 1224 792').trim().split(/\s+/).map(Number);
  return {
    x: values[0] || 0,
    y: values[1] || 0,
    width: values[2] || 1224,
    height: values[3] || 792,
  };
}

function _withMeasurementMount(svgEl, fn) {
  const mount = document.createElement('div');
  mount.style.position = 'absolute';
  mount.style.left = '-100000px';
  mount.style.top = '0';
  mount.style.width = '1224px';
  mount.style.height = '792px';
  mount.style.visibility = 'hidden';
  mount.style.pointerEvents = 'none';
  mount.appendChild(svgEl);
  document.body.appendChild(mount);

  try {
    return fn();
  } finally {
    mount.remove();
  }
}

function _clampZoom(value) {
  return _clamp(value, ZOOM_MIN, ZOOM_MAX);
}

function _clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
