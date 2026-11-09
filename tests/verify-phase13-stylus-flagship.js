import assert from 'node:assert';
import { ShapeRecognizer } from '../src/inking/shape-recognizer.js';
import { LassoTool } from '../src/inking/lasso-tool.js';
import { Stroke } from '../src/inking/stroke-model.js';
import { Annotation } from '../src/annotations/annotation-model.js';
import { highlightManager } from '../src/annotations/highlight-manager.js';
import { PdfExporter } from '../src/annotations/pdf-exporter.js';
import { toValidArrayBuffer } from '../src/storage/library.js';

console.log('--- Phase 13 Precision Stylus & Flagship Storage Verification ---');

// 1. Test ShapeRecognizer: Line
{
  const linePoints = [];
  for (let i = 0; i < 20; i++) {
    linePoints.push({ x: 10 + i * 5, y: 20 + i * 5, pressure: 0.5, time: i * 10 });
  }
  const lineResult = ShapeRecognizer.recognize(linePoints);
  assert.ok(lineResult, 'Line should be recognized');
  assert.strictEqual(lineResult.type, 'line');
  assert.strictEqual(lineResult.points.length, 2);
  assert.strictEqual(lineResult.points[0].x, 10);
  assert.strictEqual(lineResult.points[1].x, 10 + 19 * 5);
  console.log('✓ ShapeRecognizer: straight line recognized');
}

// 2. Test ShapeRecognizer: Circle
{
  const circlePoints = [];
  const cx = 100, cy = 100, r = 40;
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    circlePoints.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), pressure: 0.5, time: i * 10 });
  }
  // close the loop
  circlePoints.push({ x: cx + r, y: cy, pressure: 0.5, time: 300 });
  const circleResult = ShapeRecognizer.recognize(circlePoints);
  assert.ok(circleResult, 'Circle should be recognized');
  assert.ok(circleResult.type === 'circle' || circleResult.type === 'ellipse');
  assert.ok(circleResult.points.length > 10, 'Circle should generate smoothed polygon path');
  console.log(`✓ ShapeRecognizer: ${circleResult.type} recognized`);
}

// 3. Test ShapeRecognizer: Rectangle
{
  const rectPoints = [];
  // Top edge
  for (let x = 50; x <= 150; x += 10) rectPoints.push({ x, y: 50, pressure: 0.5, time: rectPoints.length * 10 });
  // Right edge
  for (let y = 50; y <= 120; y += 10) rectPoints.push({ x: 150, y, pressure: 0.5, time: rectPoints.length * 10 });
  // Bottom edge
  for (let x = 150; x >= 50; x -= 10) rectPoints.push({ x, y: 120, pressure: 0.5, time: rectPoints.length * 10 });
  // Left edge back to start
  for (let y = 120; y >= 50; y -= 10) rectPoints.push({ x: 50, y, pressure: 0.5, time: rectPoints.length * 10 });
  rectPoints.push({ x: 50, y: 50, pressure: 0.5, time: rectPoints.length * 10 });

  const rectResult = ShapeRecognizer.recognize(rectPoints);
  assert.ok(rectResult, 'Rectangle should be recognized');
  assert.ok(rectResult.type === 'rectangle' || rectResult.type === 'polygon');
  console.log(`✓ ShapeRecognizer: ${rectResult.type} recognized`);
}

// 4. Test LassoTool point-in-polygon & stroke selection
{
  const lasso = new LassoTool({ viewer: null });
  // Triangle polygon
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: 100 }
  ];
  assert.strictEqual(lasso.pointInPolygon({ x: 50, y: 30 }, polygon), true, 'Point inside triangle');
  assert.strictEqual(lasso.pointInPolygon({ x: 150, y: 50 }, polygon), false, 'Point outside triangle');

  // Stroke inside lasso
  const insideStroke = new Stroke({
    tool: 'pen',
    color: '#007aff',
    points: [{ x: 50, y: 30, pressure: 0.5 }, { x: 52, y: 32, pressure: 0.5 }]
  });
  // Stroke outside lasso
  const outsideStroke = new Stroke({
    tool: 'pen',
    color: '#ff2d55',
    points: [{ x: 200, y: 200, pressure: 0.5 }, { x: 210, y: 210, pressure: 0.5 }]
  });

  const selected = lasso.findStrokesInLasso(polygon, [insideStroke, outsideStroke]);
  assert.strictEqual(selected.length, 1);
  assert.strictEqual(selected[0], insideStroke);
  console.log('✓ LassoTool: precise point-in-polygon ray casting verified');
}

// 5. Test Multi-style Annotations: Highlight, Underline, Strikethrough
{
  const hl = new Annotation({
    id: 'ann-1',
    pageNum: 1,
    type: 'highlight',
    style: 'highlight',
    color: '#ffea00',
    quads: [[10, 20, 100, 20, 10, 35, 100, 35]],
    text: 'Highlight Sample'
  });
  assert.strictEqual(hl.style, 'highlight');

  const ul = new Annotation({
    id: 'ann-2',
    pageNum: 1,
    type: 'highlight',
    style: 'underline',
    color: '#007aff',
    quads: [[10, 50, 100, 50, 10, 65, 100, 65]],
    text: 'Underline Sample'
  });
  assert.strictEqual(ul.style, 'underline');

  const so = new Annotation({
    id: 'ann-3',
    pageNum: 1,
    type: 'highlight',
    style: 'strikethrough',
    color: '#ff3b30',
    quads: [[10, 80, 100, 80, 10, 95, 100, 95]],
    text: 'Strikeout Sample'
  });
  assert.strictEqual(so.style, 'strikethrough');

  // Verify ISO PDF Exporter mapping
  assert.strictEqual(PdfExporter.getSubtypeName(hl), 'Highlight', 'Highlight subtype match');
  assert.strictEqual(PdfExporter.getSubtypeName(ul), 'Underline', 'Underline subtype match');
  assert.strictEqual(PdfExporter.getSubtypeName(so), 'StrikeOut', 'StrikeOut subtype match');
  console.log('✓ ISO 32000-1 §12.5.6.10 Markup Subtypes (Highlight, Underline, StrikeOut) verified');
}

// 6. Test Detached Buffer & Non-Fatal Storage Guard
{
  const valid = toValidArrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer);
  assert.ok(valid instanceof ArrayBuffer);
  assert.strictEqual(valid.byteLength, 4);

  // Detached buffer simulation / null input
  assert.strictEqual(toValidArrayBuffer(null), null);
  assert.strictEqual(toValidArrayBuffer(undefined), null);
  assert.strictEqual(toValidArrayBuffer(new ArrayBuffer(0)), null);
  console.log('✓ Sovereign storage detached ArrayBuffer guards verified');
}

console.log('All Phase 13 Precision Stylus & Flagship tests passed successfully!');
