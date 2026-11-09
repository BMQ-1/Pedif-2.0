/**
 * Pedif 2.0 - Sovereign PDF Rubber Stamp Tool
 * Stamps authentic legal & business status seals (APPROVED, CONFIDENTIAL, DRAFT, RECEIVED, VOID, etc.)
 * directly into PDF pages client-side using pdf-lib.
 * Features live canvas preview, customizable tilt, double-border rubber stamp styling,
 * dynamic date attribution, and target page selection.
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { toast } from '../ui/toast.js';

export const STAMP_PRESETS = {
  approved: { text: 'APPROVED', color: '#15803d', rgb: [0.08, 0.5, 0.24] },
  confidential: { text: 'CONFIDENTIAL', color: '#dc2626', rgb: [0.86, 0.15, 0.15] },
  draft: { text: 'DRAFT', color: '#d97706', rgb: [0.85, 0.47, 0.02] },
  final: { text: 'FINAL', color: '#2563eb', rgb: [0.15, 0.39, 0.92] },
  received: { text: 'RECEIVED', color: '#0d9488', rgb: [0.05, 0.58, 0.53] },
  rejected: { text: 'REJECTED', color: '#991b1b', rgb: [0.6, 0.11, 0.11] },
  void: { text: 'VOID', color: '#4b5563', rgb: [0.29, 0.33, 0.39] },
};

export class StampDialog {
  /**
   * @param {Object} options
   * @param {Function} options.onApplied - Callback when stamped PDF is generated: (Uint8Array) => void
   */
  constructor({ onApplied } = {}) {
    this.onApplied = onApplied;
    this.modal = null;
    this.currentDocBytes = null;
    this.activePreset = 'approved';
    this.customText = '';
    this.includeDate = true;
    this.angle = -12; // Classic rubber stamp tilt
    this.position = 'top-right'; // 'top-right' | 'top-left' | 'center' | 'bottom-right' | 'bottom-left'
    this.targetPage = 'current'; // 'current' | 'all'
    this.currentPageNum = 1;
    this.totalPageCount = 1;
    this._onKeyDown = null;

    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'stamp-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', 'Rubber Stamps & Status Seals');

    const todayStr = new Date().toISOString().split('T')[0];

    this.modal.innerHTML = `
      <div class="workbench-dialog stamp-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <circle cx="12" cy="14" r="4"/>
              <path d="M12 2v6h6"/>
            </svg>
            <div>
              <h2 class="wb-title">Rubber Stamp & Status Seal</h2>
              <p class="wb-subtitle">Apply authentic status stamps with double borders and date attribution</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="stamp-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body dialog-split-body">
          <div class="stamp-form">
            <!-- Preset Selection Chips -->
            <div class="form-group">
              <label class="form-label">Stamp Preset</label>
              <div class="stamp-presets-grid" id="stamp-presets">
                ${Object.keys(STAMP_PRESETS).map(key => {
                  const p = STAMP_PRESETS[key];
                  return `
                    <button type="button" class="stamp-chip-btn ${key === 'approved' ? 'active' : ''}" data-preset="${key}">
                      <span class="stamp-chip-dot" style="background-color: ${p.color};"></span>
                      <span>${p.text}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Custom Text -->
            <div class="form-group">
              <label class="form-label" for="stamp-custom-text">Custom Text (Optional)</label>
              <input type="text" id="stamp-custom-text" class="input-text" placeholder="e.g. VERIFIED, PAID, CERTIFIED" maxlength="25" />
            </div>

            <!-- Options Row -->
            <div class="form-row">
              <div class="form-group half">
                <label class="form-label" for="stamp-position">Placement Position</label>
                <select id="stamp-position" class="input-select">
                  <option value="top-right" selected>Top Right</option>
                  <option value="top-left">Top Left</option>
                  <option value="center">Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>

              <div class="form-group half">
                <label class="form-label" for="stamp-angle">Stamp Tilt</label>
                <select id="stamp-angle" class="input-select">
                  <option value="-12" selected>-12° (Classic Tilt)</option>
                  <option value="0">0° (Horizontal)</option>
                  <option value="12">+12° (Upward Tilt)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group half">
                <label class="form-label" for="stamp-target-pages">Target Pages</label>
                <select id="stamp-target-pages" class="input-select">
                  <option value="current" selected>Current Page Only</option>
                  <option value="all">All Pages</option>
                </select>
              </div>

              <div class="form-group half">
                <label class="form-label" for="stamp-include-date">Include Date Stamp</label>
                <div class="stamp-checkbox-wrap" style="padding-top: 6px;">
                  <label class="sig-checkbox-label">
                    <input type="checkbox" id="stamp-include-date" checked />
                    <span>${todayStr}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- LIVE PREVIEW PANE -->
          <div class="stamp-preview-pane">
            <span class="preview-label">Live Stamp Preview</span>
            <div class="stamp-preview-canvas-wrap">
              <canvas id="stamp-preview-canvas" width="300" height="200"></canvas>
            </div>
          </div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary" id="stamp-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="stamp-apply">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Apply Stamp</span>
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('#stamp-close');
    const cancelBtn = this.modal.querySelector('#stamp-cancel');
    const close = () => this.hide();

    if (closeBtn && typeof closeBtn.addEventListener === 'function') closeBtn.addEventListener('click', close);
    if (cancelBtn && typeof cancelBtn.addEventListener === 'function') cancelBtn.addEventListener('click', close);
    if (typeof this.modal.addEventListener === 'function') {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) close();
      });
    }

    // Preset chips
    const chips = this.modal.querySelectorAll ? this.modal.querySelectorAll('.stamp-chip-btn') : [];
    if (chips && chips.forEach) {
      chips.forEach(chip => {
        if (typeof chip.addEventListener === 'function') {
          chip.addEventListener('click', () => {
            chips.forEach(c => { if (c.classList) c.classList.remove('active'); });
            if (chip.classList) chip.classList.add('active');
            this.activePreset = chip.dataset.preset;
            this._updatePreview();
          });
        }
      });
    }

    // Custom text input
    const customInput = this.modal.querySelector('#stamp-custom-text');
    if (customInput && typeof customInput.addEventListener === 'function') {
      customInput.addEventListener('input', (e) => {
        this.customText = e.target.value.trim().toUpperCase();
        this._updatePreview();
      });
    }

    // Angle select
    const angleSel = this.modal.querySelector('#stamp-angle');
    if (angleSel && typeof angleSel.addEventListener === 'function') {
      angleSel.addEventListener('change', (e) => {
        this.angle = parseInt(e.target.value, 10);
        this._updatePreview();
      });
    }

    // Position select
    const posSel = this.modal.querySelector('#stamp-position');
    if (posSel && typeof posSel.addEventListener === 'function') {
      posSel.addEventListener('change', (e) => {
        this.position = e.target.value;
      });
    }

    // Target pages
    const pageSel = this.modal.querySelector('#stamp-target-pages');
    if (pageSel && typeof pageSel.addEventListener === 'function') {
      pageSel.addEventListener('change', (e) => {
        this.targetPage = e.target.value;
      });
    }

    // Include date checkbox
    const dateCheck = this.modal.querySelector('#stamp-include-date');
    if (dateCheck && typeof dateCheck.addEventListener === 'function') {
      dateCheck.addEventListener('change', (e) => {
        this.includeDate = e.target.checked;
        this._updatePreview();
      });
    }

    // Apply button
    const applyBtn = this.modal.querySelector('#stamp-apply');
    if (applyBtn && typeof applyBtn.addEventListener === 'function') {
      applyBtn.addEventListener('click', () => this.applyStamp());
    }
  }

  _updatePreview() {
    const canvas = this.modal.querySelector('#stamp-preview-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const preset = STAMP_PRESETS[this.activePreset] || STAMP_PRESETS.approved;
    const text = this.customText || preset.text;
    const color = preset.color;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((this.angle * Math.PI) / 180);

    // Measure text
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = ctx.measureText(text);
    const boxW = Math.max(160, textMetrics.width + 36);
    const boxH = this.includeDate ? 62 : 46;

    // Draw authentic double rubber-stamp border
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

    ctx.lineWidth = 1;
    ctx.strokeRect(-boxW / 2 + 4, -boxH / 2 + 4, boxW - 8, boxH - 8);

    // Draw main stamp text
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(text, 0, this.includeDate ? -8 : 0);

    // Draw date attribution if enabled
    if (this.includeDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(todayStr, 0, 16);
    }

    ctx.restore();
  }

  show(pdfBytes, curPage = 1, totalPages = 1) {
    if (!pdfBytes) {
      toast.show('Please open a PDF document first', 'alert');
      return;
    }
    this.currentDocBytes = pdfBytes;
    this.currentPageNum = curPage;
    this.totalPageCount = totalPages;
    this.modal.hidden = false;
    this._updatePreview();

    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.hide();
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  hide() {
    if (!this.modal) return;
    this.modal.hidden = true;
    if (this._onKeyDown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }

  async applyStamp() {
    if (!this.currentDocBytes) return;

    const preset = STAMP_PRESETS[this.activePreset] || STAMP_PRESETS.approved;
    const text = this.customText || preset.text;
    const [r, g, b] = preset.rgb;

    const applyBtn = this.modal.querySelector('#stamp-apply');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying Stamp...';
    }

    try {
      const pdfDoc = await PDFDocument.load(this.currentDocBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      const stampAngle = degrees(this.angle);
      const rad = (this.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const targetPagesList = this.targetPage === 'all'
        ? pages
        : [pages[Math.min(pages.length - 1, Math.max(0, this.currentPageNum - 1))]];

      for (const page of targetPagesList) {
        const { width: pWidth, height: pHeight } = page.getSize();

        const fontSize = 20;
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const boxWidth = Math.max(140, textWidth + 30);
        const boxHeight = this.includeDate ? 54 : 40;

        let posX = pWidth - boxWidth - 40;
        let posY = pHeight - boxHeight - 40;

        if (this.position === 'top-left') {
          posX = 40;
          posY = pHeight - boxHeight - 40;
        } else if (this.position === 'center') {
          posX = (pWidth - boxWidth) / 2;
          posY = (pHeight - boxHeight) / 2;
        } else if (this.position === 'bottom-right') {
          posX = pWidth - boxWidth - 40;
          posY = 40;
        } else if (this.position === 'bottom-left') {
          posX = 40;
          posY = 40;
        }

        // Draw Outer Box
        page.drawRectangle({
          x: posX,
          y: posY,
          width: boxWidth,
          height: boxHeight,
          borderColor: rgb(r, g, b),
          borderWidth: 2.5,
          rotate: stampAngle,
        });

        // Draw Inner Box
        page.drawRectangle({
          x: posX + 3,
          y: posY + 3,
          width: boxWidth - 6,
          height: boxHeight - 6,
          borderColor: rgb(r, g, b),
          borderWidth: 0.8,
          rotate: stampAngle,
        });

        // Draw Center Text
        const textOffsetDx = (boxWidth - textWidth) / 2;
        const textOffsetDy = this.includeDate ? (boxHeight / 2) : ((boxHeight - fontSize) / 2 + 2);

        page.drawText(text, {
          x: posX + textOffsetDx * cos - textOffsetDy * sin,
          y: posY + textOffsetDx * sin + textOffsetDy * cos,
          size: fontSize,
          font,
          color: rgb(r, g, b),
          rotate: stampAngle,
        });

        // Draw Date Text if enabled
        if (this.includeDate) {
          const dateStr = new Date().toISOString().split('T')[0];
          const dateSize = 9.5;
          const dateWidth = font.widthOfTextAtSize(dateStr, dateSize);
          const dateOffsetDx = (boxWidth - dateWidth) / 2;
          const dateOffsetDy = 10;

          page.drawText(dateStr, {
            x: posX + dateOffsetDx * cos - dateOffsetDy * sin,
            y: posY + dateOffsetDx * sin + dateOffsetDy * cos,
            size: dateSize,
            font,
            color: rgb(r, g, b),
            rotate: stampAngle,
          });
        }
      }

      const stampedBytes = await pdfDoc.save({ useObjectStreams: true });
      this.hide();
      toast.show(`Rubber stamp applied successfully!`, 'check');

      if (typeof this.onApplied === 'function') {
        this.onApplied(stampedBytes);
      }
    } catch (err) {
      console.error('[Pedif] Stamp application failed:', err);
      toast.show('Failed to apply stamp: ' + err.message, 'alert');
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply Stamp';
      }
    }
  }
}
