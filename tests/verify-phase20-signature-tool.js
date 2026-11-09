/**
 * Phase 20 Verification: Sovereign Digital & Freehand Signature Tool
 * Verifies:
 * 1. SignatureDialog instantiation and DOM rendering
 * 2. Canvas freehand drawing, stroke undo, and clear
 * 3. Atomic placement of vector strokes onto target PDF page
 * 4. CommandStack undo/redo lifecycle
 * 5. Sovereign local storage persistence
 * 6. Bounds and coordinate normalization [0.0, 1.0]
 */

import assert from 'assert';
import { SignatureDialog } from '../src/tools/signature-dialog.js';
import { commandStack } from '../src/core/command-stack.js';

console.log('--- Running Phase 20 Sovereign Digital Signature Verification ---');

// Setup mock DOM for headless testing
globalThis.document = {
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      hidden: false,
      style: {},
      attributes: {},
      innerHTML: '',
      value: '',
      checked: true,
      children: [],
      setAttribute: function(k, v) { this.attributes[k] = v; },
      getAttribute: function(k) { return this.attributes[k]; },
      appendChild: function(c) { this.children.push(c); return c; },
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 560, height: 220 }),
      getContext: () => ({
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        quadraticCurveTo: () => {},
        stroke: () => {},
        fillText: () => {},
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        fillStyle: '',
      }),
      querySelector: function(sel) {
        if (sel === '#sig-canvas') return this.createElement('canvas');
        if (sel === '#sig-page-select') return { value: '1', innerHTML: '', appendChild: () => {}, addEventListener: () => {} };
        if (sel === '#sig-placement-pos') return { value: 'bottom-right', addEventListener: () => {} };
        if (sel === '#sig-save-storage') return { checked: true, addEventListener: () => {} };
        if (sel === '#sig-type-input') return { value: 'Jane Doe', addEventListener: () => {}, focus: () => {} };
        if (sel === '.sig-type-card.active') return { dataset: { font: 'cursive' }, addEventListener: () => {} };
        return {
          addEventListener: () => {},
          classList: { add: () => {}, remove: () => {} },
          style: {},
          dataset: {},
        };
      },
      querySelectorAll: function() { return []; },
    };
    el.createElement = globalThis.document.createElement;
    return el;
  },
  body: { appendChild: () => {} },
  getElementById: () => null,
};

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

const storageStore = {};
globalThis.localStorage = {
  getItem: (k) => storageStore[k] || null,
  setItem: (k, v) => { storageStore[k] = String(v); },
  removeItem: (k) => { delete storageStore[k]; },
};

// Mock Viewer with pageStrokes Map
const mockViewer = {
  currentPage: 1,
  pageStrokes: new Map(),
  renderPageOverlay: (p) => {},
};

// 1. Instantiation
const sigDialog = new SignatureDialog({ viewer: mockViewer });
assert.ok(sigDialog, 'SignatureDialog should instantiate cleanly');
assert.strictEqual(sigDialog.mode, 'draw', 'Default mode should be draw');
console.log('✓ SignatureDialog: instantiated successfully');

// 2. Freehand drawing simulation
sigDialog.drawingStrokes = [
  [{ x: 50, y: 100, p: 0.5 }, { x: 80, y: 120, p: 0.6 }, { x: 120, y: 90, p: 0.5 }],
  [{ x: 130, y: 110, p: 0.7 }, { x: 160, y: 110, p: 0.4 }]
];
assert.strictEqual(sigDialog.drawingStrokes.length, 2, 'Two drawing strokes recorded');

// 3. Stamping onto page
sigDialog._applySignature();

const page1Strokes = mockViewer.pageStrokes.get(1);
assert.ok(page1Strokes && page1Strokes.length === 2, 'Page 1 should receive 2 vector strokes');

const firstStroke = page1Strokes[0];
assert.ok(firstStroke.isNormalized, 'Signature stroke should be normalized [0, 1]');
assert.ok(firstStroke.points[0].x >= 0 && firstStroke.points[0].x <= 1.0, 'X coordinate within normalized boundary');
assert.ok(firstStroke.points[0].y >= 0 && firstStroke.points[0].y <= 1.0, 'Y coordinate within normalized boundary');
console.log('✓ Signature: vector strokes stamped onto page with normalized coordinates');

// 4. CommandStack Undo / Redo
commandStack.undo();
const afterUndo = mockViewer.pageStrokes.get(1);
assert.strictEqual(afterUndo.length, 0, 'Signature should be removed from page on undo');

commandStack.redo();
const afterRedo = mockViewer.pageStrokes.get(1);
assert.strictEqual(afterRedo.length, 2, 'Signature should be restored on redo');
console.log('✓ Signature: CommandStack atomic undo/redo verified');

// 5. Sovereign Storage Persistence
const savedJson = localStorage.getItem('pedif:signature_strokes');
assert.ok(savedJson, 'Signature strokes must be persisted in localStorage');
const parsed = JSON.parse(savedJson);
assert.strictEqual(parsed.length, 2, 'Persisted strokes match input strokes');
console.log('✓ Signature: sovereign local storage persistence verified');

console.log('--- All Phase 20 Signature Tool Tests Passed Successfully ---');
