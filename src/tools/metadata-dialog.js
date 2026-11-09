/**
 * Pedif 2.0 - Sovereign PDF Metadata Editor
 * Inspects and modifies PDF title, author, subject, keywords, and producer dictionary
 * entirely client-side using pdf-lib without sending bytes over the wire.
 */

import { PDFDocument } from 'pdf-lib';
import { i18n } from '../i18n/i18n.js';
import { toast } from '../ui/toast.js';

export class MetadataDialog {
  /**
   * @param {Object} options
   * @param {Function} options.onApplied - Callback when updated PDF is generated: (Uint8Array) => void
   */
  constructor({ onApplied } = {}) {
    this.onApplied = onApplied;
    this.modal = null;
    this.currentDocBytes = null;
    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'metadata-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', i18n.t('metaTitle'));

    this.modal.innerHTML = `
      <div class="workbench-dialog metadata-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div>
              <h2 class="wb-title" data-i18n="metaTitle">${i18n.t('metaTitle')}</h2>
              <p class="wb-subtitle">View and edit document metadata catalog without re-encoding</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="meta-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body">
          <div class="meta-tech-strip">
            <div class="meta-tech-item">
              <span class="meta-tech-lbl">Pages</span>
              <strong class="meta-tech-val" id="meta-stat-pages">—</strong>
            </div>
            <div class="meta-tech-item">
              <span class="meta-tech-lbl">File Size</span>
              <strong class="meta-tech-val" id="meta-stat-size">—</strong>
            </div>
            <div class="meta-tech-item">
              <span class="meta-tech-lbl">Dimensions</span>
              <strong class="meta-tech-val" id="meta-stat-dims">—</strong>
            </div>
            <div class="meta-tech-item">
              <span class="meta-tech-lbl">Compliance</span>
              <strong class="meta-tech-val">ISO 32000-1</strong>
            </div>
          </div>

          <div class="wm-form">
            <div class="form-group">
              <label class="form-label" for="meta-field-title" data-i18n="metaDocTitle">${i18n.t('metaDocTitle')}</label>
              <input type="text" id="meta-field-title" class="input-text" placeholder="Document title" />
            </div>

            <div class="form-row">
              <div class="form-group col">
                <label class="form-label" for="meta-field-author" data-i18n="metaAuthor">${i18n.t('metaAuthor')}</label>
                <input type="text" id="meta-field-author" class="input-text" placeholder="Author name" />
              </div>
              <div class="form-group col">
                <label class="form-label" for="meta-field-subject" data-i18n="metaSubject">${i18n.t('metaSubject')}</label>
                <input type="text" id="meta-field-subject" class="input-text" placeholder="Subject or theme" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="meta-field-keywords" data-i18n="metaKeywords">${i18n.t('metaKeywords')}</label>
              <input type="text" id="meta-field-keywords" class="input-text" placeholder="Comma-separated keywords (e.g. legal, contract, 2026)" />
            </div>

            <div class="form-group">
              <label class="form-label" for="meta-field-producer">PDF Producer / Application</label>
              <input type="text" id="meta-field-producer" class="input-text" placeholder="Producer software" />
            </div>
          </div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary" id="meta-btn-cancel" data-i18n="cancel">${i18n.t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="meta-btn-save" data-i18n="metaSave">${i18n.t('metaSave')}</button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('#meta-close');
    const cancelBtn = this.modal.querySelector('#meta-btn-cancel');
    const saveBtn = this.modal.querySelector('#meta-btn-save');

    const closeHandler = () => this.hide();
    closeBtn.addEventListener('click', closeHandler);
    cancelBtn.addEventListener('click', closeHandler);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    saveBtn.addEventListener('click', () => this.saveMetadata());
  }

  async show(pdfBytes) {
    if (!pdfBytes) {
      toast.show('No PDF document loaded', 'warn');
      return;
    }
    this.currentDocBytes = pdfBytes;

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      this.modal.querySelector('#meta-field-title').value = pdfDoc.getTitle() || '';
      this.modal.querySelector('#meta-field-author').value = pdfDoc.getAuthor() || '';
      this.modal.querySelector('#meta-field-subject').value = pdfDoc.getSubject() || '';
      this.modal.querySelector('#meta-field-keywords').value = (pdfDoc.getKeywords() || []).join(', ');
      this.modal.querySelector('#meta-field-producer').value = pdfDoc.getProducer() || 'Pedif Sovereign PDF Studio';

      const pageCount = pdfDoc.getPageCount();
      const pagesEl = this.modal.querySelector('#meta-stat-pages');
      if (pagesEl) pagesEl.textContent = `${pageCount}`;

      const bytes = pdfBytes.byteLength || 0;
      const sizeStr = bytes > 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
      const sizeEl = this.modal.querySelector('#meta-stat-size');
      if (sizeEl) sizeEl.textContent = sizeStr;

      const firstPage = pageCount > 0 ? pdfDoc.getPage(0) : null;
      const dimsEl = this.modal.querySelector('#meta-stat-dims');
      if (dimsEl && firstPage) {
        dimsEl.textContent = `${Math.round(firstPage.getWidth())} × ${Math.round(firstPage.getHeight())} pt`;
      }
    } catch (err) {
      console.warn('Error reading metadata:', err);
    }

    this.modal.hidden = false;
    this.modal.classList.add('visible');

    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.hide();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  hide() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.modal.classList.remove('visible');
    this.modal.hidden = true;
  }

  async saveMetadata() {
    if (!this.currentDocBytes) return;

    const saveBtn = this.modal.querySelector('#meta-btn-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const pdfDoc = await PDFDocument.load(this.currentDocBytes, { ignoreEncryption: true });

      const title = this.modal.querySelector('#meta-field-title').value.trim();
      const author = this.modal.querySelector('#meta-field-author').value.trim();
      const subject = this.modal.querySelector('#meta-field-subject').value.trim();
      const keywordsRaw = this.modal.querySelector('#meta-field-keywords').value.trim();
      const producer = this.modal.querySelector('#meta-field-producer').value.trim();

      const keywords = keywordsRaw ? keywordsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

      if (title) pdfDoc.setTitle(title);
      if (author) pdfDoc.setAuthor(author);
      if (subject) pdfDoc.setSubject(subject);
      if (keywords.length) pdfDoc.setKeywords(keywords);
      if (producer) pdfDoc.setProducer(producer);
      pdfDoc.setModificationDate(new Date());

      const updatedBytes = await pdfDoc.save({ useObjectStreams: true });
      toast.show('Document metadata saved successfully!', 'success');
      this.hide();

      if (this.onApplied) {
        this.onApplied(updatedBytes);
      }
    } catch (err) {
      console.error('Save metadata error:', err);
      toast.show('Failed to save metadata: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = i18n.t('metaSave');
    }
  }
}
