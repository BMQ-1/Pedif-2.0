/**
 * Extract Pages Dialog — Studio Tool
 * Extracts specified page ranges into a brand-new standalone PDF using pdf-lib.
 * Sovereign and 100% offline — zero server uploads.
 */

import { PDFDocument } from 'pdf-lib';
import { showToast } from './toast.js';

export class ExtractDialog {
  constructor(options = {}) {
    this.getPdfBuffer = options.getPdfBuffer || null;
    this.getCurrentPage = options.getCurrentPage || (() => 1);
    this.getTotalPages = options.getTotalPages || (() => 1);
    this.getDocName = options.getDocName || (() => 'Document.pdf');

    this.modalEl = null;
    this.isOpen = false;
  }

  /**
   * Parse range strings like "1-3, 5, 8-10" into 0-based page indices
   */
  static parsePageRanges(rangeStr, totalPages) {
    if (!rangeStr || !rangeStr.trim()) return [];
    const parts = rangeStr.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
    const pageSet = new Set();

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(totalPages, Math.max(start, end));
          for (let p = min; p <= max; p++) {
            pageSet.add(p - 1);
          }
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          pageSet.add(p - 1);
        }
      }
    }

    return Array.from(pageSet).sort((a, b) => a - b);
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;

    const totalPages = this.getTotalPages();
    const curPage = this.getCurrentPage();
    const docName = this.getDocName();

    let modal = document.getElementById('extract-pages-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'extract-pages-modal';
      modal.className = 'extract-modal-backdrop';
      document.body.appendChild(modal);
    }
    this.modalEl = modal;

    modal.innerHTML = `
      <div class="extract-modal-card glass stagger">
        <div class="extract-modal-header">
          <div class="extract-header-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="extract-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <div>
              <h3>Extract Pages</h3>
              <p>Save selected pages into a new standalone PDF</p>
            </div>
          </div>
          <button class="b sm rip" id="btn-extract-close" title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="extract-modal-body">
          <div class="extract-presets">
            <button class="extract-preset-chip active" data-range="${curPage}">Current Page (${curPage})</button>
            <button class="extract-preset-chip" data-range="1-${totalPages}">All Pages (1-${totalPages})</button>
            ${totalPages > 2 ? `<button class="extract-preset-chip" data-range="1-${Math.ceil(totalPages / 2)}">First Half (1-${Math.ceil(totalPages / 2)})</button>` : ''}
          </div>

          <label class="extract-label">Page range or comma-separated numbers</label>
          <div class="extract-input-wrap">
            <input type="text" id="extract-range-input" class="extract-input" value="${curPage}" placeholder="e.g. 1-3, 5, 8">
          </div>
          <div class="extract-preview-bar">
            <span id="extract-preview-count" class="extract-count-badge">1 page selected</span>
            <small class="extract-range-hint">Total: ${totalPages} pages in document</small>
          </div>
        </div>

        <div class="extract-modal-footer">
          <button class="btn-secondary rip" id="btn-extract-cancel">Cancel</button>
          <button class="btn-primary rip" id="btn-extract-submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;display:inline-block;vertical-align:-2px;margin-right:6px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Extract &amp; Download PDF
          </button>
        </div>
      </div>
    `;

    modal.classList.add('on');

    const input = modal.querySelector('#extract-range-input');
    const previewCount = modal.querySelector('#extract-preview-count');
    const submitBtn = modal.querySelector('#btn-extract-submit');
    const closeBtn = modal.querySelector('#btn-extract-close');
    const cancelBtn = modal.querySelector('#btn-extract-cancel');

    const updatePreview = () => {
      const indices = ExtractDialog.parsePageRanges(input.value, totalPages);
      const count = indices.length;
      if (count === 0) {
        previewCount.textContent = 'No pages selected';
        previewCount.classList.add('error');
        submitBtn.disabled = true;
      } else {
        previewCount.textContent = `${count} page${count === 1 ? '' : 's'} selected (${indices.map(i => i + 1).slice(0, 8).join(', ')}${count > 8 ? '…' : ''})`;
        previewCount.classList.remove('error');
        submitBtn.disabled = false;
      }
    };

    input.addEventListener('input', () => {
      modal.querySelectorAll('.extract-preset-chip').forEach(c => c.classList.remove('active'));
      updatePreview();
    });

    modal.querySelectorAll('.extract-preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.extract-preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        input.value = chip.dataset.range;
        updatePreview();
      });
    });

    closeBtn.addEventListener('click', () => this.hide());
    cancelBtn.addEventListener('click', () => this.hide());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.hide();
        window.removeEventListener('keydown', onKeyDown);
      } else if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        submitBtn.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    submitBtn.addEventListener('click', async () => {
      const indices = ExtractDialog.parsePageRanges(input.value, totalPages);
      if (indices.length === 0) {
        showToast('Please select at least 1 valid page', 'alert');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Extracting ${indices.length} pages…</span>`;

      try {
        const originalBytes = this.getPdfBuffer ? await this.getPdfBuffer() : null;
        if (!originalBytes) throw new Error('No PDF bytes available');

        const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(srcDoc, indices);
        copiedPages.forEach(p => newDoc.addPage(p));

        const extractedBytes = await newDoc.save();
        const blob = new Blob([extractedBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const baseName = docName.replace(/\.pdf$/i, '');
        const rangeSummary = input.value.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${baseName}_extracted_${rangeSummary}.pdf`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Extracted ${indices.length} pages successfully`, 'check');
        this.hide();
      } catch (err) {
        console.error('[ExtractDialog] Extraction error:', err);
        showToast('Extraction failed: ' + err.message, 'alert');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Extract & Download PDF';
      }
    });

    input.focus();
    input.select();
  }

  hide() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.classList.remove('on');
    }
  }
}
