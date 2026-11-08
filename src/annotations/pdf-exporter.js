/**
 * Non-Destructive ISO 32000-1 PDF Exporter
 * Compiles 8-point quads into true PDF /Subtype /Highlight annotations with /QuadPoints,
 * and vector ink strokes into native /Subtype /Ink annotations via pdf-lib.
 *
 * Fully recognized as selectable, native highlights in:
 * - Adobe Acrobat Reader
 * - Apple Preview & Apple Books
 * - Google Chrome PDF Viewer
 */

import { PDFDocument, PDFName, PDFArray, PDFNumber, PDFString, rgb } from 'pdf-lib';
import { highlightManager, PALETTE } from './highlight-manager.js';

export class PdfExporter {
  static getSubtypeName(ann) {
    if (!ann) return 'Highlight';
    if (ann.style === 'underline') return 'Underline';
    if (ann.style === 'strikethrough') return 'StrikeOut';
    return 'Highlight';
  }
  /**
   * Exports annotated PDF document
   * @param {ArrayBuffer} originalPdfBytes
   * @param {Map<number, Stroke[]>} pageStrokesMap - pageNum -> Stroke[]
   * @param {Map<number, Object>} pageMetricsMap - pageNum -> { width, height, scale }
   * @returns {Promise<Uint8Array>} modifiedPdfBytes
   */
  static async exportAnnotatedPdf(originalPdfBytes, pageStrokesMap, pageMetricsMap) {
    if (!originalPdfBytes) throw new Error('No PDF bytes provided for export');

    const pdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;

    // Process each page
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageNum = pageIdx + 1;
      const page = pages[pageIdx];
      const { width: pdfWidth, height: pdfHeight } = page.getSize();
      const metrics = pageMetricsMap.get(pageNum);

      // Scale factors from screen viewport coordinates to PDF user space
      const screenWidth = metrics ? metrics.width : pdfWidth;
      const screenHeight = metrics ? metrics.height : pdfHeight;
      const scaleX = pdfWidth / screenWidth;
      const scaleY = pdfHeight / screenHeight;

      const pageAnnotsRef = page.node.Annots();
      const annotsArray = pageAnnotsRef ? pageAnnotsRef : context.obj([]);
      if (!pageAnnotsRef) {
        page.node.set(PDFName.of('Annots'), annotsArray);
      }

      // ─────────────────────────────────────────────────────────────
      // 1. Compile User Highlights into ISO 32000-1 /QuadPoints
      // ─────────────────────────────────────────────────────────────
      const pageHighlights = highlightManager.getAnnotationsForPage(pageNum);

      for (const ann of pageHighlights) {
        if (!ann.quads || !ann.quads.length) continue;

        const quadPointsList = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        // Convert hex color to normalized RGB [0.0 - 1.0]
        const rgbColor = this.hexToRgb(ann.color || '#ffcc00');

        for (const q of ann.quads) {
          // Zero-Drift Coordinate Transformation:
          // If quads are normalized [0.0, 1.0], map directly to native PDF dimensions.
          const isNorm = q.isNormalized || (q.lt.x <= 1.0 && q.lt.y <= 1.0);
          const qScaleX = isNorm ? pdfWidth : scaleX;
          const qScaleY = isNorm ? pdfHeight : scaleY;

          const tlX = q.lt.x * qScaleX;
          const tlY = pdfHeight - (q.lt.y * qScaleY);
          const trX = q.rt.x * qScaleX;
          const trY = pdfHeight - (q.rt.y * qScaleY);
          const blX = q.lb.x * qScaleX;
          const blY = pdfHeight - (q.lb.y * qScaleY);
          const brX = q.rb.x * qScaleX;
          const brY = pdfHeight - (q.rb.y * qScaleY);

          // Standard ISO 32000-1 QuadPoints order: x1 y1 (TL), x2 y2 (TR), x3 y3 (BL), x4 y4 (BR)
          quadPointsList.push(
            context.obj(tlX), context.obj(tlY),
            context.obj(trX), context.obj(trY),
            context.obj(blX), context.obj(blY),
            context.obj(brX), context.obj(brY)
          );

          minX = Math.min(minX, tlX, trX, blX, brX);
          minY = Math.min(minY, tlY, trY, blY, brY);
          maxX = Math.max(maxX, tlX, trX, blX, brX);
          maxY = Math.max(maxY, tlY, trY, blY, brY);
        }

        // Construct PDF Dictionary for Highlight / Underline / StrikeOut Annotation
        const subtypeName = ann.style === 'underline' ? 'Underline' : (ann.style === 'strikethrough' ? 'StrikeOut' : 'Highlight');
        const highlightDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of(subtypeName),
          Rect: [context.obj(minX), context.obj(minY), context.obj(maxX), context.obj(maxY)],
          QuadPoints: quadPointsList,
          C: [context.obj(rgbColor.r), context.obj(rgbColor.g), context.obj(rgbColor.b)],
          CA: context.obj(ann.opacity || 0.35),
          T: PDFString.of(`Pedif ${subtypeName}`),
          Contents: PDFString.of(ann.note || ann.text || ''),
        });

        const highlightRef = context.register(highlightDict);
        annotsArray.push(highlightRef);
      }

      // ─────────────────────────────────────────────────────────────
      // 2. Compile Vector Inking Strokes into ISO 32000-1 /Ink
      // ─────────────────────────────────────────────────────────────
      const pageStrokes = pageStrokesMap.get(pageNum) || [];

      for (const stroke of pageStrokes) {
        if (!stroke.points || stroke.points.length < 2) continue;

        const inkListPoints = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const isHighlighter = stroke.type === 'highlighter';
        const strokeColor = this.parseColorToRgb(stroke.color, isHighlighter);

        const isNorm = stroke.isNormalized && (stroke.points[0].x <= 1.0 && stroke.points[0].y <= 1.0);
        const ptScaleX = isNorm ? pdfWidth : scaleX;
        const ptScaleY = isNorm ? pdfHeight : scaleY;

        for (const pt of stroke.points) {
          const pdfX = pt.x * ptScaleX;
          const pdfY = pdfHeight - (pt.y * ptScaleY);

          inkListPoints.push(context.obj(pdfX), context.obj(pdfY));

          minX = Math.min(minX, pdfX);
          minY = Math.min(minY, pdfY);
          maxX = Math.max(maxX, pdfX);
          maxY = Math.max(maxY, pdfY);
        }

        const strokeThickness = isNorm ? ((stroke.width || 3) * (pdfWidth / 800)) : ((stroke.width || 3) * scaleX);
        const pad = strokeThickness / 2;

        const inkDict = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Ink'),
          Rect: [
            context.obj(minX - pad),
            context.obj(minY - pad),
            context.obj(maxX + pad),
            context.obj(maxY + pad)
          ],
          InkList: [inkListPoints],
          C: [context.obj(strokeColor.r), context.obj(strokeColor.g), context.obj(strokeColor.b)],
          CA: context.obj(stroke.opacity !== undefined ? stroke.opacity : (isHighlighter ? 0.35 : 1.0)),
          BS: context.obj({
            Type: PDFName.of('Border'),
            W: context.obj(strokeThickness),
          }),
          T: PDFString.of('Pedif Ink'),
        });

        const inkRef = context.register(inkDict);
        annotsArray.push(inkRef);
      }
    }

    return await pdfDoc.save();
  }

  /**
   * Helper to trigger native browser file download
   */
  static downloadPdf(bytes, filename = 'annotated_document.pdf') {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  static hexToRgb(hex) {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    return {
      r: ((num >> 16) & 255) / 255,
      g: ((num >> 8) & 255) / 255,
      b: (num & 255) / 255,
    };
  }

  static parseColorToRgb(colorStr, isHighlighter) {
    if (!colorStr) {
      return isHighlighter ? { r: 0.98, g: 0.8, b: 0.08 } : { r: 0, g: 0, b: 0 };
    }
    if (colorStr.startsWith('#')) {
      return this.hexToRgb(colorStr);
    }
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1], 10) / 255,
        g: parseInt(match[2], 10) / 255,
        b: parseInt(match[3], 10) / 255,
      };
    }
    return { r: 0, g: 0, b: 0 };
  }
}
