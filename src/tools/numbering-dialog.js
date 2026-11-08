/**
 * Pedif 2.0 - Sovereign Page Numbering & Bates Stamping
 * Stamps configurable page numbers or Bates indices ("DOC-00001", "Page X of Y")
 * across document pages entirely client-side using pdf-lib.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { i18n } from '../i18n/i18n.js';
import { toast } from '../ui/toast.js';

export class NumberingDialog {
  /**
   * @param {Object} options
   * @param {Function} options.onApplied - Callback when numbered PDF is generated: (Uint8Array) => void
   */
  constructor({ onApplied } = {}) {
    this.onApplied = onApplied;
    this.modal = null;
    this.currentDocBytes = null;
    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'numbering-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', i18n.t('batesTitle'));

    this.modal.innerHTML = `
      <div class="workbench-dialog numbering-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              <line x1="9" y1="7" x2="15" y2="7"/>
              <line x1="9" y1="11" x2="13" y2="11"/>
            </svg>
            <div>
              <h2 class="wb-title" data-i18n="batesTitle">${i18n.t('batesTitle')}</h2>
              <p class="wb-subtitle">Add standard page numbers or legal Bates stamps with custom prefixes</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="num-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body">
          <div class="wm-form">
            <div class="form-row">
              <div class="form-group col">
                <label class="form-label" for="num-format">Numbering Style</label>
                <select id="num-format" class="input-select">
                  <option value="page_x_of_y" selected>Page X of Y</option>
                  <option value="x_of_y">X / Y</option>
                  <option value="page_x">Page X</option>
                  <option value="just_x">X (Number only)</option>
                  <option value="bates">Bates Stamping (PREFIX-0001)</option>
                </select>
              </div>

              <div class="form-group col">
                <label class="form-label" for="num-position">Position</label>
                <select id="num-position" class="input-select">
                  <option value="bottom-center" selected>Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-center">Top Center</option>
                  <option value="top-left">Top Left</option>
                </select>
              </div>
            </div>

            <div class="form-row" id="bates-row" hidden>
              <div class="form-group col">
                <label class="form-label" for="num-bates-prefix">Bates Prefix</label>
                <input type="text" id="num-bates-prefix" class="input-text" value="DOC-" placeholder="e.g. CASE-, EXHIBIT-" />
              </div>
              <div class="form-group col">
                <label class="form-label" for="num-bates-digits">Zero Padding Digits</label>
                <input type="number" id="num-bates-digits" class="input-text" value="5" min="2" max="10" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label class="form-label" for="num-start">Start At Number</label>
                <input type="number" id="num-start" class="input-text" value="1" min="1" />
              </div>
              <div class="form-group col">
                <label class="form-label" for="num-size">Font Size</label>
                <select id="num-size" class="input-select">
                  <option value="9">9 pt (Small / Subtle)</option>
                  <option value="10" selected>10 pt (Standard)</option>
                  <option value="12">12 pt (Prominent)</option>
                </select>
              </div>
            </div>

            <div class="form-preview-box">
              <span class="preview-label">Sample Preview:</span>
              <strong id="num-preview-text" class="preview-text">Page 1 of 12</strong>
            </div>
          </div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary" id="num-btn-cancel" data-i18n="cancel">${i18n.t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="num-btn-apply">Apply Numbering</button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('#num-close');
    const cancelBtn = this.modal.querySelector('#num-btn-cancel');
    const formatSelect = this.modal.querySelector('#num-format');
    const batesRow = this.modal.querySelector('#bates-row');
    const applyBtn = this.modal.querySelector('#num-btn-apply');
    const previewText = this.modal.querySelector('#num-preview-text');
    const batesPrefix = this.modal.querySelector('#num-bates-prefix');
    const batesDigits = this.modal.querySelector('#num-bates-digits');
    const startInput = this.modal.querySelector('#num-start');

    const closeHandler = () => this.hide();
    closeBtn.addEventListener('click', closeHandler);
    cancelBtn.addEventListener('click', closeHandler);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    const updatePreview = () => {
      const fmt = formatSelect.value;
      const start = parseInt(startInput.value, 10) || 1;
      batesRow.hidden = fmt !== 'bates';

      if (fmt === 'bates') {
        const prefix = batesPrefix.value || '';
        const digits = parseInt(batesDigits.value, 10) || 5;
        previewText.textContent = `${prefix}${String(start).padStart(digits, '0')}`;
      } else if (fmt === 'page_x_of_y') {
        previewText.textContent = `Page ${start} of 12`;
      } else if (fmt === 'x_of_y') {
        previewText.textContent = `${start} / 12`;
      } else if (fmt === 'page_x') {
        previewText.textContent = `Page ${start}`;
      } else {
        previewText.textContent = `${start}`;
      }
    };

    formatSelect.addEventListener('change', updatePreview);
    batesPrefix.addEventListener('input', updatePreview);
    batesDigits.addEventListener('input', updatePreview);
    startInput.addEventListener('input', updatePreview);

    applyBtn.addEventListener('click', () => this.applyNumbering());
  }

  show(pdfBytes) {
    if (!pdfBytes) {
      toast.show('No PDF document loaded', 'warn');
      return;
    }
    this.currentDocBytes = pdfBytes;
    this.modal.hidden = false;
    this.modal.classList.add('visible');
  }

  hide() {
    this.modal.classList.remove('visible');
    this.modal.hidden = true;
  }

  async applyNumbering() {
    if (!this.currentDocBytes) return;

    const fmt = this.modal.querySelector('#num-format').value;
    const pos = this.modal.querySelector('#num-position').value;
    const size = parseInt(this.modal.querySelector('#num-size').value, 10) || 10;
    const startNum = parseInt(this.modal.querySelector('#num-start').value, 10) || 1;
    const prefix = this.modal.querySelector('#num-bates-prefix').value || '';
    const digits = parseInt(this.modal.querySelector('#num-bates-digits').value, 10) || 5;

    const applyBtn = this.modal.querySelector('#num-btn-apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';

    try {
      const pdfDoc = await PDFDocument.load(this.currentDocBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      const margin = 28; // Margin from page edge in points

      for (let i = 0; i < totalPages; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const currentNum = startNum + i;

        let label = '';
        if (fmt === 'bates') {
          label = `${prefix}${String(currentNum).padStart(digits, '0')}`;
        } else if (fmt === 'page_x_of_y') {
          label = `Page ${currentNum} of ${totalPages + startNum - 1}`;
        } else if (fmt === 'x_of_y') {
          label = `${currentNum} / ${totalPages + startNum - 1}`;
        } else if (fmt === 'page_x') {
          label = `Page ${currentNum}`;
        } else {
          label = `${currentNum}`;
        }

        const textWidth = font.widthOfTextAtSize(label, size);
        let x = 0;
        let y = 0;

        // Calculate X coordinate
        if (pos.endsWith('center')) {
          x = (width - textWidth) / 2;
        } else if (pos.endsWith('right')) {
          x = width - margin - textWidth;
        } else {
          x = margin;
        }

        // Calculate Y coordinate
        if (pos.startsWith('top')) {
          y = height - margin - size;
        } else {
          y = margin;
        }

        page.drawText(label, {
          x,
          y,
          size,
          font,
          color: rgb(0.2, 0.23, 0.27),
        });
      }

      const modifiedBytes = await pdfDoc.save();
      toast.show(`Added numbering to ${totalPages} page(s)!`, 'success');
      this.hide();

      if (this.onApplied) {
        this.onApplied(modifiedBytes);
      }
    } catch (err) {
      console.error('Numbering error:', err);
      toast.show('Failed to apply numbering: ' + err.message, 'error');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Numbering';
    }
  }
}
