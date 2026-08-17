/**
 * pdf.js — PDF blueprint export.
 *
 * Uses jsPDF (loaded via CDN in index.html) to generate a "Build Blueprint" PDF.
 * Decoupled from the viewer: accepts a preview image (data URL) + config state,
 * so the future Three.js viewer (Phase 2) can reuse it by providing a WebGL
 * canvas screenshot instead.
 *
 * Usage:
 *   import { exportPDF } from './pdf.js';
 *   await exportPDF({
 *     previewDataURL,   // PNG/JPEG data URL of the machine preview
 *     selections,       // { partId: colorId }
 *     parts,            // array from parts.js
 *     colors,           // array from palette.js
 *   });
 */

/**
 * Export a PDF blueprint.
 * @param {Object} opts
 * @param {string}   opts.previewDataURL   - Data URL of the recolored preview image
 * @param {Object}   opts.selections       - { partId: colorId }
 * @param {string}   opts.windowsMaterial  - 'printed' | 'acrylic'
 * @param {Array}    opts.parts            - Parts array [{ id, label, defaultColorId }]
 * @param {Array}    opts.colors           - Colors array [{ id, name, hex, series, url }]
 */
export async function exportPDF({ previewDataURL, selections, windowsMaterial = 'printed', parts, colors }) {
  // jsPDF is loaded globally via CDN; if it is missing, fail loudly so main.js
  // can show a user-visible message instead of the export button failing silently.
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    throw new Error('PDF export is unavailable because jsPDF did not load. Refresh the page and try again.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const MARGIN = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Gata-Gata Gacha Machine — Build Blueprint', MARGIN, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 27);
  doc.setTextColor(0);

  // ── Preview image ────────────────────────────────────────────────────────
  let yPos = 34;
  if (previewDataURL) {
    const imgW = 90;
    const imgH = 110;
    const imgX = (PAGE_W - imgW) / 2;
    doc.addImage(previewDataURL, 'PNG', imgX, yPos, imgW, imgH);
    yPos += imgH + 8;
  }

  // ── Legend table ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Parts & Colors', MARGIN, yPos);
  yPos += 6;

  // Build color lookup map
  const colorMap = {};
  colors.forEach(c => { colorMap[c.id] = c; });

  // Table header
  const COL_PART   = MARGIN;
  const COL_COLOR  = MARGIN + 60;
  const COL_HEX    = MARGIN + 110;
  const COL_URL    = MARGIN + 135;
  const ROW_H      = 8;

  doc.setFillColor(50, 50, 50);
  doc.rect(MARGIN, yPos, CONTENT_W, ROW_H, 'F');
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Part',        COL_PART  + 1, yPos + 5.5);
  doc.text('Bambu Color', COL_COLOR + 1, yPos + 5.5);
  doc.text('Hex',         COL_HEX   + 1, yPos + 5.5);
  doc.text('Product URL', COL_URL   + 1, yPos + 5.5);
  yPos += ROW_H;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');

  // Table rows
  let rowIndex = 0;
  parts.forEach(part => {
    // Handle 'window' part specially based on windowsMaterial
    if (part.id === 'window') {
      // Alternating row background
      if (rowIndex % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(MARGIN, yPos, CONTENT_W, ROW_H, 'F');
      }
      doc.setFontSize(8);
      if (windowsMaterial === 'acrylic') {
        // No color swatch; just show "Windows: Clear acrylic"
        doc.text('Windows', COL_PART + 1, yPos + 5.5);
        doc.text('Clear acrylic', COL_COLOR + 1, yPos + 5.5);
      } else {
        // 3D printed — show with chosen color
        const colorId = selections[part.id] || part.defaultColorId;
        const color   = colorMap[colorId];
        if (color) {
          const swatchSize = 5;
          const swatchX    = COL_COLOR - 7;
          const swatchY    = yPos + (ROW_H - swatchSize) / 2;
          const rgb = _hexToRGB(color.hex);
          doc.setFillColor(rgb.r, rgb.g, rgb.b);
          doc.rect(swatchX, swatchY, swatchSize, swatchSize, 'F');
          doc.setDrawColor(180);
          doc.rect(swatchX, swatchY, swatchSize, swatchSize, 'S');
          doc.setDrawColor(0);
          doc.text('Windows (×2)', COL_PART + 1, yPos + 5.5);
          doc.text(color.name,      COL_COLOR + 1, yPos + 5.5);
          doc.text(color.hex,       COL_HEX   + 1, yPos + 5.5);
          if (color.url) {
            const urlText = color.url.replace(/^https?:\/\//, '').slice(0, 30);
            doc.setTextColor(0, 80, 180);
            doc.textWithLink(urlText, COL_URL + 1, yPos + 5.5, { url: color.url });
            doc.setTextColor(0);
          }
        }
      }
      yPos += ROW_H;
      rowIndex++;
      if (yPos > 270) { doc.addPage(); yPos = MARGIN; }
      return;
    }

    const colorId = selections[part.id] || part.defaultColorId;
    const color   = colorMap[colorId];
    if (!color) return;

    // Alternating row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, yPos, CONTENT_W, ROW_H, 'F');
    }

    // Color swatch
    const swatchSize = 5;
    const swatchX    = COL_COLOR - 7;
    const swatchY    = yPos + (ROW_H - swatchSize) / 2;
    const rgb = _hexToRGB(color.hex);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(swatchX, swatchY, swatchSize, swatchSize, 'F');
    doc.setDrawColor(180);
    doc.rect(swatchX, swatchY, swatchSize, swatchSize, 'S');
    doc.setDrawColor(0);

    doc.setFontSize(8);
    const partLabel = part.qty && part.qty > 1 ? `${part.label} (×${part.qty})` : part.label;
    doc.text(partLabel,  COL_PART  + 1, yPos + 5.5);
    doc.text(color.name,  COL_COLOR + 1, yPos + 5.5);
    doc.text(color.hex,   COL_HEX   + 1, yPos + 5.5);

    // URL (truncated to fit)
    if (color.url) {
      const urlText = color.url.replace(/^https?:\/\//, '').slice(0, 30);
      doc.setTextColor(0, 80, 180);
      doc.textWithLink(urlText, COL_URL + 1, yPos + 5.5, { url: color.url });
      doc.setTextColor(0);
    }

    yPos += ROW_H;
    rowIndex++;

    // Add new page if needed
    if (yPos > 270) {
      doc.addPage();
      yPos = MARGIN;
    }
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      'Lightning Bug Club — lightningbugclub.com',
      MARGIN,
      290
    );
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, 290, { align: 'right' });
  }

  doc.save('gatagata-build-blueprint.pdf');
}

/** Convert a #RRGGBB hex string to { r, g, b } (0–255). */
function _hexToRGB(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
