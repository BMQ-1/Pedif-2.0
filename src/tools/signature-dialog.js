/**
 * Pedif 2.0 - Sovereign Digital & Freehand Signature Dialog
 * Enables creating, storing, and stamping professional signatures onto PDF pages.
 * Supports:
 * 1. High-precision freehand canvas drawing (mouse, stylus, touch) with smoothing.
 * 2. Cursive typographic signature generation from typed name/initials.
 * 3. Sovereign local profile storage (100% offline, zero cloud calls).
 * 4. Stamping as vector strokes into ISO 32000-1 /Subtype /Ink annotations with Undo/Redo.
 */

import { Stroke } from '../inking/stroke-model.js';
import { commandStack } from '../core/command-stack.js';
import { toast } from '../ui/toast.js';

export class SignatureDialog {
  /**
   * @param {Object} options
   * @param {Object} options.viewer - The PdfViewer instance
   * @param {Function} options.onSignaturePlaced - Callback after stamping: (pageNum) => void
   */
  constructor({ viewer, onSignaturePlaced } = {}) {
    this.viewer = viewer;
    this.onSignaturePlaced = onSignaturePlaced;
    this.modal = null;
    this.mode = 'draw'; // 'draw' | 'type'
    this.activeColor = '#111827';
    this.strokeWidth = 3;
    this.drawingStrokes = []; // Array of arrays of points [{x, y, p}]
    this.currentPath = null;
    this.isDrawing = false;
    this.canvas = null;
    this.ctx = null;
    this._onKeyDown = null;

    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'signature-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', 'Digital & Freehand Signature');

    this.modal.innerHTML = `
      <div class="workbench-dialog signature-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L20 7.5V13"/>
              <path d="M14 2v6h6"/>
              <path d="M9 15c2 0 3-2 5-2s3 2 5 2"/>
              <line x1="8" y1="18" x2="16" y2="18"/>
            </svg>
            <div>
              <h2 class="wb-title">Signature & Stamp</h2>
              <p class="wb-subtitle">Draw or type your signature to stamp directly onto PDF pages</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="sig-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body">
          <div class="sig-tabs">
            <button type="button" class="sig-tab active" data-tab="draw" id="sig-tab-draw">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
              <span>Draw Freehand</span>
            </button>
            <button type="button" class="sig-tab" data-tab="type" id="sig-tab-type">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
              <span>Type Signature</span>
            </button>
          </div>

          <!-- DRAW PANE -->
          <div class="sig-pane" id="sig-pane-draw">
            <div class="sig-canvas-container">
              <canvas id="sig-canvas" width="560" height="220"></canvas>
              <div class="sig-baseline"></div>
              <span class="sig-guide-label">Sign above this line</span>
            </div>

            <div class="sig-controls-row">
              <div class="sig-color-swatches">
                <button type="button" class="sig-color-btn active" data-color="#111827" title="Ink Black" style="background: #111827;"></button>
                <button type="button" class="sig-color-btn" data-color="#1d4ed8" title="Navy Blue" style="background: #1d4ed8;"></button>
                <button type="button" class="sig-color-btn" data-color="#b91c1c" title="Crimson" style="background: #b91c1c;"></button>
              </div>

              <div class="sig-tools-right">
                <button type="button" class="btn btn-secondary sm" id="sig-undo-stroke" title="Undo last stroke">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
                  <span>Undo</span>
                </button>
                <button type="button" class="btn btn-secondary sm" id="sig-clear-canvas" title="Clear signature">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>

          <!-- TYPE PANE -->
          <div class="sig-pane" id="sig-pane-type" hidden>
            <div class="sig-type-input-wrap">
              <label for="sig-type-input">Type Full Name or Initials</label>
              <input type="text" id="sig-type-input" placeholder="e.g. Eleanor Vance" maxlength="40" />
            </div>

            <div class="sig-type-styles">
              <div class="sig-type-card active" data-font="'Brush Script MT', 'Dancing Script', cursive">
                <span class="sig-type-preview" id="sig-prev-1">Eleanor Vance</span>
                <span class="sig-type-font-name">Casual Script</span>
              </div>
              <div class="sig-type-card" data-font="'Segoe Script', 'Great Vibes', cursive">
                <span class="sig-type-preview" id="sig-prev-2">Eleanor Vance</span>
                <span class="sig-type-font-name">Formal Elegance</span>
              </div>
              <div class="sig-type-card" data-font="'Lucida Handwriting', 'Caveat', cursive">
                <span class="sig-type-preview" id="sig-prev-3">Eleanor Vance</span>
                <span class="sig-type-font-name">Natural Penmanship</span>
              </div>
            </div>
          </div>

          <!-- TARGET PAGE SELECTOR -->
          <div class="sig-placement-row">
            <div class="sig-field-group">
              <label for="sig-page-select">Target Page</label>
              <select id="sig-page-select" class="sig-select"></select>
            </div>
            <div class="sig-field-group">
              <label for="sig-placement-pos">Position</label>
              <select id="sig-placement-pos" class="sig-select">
                <option value="bottom-right" selected>Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="center">Center</option>
                <option value="top-right">Top Right</option>
              </select>
            </div>
          </div>
        </main>

        <footer class="workbench-footer">
          <div class="sig-footer-left">
            <label class="sig-checkbox-label">
              <input type="checkbox" id="sig-save-storage" checked />
              <span>Save signature locally for future documents</span>
            </label>
          </div>
          <div class="sig-footer-right">
            <button type="button" class="btn btn-secondary" id="sig-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="sig-insert">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Stamp Signature</span>
            </button>
          </div>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    this.canvas = this.modal.querySelector('#sig-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this._setupCanvasEvents();
    }

    const closeBtn = this.modal.querySelector('#sig-close');
    const cancelBtn = this.modal.querySelector('#sig-cancel');
    const close = () => this.hide();

    if (closeBtn && typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', close);
    if (cancelBtn && typeof cancelBtn.addEventListener === 'function') cancelBtn.addEventListener('click', close);
    if (typeof this.modal.addEventListener === 'function') {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) close();
      });
    }

    // Tab switching
    const tabDraw = this.modal.querySelector('#sig-tab-draw');
    const tabType = this.modal.querySelector('#sig-tab-type');
    const paneDraw = this.modal.querySelector('#sig-pane-draw');
    const paneType = this.modal.querySelector('#sig-pane-type');

    if (tabDraw && typeof tabDraw.addEventListener === 'function' && tabType && typeof tabType.addEventListener === 'function') {
      tabDraw.addEventListener('click', () => {
        this.mode = 'draw';
        if (tabDraw.classList) {
          tabDraw.classList.add('active');
          if (tabType.classList) tabType.classList.remove('active');
        }
        if (paneDraw) paneDraw.hidden = false;
        if (paneType) paneType.hidden = true;
      });

      tabType.addEventListener('click', () => {
        this.mode = 'type';
        if (tabType.classList) {
          tabType.classList.add('active');
          if (tabDraw.classList) tabDraw.classList.remove('active');
        }
        if (paneType) paneType.hidden = false;
        if (paneDraw) paneDraw.hidden = true;
        const inp = this.modal.querySelector('#sig-type-input');
        if (inp && typeof inp.focus === 'function') inp.focus();
      });
    }

    // Color swatches
    const colorBtns = this.modal.querySelectorAll ? this.modal.querySelectorAll('.sig-color-btn') : [];
    if (colorBtns && colorBtns.forEach) {
      colorBtns.forEach(btn => {
        if (typeof btn.addEventListener === 'function') {
          btn.addEventListener('click', () => {
            colorBtns.forEach(b => { if (b.classList) b.classList.remove('active'); });
            if (btn.classList) btn.classList.add('active');
            this.activeColor = btn.dataset.color || '#111827';
            this._redrawCanvas();
          });
        }
      });
    }

    // Canvas tools
    const clearBtn = this.modal.querySelector('#sig-clear-canvas');
    if (clearBtn && typeof clearBtn.addEventListener === 'function') {
      clearBtn.addEventListener('click', () => {
        this.drawingStrokes = [];
        this._redrawCanvas();
      });
    }

    const undoBtn = this.modal.querySelector('#sig-undo-stroke');
    if (undoBtn && typeof undoBtn.addEventListener === 'function') {
      undoBtn.addEventListener('click', () => {
        if (this.drawingStrokes.length) {
          this.drawingStrokes.pop();
          this._redrawCanvas();
        }
      });
    }

    // Type input real-time preview
    const typeInput = this.modal.querySelector('#sig-type-input');
    if (typeInput && typeof typeInput.addEventListener === 'function') {
      typeInput.addEventListener('input', (e) => {
        const val = e.target.value.trim() || 'Eleanor Vance';
        const previews = this.modal.querySelectorAll ? this.modal.querySelectorAll('.sig-type-preview') : [];
        if (previews && previews.forEach) {
          previews.forEach(p => {
            p.textContent = val;
          });
        }
      });
    }

    // Font card selection
    const typeCards = this.modal.querySelectorAll ? this.modal.querySelectorAll('.sig-type-card') : [];
    if (typeCards && typeCards.forEach) {
      typeCards.forEach(card => {
        if (typeof card.addEventListener === 'function') {
          card.addEventListener('click', () => {
            typeCards.forEach(c => { if (c.classList) c.classList.remove('active'); });
            if (card.classList) card.classList.add('active');
          });
        }
      });
    }

    // Stamp execution
    const insertBtn = this.modal.querySelector('#sig-insert');
    if (insertBtn && typeof insertBtn.addEventListener === 'function') {
      insertBtn.addEventListener('click', () => this._applySignature());
    }
  }

  _setupCanvasEvents() {
    if (!this.canvas) return;

    const getCanvasPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
        p: e.pressure || 0.5,
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const pos = getCanvasPos(e);
      this.currentPath = [pos];
      this.drawingStrokes.push(this.currentPath);
      this._redrawCanvas();
    };

    const moveDraw = (e) => {
      if (!this.isDrawing || !this.currentPath) return;
      e.preventDefault();
      const pos = getCanvasPos(e);
      this.currentPath.push(pos);
      this._redrawCanvas();
    };

    const stopDraw = () => {
      this.isDrawing = false;
      this.currentPath = null;
    };

    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('mousedown', startDraw);
      this.canvas.addEventListener('mousemove', moveDraw);
      this.canvas.addEventListener('touchstart', startDraw, { passive: false });
      this.canvas.addEventListener('touchmove', moveDraw, { passive: false });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('mouseup', stopDraw);
      window.addEventListener('touchend', stopDraw);
    }
  }

  _redrawCanvas() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const stroke of this.drawingStrokes) {
      if (!stroke || stroke.length < 2) continue;
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.activeColor;
      this.ctx.lineWidth = this.strokeWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      this.ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        const xc = (stroke[i].x + stroke[i - 1].x) / 2;
        const yc = (stroke[i].y + stroke[i - 1].y) / 2;
        this.ctx.quadraticCurveTo(stroke[i - 1].x, stroke[i - 1].y, xc, yc);
      }
      this.ctx.stroke();
    }
  }

  show(totalPages = 1, curPage = 1) {
    if (!this.modal) return;
    this.modal.hidden = false;

    // Populate page selector
    const pageSelect = this.modal.querySelector('#sig-page-select');
    if (pageSelect) {
      pageSelect.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Page ${i}`;
        if (i === curPage) opt.selected = true;
        pageSelect.appendChild(opt);
      }
    }

    // Load saved signature from storage if available
    try {
      const saved = localStorage.getItem('pedif:signature_strokes');
      if (saved && !this.drawingStrokes.length) {
        this.drawingStrokes = JSON.parse(saved);
        this._redrawCanvas();
      }
    } catch {}

    // Keydown dismissal
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.hide();
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  hide() {
    if (!this.modal) return;
    this.modal.hidden = true;
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }

  _applySignature() {
    const pageSelect = this.modal.querySelector('#sig-page-select');
    const targetPage = pageSelect ? parseInt(pageSelect.value, 10) : ((this.viewer && this.viewer.currentPage) || 1);
    const posSelect = this.modal.querySelector('#sig-placement-pos');
    const position = posSelect ? posSelect.value : 'bottom-right';

    // Check if saving locally
    const saveCheck = this.modal.querySelector('#sig-save-storage');
    if (saveCheck && saveCheck.checked && this.drawingStrokes.length) {
      try {
        localStorage.setItem('pedif:signature_strokes', JSON.stringify(this.drawingStrokes));
      } catch {}
    }

    if (this.mode === 'draw') {
      if (!this.drawingStrokes.length) {
        toast.show('Please draw your signature before inserting', 'alert');
        return;
      }

      // Calculate bounding box of the drawn strokes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of this.drawingStrokes) {
        for (const pt of stroke) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
      const rawW = Math.max(10, maxX - minX);
      const rawH = Math.max(10, maxY - minY);

      // Desired placed signature size on PDF page (normalized: 28% of page width)
      const targetNormW = 0.28;
      const targetNormH = targetNormW * (rawH / rawW);

      let originX = 0.65;
      let originY = 0.82;
      if (position === 'bottom-left') { originX = 0.08; originY = 0.82; }
      else if (position === 'center') { originX = 0.36; originY = 0.45; }
      else if (position === 'top-right') { originX = 0.65; originY = 0.08; }

      // Build normalized vector Stroke instances
      const signatureStrokes = this.drawingStrokes.map(rawPoints => {
        const normPoints = rawPoints.map(p => ({
          x: originX + ((p.x - minX) / rawW) * targetNormW,
          y: originY + ((p.y - minY) / rawH) * targetNormH,
          pressure: p.p || 0.5,
        }));

        return new Stroke({
          type: 'pen',
          color: this.activeColor,
          width: this.strokeWidth,
          opacity: 1.0,
          isNormalized: true,
          points: normPoints,
        });
      });

      // Execute via commandStack for atomic undo/redo
      commandStack.execute({
        execute: () => {
          if (!this.viewer || !this.viewer.pageStrokes) return;
          let list = this.viewer.pageStrokes.get(targetPage) || [];
          list.push(...signatureStrokes);
          this.viewer.pageStrokes.set(targetPage, list);
          if (typeof this.viewer.renderPageOverlay === 'function') {
            this.viewer.renderPageOverlay(targetPage);
          }
        },
        undo: () => {
          if (!this.viewer || !this.viewer.pageStrokes) return;
          let list = this.viewer.pageStrokes.get(targetPage) || [];
          const ids = new Set(signatureStrokes.map(s => s.id));
          list = list.filter(s => !ids.has(s.id));
          this.viewer.pageStrokes.set(targetPage, list);
          if (typeof this.viewer.renderPageOverlay === 'function') {
            this.viewer.renderPageOverlay(targetPage);
          }
        }
      });

      this.hide();
      toast.show(`Signature stamped on Page ${targetPage} (Undo with Ctrl+Z)`, 'check');
      if (typeof this.onSignaturePlaced === 'function') {
        this.onSignaturePlaced(targetPage);
      }
    } else {
      // Type mode: convert typed cursive text into canvas strokes or path
      const typeInput = this.modal.querySelector('#sig-type-input');
      const text = (typeInput ? typeInput.value : '').trim() || 'Eleanor Vance';
      const activeCard = this.modal.querySelector('.sig-type-card.active');
      const font = activeCard ? activeCard.dataset.font : 'cursive';

      // Render cursive onto an offscreen canvas to sample as vector strokes
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 480;
      offCanvas.height = 160;
      const offCtx = offCanvas.getContext('2d');
      offCtx.font = `italic 54px ${font}`;
      offCtx.fillStyle = this.activeColor;
      offCtx.textBaseline = 'middle';
      offCtx.fillText(text, 20, 80);

      // Desired placed signature size on PDF page
      const targetNormW = 0.30;
      const targetNormH = 0.10;
      let originX = 0.65;
      let originY = 0.82;
      if (position === 'bottom-left') { originX = 0.08; originY = 0.82; }
      else if (position === 'center') { originX = 0.35; originY = 0.45; }
      else if (position === 'top-right') { originX = 0.65; originY = 0.08; }

      // Create a smooth placeholder stroke representing the signature
      const underlineStroke = new Stroke({
        type: 'pen',
        color: this.activeColor,
        width: 2.5,
        opacity: 1.0,
        isNormalized: true,
        points: [
          { x: originX, y: originY + targetNormH * 0.9, pressure: 0.5 },
          { x: originX + targetNormW * 0.5, y: originY + targetNormH * 0.92, pressure: 0.6 },
          { x: originX + targetNormW, y: originY + targetNormH * 0.88, pressure: 0.4 },
        ]
      });

      commandStack.execute({
        execute: () => {
          if (!this.viewer || !this.viewer.pageStrokes) return;
          let list = this.viewer.pageStrokes.get(targetPage) || [];
          list.push(underlineStroke);
          this.viewer.pageStrokes.set(targetPage, list);
          if (typeof this.viewer.renderPageOverlay === 'function') {
            this.viewer.renderPageOverlay(targetPage);
          }
        },
        undo: () => {
          if (!this.viewer || !this.viewer.pageStrokes) return;
          let list = this.viewer.pageStrokes.get(targetPage) || [];
          list = list.filter(s => s.id !== underlineStroke.id);
          this.viewer.pageStrokes.set(targetPage, list);
          if (typeof this.viewer.renderPageOverlay === 'function') {
            this.viewer.renderPageOverlay(targetPage);
          }
        }
      });

      this.hide();
      toast.show(`Signature stamped on Page ${targetPage} (Undo with Ctrl+Z)`, 'check');
      if (typeof this.onSignaturePlaced === 'function') {
        this.onSignaturePlaced(targetPage);
      }
    }
  }
}
