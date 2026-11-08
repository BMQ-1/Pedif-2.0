import { Stroke } from '../src/inking/stroke-model.js';
import { Point, Quad } from '../src/selection/quad-model.js';
import { PdfExporter } from '../src/annotations/pdf-exporter.js';
import { PDFDocument, PDFName } from 'pdf-lib';

console.log('--- Running Law 1: Coordinate Space Invariance (Zero-Drift) Tests ---');

// 1. Test Stroke Normalization Invariance
const stroke = new Stroke({
  type: 'pen',
  width: 4,
  points: [
    { x: 0.25, y: 0.25, pressure: 0.5 },
    { x: 0.75, y: 0.75, pressure: 0.5 }
  ],
  isNormalized: true
});

// At 800x1000 viewport
const bounds800 = stroke.getBounds(800, 1000);
if (Math.abs(bounds800[0] - (200 - 2)) > 1e-4 || Math.abs(bounds800[2] - (600 + 2)) > 1e-4) {
  throw new Error(`Bounds calculation at 800x1000 failed: expected [198, 248, 602, 752], got ${JSON.stringify(bounds800)}`);
}

// At 1600x2000 viewport (2x Zoom)
const bounds1600 = stroke.getBounds(1600, 2000);
if (Math.abs(bounds1600[0] - (400 - 2)) > 1e-4 || Math.abs(bounds1600[2] - (1200 + 2)) > 1e-4) {
  throw new Error(`Bounds calculation at 1600x2000 failed: expected [398, 498, 1202, 1502], got ${JSON.stringify(bounds1600)}`);
}

// Test Eraser Hit-Test at 1600x2000 viewport
// Screen point (800, 1000) corresponds to normalized (0.5, 0.5), which lies directly on the stroke segment!
if (!stroke.intersectsPoint(800, 1000, 10, 1600, 2000)) {
  throw new Error('Eraser failed to intersect normalized stroke at 2x zoom');
}
if (stroke.intersectsPoint(100, 100, 10, 1600, 2000)) {
  throw new Error('Eraser false positive on normalized stroke');
}
console.log('✅ Stroke zoom-invariant dynamic projection & hit-testing passed');

// 2. Test Quad Normalization Invariance
const screenQuad = new Quad(new Point(200, 250), new Point(600, 250), new Point(600, 300), new Point(200, 300));
const normQuad = screenQuad.toNormalized(800, 1000);

if (normQuad.lt.x !== 0.25 || normQuad.lt.y !== 0.25 || normQuad.rb.x !== 0.75 || normQuad.rb.y !== 0.3) {
  throw new Error('Quad normalization failed');
}

// Re-projecting to 1600x2000 (2x zoom) must yield exact double coordinates
const zoomedQuad = normQuad.toScreen(1600, 2000);
if (zoomedQuad.lt.x !== 400 || zoomedQuad.lt.y !== 500 || zoomedQuad.rb.x !== 1200 || zoomedQuad.rb.y !== 600) {
  throw new Error('Quad re-projection to 2x zoom failed');
}
console.log('✅ Quad normalization and multi-resolution re-projection passed');

// 3. Test Scale-Independent PDF Export
async function testExportInvariance() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]);
  const pdfBytes = await pdfDoc.save();

  const pageStrokesMap = new Map();
  pageStrokesMap.set(1, [stroke]);

  // Case A: User is at 100% zoom (800x1000 screen)
  const metrics100 = new Map([[1, { width: 800, height: 1000 }]]);
  const export100 = await PdfExporter.exportAnnotatedPdf(pdfBytes.buffer, pageStrokesMap, metrics100);

  // Case B: User zoomed in to 250% (2000x2500 screen) before exporting
  const metrics250 = new Map([[1, { width: 2000, height: 2500 }]]);
  const export250 = await PdfExporter.exportAnnotatedPdf(pdfBytes.buffer, pageStrokesMap, metrics250);

  // Parse exported PDFs
  const doc100 = await PDFDocument.load(export100);
  const doc250 = await PDFDocument.load(export250);

  const getInkPoints = (doc) => {
    const page = doc.getPages()[0];
    const annots = page.node.Annots();
    const inkAnnot = doc.context.lookup(annots.get(0));
    const inkList = inkAnnot.get(PDFName.of('InkList'));
    const strokeArray = inkList.get(0);
    return strokeArray.asArray().map(n => n.asNumber());
  };

  const pts100 = getInkPoints(doc100);
  const pts250 = getInkPoints(doc250);

  // Expected coordinates in PDF user space:
  // p0: (0.25 * 612, 792 - 0.25 * 792) = (153, 594)
  // p1: (0.75 * 612, 792 - 0.75 * 792) = (459, 198)
  if (Math.abs(pts100[0] - 153) > 1e-3 || Math.abs(pts100[1] - 594) > 1e-3) {
    throw new Error(`Export 100% mismatch: expected [153, 594], got [${pts100[0]}, ${pts100[1]}]`);
  }

  // The critical invariance test: pts250 MUST be bit-exact equal to pts100!
  if (Math.abs(pts250[0] - pts100[0]) > 1e-4 || Math.abs(pts250[1] - pts100[1]) > 1e-4) {
    throw new Error(`Zero-Drift Invariance violated! Zoom state corrupted exported coordinates: ${pts100} vs ${pts250}`);
  }

  console.log('✅ PDF Export is 100% scale-invariant (Zero-Drift between 100% and 250% zoom verified)');
}

testExportInvariance().then(() => {
  console.log('--- All Law 1: Coordinate Space Invariance Tests Passed Successfully ---');
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
