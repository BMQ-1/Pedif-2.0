/**
 * Interactive Showcase PDF Generator
 * Instantly creates a rich, elegant sample PDF using pdf-lib on-device
 * with zero network calls, letting users immediately experience all features:
 * - Native text selection & highlighting
 * - Freehand inking & hold-to-snap
 * - WebGPU Area OCR snippet extraction
 * - Universal eraser & ISO 32000-1 non-destructive export
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function createShowcasePdf() {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  // ─────────────────────────────────────────────────────────────
  // PAGE 1: Welcome & Studio Showcase
  // ─────────────────────────────────────────────────────────────
  const page1 = doc.addPage([595.28, 841.89]); // A4
  const { width: p1W, height: p1H } = page1.getSize();

  // Decorative header bar
  page1.drawRectangle({
    x: 0,
    y: p1H - 8,
    width: p1W,
    height: 8,
    color: rgb(0.04, 0.52, 1.0), // Cupertino Blue
  });

  // Header Title
  page1.drawText('Pedif 2.0 Studio Showcase', {
    x: 54,
    y: p1H - 64,
    size: 24,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  // Subtitle
  page1.drawText('Zero-Install Web App · 100% On-Device · Privacy-Sovereign PDF Reading & Inking', {
    x: 54,
    y: p1H - 86,
    size: 11,
    font: fontOblique,
    color: rgb(0.4, 0.42, 0.46),
  });

  // Section 1: Precision Highlighting
  page1.drawText('1. Precision Text Selection & Multi-Color Highlighting', {
    x: 54,
    y: p1H - 130,
    size: 14,
    font: fontBold,
    color: rgb(0.04, 0.52, 1.0),
  });

  const sec1Lines = [
    'Pedif 2.0 introduces zero-lag native text selection with scale-invariant quadrilateral geometry.',
    'Drag your cursor across any text in this paragraph to summon the floating Apple-style action bubble.',
    'Choose from 5 pastel color chips (Yellow, Coral, Emerald, Sky Blue, Lilac) to create a permanent highlight.',
    'All highlights conform strictly to ISO 32000-1 §12.5.6.10, remaining fully editable in Adobe Acrobat & Apple Books.'
  ];
  let curY = p1H - 152;
  sec1Lines.forEach(line => {
    page1.drawText(line, { x: 54, y: curY, size: 10.5, font: fontRegular, color: rgb(0.18, 0.2, 0.24) });
    curY -= 17;
  });

  // Section 2: Vector Inking & Ergonomics
  curY -= 16;
  page1.drawText('2. Dynamic Vector Inking & Universal Eraser', {
    x: 54,
    y: curY,
    size: 14,
    font: fontBold,
    color: rgb(0.04, 0.52, 1.0),
  });
  curY -= 22;

  const sec2Lines = [
    'Tap the Pen (P) or Highlighter (H) in the top action bar to write and sketch with sub-millisecond latency.',
    'Features Catmull-Rom spline smoothing, pressure modulation, and gentle hold-to-snap for straight lines.',
    'The universal Eraser (E) sweeps across both handwriting ink strokes and text highlights with generous precision.',
    'Every annotation action supports complete reversible Undo (Ctrl+Z) and Redo (Ctrl+Y) through the CommandStack.'
  ];
  sec2Lines.forEach(line => {
    page1.drawText(line, { x: 54, y: curY, size: 10.5, font: fontRegular, color: rgb(0.18, 0.2, 0.24) });
    curY -= 17;
  });

  // Section 3: On-Device Neural PP-OCRv4
  curY -= 16;
  page1.drawText('3. On-Device WebGPU PP-OCRv4 Neural Pipeline', {
    x: 54,
    y: curY,
    size: 14,
    font: fontBold,
    color: rgb(0.04, 0.52, 1.0),
  });
  curY -= 22;

  const sec3Lines = [
    'Select the Area OCR Snippet tool (O) and drag a selection rectangle across any text or diagram on this page.',
    'Pedif dispatches image patches to an isolated Web Worker executing local ONNX Runtime Web with WebGPU / WASM SIMD.',
    'Transcribes scanned typography with zero telemetry, zero servers, and zero cloud roundtrips.'
  ];
  sec3Lines.forEach(line => {
    page1.drawText(line, { x: 54, y: curY, size: 10.5, font: fontRegular, color: rgb(0.18, 0.2, 0.24) });
    curY -= 17;
  });

  // Demonstration Callout Box
  curY -= 20;
  page1.drawRectangle({
    x: 54,
    y: curY - 90,
    width: p1W - 108,
    height: 90,
    color: rgb(0.95, 0.97, 1.0),
    borderColor: rgb(0.78, 0.86, 0.98),
    borderWidth: 1,
  });

  page1.drawText('PRO-TIP: TEST THE SNIPPET OCR TOOL HERE', {
    x: 70,
    y: curY - 24,
    size: 9.5,
    font: fontBold,
    color: rgb(0.04, 0.52, 1.0),
  });

  page1.drawText('Formula: E = mc^2 | Model Weights: 14.8MB local ONNX | Accuracy: 97.4%', {
    x: 70,
    y: curY - 44,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.15, 0.18, 0.22),
  });

  page1.drawText('Click tool (O) in the top bar, then drag over this box to transcribe in real time.', {
    x: 70,
    y: curY - 64,
    size: 10,
    font: fontOblique,
    color: rgb(0.35, 0.38, 0.42),
  });

  // Footer
  page1.drawText('Pedif 2.0 Showcase · Page 1 of 2 · ISO 32000-1 Document Architecture', {
    x: 54,
    y: 36,
    size: 9,
    font: fontRegular,
    color: rgb(0.55, 0.58, 0.62),
  });

  // ─────────────────────────────────────────────────────────────
  // PAGE 2: Creative Inking & Annotation Canvas
  // ─────────────────────────────────────────────────────────────
  const page2 = doc.addPage([595.28, 841.89]);
  const { width: p2W, height: p2H } = page2.getSize();

  page2.drawRectangle({
    x: 0,
    y: p2H - 8,
    width: p2W,
    height: 8,
    color: rgb(0.2, 0.78, 0.35), // Emerald Green
  });

  page2.drawText('Creative Inking & Margin Notes Canvas', {
    x: 54,
    y: p2H - 64,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  page2.drawText('Use this ruled space to test freehand pen strokes, fluid highlighter, and hold-to-snap lines.', {
    x: 54,
    y: p2H - 86,
    size: 11,
    font: fontRegular,
    color: rgb(0.4, 0.42, 0.46),
  });

  // Ruled notebook lines for inking practice
  let lineY = p2H - 120;
  for (let i = 0; i < 22; i++) {
    page2.drawLine({
      start: { x: 54, y: lineY },
      end: { x: p2W - 54, y: lineY },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });
    lineY -= 28;
  }

  // Vertical margin guide
  page2.drawLine({
    start: { x: 120, y: p2H - 110 },
    end: { x: 120, y: lineY + 18 },
    thickness: 1,
    color: rgb(1.0, 0.85, 0.88),
  });

  page2.drawText('MARGIN', {
    x: 64,
    y: p2H - 138,
    size: 8.5,
    font: fontBold,
    color: rgb(0.75, 0.4, 0.45),
  });

  page2.drawText('Write notes, draw diagrams, or highlight lines here. Save & Export via Ctrl + S.', {
    x: 136,
    y: p2H - 138,
    size: 10,
    font: fontOblique,
    color: rgb(0.3, 0.34, 0.4),
  });

  page2.drawText('Pedif 2.0 Showcase · Page 2 of 2 · Designed for Apple Pencil, stylus & mouse precision', {
    x: 54,
    y: 36,
    size: 9,
    font: fontRegular,
    color: rgb(0.55, 0.58, 0.62),
  });

  const pdfBytes = await doc.save();
  return pdfBytes.buffer;
}
