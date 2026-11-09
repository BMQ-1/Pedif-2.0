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
          <h3>Keyboard Shortcuts</h3>
          <button class="b sm" id="shortcuts-close-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
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
            <div class="shortcut-row"><kbd>D</kbd><span>Toggle Theme</span></div>
            <div class="shortcut-row"><kbd>?</kbd><span>Show Shortcuts</span></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  setupListeners() {
    this.modalEl.querySelector('#shortcuts-close-btn').addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
  }

  open() {
    this.modalEl.style.display = 'grid';
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
