/**
 * Area OCR Snippet Tool
 * Allows dragging a box over any image, diagram, or scanned text to extract text instantly.
 */

import { ocrManager } from '../ocr/ocr-manager.js';

export class SnippetTool {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.isActive = false;
    this.isDragging = false;
    this.startPoint = null;
    this.activePageEl = null;
    this.boxEl = null;

    this.init();
  }

  init() {
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'ocr-snippet-box';
    this.boxEl.style.display = 'none';
    document.body.appendChild(this.boxEl);

    window.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
  }

  setMode(mode) {
    this.isActive = mode === 'ocr';
    if (!this.isActive) {
      this.cancelSnippet();
    }
  }

  handlePointerDown(e) {
    if (!this.isActive) return;
    const pageEl = e.target.closest('.page-container');
    if (!pageEl) return;

    this.isDragging = true;
    this.activePageEl = pageEl;
    this.startPoint = { x: e.clientX, y: e.clientY };

    this.boxEl.style.left = `${e.clientX}px`;
    this.boxEl.style.top = `${e.clientY}px`;
    this.boxEl.style.width = '0px';
    this.boxEl.style.height = '0px';
    this.boxEl.style.display = 'block';
  }

  handlePointerMove(e) {
    if (!this.isDragging || !this.startPoint) return;

    const minX = Math.min(this.startPoint.x, e.clientX);
    const minY = Math.min(this.startPoint.y, e.clientY);
    const width = Math.abs(e.clientX - this.startPoint.x);
    const height = Math.abs(e.clientY - this.startPoint.y);

    this.boxEl.style.left = `${minX}px`;
    this.boxEl.style.top = `${minY}px`;
    this.boxEl.style.width = `${width}px`;
    this.boxEl.style.height = `${height}px`;
  }

  async handlePointerUp(e) {
    if (!this.isDragging || !this.startPoint || !this.activePageEl) {
      this.cancelSnippet();
      return;
    }

    const minX = Math.min(this.startPoint.x, e.clientX);
    const minY = Math.min(this.startPoint.y, e.clientY);
    const width = Math.abs(e.clientX - this.startPoint.x);
    const height = Math.abs(e.clientY - this.startPoint.y);

    this.cancelSnippet();

    if (width > 15 && height > 15) {
      const pageNum = parseInt(this.activePageEl.dataset.page, 10);
      const record = this.viewer.renderedPages.get(pageNum);
      if (record && record.layer0) {
        const pageRect = this.activePageEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scaleX = record.layer0.width / pageRect.width;
        const scaleY = record.layer0.height / pageRect.height;

        const cropRect = {
          x: (minX - pageRect.left) * scaleX,
          y: (minY - pageRect.top) * scaleY,
          width: width * scaleX,
          height: height * scaleY,
        };

        const recognizedText = await ocrManager.processAreaCrop(record.layer0, cropRect);
        this.showResultDialog(recognizedText || 'No text detected in selected area.');
      }
    }
  }

  cancelSnippet() {
    this.isDragging = false;
    this.startPoint = null;
    this.activePageEl = null;
    if (this.boxEl) this.boxEl.style.display = 'none';
  }

  showResultDialog(text) {
    const dialog = document.createElement('div');
    dialog.className = 'ocr-result-modal';
    dialog.innerHTML = `
      <div class="ocr-modal-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 600;">Area OCR Result</h3>
          <button class="b sm" id="modal-close-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <textarea readonly style="width: 100%; height: 120px; border: 1px solid var(--ln); border-radius: var(--r-s); padding: 8px; background: var(--bg); color: var(--tx); resize: none; font-size: 14px;">${text}</textarea>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
          <button class="btn-primary" id="modal-copy-btn">Copy Text</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.querySelector('#modal-close-btn').addEventListener('click', () => dialog.remove());
    dialog.querySelector('#modal-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        dialog.querySelector('#modal-copy-btn').textContent = 'Copied!';
        setTimeout(() => dialog.remove(), 700);
      });
    });
  }
}
