import { PDFDocument, PDFName } from 'pdf-lib';
import { PdfExporter } from '../src/annotations/pdf-exporter.js';
import { highlightManager } from '../src/annotations/highlight-manager.js';
import { Stroke } from '../src/inking/stroke-model.js';
import { Point, Quad } from '../src/selection/quad-model.js';

console.log('--- Running Phase 7 Non-Destructive ISO 32000-1 PDF Export Tests ---');

// 1. Create a synthetic PDF document
const testDoc = await PDFDocument.create();
const testPage = testDoc.addPage([600, 800]);
const originalPdfBytes = await testDoc.save();

// 2. Setup mock highlights and strokes
highlightManager.annotations.clear();

const q1 = new Quad(new Point(50, 50), new Point(200, 50), new Point(200, 70), new Point(50, 70));
const mockChars = [
  { char: 'T', quad: q1, lineIdx: 0 },
  { char: 'e', quad: q1, lineIdx: 0 },
  { char: 's', quad: q1, lineIdx: 0 },
  { char: 't', quad: q1, lineIdx: 0 },
];

highlightManager.createHighlight(1, mockChars, 'yellow', 'Highlight comment');

const s1 = new Stroke({ id: 's1', type: 'pen', width: 3 });
s1.addPoint(100, 100);
s1.addPoint(150, 150);

const pageStrokesMap = new Map();
pageStrokesMap.set(1, [s1]);

const pageMetricsMap = new Map();
pageMetricsMap.set(1, { width: 600, height: 800, scale: 1 });

// 3. Export Annotated PDF
const exportedBytes = await PdfExporter.exportAnnotatedPdf(originalPdfBytes.buffer, pageStrokesMap, pageMetricsMap);
if (!exportedBytes || exportedBytes.length <= originalPdfBytes.length) {
  throw new Error('Exported PDF bytes should be greater than original bytes');
}
console.log('✅ PDF serialization passed');

// 4. Reload and Verify ISO 32000-1 Annotation Objects
const reloadedDoc = await PDFDocument.load(exportedBytes);
const reloadedPages = reloadedDoc.getPages();
if (reloadedPages.length !== 1) {
  throw new Error('Reloaded page count mismatch');
}

const reloadedPage = reloadedPages[0];
const annotsRef = reloadedPage.node.Annots();
if (!annotsRef || annotsRef.size() < 2) {
  throw new Error(`Expected at least 2 annotations (Highlight + Ink), got ${annotsRef ? annotsRef.size() : 0}`);
}

let foundHighlight = false;
let foundInk = false;

for (let i = 0; i < annotsRef.size(); i++) {
  const annot = annotsRef.lookup(i);
  const subtype = annot.get(PDFName.of('Subtype')).asString();

  if (subtype === '/Highlight') {
    foundHighlight = true;
    const quadPoints = annot.get(PDFName.of('QuadPoints'));
    if (!quadPoints || quadPoints.size() !== 8) {
      throw new Error(`Invalid /QuadPoints size: expected 8 numbers, got ${quadPoints ? quadPoints.size() : 0}`);
    }
  }

  if (subtype === '/Ink') {
    foundInk = true;
    const inkList = annot.get(PDFName.of('InkList'));
    if (!inkList || inkList.size() < 1) {
      throw new Error('Invalid /InkList');
    }
  }
}

if (!foundHighlight) throw new Error('Exported PDF missing /Subtype /Highlight annotation');
if (!foundInk) throw new Error('Exported PDF missing /Subtype /Ink annotation');
console.log('✅ ISO 32000-1 /Subtype /Highlight with /QuadPoints and /Ink verified');

// 5. Test Color Parsing Utilities
const rgbYellow = PdfExporter.hexToRgb('#ffcc00');
if (Math.abs(rgbYellow.r - 1.0) > 0.01 || Math.abs(rgbYellow.g - 0.8) > 0.01) {
  throw new Error('hexToRgb failed');
}

const rgbRgba = PdfExporter.parseColorToRgb('rgba(255, 100, 50, 0.5)', false);
if (rgbRgba.r !== 1.0 || Math.abs(rgbRgba.g - 0.39) > 0.02) {
  throw new Error('parseColorToRgb failed');
}
console.log('✅ Color parsing utilities passed');

console.log('--- All Phase 7 Core Tests Passed Successfully ---');
