/**
 * palette.js — loads and provides access to the Bambu Lab PLA color palette.
 *
 * Shared module: reused by the 2D viewer (Phase 1), the future Three.js viewer
 * (Phase 2), and the PDF exporter.
 */

export const EXCLUDED_SERIES = [
  'PLA Basic Gradient',
  'PLA CF',
  'PLA Sparkle',
  'PLA Metal',
  'PLA Galaxy',
  'PLA Marble',
];

let _colors = null;
let _allColors = null;

/**
 * Load the Bambu PLA color data from the JSON file.
 * Returns a promise that resolves to an array of color objects:
 *   { id, name, hex, series, url }
 */
export async function loadPalette() {
  if (_colors) return _colors;
  const res = await fetch('./data/bambu-pla-colors.json');
  if (!res.ok) throw new Error(`Failed to load palette: ${res.status}`);
  _allColors = await res.json();
  _colors = _allColors.filter(color => !EXCLUDED_SERIES.includes(color.series));
  return _colors;
}

/**
 * Return the full color list (must call loadPalette() first).
 */
export function getColors() {
  if (!_colors) throw new Error('Palette not loaded. Call loadPalette() first.');
  return _colors;
}

/**
 * Return the full unfiltered color list (must call loadPalette() first).
 */
export function getAllColors() {
  if (!_allColors) throw new Error('Palette not loaded. Call loadPalette() first.');
  return _allColors;
}

/**
 * Look up a single color by id. Returns undefined if not found.
 */
export function getColorById(id) {
  return getAllColors().find(c => c.id === id);
}
