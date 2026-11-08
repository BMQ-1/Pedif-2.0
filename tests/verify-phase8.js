import { Sidebar } from '../src/ui/sidebar.js';
import { ShortcutsModal } from '../src/ui/shortcuts-modal.js';

console.log('--- Running Phase 8 Desktop & Phone UI/UX Tests ---');

// Mock DOM elements
globalThis.document = {
  createElement: (tag) => ({
    className: '',
    innerHTML: '',
    style: {},
    classList: {
      add: function(c) { this[c] = true; },
      remove: function(c) { delete this[c]; },
      toggle: function(c, v) { if (v) this[c] = true; else delete this[c]; },
    },
    appendChild: () => {},
    querySelectorAll: () => [],
    querySelector: () => ({
      innerHTML: '',
      addEventListener: () => {},
    }),
    addEventListener: () => {},
  }),
  getElementById: () => ({
    appendChild: () => {},
  }),
  body: {
    appendChild: () => {},
  },
};
globalThis.window = {
  innerWidth: 1024,
  addEventListener: () => {},
};

// 1. Test Sidebar
const mockViewer = {
  currentPage: 1,
  scrollToPage: (p) => {},
};

const sidebar = new Sidebar({ viewer: mockViewer });
if (sidebar.isOpen) throw new Error('Sidebar should be closed initially');

sidebar.open();
if (!sidebar.isOpen) throw new Error('Sidebar should be open after open()');

sidebar.toggleBookmark(3);
if (!sidebar.bookmarks.has(3)) throw new Error('Bookmark toggle add failed');

sidebar.toggleBookmark(3);
if (sidebar.bookmarks.has(3)) throw new Error('Bookmark toggle remove failed');

sidebar.close();
if (sidebar.isOpen) throw new Error('Sidebar should be closed after close()');

console.log('✅ Sidebar tabs & bookmark state passed');

// 2. Test ShortcutsModal
const modal = new ShortcutsModal();
if (modal.isOpen()) throw new Error('Shortcuts modal should be closed initially');

modal.open();
if (!modal.isOpen()) throw new Error('Shortcuts modal should be open after open()');

modal.close();
if (modal.isOpen()) throw new Error('Shortcuts modal should be closed after close()');

console.log('✅ Shortcuts modal passed');

console.log('--- All Phase 8 Tests Passed Successfully ---');
