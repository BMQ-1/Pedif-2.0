/**
 * Keyboard Shortcuts Modal
 * Clean, interactive cheat-sheet for all shortcuts.
 */

export class ShortcutsModal {
  constructor() {
    this.modalEl = null;
    this.render();
    this.setupListeners();
  }

  render() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'shortcuts-modal-backdrop';
    this.modalEl.style.display = 'none';

    this.modalEl.innerHTML = `
      <div class="shortcuts-card">
        <div class="shortcuts-header">
          <div class="shortcuts-title-wrap">
            <h3>Keyboard Shortcuts</h3>
            <span class="shortcuts-subtitle">Press <kbd>?</kbd> anytime to open</span>
          </div>
          <button class="b sm" id="shortcuts-close-btn" title="Close" aria-label="Close shortcuts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="shortcuts-search-wrap">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="shortcuts-search-input" id="shortcuts-search" placeholder="Search shortcuts (e.g. ocr, pen, zoom, export)..." aria-label="Search keyboard shortcuts">
        </div>

        <div class="shortcuts-grid">
          <div class="shortcut-group">
            <h4>Tools</h4>
            <div class="shortcut-row"><kbd>V</kbd><span>Text Selection & Highlighting</span></div>
            <div class="shortcut-row"><kbd>P</kbd><span>Vector Pen & Shapes</span></div>
            <div class="shortcut-row"><kbd>H</kbd><span>Freehand Highlighter</span></div>
            <div class="shortcut-row"><kbd>E</kbd><span>Eraser (Whole / Segment)</span></div>
            <div class="shortcut-row"><kbd>L</kbd><span>Vector Lasso Tool</span></div>
            <div class="shortcut-row"><kbd>O</kbd><span>Area OCR Snippet</span></div>
            <div class="shortcut-row"><kbd>T</kbd><span>Smart Text Scan (Page)</span></div>
            <div class="shortcut-row"><kbd>C</kbd><span>8-Point Document Cropper</span></div>
          </div>

          <div class="shortcut-group">
            <h4>Navigation & Zoom</h4>
            <div class="shortcut-row"><kbd>J</kbd> / <kbd>→</kbd><span>Next page</span></div>
            <div class="shortcut-row"><kbd>K</kbd> / <kbd>←</kbd><span>Previous page</span></div>
            <div class="shortcut-row"><kbd>PgUp</kbd> / <kbd>PgDn</kbd><span>Previous / Next page</span></div>
            <div class="shortcut-row"><kbd>G</kbd><span>Go to Page (Jump)</span></div>
            <div class="shortcut-row"><kbd>W</kbd><span>Toggle Fit Width</span></div>
            <div class="shortcut-row"><kbd>+</kbd> / <kbd>-</kbd><span>Zoom in / out</span></div>
            <div class="shortcut-row"><kbd>0</kbd><span>Reset zoom (100%)</span></div>
            <div class="shortcut-row"><kbd>Home</kbd> / <kbd>End</kbd><span>First / Last page</span></div>
            <div class="shortcut-row"><kbd>F11</kbd><span>Toggle Fullscreen</span></div>
          </div>

          <div class="shortcut-group">
            <h4>Actions & Utilities</h4>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>O</kbd><span>Open Document</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>F</kbd><span>Find in document</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>P</kbd><span>Print document</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>S</kbd><span>Export PDF</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>Z</kbd><span>Undo</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>Y</kbd><span>Redo</span></div>
            <div class="shortcut-row"><kbd>X</kbd><span>Extract Pages</span></div>
            <div class="shortcut-row"><kbd>R</kbd><span>Rotate View (90°)</span></div>
            <div class="shortcut-row"><kbd>A</kbd><span>Read Page Aloud (TTS)</span></div>
            <div class="shortcut-row"><kbd>S</kbd><span>Reading Statistics</span></div>
            <div class="shortcut-row"><kbd>B</kbd><span>Bookmark Current Page</span></div>
            <div class="shortcut-row"><kbd>D</kbd><span>Toggle Theme</span></div>
            <div class="shortcut-row"><kbd>Z</kbd><span>Zen Focus Reading Mode</span></div>
            <div class="shortcut-row"><kbd>?</kbd><span>Show Shortcuts</span></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  setupListeners() {
    const closeBtn = this.modalEl.querySelector('#shortcuts-close-btn');
    if (closeBtn && typeof closeBtn.addEventListener === 'function') {
      closeBtn.addEventListener('click', () => this.close());
    }
    if (typeof this.modalEl.addEventListener === 'function') {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }
    const searchInput = this.modalEl.querySelector('#shortcuts-search');
    if (searchInput && typeof searchInput.addEventListener === 'function') {
      searchInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim().toLowerCase();
        this.filterShortcuts(query);
      });
    }
  }

  filterShortcuts(query) {
    const groups = this.modalEl.querySelectorAll ? this.modalEl.querySelectorAll('.shortcut-group') : [];
    if (!groups || !groups.forEach) return;
    groups.forEach(group => {
      let visibleInGroup = 0;
      const rows = group.querySelectorAll ? group.querySelectorAll('.shortcut-row') : [];
      if (rows && rows.forEach) {
        rows.forEach(row => {
          const text = (row.textContent || '').toLowerCase();
          const matches = !query || text.includes(query);
          if (row.style) row.style.display = matches ? 'flex' : 'none';
          if (matches) visibleInGroup++;
        });
      }
      if (group.style) {
        group.style.display = (visibleInGroup > 0 || !query) ? 'block' : 'none';
      }
    });
  }

  open() {
    this.modalEl.style.display = 'grid';
    const searchInput = this.modalEl.querySelector ? this.modalEl.querySelector('#shortcuts-search') : null;
    if (searchInput) {
      searchInput.value = '';
      this.filterShortcuts('');
      setTimeout(() => {
        if (typeof searchInput.focus === 'function') searchInput.focus();
      }, 50);
    }
  }

  close() {
    this.modalEl.style.display = 'none';
  }

  isOpen() {
    return this.modalEl.style.display === 'grid';
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }
}
