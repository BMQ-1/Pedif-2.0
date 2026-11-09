/**
 * Floating / Dockable Quick Tools Hotbar
 * A movable, persistent set of shortcuts to core document tools.
 */

export class Hotbar {
  constructor(options = {}) {
    this.app = options.app || null;
    this.viewer = options.viewer || null;
    this.container = null;
    this.activeTool = 'select';
    this.isDragging = false;
    this.dock = localStorage.getItem('pedif:hotbar:dock') || 'floating'; // 'floating' | 'left' | 'top'
    this.position = { x: 24, y: 120 };

    this.initDOM();
    this.restorePosition();
    this.bindDrag();
    this.bindTools();

    window.addEventListener('resize', () => {
      this.clampPosition();
    });
  }

  initDOM() {
    if (typeof document === 'undefined') return;

    let el = document.getElementById('craft-hotbar');
    if (!el) {
      el = document.createElement('aside');
      el.id = 'craft-hotbar';
      el.className = 'craft-hotbar';
      el.setAttribute('aria-label', 'Quick Action Hotbar');
      el.innerHTML = `
        <div class="craft-hotbar-handle" title="Drag to reposition hotbar" aria-grabbed="false">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/>
            <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
            <circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>
          </svg>
        </div>

        <div class="craft-hotbar-tools">
          <button type="button" class="craft-hotbar-btn active" data-tool="select" title="Text Select & Highlight (V)" aria-label="Text Select & Highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
            </svg>
            <span class="craft-hotbar-tooltip">Select (V)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-tool="pen" title="Vector Pen & Shape Snapping (P)" aria-label="Vector Pen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            </svg>
            <span class="craft-hotbar-tooltip">Pen (P)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-tool="highlighter" title="Freehand Highlighter (H)" aria-label="Highlighter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15.5 3.5l5 5L7 22H2v-5L15.5 3.5z"/>
              <path d="M14 5l5 5"/>
            </svg>
            <span class="craft-hotbar-tooltip">Highlighter (H)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-tool="eraser" title="Vector Stroke Eraser (E)" aria-label="Eraser">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 20H7L3 16a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4L13 19"/>
            </svg>
            <span class="craft-hotbar-tooltip">Eraser (E)</span>
          </button>

          <div class="craft-hotbar-divider"></div>

          <button type="button" class="craft-hotbar-btn" data-action="stamp" title="Rubber Stamp Palette (S)" aria-label="Rubber Stamp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
            <span class="craft-hotbar-tooltip">Stamp (S)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-action="signature" title="Digital Signature (F)" aria-label="Signature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 19.5c-3 0-5-2-7-5s-4-6-7-6c-2 0-3 1-3 3s2 3 5 3c4 0 7-3 9-6"/>
            </svg>
            <span class="craft-hotbar-tooltip">Sign (F)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-tool="ocr" title="Area OCR Snippet (O)" aria-label="OCR Snippet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
              <path d="M8 12h8M12 8v8"/>
            </svg>
            <span class="craft-hotbar-tooltip">OCR (O)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-action="crop" title="Interactive Crop (C)" aria-label="Crop">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
              <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
            </svg>
            <span class="craft-hotbar-tooltip">Crop (C)</span>
          </button>

          <button type="button" class="craft-hotbar-btn" data-action="sanitize" title="Document Sanitizer (R)" aria-label="Sanitize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span class="craft-hotbar-tooltip">Sanitize (R)</span>
          </button>

          <div class="craft-hotbar-divider"></div>

          <button type="button" class="craft-hotbar-btn craft-hotbar-alltools-btn" data-action="all-tools" title="All Tools (T)" aria-label="All Tools">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            <span class="craft-hotbar-tooltip">All Tools (T)</span>
          </button>
        </div>
      `;

      const readerScreen = document.getElementById('rd');
      if (readerScreen) {
        readerScreen.appendChild(el);
      } else {
        document.body.appendChild(el);
      }
    }

    this.container = el;
  }

  restorePosition() {
    try {
      const saved = localStorage.getItem('pedif:hotbar:pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          // Clamp to screen
          const maxX = window.innerWidth - 60;
          const maxY = window.innerHeight - 100;
          this.position.x = Math.max(8, Math.min(maxX, parsed.x));
          this.position.y = Math.max(48, Math.min(maxY, parsed.y));
        }
      }
    } catch {}

    this.applyPosition();
  }

  applyPosition() {
    if (!this.container) return;
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  clampPosition() {
    if (!this.container) return;
    const maxX = Math.max(8, window.innerWidth - this.container.offsetWidth - 8);
    const maxY = Math.max(48, window.innerHeight - this.container.offsetHeight - 8);
    this.position.x = Math.max(8, Math.min(maxX, this.position.x));
    this.position.y = Math.max(48, Math.min(maxY, this.position.y));
    this.applyPosition();
  }

  savePosition() {
    try {
      localStorage.setItem('pedif:hotbar:pos', JSON.stringify(this.position));
    } catch {}
  }

  bindDrag() {
    if (!this.container) return;
    const handle = this.container.querySelector('.craft-hotbar-handle');
    if (!handle) return;

    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let activePointerId = null;

    const onPointerMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const maxX = Math.max(8, window.innerWidth - this.container.offsetWidth - 8);
      const maxY = Math.max(48, window.innerHeight - this.container.offsetHeight - 8);

      this.position.x = Math.max(8, Math.min(maxX, initialX + dx));
      this.position.y = Math.max(48, Math.min(maxY, initialY + dy));
      this.applyPosition();
    };

    const onPointerUp = (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        handle.setAttribute('aria-grabbed', 'false');
        this.container.classList.remove('dragging');
        this.savePosition();
        if (activePointerId !== null && handle.releasePointerCapture) {
          try { handle.releasePointerCapture(activePointerId); } catch {}
          activePointerId = null;
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      }
    };

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.isDragging = true;
      activePointerId = e.pointerId;
      if (handle.setPointerCapture) {
        try { handle.setPointerCapture(e.pointerId); } catch {}
      }
      handle.setAttribute('aria-grabbed', 'true');
      this.container.classList.add('dragging');
      startX = e.clientX;
      startY = e.clientY;
      initialX = this.position.x;
      initialY = this.position.y;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });
  }

  bindTools() {
    if (!this.container) return;

    this.container.querySelectorAll('.craft-hotbar-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        const action = btn.dataset.action;

        if (tool) {
          this.setActiveTool(tool);
          // Sync with existing topbar tool buttons
          const topToolBtn = document.getElementById(`tool-${tool}`);
          if (topToolBtn) topToolBtn.click();
        } else if (action) {
          if (action === 'stamp') {
            this.app?.openStamp?.();
          } else if (action === 'signature') {
            this.app?.openSignature?.();
          } else if (action === 'crop') {
            this.app?.openCrop?.();
          } else if (action === 'sanitize') {
            this.app?.openSanitize?.();
          } else if (action === 'all-tools') {
            this.app?.openAllTools?.();
          }
        }
      });
    });
  }

  setActiveTool(toolName) {
    this.activeTool = toolName;
    if (!this.container) return;
    this.container.querySelectorAll('.craft-hotbar-btn[data-tool]').forEach((btn) => {
      if (btn.dataset.tool === toolName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
}
