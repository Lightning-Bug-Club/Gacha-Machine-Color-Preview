/**
 * state.js — configuration state management and URL serialization.
 *
 * Shared module: designed to be reused by:
 *   Phase 1 — 2D viewer (viewer2d.js)
 *   Phase 2 — Three.js 3D viewer (future viewer3d.js)
 *   Phase 3 — order submission
 *
 * State shape:
 *   {
 *     selections: { [partId]: colorId },   // user's part→color assignments
 *     selectedPartId: string | null        // currently highlighted part
 *   }
 */

const _listeners = [];

let _state = {
  selections: {},
  selectedPartId: null,
};

/** Return a shallow copy of the current state. */
export function getState() {
  return {
    ..._state,
    selections: { ..._state.selections },
  };
}

/** Return only the selections map { partId: colorId }. */
export function getSelections() {
  return { ..._state.selections };
}

/** Set the color for a part and notify listeners. */
export function setPartColor(partId, colorId) {
  _state = {
    ..._state,
    selections: { ..._state.selections, [partId]: colorId },
  };
  _notify();
}

/** Set the currently selected part (for UI highlighting). */
export function setSelectedPart(partId) {
  _state = { ..._state, selectedPartId: partId };
  _notify();
}

/** Replace the entire selections map (e.g. when restoring from URL). */
export function loadSelections(selections) {
  _state = { ..._state, selections: { ...selections } };
  _notify();
}

/** Register a callback to be called whenever state changes. */
export function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

function _notify() {
  const snap = getState();
  _listeners.forEach(fn => fn(snap));
}

// ─── URL encode / decode ────────────────────────────────────────────────────

/**
 * Encode the current selections into a URL query string parameter `c`.
 * Format: c=partId:colorId,partId:colorId,...
 */
export function encodeStateToURL() {
  const entries = Object.entries(_state.selections);
  if (entries.length === 0) return '';
  const encoded = entries.map(([p, c]) => `${encodeURIComponent(p)}:${encodeURIComponent(c)}`).join(',');
  const url = new URL(window.location.href);
  url.searchParams.set('c', encoded);
  return url.toString();
}

/**
 * Push the current state into the browser history (updates the address bar).
 */
export function pushStateToURL() {
  const url = encodeStateToURL();
  if (url) window.history.replaceState(null, '', url);
}

/**
 * Read selections from the current URL query string and load them into state.
 * Returns the loaded selections object (may be empty).
 */
export function decodeStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const c = params.get('c');
  if (!c) return {};
  const selections = {};
  c.split(',').forEach(pair => {
    const idx = pair.indexOf(':');
    if (idx === -1) return;
    const partId = decodeURIComponent(pair.slice(0, idx));
    const colorId = decodeURIComponent(pair.slice(idx + 1));
    if (partId && colorId) selections[partId] = colorId;
  });
  loadSelections(selections);
  return selections;
}
