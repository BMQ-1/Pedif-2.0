import { PdfEngine } from '../src/core/pdf-engine.js';
import { CommandStack } from '../src/core/command-stack.js';
import { Quad, Point } from '../src/selection/quad-model.js';
import { Stroke } from '../src/inking/stroke-model.js';

console.log('--- Running Phase 2 Core Engine Verification Tests ---');

// 1. Test CommandStack
const stack = new CommandStack(10);
let val = 0;
stack.execute({
  execute: () => { val += 5; },
  undo: () => { val -= 5; },
});
if (val !== 5) throw new Error('CommandStack execute failed');
stack.undo();
if (val !== 0) throw new Error('CommandStack undo failed');
stack.redo();
if (val !== 5) throw new Error('CommandStack redo failed');
console.log('✅ CommandStack passed');

// 2. Test Quad geometry
const q = new Quad(new Point(0, 0), new Point(100, 0), new Point(100, 20), new Point(0, 20));
const bounds = q.getBounds();
if (bounds[0] !== 0 || bounds[1] !== 0 || bounds[2] !== 100 || bounds[3] !== 20) {
  throw new Error('Quad getBounds failed');
}
const arr = q.toArray();
if (arr.length !== 8) throw new Error('Quad toArray failed');
console.log('✅ Quad geometry passed');

// 3. Test Stroke geometry & intersection
const s = new Stroke({ type: 'pen', width: 4 });
s.addPoint(10, 10);
s.addPoint(50, 50);
if (!s.intersectsPoint(30, 30, 5)) throw new Error('Stroke intersection test failed');
if (s.intersectsPoint(200, 200, 5)) throw new Error('Stroke false positive intersection test failed');
console.log('✅ Stroke intersection passed');

// 4. Test PdfEngine instantiation
const engine = new PdfEngine();
if (engine.numPages !== 0) throw new Error('Initial numPages should be 0');
console.log('✅ PdfEngine passed');

console.log('--- All Phase 2 Core Tests Passed Successfully ---');
