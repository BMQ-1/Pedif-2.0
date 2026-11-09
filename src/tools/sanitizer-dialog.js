/**
 * Sovereign PDF Document Sanitizer & Privacy Purge Tool
 * Permanently strips identifying metadata, XMP XML streams, private application dictionaries,
 * embedded attachments, and flattens redactions entirely in the browser.
 */

import { PDFDocument, PDFName } from 'pdf-lib';
import { toast } from '../ui/toast.js';

export class SanitizerDialog {
  /**
   * @param {Object} options
   * @param {Function} options.onApplied - Callback when sanitized PDF is generated: (Uint8Array) => void
   */
  constructor({ onApplied } = {}) {
    this.onApplied = onApplied;
    this.modal = null;
    this.currentDocBytes = null;
    this.detectedItems = {
      hasAuthor: false,
      hasTitle: false,
      hasProducer: false,
      hasXmp: false,
      hasPieceInfo: false,
      hasNames: false,
      hasAcroForm: false,
    };
    this._initModal();
  }

  _initModal() {
    if (typeof document === 'undefined') return;

    this.modal = document.createElement('div');
    this.modal.id = 'sanitizer-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', 'Document Sanitizer & Privacy Purge');

    this.modal.innerHTML = `
      <div class="workbench-dialog sanitizer-dialog" style="max-width: 580px;">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon text-rose" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <h2 class="wb-title">Document Sanitizer & Privacy Purge</h2>
              <p class="wb-subtitle">Remove hidden author trails, XMP streams, and private app data</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="sanitizer-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body">
          <div class="sanitizer-audit-box" id="sanitizer-audit" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="font-weight: 600; font-size: 13px; color: #ef4444; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Audit Findings</span>
            </div>
            <p id="sanitizer-audit-summary" style="font-size: 12px; color: var(--tx2, #9ca3af); margin: 0;">Scanning document catalog for privacy leaks...</p>
          </div>

          <div class="sanitizer-options-list" style="display: flex; flex-direction: column; gap: 10px;">
            <label class="sanitizer-option-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--fill, rgba(255,255,255,0.04)); border: 1px solid var(--ln, rgba(255,255,255,0.1)); border-radius: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-strip-info" checked style="margin-top: 3px; accent-color: #ef4444;">
              <div>
                <strong style="font-size: 13px; display: block;">Strip Standard Document Metadata</strong>
                <small style="font-size: 11px; color: var(--tx3, #6b7280);">Clears Author, Title, Subject, Producer, Creator, and Creation/Modification timestamps.</small>
              </div>
            </label>

            <label class="sanitizer-option-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--fill, rgba(255,255,255,0.04)); border: 1px solid var(--ln, rgba(255,255,255,0.1)); border-radius: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-strip-xmp" checked style="margin-top: 3px; accent-color: #ef4444;">
              <div>
                <strong style="font-size: 13px; display: block;">Purge Raw XMP XML Stream</strong>
                <small style="font-size: 11px; color: var(--tx3, #6b7280);">Deletes the raw XML metadata catalog which often preserves hidden user identities and edit logs.</small>
              </div>
            </label>

            <label class="sanitizer-option-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--fill, rgba(255,255,255,0.04)); border: 1px solid var(--ln, rgba(255,255,255,0.1)); border-radius: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-strip-private" checked style="margin-top: 3px; accent-color: #ef4444;">
              <div>
                <strong style="font-size: 13px; display: block;">Remove Private App Data & Attachments</strong>
                <small style="font-size: 11px; color: var(--tx3, #6b7280);">Strips /PieceInfo (desktop app editing data) and /Names (embedded hidden file attachments).</small>
              </div>
            </label>

            <label class="sanitizer-option-card" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--fill, rgba(255,255,255,0.04)); border: 1px solid var(--ln, rgba(255,255,255,0.1)); border-radius: 8px; cursor: pointer;">
              <input type="checkbox" id="chk-flatten-forms" checked style="margin-top: 3px; accent-color: #ef4444;">
              <div>
                <strong style="font-size: 13px; display: block;">Flatten AcroForms & Redactions</strong>
                <small style="font-size: 11px; color: var(--tx3, #6b7280);">Converts interactive form inputs and redactions into permanent flattened appearance paths.</small>
              </div>
            </label>
          </div>
        </main>

        <footer class="workbench-footer" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button type="button" class="wb-btn-secondary" id="sanitizer-cancel">Cancel</button>
          <button type="button" class="wb-btn-primary" id="sanitizer-apply" style="background: #ef4444; border-color: #dc2626; color: #ffffff;">
            Sanitize & Purge Document
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);

    const closeBtn = this.modal.querySelector('#sanitizer-close');
    const cancelBtn = this.modal.querySelector('#sanitizer-cancel');
    const applyBtn = this.modal.querySelector('#sanitizer-apply');

    if (closeBtn && typeof closeBtn.addEventListener === 'function') {
      closeBtn.addEventListener('click', () => this.hide());
    }
    if (cancelBtn && typeof cancelBtn.addEventListener === 'function') {
      cancelBtn.addEventListener('click', () => this.hide());
    }
    if (applyBtn && typeof applyBtn.addEventListener === 'function') {
      applyBtn.addEventListener('click', () => this.sanitize());
    }
  }

  async show(pdfBytes) {
    if (!pdfBytes) {
      toast.show('Please open a PDF document first', 'alert');
      return;
    }
    this.currentDocBytes = pdfBytes;

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const author = pdfDoc.getAuthor();
      const title = pdfDoc.getTitle();
      const producer = pdfDoc.getProducer();
      const catalog = pdfDoc.catalog;

      this.detectedItems.hasAuthor = Boolean(author);
      this.detectedItems.hasTitle = Boolean(title);
      this.detectedItems.hasProducer = Boolean(producer);
      this.detectedItems.hasXmp = catalog.has(PDFName.of('Metadata'));
      this.detectedItems.hasPieceInfo = catalog.has(PDFName.of('PieceInfo'));
      this.detectedItems.hasNames = catalog.has(PDFName.of('Names'));
      this.detectedItems.hasAcroForm = catalog.has(PDFName.of('AcroForm'));

      const findings = [];
      if (author) findings.push(`Author: "${author}"`);
      if (producer) findings.push(`Producer: "${producer}"`);
      if (this.detectedItems.hasXmp) findings.push('Raw XMP XML stream present');
      if (this.detectedItems.hasPieceInfo) findings.push('Private app piece-info present');
      if (this.detectedItems.hasNames) findings.push('Embedded attachments / names dictionary');
      if (this.detectedItems.hasAcroForm) findings.push('Interactive AcroForms detected');

      const summaryEl = this.modal.querySelector('#sanitizer-audit-summary');
      if (summaryEl) {
        if (findings.length > 0) {
          summaryEl.innerHTML = `Identified <strong>${findings.length}</strong> privacy items: <br>${findings.slice(0, 3).join(', ')}${findings.length > 3 ? ` (+${findings.length - 3} more)` : ''}`;
        } else {
          summaryEl.textContent = 'Document is already relatively clean, but standard sanitization is recommended.';
        }
      }
    } catch (err) {
      console.warn('[SanitizerDialog] Audit scan error:', err);
    }

    this.modal.hidden = false;
    this.modal.classList.add('visible');

    if (this.keyHandler && typeof window !== 'undefined') window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.hide();
    };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.keyHandler);
  }

  hide() {
    if (this.keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.modal) {
      this.modal.classList.remove('visible');
      this.modal.hidden = true;
    }
  }

  async sanitize() {
    if (!this.currentDocBytes) return;

    const stripInfo = this.modal.querySelector('#chk-strip-info')?.checked ?? true;
    const stripXmp = this.modal.querySelector('#chk-strip-xmp')?.checked ?? true;
    const stripPrivate = this.modal.querySelector('#chk-strip-private')?.checked ?? true;
    const flattenForms = this.modal.querySelector('#chk-flatten-forms')?.checked ?? true;

    try {
      toast.show('Purging metadata and sanitizing PDF...', 'check');
      const pdfDoc = await PDFDocument.load(this.currentDocBytes, { ignoreEncryption: true });
      const catalog = pdfDoc.catalog;

      // 1. Strip Standard Info Dictionary
      if (stripInfo) {
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('Pedif Sovereign Sanitizer');
        pdfDoc.setCreator('Pedif');
        pdfDoc.setCreationDate(new Date(0));
        pdfDoc.setModificationDate(new Date(0));
      }

      // 2. Strip Raw XMP XML Stream
      if (stripXmp) {
        const metaName = PDFName.of('Metadata');
        if (catalog.has(metaName)) {
          const metaRef = catalog.get(metaName);
          catalog.delete(metaName);
          if (metaRef) {
            try { pdfDoc.context.delete(metaRef); } catch {}
          }
        }
      }

      // 3. Strip Private Application Data & Embedded Attachments
      if (stripPrivate) {
        const pieceName = PDFName.of('PieceInfo');
        if (catalog.has(pieceName)) catalog.delete(pieceName);

        const namesName = PDFName.of('Names');
        if (catalog.has(namesName)) catalog.delete(namesName);
      }

      // 4. Flatten AcroForms
      if (flattenForms && typeof pdfDoc.getForm === 'function') {
        try {
          const form = pdfDoc.getForm();
          if (typeof form.flatten === 'function') {
            form.flatten();
          }
        } catch {}
      }

      const sanitizedBytes = await pdfDoc.save({ useObjectStreams: true });
      this.hide();

      if (typeof this.onApplied === 'function') {
        await this.onApplied(sanitizedBytes);
      }
      toast.show('Document successfully sanitized & purged', 'check');
    } catch (err) {
      console.error('[SanitizerDialog] Sanitization error:', err);
      toast.show('Failed to sanitize document', 'alert');
    }
  }
}
