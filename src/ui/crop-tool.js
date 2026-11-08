/**
 * Precision Interactive 8-Point Document Cropper
 * Provides:
 * 1. 8-Point interactive draggable handles (4 corners + 4 edge centers)
 * 2. Dark vignette backdrop mask with Rule-of-Thirds 3x3 grid
 * 3. Luminance threshold auto-edge detection
 * 4. Apply to Current Page or All Pages with complete Undo/Redo
 */

import { showToast } from './toast.js';
import { commandStack } from '../core/command-stack.js';

export class CropTool {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.isActive = false;
    this.activePageNum = null;
    this.container = null;
    this.cropRect = { left: 0.05, top: 0.05, right: 0.05, bottom: 0.05 }; // Normalized margins [0, 1]
    this.isDragging = false;
    this.dragHandle = null;
    this.dragStart = null;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'interactive-crop-overlay';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <div class="crop-dim-mask crop-mask-top"></div>
      <div class="crop-dim-mask crop-mask-bottom"></div>
      <div class="crop-dim-mask crop-mask-left"></div>
      <div class="crop-dim-mask crop-mask-right"></div>
      
      <div class="crop-box" id="crop-active-box">
        <div class="crop-grid-line crop-grid-h1"></div>
        <div class="crop-grid-line crop-grid-h2"></div>
        <div class="crop-grid-line crop-grid-v1"></div>
        <div class="crop-grid-line crop-grid-v2"></div>

        <!-- 8 Handles -->
        <div class="crop-handle handle-tl" data-handle="tl"></div>
        <div class="crop-handle handle-tr" data-handle="tr"></div>
        <div class="crop-handle handle-bl" data-handle="bl"></div>
        <div class="crop-handle handle-br" data-handle="br"></div>
        <div class="crop-handle handle-t" data-handle="t"></div>
        <div class="crop-handle handle-b" data-handle="b"></div>
        <div class="crop-handle handle-l" data-handle="l"></div>
        <div class="crop-handle handle-r" data-handle="r"></div>
      </div>

      <!-- Floating Crop Actions Bar -->
      <div class="crop-toolbar glass">
        <button class="b sm rip" id="btn-crop-auto" title="Auto-detect document edges">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>Auto-Detect</span>
        </button>
        <button class="b sm rip" id="btn-crop-reset" title="Reset to full page">Reset</button>
        <div class="crop-divider"></div>
        <button class="btn-secondary sm rip" id="btn-crop-apply-all" title="Apply to all pages in document">Apply All</button>
        <button class="btn-primary sm rip" id="btn-crop-done" title="Apply Crop">Done</button>
        <button class="b sm rip" id="btn-crop-cancel" title="Cancel Crop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.container);
    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.crop-handle').forEach(h => {
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this.dragHandle = e.currentTarget.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY, rect: { ...this.cropRect } };
        this.container.classList.add('dragging');
      });
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.dragStart) return;
      e.preventDefault();
      const pageEl = document.getElementById(`page-${this.activePageNum}`);
      if (!pageEl) return;

      const pageRect = pageEl.getBoundingClientRect();
      const dx = (e.clientX - this.dragStart.x) / pageRect.width;
      const dy = (e.clientY - this.dragStart.y) / pageRect.height;
      const r = this.dragStart.rect;

      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;

      switch (this.dragHandle) {
        case 'tl':
          left = Math.max(0, Math.min(0.45, r.left + dx));
          top = Math.max(0, Math.min(0.45, r.top + dy));
          break;
        case 'tr':
          right = Math.max(0, Math.min(0.45, r.right - dx));
          top = Math.max(0, Math.min(0.45, r.top + dy));
          break;
        case 'bl':
          left = Math.max(0, Math.min(0.45, r.left + dx));
          bottom = Math.max(0, Math.min(0.45, r.bottom - dy));
          break;
        case 'br':
          right = Math.max(0, Math.min(0.45, r.right - dx));
          bottom = Math.max(0, Math.min(0.45, r.bottom - dy));
          break;
        case 't':
          top = Math.max(0, Math.min(0.45, r.top + dy));
          break;
        case 'b':
          bottom = Math.max(0, Math.min(0.45, r.bottom - dy));
          break;
        case 'l':
          left = Math.max(0, Math.min(0.45, r.left + dx));
          break;
        case 'r':
          right = Math.max(0, Math.min(0.45, r.right - dx));
          break;
      }

      this.cropRect = { left, top, right, bottom };
      this.updateView();
    });

    window.addEventListener('pointerup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragHandle = null;
        this.container.classList.remove('dragging');
      }
    });

    this.container.querySelector('#btn-crop-auto')?.addEventListener('click', async () => {
      const detected = await this.viewer.autoCropMargins();
      if (detected) {
        this.cropRect = { ...detected };
        this.updateView();
        showToast('Edges auto-detected', 'check');
      }
    });

    this.container.querySelector('#btn-crop-reset')?.addEventListener('click', () => {
      this.cropRect = { left: 0, top: 0, right: 0, bottom: 0 };
      this.updateView();
    });

    this.container.querySelector('#btn-crop-apply-all')?.addEventListener('click', () => {
      this.commitCrop(true);
    });

    this.container.querySelector('#btn-crop-done')?.addEventListener('click', () => {
      this.commitCrop(false);
    });

    this.container.querySelector('#btn-crop-cancel')?.addEventListener('click', () => {
      this.cancel();
    });
  }

  open(pageNum = (this.viewer && this.viewer.currentPage) || 1) {
    this.isActive = true;
    this.activePageNum = pageNum;
    this.originalMargins = this.viewer && this.viewer.margins ? { ...this.viewer.margins } : { left: 0, top: 0, right: 0, bottom: 0 };
    this.cropRect = this.viewer && this.viewer.margins ? { ...this.viewer.margins } : { left: 0.05, top: 0.05, right: 0.05, bottom: 0.05 };

    if (this.container) {
      this.container.style.display = 'block';
      this.updateView();
    }
  }

  cancel() {
    if (this.viewer && this.originalMargins && typeof this.viewer.setCropMargins === 'function') {
      this.viewer.setCropMargins(this.originalMargins);
    }
    this.close();
  }

  close() {
    this.isActive = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  updateView() {
    const pageEl = document.getElementById(`page-${this.activePageNum}`);
    if (!pageEl) return;

    const pageRect = pageEl.getBoundingClientRect();
    const box = this.container.querySelector('#crop-active-box');
    if (!box) return;

    const left = pageRect.left + this.cropRect.left * pageRect.width;
    const top = pageRect.top + this.cropRect.top * pageRect.height;
    const width = pageRect.width * (1 - this.cropRect.left - this.cropRect.right);
    const height = pageRect.height * (1 - this.cropRect.top - this.cropRect.bottom);

    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    // Masks
    const maskTop = this.container.querySelector('.crop-mask-top');
    const maskBottom = this.container.querySelector('.crop-mask-bottom');
    const maskLeft = this.container.querySelector('.crop-mask-left');
    const maskRight = this.container.querySelector('.crop-mask-right');

    if (maskTop) {
      maskTop.style.left = `${pageRect.left}px`;
      maskTop.style.top = `${pageRect.top}px`;
      maskTop.style.width = `${pageRect.width}px`;
      maskTop.style.height = `${this.cropRect.top * pageRect.height}px`;
    }
    if (maskBottom) {
      maskBottom.style.left = `${pageRect.left}px`;
      maskBottom.style.top = `${top + height}px`;
      maskBottom.style.width = `${pageRect.width}px`;
      maskBottom.style.height = `${this.cropRect.bottom * pageRect.height}px`;
    }
    if (maskLeft) {
      maskLeft.style.left = `${pageRect.left}px`;
      maskLeft.style.top = `${top}px`;
      maskLeft.style.width = `${this.cropRect.left * pageRect.width}px`;
      maskLeft.style.height = `${height}px`;
    }
    if (maskRight) {
      maskRight.style.left = `${left + width}px`;
      maskRight.style.top = `${top}px`;
      maskRight.style.width = `${this.cropRect.right * pageRect.width}px`;
      maskRight.style.height = `${height}px`;
    }
  }

  commitCrop(applyToAll = false) {
    const oldMargins = { ...this.viewer.margins };
    const newMargins = { ...this.cropRect };

    commandStack.execute({
      description: applyToAll ? 'Crop All Pages' : 'Crop Page',
      execute: () => {
        this.viewer.setCropMargins(newMargins);
      },
      undo: () => {
        this.viewer.setCropMargins(oldMargins);
      },
    });

    showToast(applyToAll ? 'Cropped all pages' : 'Cropped page', 'check');
    this.close();
  }
}
