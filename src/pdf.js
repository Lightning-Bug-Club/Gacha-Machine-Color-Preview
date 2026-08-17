/**
 * pdf.js — PDF blueprint export.
 */

/**
 * Export a PDF blueprint.
 * @param {Object} opts
 * @param {string}   [opts.previewDataURL]    - Backward-compatible single preview image
 * @param {Array}    [opts.previewDataURLs]   - Array of preview strings or { view, dataURL } objects
 * @param {Object}   opts.selections          - { partId: colorId }
 * @param {string}   opts.windowsMaterial     - 'printed' | 'acrylic'
 * @param {Array}    opts.parts               - Parts array [{ id, label, defaultColorId }]
 * @param {Array}    opts.colors              - Colors array [{ id, name, hex, series, url }]
 */
export async function exportPDF({
  previewDataURL,
  previewDataURLs,
  selections,
  windowsMaterial = 'printed',
  parts,
  colors,
}) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    throw new Error('PDF export is unavailable because jsPDF did not load. Refresh the page and try again.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM_MARGIN = 16;
  const ROW_H = 8;
  const HEADER_H = 6;
  const SUBHEADER_H = 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Gata-Gata Gacha Machine — Build Blueprint', MARGIN, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 27);
  doc.setTextColor(0);

  let yPos = 34;
  const normalizedPreviews = await _normalizePreviews(previewDataURLs, previewDataURL);
  if (normalizedPreviews.length) {
    yPos = await _drawPreviewRow(doc, normalizedPreviews, { pageWidth: PAGE_W, margin: MARGIN, contentWidth: CONTENT_W, yPos });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Parts & Colors', MARGIN, yPos);
  yPos += 6;

  const colorMap = {};
  colors.forEach(c => { colorMap[c.id] = c; });

  const columns = {
    part: { x: MARGIN, width: 62 },
    color: { x: MARGIN + 62, width: 58 },
    hex: { x: MARGIN + 120, width: 22 },
    bitty: { x: MARGIN + 142, width: 20 },
    biggy: { x: MARGIN + 162, width: 20 },
  };

  const drawLegendHeader = top => {
    doc.setFillColor(50, 50, 50);
    doc.rect(MARGIN, top, CONTENT_W, HEADER_H + SUBHEADER_H, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Part', columns.part.x + 1, top + 8);
    doc.text('Bambu Color', columns.color.x + 1, top + 8);
    doc.text('Hex', columns.hex.x + 1, top + 8);
    doc.text('Filament Usage', columns.bitty.x + ((columns.bitty.width + columns.biggy.width) / 2), top + 4.4, { align: 'center' });
    doc.text('Bitty', columns.bitty.x + columns.bitty.width / 2, top + HEADER_H + 4.2, { align: 'center' });
    doc.text('Biggy', columns.biggy.x + columns.biggy.width / 2, top + HEADER_H + 4.2, { align: 'center' });
    doc.setDrawColor(95);
    doc.line(columns.bitty.x, top + HEADER_H, columns.biggy.x + columns.biggy.width, top + HEADER_H);
    doc.setDrawColor(0);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    return top + HEADER_H + SUBHEADER_H;
  };

  yPos = drawLegendHeader(yPos);

  let rowIndex = 0;
  parts.forEach(part => {
    if (yPos + ROW_H > PAGE_H - BOTTOM_MARGIN) {
      doc.addPage();
      yPos = MARGIN;
      yPos = drawLegendHeader(yPos);
    }

    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, yPos, CONTENT_W, ROW_H, 'F');
    }

    doc.setFontSize(8);

    if (part.id === 'window') {
      doc.text(windowsMaterial === 'printed' ? 'Windows (×2)' : 'Windows', columns.part.x + 1, yPos + 5.5);
      if (windowsMaterial === 'acrylic') {
        doc.text('Clear acrylic', columns.color.x + 1, yPos + 5.5);
      } else {
        const colorId = selections[part.id] || part.defaultColorId;
        const color = colorMap[colorId];
        if (color) {
          _drawSwatch(doc, color.hex, columns.color.x - 7, yPos + 1.5);
          doc.text(color.name, columns.color.x + 1, yPos + 5.5);
          doc.text(color.hex, columns.hex.x + 1, yPos + 5.5);
        }
      }

      yPos += ROW_H;
      rowIndex++;
      return;
    }

    const colorId = selections[part.id] || part.defaultColorId;
    const color = colorMap[colorId];
    if (!color) return;

    _drawSwatch(doc, color.hex, columns.color.x - 7, yPos + 1.5);
    const partLabel = part.qty && part.qty > 1 ? `${part.label} (×${part.qty})` : part.label;
    doc.text(partLabel, columns.part.x + 1, yPos + 5.5);
    doc.text(color.name, columns.color.x + 1, yPos + 5.5);
    doc.text(color.hex, columns.hex.x + 1, yPos + 5.5);

    yPos += ROW_H;
    rowIndex++;
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Lightning Bug Club — lightningbugclub.com', MARGIN, 290);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, 290, { align: 'right' });
  }

  doc.save('gatagata-build-blueprint.pdf');
}

async function _normalizePreviews(previewDataURLs, previewDataURL) {
  const rawItems = Array.isArray(previewDataURLs) && previewDataURLs.length
    ? previewDataURLs
    : (previewDataURL ? [{ view: 'front', dataURL: previewDataURL }] : []);

  const normalized = [];
  for (let index = 0; index < rawItems.length; index++) {
    const item = rawItems[index];
    const dataURL = typeof item === 'string' ? item : item?.dataURL;
    if (!dataURL) continue;

    try {
      const size = await _getImageSize(dataURL);
      const view = typeof item === 'string' ? ['front', 'side', 'back'][index] || 'front' : (item.view || 'front');
      normalized.push({ view, dataURL, ...size });
    } catch (_) {
      // Skip broken preview assets instead of failing the whole PDF.
    }
  }

  return normalized;
}

async function _drawPreviewRow(doc, previews, { pageWidth, margin, contentWidth, yPos }) {
  const gap = 4;
  const slotWidth = previews.length === 1
    ? Math.min(90, contentWidth)
    : (contentWidth - gap * (previews.length - 1)) / previews.length;
  const framePadding = 2;
  const captionGap = 4;
  const maxImageHeight = 52;

  const laidOut = previews.map(preview => {
    const aspect = preview.width / preview.height || 1;
    const maxWidth = slotWidth - framePadding * 2;
    let imageWidth = maxWidth;
    let imageHeight = imageWidth / aspect;
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight;
      imageWidth = imageHeight * aspect;
    }
    const frameWidth = imageWidth + framePadding * 2;
    const frameHeight = imageHeight + framePadding * 2;
    return { ...preview, imageWidth, imageHeight, frameWidth, frameHeight };
  });

  const totalWidth = laidOut.reduce((sum, item) => sum + item.frameWidth, 0) + gap * (laidOut.length - 1);
  let x = margin + (contentWidth - totalWidth) / 2;
  let rowBottom = yPos;

  laidOut.forEach(item => {
    const frameX = x;
    const frameY = yPos;
    doc.setDrawColor(210);
    doc.rect(frameX, frameY, item.frameWidth, item.frameHeight, 'S');
    doc.addImage(item.dataURL, 'PNG', frameX + framePadding, frameY + framePadding, item.imageWidth, item.imageHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70);
    doc.text(_viewLabel(item.view), frameX + item.frameWidth / 2, frameY + item.frameHeight + captionGap, { align: 'center' });
    rowBottom = Math.max(rowBottom, frameY + item.frameHeight + captionGap + 3);
    x += item.frameWidth + gap;
  });

  doc.setTextColor(0);
  return rowBottom + 6;
}

function _drawSwatch(doc, hex, x, y) {
  const swatchSize = 5;
  const rgb = _hexToRGB(hex);
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(x, y, swatchSize, swatchSize, 'F');
  doc.setDrawColor(180);
  doc.rect(x, y, swatchSize, swatchSize, 'S');
  doc.setDrawColor(0);
}

function _viewLabel(viewName) {
  return ({ front: 'Front', side: 'Side', back: 'Back' })[viewName] || 'Front';
}

function _getImageSize(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('Could not load preview image.'));
    img.src = dataURL;
  });
}

function _hexToRGB(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
