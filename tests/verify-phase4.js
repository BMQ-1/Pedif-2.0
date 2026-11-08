import { SelectionOverlay } from '../src/selection/selection-overlay.js';
import { HighlightManager, PALETTE } from '../src/annotations/highlight-manager.js';
import { commandStack } from '../src/core/command-stack.js';
import { Point, Quad } from '../src/selection/quad-model.js';

console.log('--- Running Phase 4 Precision Selection Engine & Highlighting Tests ---');

// Mock SVG & page container
const mockSvg = {
  querySelector: (sel) => {
    return {
      appendChild: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      style: {},
      setAttribute: () => {},
    };
  },
  addEventListener: () => {},
};

const q1 = new Quad(new Point(10, 10), new Point(20, 10), new Point(20, 30), new Point(10, 30));
const q2 = new Quad(new Point(20, 10), new Point(30, 10), new Point(30, 30), new Point(20, 30));
const q3 = new Quad(new Point(30, 10), new Point(40, 10), new Point(40, 30), new Point(30, 30));

const mockLines = [
  {
    lineIdx: 0,
    dir: 'ltr',
    words: [
      {
        text: 'ABC',
        quad: new Quad(new Point(10, 10), new Point(40, 10), new Point(40, 30), new Point(10, 30)),
        chars: [
          { char: 'A', quad: q1 },
          { char: 'B', quad: q2 },
          { char: 'C', quad: q3 },
        ],
      },
    ],
  },
];

// 1. Test SelectionOverlay Flattening & Magnetic Snap
const overlay = new SelectionOverlay({
  pageContainer: {},
  svg: mockSvg,
  pageNum: 1,
  lines: mockLines,
});

if (overlay.allChars.length !== 3) {
  throw new Error(`Expected 3 chars, got ${overlay.allChars.length}`);
}

// Test nearest char to (15, 20) -> should be 'A' (index 0)
const idxA = overlay.findNearestChar(15, 20);
if (idxA !== 0) throw new Error(`Expected char index 0 for (15, 20), got ${idxA}`);

// Test nearest char to (35, 20) -> should be 'C' (index 2)
const idxC = overlay.findNearestChar(35, 20);
if (idxC !== 2) throw new Error(`Expected char index 2 for (35, 20), got ${idxC}`);

console.log('✅ Magnetic character snapping passed');

// 2. Test HighlightManager & Undo/Redo integration
const hm = new HighlightManager();
commandStack.clear();

const charsToHighlight = overlay.allChars.slice(0, 2); // 'AB'
const ann = hm.createHighlight(1, charsToHighlight, 'coral', 'Important note');

if (!ann || ann.text !== 'AB' || ann.color !== PALETTE.coral.color) {
  throw new Error('Highlight creation mismatch');
}
if (hm.getAnnotationsForPage(1).length !== 1) {
  throw new Error('Expected 1 annotation on page 1');
}
console.log('✅ Highlight creation passed');

// Test Undo
if (!commandStack.canUndo()) throw new Error('CommandStack should be able to undo');
commandStack.undo();
if (hm.getAnnotationsForPage(1).length !== 0) {
  throw new Error('Highlight should be deleted after undo');
}
console.log('✅ Highlight undo passed');

// Test Redo
if (!commandStack.canRedo()) throw new Error('CommandStack should be able to redo');
commandStack.redo();
if (hm.getAnnotationsForPage(1).length !== 1) {
  throw new Error('Highlight should be restored after redo');
}
console.log('✅ Highlight redo passed');

// Test Color Change Undo/Redo
hm.updateColor(ann.id, 'green');
if (hm.annotations.get(ann.id).color !== PALETTE.green.color) {
  throw new Error('Color change failed');
}
commandStack.undo();
if (hm.annotations.get(ann.id).color !== PALETTE.coral.color) {
  throw new Error('Color change undo failed');
}
commandStack.redo();
if (hm.annotations.get(ann.id).color !== PALETTE.green.color) {
  throw new Error('Color change redo failed');
}
console.log('✅ Highlight color change and undo/redo passed');

// Test Note Edit Undo/Redo
hm.updateNote(ann.id, 'Updated comment');
if (hm.annotations.get(ann.id).note !== 'Updated comment') {
  throw new Error('Note update failed');
}
commandStack.undo();
if (hm.annotations.get(ann.id).note !== 'Important note') {
  throw new Error('Note update undo failed');
}
console.log('✅ Highlight note edit and undo/redo passed');

console.log('--- All Phase 4 Core Tests Passed Successfully ---');
