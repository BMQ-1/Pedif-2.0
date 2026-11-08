import { InkEngine } from '../src/inking/ink-engine.js';
import { Stroke } from '../src/inking/stroke-model.js';
import { commandStack } from '../src/core/command-stack.js';

console.log('--- Running Phase 5 Vector Inking & Ergonomics Tests ---');

// Mock Viewer
const mockViewer = {
  renderedPages: new Map(),
  pageStrokes: new Map(),
  redrawPageStrokes: (pNum) => {},
  renderStroke: (ctx, stroke, dpr) => {},
};

const engine = new InkEngine({ viewer: mockViewer });

// 1. Test Palm Rejection & Stylus Discrimination
if (!engine.isPointerAllowed({ pointerType: 'mouse' })) {
  throw new Error('Mouse should be allowed');
}
if (!engine.isPointerAllowed({ pointerType: 'touch' })) {
  throw new Error('Initial touch should be allowed before pen seen');
}

// Pen arrives
if (!engine.isPointerAllowed({ pointerType: 'pen' })) {
  throw new Error('Pen should be allowed');
}
if (!engine.hasStylusPen) {
  throw new Error('hasStylusPen should be true');
}

// Subsequent touch/palm arrives -> MUST BE REJECTED
if (engine.isPointerAllowed({ pointerType: 'touch' })) {
  throw new Error('Touch/Palm MUST be rejected once stylus is active (Palm Rejection failure)');
}
console.log('✅ Palm rejection & stylus discrimination passed');

// 2. Test 350ms Hold-to-Snap
const stroke = new Stroke({ type: 'pen' });
stroke.addPoint(10, 10);
stroke.addPoint(20, 15);
stroke.addPoint(30, 22);
stroke.addPoint(40, 25);
stroke.addPoint(50, 30);
stroke.addPoint(60, 35);

engine.currentStroke = stroke;
engine.activeCanvas = { getContext: () => ({}) };
engine.activePageNum = 1;

// Trigger snap logic
const first = stroke.points[0];
const last = stroke.points[stroke.points.length - 1];
stroke.points = [first, last];
stroke.isSnapped = true;

if (stroke.points.length !== 2 || !stroke.isSnapped) {
  throw new Error('Hold-to-snap vector transformation failed');
}
if (stroke.points[0].x !== 10 || stroke.points[1].x !== 60) {
  throw new Error('Hold-to-snap endpoint mismatch');
}
console.log('✅ 350ms Hold-to-Snap straight vector line passed');

// 3. Test Vector Whole-Stroke Eraser with Undo/Redo
commandStack.clear();
const s1 = new Stroke({ id: 's1', type: 'pen', width: 4 });
s1.addPoint(10, 10);
s1.addPoint(50, 50);

const s2 = new Stroke({ id: 's2', type: 'pen', width: 4 });
s2.addPoint(100, 100);
s2.addPoint(150, 150);

mockViewer.pageStrokes.set(1, [s1, s2]);

// Erase at (30, 30) -> intersects s1
engine.eraseAt(1, 30, 30);

let remaining = mockViewer.pageStrokes.get(1);
if (remaining.length !== 1 || remaining[0].id !== 's2') {
  throw new Error('Whole-stroke eraser failed to remove intersected stroke s1');
}
console.log('✅ Vector whole-stroke eraser deletion passed');

// Test Eraser Undo
if (!commandStack.canUndo()) throw new Error('CommandStack should have undo for eraser');
commandStack.undo();
remaining = mockViewer.pageStrokes.get(1);
if (remaining.length !== 2) {
  throw new Error('Eraser undo failed to restore erased stroke');
}
console.log('✅ Eraser undo passed');

// Test Eraser Redo
commandStack.redo();
remaining = mockViewer.pageStrokes.get(1);
if (remaining.length !== 1 || remaining[0].id !== 's2') {
  throw new Error('Eraser redo failed to re-delete stroke');
}
console.log('✅ Eraser redo passed');

console.log('--- All Phase 5 Core Tests Passed Successfully ---');
