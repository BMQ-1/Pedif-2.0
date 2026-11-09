/**
 * Pedif 2.0 - Sovereign PDF Watermark Applier
 * Applies customizable diagonal or horizontal text watermarks to all or specific pages
 * entirely client-side using pdf-lib.
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { i18n } from '../i18n/i18n.js';
import { toast } from '../ui/toast.js';

export class WatermarkDialog {
  /**
   * @param {Object} options
   * @param {Function} options.onApplied - Callback when watermarked PDF is generated: (Uint8Array) => void
   */
  constructor({ onApplied } = {}) {
    this.onApplied = onApplied;
    this.modal = null;
    this.currentDocBytes = null;
    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'watermark-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', i18n.t('watermarkTitle'));

    this.modal.innerHTML = `
      <div class="workbench-dialog watermark-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
            <div>
              <h2 class="wb-title" data-i18n="watermarkTitle">${i18n.t('watermarkTitle')}</h2>
              <p class="wb-subtitle">Stamp sovereign diagonal security watermarks across document pages</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="wm-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body dialog-split-body">
          <div class="wm-form">
            <div class="form-group">
              <label class="form-label" for="wm-text" data-i18n="wmText">${i18n.t('wmText')}</label>
              <input type="text" id="wm-text" class="input-text" value="CONFIDENTIAL" placeholder="e.g. DRAFT, CONFIDENTIAL, INTERNAL ONLY" />
              <div class="wm-presets">
                <button type="button" class="chip-preset" data-val="CONFIDENTIAL">CONFIDENTIAL</button>
                <button type="button" class="chip-preset" data-val="DRAFT">DRAFT</button>
                <button type="button" class="chip-preset" data-val="DO NOT COPY">DO NOT COPY</button>
                <button type="button" class="chip-preset" data-val="SOVEREIGN">SOVEREIGN</button>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label class="form-label" for="wm-opacity" data-i18n="wmOpacity">${i18n.t('wmOpacity')}: <span id="wm-opacity-val">18%</span></label>
                <input type="range" id="wm-opacity" min="5" max="60" value="18" class="range-slider" />
              </div>
              <div class="form-group col">
                <label class="form-label" for="wm-size" data-i18n="wmSize">${i18n.t('wmSize')}: <span id="wm-size-val">52 pt</span></label>
                <input type="range" id="wm-size" min="20" max="90" value="52" class="range-slider" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label class="form-label" for="wm-angle">Angle</label>
                <select id="wm-angle" class="input-select">
                  <option value="45" selected>45° Diagonal</option>
                  <option value="0">0° Horizontal</option>
                  <option value="-45">-45° Reverse Diagonal</option>
                  <option value="90">90° Vertical</option>
                </select>
              </div>
              <div class="form-group col">
                <label class="form-label" for="wm-color">Color Tint</label>
                <select id="wm-color" class="input-select">
                  <option value="red" selected>Security Red</option>
                  <option value="gray">Neutral Slate</option>
                  <option value="blue">Corporate Blue</option>
                  <option value="amber">Caution Amber</option>
                </select>
              </div>
            </div>
          </div>

          <div class="dialog-preview-col">
            <span class="dialog-preview-title">Real-Time Preview</span>
            <canvas id="wm-preview-canvas" class="dialog-preview-paper" width="180" height="240"></canvas>
          </div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary" id="wm-btn-cancel" data-i18n="cancel">${i18n.t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="wm-btn-apply" data-i18n="wmApply">${i18n.t('wmApply')}</button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('#wm-close');
    const cancelBtn = this.modal.querySelector('#wm-btn-cancel');
    const opacitySlider = this.modal.querySelector('#wm-opacity');
    const opacityVal = this.modal.querySelector('#wm-opacity-val');
    const sizeSlider = this.modal.querySelector('#wm-size');
    const sizeVal = this.modal.querySelector('#wm-size-val');
    const applyBtn = this.modal.querySelector('#wm-btn-apply');
    const textInput = this.modal.querySelector('#wm-text');

    const closeHandler = () => this.hide();
    closeBtn.addEventListener('click', closeHandler);
    cancelBtn.addEventListener('click', closeHandler);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    const angleSelect = this.modal.querySelector('#wm-angle');
    const colorSelect = this.modal.querySelector('#wm-color');

    const updatePreviewHandler = () => this._updatePreview();

    opacitySlider.addEventListener('input', (e) => {
      opacityVal.textContent = `${e.target.value}%`;
      updatePreviewHandler();
    });

    sizeSlider.addEventListener('input', (e) => {
      sizeVal.textContent = `${e.target.value} pt`;
      updatePreviewHandler();
    });

    textInput.addEventListener('input', updatePreviewHandler);
    if (angleSelect) angleSelect.addEventListener('change', updatePreviewHandler);
    if (colorSelect) colorSelect.addEventListener('change', updatePreviewHandler);

    this.modal.querySelectorAll('.chip-preset').forEach(chip => {
      chip.addEventListener('click', () => {
        textInput.value = chip.dataset.val;
        updatePreviewHandler();
      });
    });

    applyBtn.addEventListener('click', () => this.applyWatermark());
    this._updatePreview();
  }

  _updatePreview() {
    if (!this.modal) return;
    const canvas = this.modal.querySelector('#wm-preview-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Draw paper background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw subtle simulated document text skeleton lines
    ctx.fillStyle = '#e5e5ea';
    const lines = [
      [20, 24, 70, 7],
      [20, 36, 140, 5],
      [20, 46, 130, 5],
      [20, 56, 135, 5],
      [20, 70, 60, 6],
      [20, 82, 140, 5],
      [20, 92, 125, 5],
      [20, 102, 138, 5],
      [20, 112, 110, 5],
      [20, 130, 140, 5],
      [20, 140, 130, 5],
      [20, 150, 120, 5],
      [20, 165, 140, 5],
      [20, 175, 135, 5],
      [20, 190, 80, 5],
      [20, 200, 135, 5],
      [20, 210, 120, 5],
    ];
    lines.forEach(([lx, ly, lw, lh]) => {
      ctx.fillRect(lx, ly, lw, lh);
    });

    // 3. Draw Watermark Text
    const text = (this.modal.querySelector('#wm-text')?.value || 'CONFIDENTIAL').trim();
    if (!text) return;

    const opacity = (parseInt(this.modal.querySelector('#wm-opacity')?.value || '18', 10)) / 100;
    const ptSize = parseInt(this.modal.querySelector('#wm-size')?.value || '52', 10);
    const angle = parseInt(this.modal.querySelector('#wm-angle')?.value || '45', 10);
    const colorKey = this.modal.querySelector('#wm-color')?.value || 'red';

    let colorRgb = '255, 59, 48'; // red
    if (colorKey === 'gray') colorRgb = '100, 100, 105';
    if (colorKey === 'blue') colorRgb = '10, 132, 255';
    if (colorKey === 'amber') colorRgb = '255, 159, 10';

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-angle * Math.PI) / 180);

    const scaledSize = Math.max(10, Math.min(32, ptSize * 0.32));
    ctx.font = `bold ${scaledSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${colorRgb}, ${opacity * 1.5})`;
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  show(pdfBytes) {
    if (!pdfBytes) {
      toast.show('No PDF document loaded', 'warn');
      return;
    }
    this.currentDocBytes = pdfBytes;
    this.modal.hidden = false;
    this.modal.classList.add('visible');
    this._updatePreview();
  }

  hide() {
    this.modal.classList.remove('visible');
    this.modal.hidden = true;
  }

  async applyWatermark() {
    if (!this.currentDocBytes) return;

    const text = this.modal.querySelector('#wm-text').value.trim();
    if (!text) {
      toast.show('Please enter watermark text', 'warn');
      return;
    }

    const opacity = parseInt(this.modal.querySelector('#wm-opacity').value, 10) / 100;
    const size = parseInt(this.modal.querySelector('#wm-size').value, 10);
    const angle = parseInt(this.modal.querySelector('#wm-angle').value, 10);
    const colorChoice = this.modal.querySelector('#wm-color').value;

    let colorRgb;
    switch (colorChoice) {
      case 'red': colorRgb = rgb(0.85, 0.15, 0.15); break;
      case 'blue': colorRgb = rgb(0.12, 0.45, 0.95); break;
      case 'amber': colorRgb = rgb(0.9, 0.55, 0.05); break;
      case 'gray':
      default: colorRgb = rgb(0.4, 0.43, 0.48); break;
    }

    const applyBtn = this.modal.querySelector('#wm-btn-apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';

    try {
      const pdfDoc = await PDFDocument.load(this.currentDocBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);
        const textHeight = font.heightAtSize(size);

        // Center calculation with true 2D affine pivot compensation
        const centerX = width / 2;
        const centerY = height / 2;
        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Offset from rotation pivot (x, y) to text bounding center (textWidth/2, textHeight/2)
        const dx = (textWidth / 2) * cos - (textHeight / 2) * sin;
        const dy = (textWidth / 2) * sin + (textHeight / 2) * cos;

        page.drawText(text, {
          x: centerX - dx,
          y: centerY - dy,
          size,
          font,
          color: colorRgb,
          opacity,
          rotate: degrees(angle),
        });
      }

      const modifiedBytes = await pdfDoc.save();
      toast.show(`Applied watermark to ${pages.length} page(s)!`, 'success');
      this.hide();

      if (this.onApplied) {
        this.onApplied(modifiedBytes);
      }
    } catch (err) {
      console.error('Watermark application error:', err);
      toast.show('Failed to apply watermark: ' + err.message, 'error');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = i18n.t('wmApply');
    }
  }
}
