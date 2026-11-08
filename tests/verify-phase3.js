import { GlyphExtractor } from '../src/selection/glyph-extractor.js';
import { SearchEngine } from '../src/core/search-engine.js';
import { Point, Quad } from '../src/selection/quad-model.js';

console.log('--- Running Phase 3 Hybrid Text & Unified Search Tests ---');

// 1. Test Mock Viewport Point Conversion
const mockViewport = {
  convertToViewportPoint: (x, y) => [x * 1.5, (800 - y) * 1.5],
};

const mockItem = {
  str: 'Pedif Engine',
  dir: 'ltr',
  width: 100,
  height: 14,
  transform: [14, 0, 0, 14, 50, 700],
};

const itemQuad = GlyphExtractor.computeItemQuad(mockItem, mockViewport);
if (!itemQuad || !(itemQuad instanceof Quad)) {
  throw new Error('computeItemQuad failed to return Quad');
}
console.log('✅ computeItemQuad passed');

// 2. Test Word & Character Subdivision
const words = GlyphExtractor.subdivideItemIntoWords(mockItem, itemQuad, mockViewport);
if (words.length !== 2) {
  throw new Error(`Expected 2 words ("Pedif", "Engine"), got ${words.length}`);
}
if (words[0].text !== 'Pedif' || words[1].text !== 'Engine') {
  throw new Error(`Word text mismatch: ${words[0].text}, ${words[1].text}`);
}
if (words[0].chars.length !== 5 || words[1].chars.length !== 6) {
  throw new Error('Character subdivision count mismatch');
}
console.log('✅ Word & character subdivision passed');

// 3. Test SearchEngine Indexing and Querying
const search = new SearchEngine();
const mockWords = [
  { text: 'The', quad: itemQuad },
  { text: 'quick', quad: itemQuad },
  { text: 'brown', quad: itemQuad },
  { text: 'fox', quad: itemQuad },
  { text: 'jumps', quad: itemQuad },
];

search.registerOcrPage(1, [{ lineIdx: 0, words: mockWords }], mockWords, 'The quick brown fox jumps');

// Test single word match
let matches = search.search('fox');
if (matches.length !== 1 || matches[0].text !== 'fox') {
  throw new Error(`Expected 1 match for "fox", got ${matches.length}`);
}
console.log('✅ Single-word search passed');

// Test multi-word phrase match
matches = search.search('brown fox');
if (matches.length !== 1 || matches[0].text !== 'brown fox') {
  throw new Error(`Expected 1 match for phrase "brown fox", got ${matches.length}`);
}
console.log('✅ Multi-word phrase search passed');

// Test match navigation wrapping
const first = search.getActiveMatch();
if (first.index !== 1 || first.total !== 1) {
  throw new Error('getActiveMatch mismatch');
}
const next = search.nextMatch();
if (next.index !== 1) {
  throw new Error('nextMatch wrap failed');
}
const prev = search.prevMatch();
if (prev.index !== 1) {
  throw new Error('prevMatch wrap failed');
}
console.log('✅ Match navigation & wrapping passed');

// Test case insensitivity
matches = search.search('BROWN FOX');
if (matches.length !== 1) {
  throw new Error('Case-insensitive search failed');
}
console.log('✅ Case insensitivity passed');

// Test clear
search.clear();
if (search.matches.length !== 0) {
  throw new Error('Clear search failed');
}
console.log('✅ Search clear passed');

console.log('--- All Phase 3 Core Tests Passed Successfully ---');
