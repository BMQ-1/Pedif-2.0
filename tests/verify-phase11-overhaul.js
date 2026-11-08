import assert from 'node:assert';
import { highlightManager } from '../src/annotations/highlight-manager.js';
import { HomeLibrary } from '../src/ui/home-library.js';
import { Scrubber } from '../src/ui/scrubber.js';
import { Dock } from '../src/ui/dock.js';

console.log('--- Running Phase 11 UI & Native Selection Overhaul Tests ---');

// 1. Verify highlightManager.createHighlightFromQuads
const mockQuads = [
  {
    lt: { x: 0.1, y: 0.2 },
    rt: { x: 0.5, y: 0.2 },
    rb: { x: 0.5, y: 0.25 },
    lb: { x: 0.1, y: 0.25 },
    isNormalized: true,
  }
];

const ann = highlightManager.createHighlightFromQuads(1, mockQuads, 'Hello world', 'coral', 'Note text');
assert.ok(ann, 'Highlight created from quads');
assert.strictEqual(ann.color, '#ff2d55', 'Coral palette color applied');
assert.strictEqual(ann.text, 'Hello world');
assert.strictEqual(ann.note, 'Note text');
assert.strictEqual(ann.quads.length, 1);
assert.strictEqual(ann.quads[0].lt.x, 0.1);
console.log('✅ highlightManager.createHighlightFromQuads passed');

// 2. Verify HomeLibrary helper utilities
const lib = new HomeLibrary();
assert.strictEqual(lib.formatTimeAgo(Date.now() - 30000), 'Just now');
assert.strictEqual(lib.formatTimeAgo(Date.now() - 300000), '5m ago');
assert.strictEqual(lib.formatTimeAgo(Date.now() - 7200000), '2h ago');
assert.strictEqual(lib.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
console.log('✅ HomeLibrary utilities passed');

// 3. Verify Dock methods
const dock = new Dock();
dock.updatePage(5, 42);
assert.strictEqual(dock.currentPage, 5);
assert.strictEqual(dock.totalPages, 42);
console.log('✅ Dock state updates passed');

// 4. Verify Scrubber methods
const scrubber = new Scrubber();
scrubber.updateProgress(10, 50);
assert.strictEqual(scrubber.currentPage, 10);
assert.strictEqual(scrubber.totalPages, 50);
console.log('✅ Scrubber progress updates passed');

console.log('--- All Phase 11 Overhaul Tests Passed Successfully ---');
