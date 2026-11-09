/**
 * Visual Page Organizer Workbench
 * Inspired by PdfCraft's card-based page organizer:
 * - Interactive visual card grid with page thumbnails
 * - Drag-and-drop page reordering
 * - Per-page rotation (90° increments)
 * - Page deletion & duplication
 * - Insert blank pages
 * - Deep PDF reassembly via pdf-lib
 */

import { PDFDocument, degrees } from 'pdf-lib';
import { pdfEngine } from '../core/pdf-engine.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/i18n.js';

export class PageOrganizer {
  constructor(options = {}) {
    this.getPdfBuffer = options.getPdfBuffer || null;
    this.onApplyChanges = options.onApplyChanges || options.onApplied || null;
    this._buffer = null;
    this._docName = null;
    this.modalEl = null;
    this.isOpen = false;
    this.pageItems = []; // Array of { originalIndex: number, rotation: number, isBlank: boolean }
    this.thumbnails = new Map(); // originalIndex -> dataURL
  }

  async show(directBuffer = null, docName = null) {
    if (this.isOpen) return;
    if (directBuffer) {
      this._buffer = directBuffer;
      this._docName = docName;
    }

    const originalBuffer = this._buffer || (this.getPdfBuffer ? await this.getPdfBuffer() : null);
    if (!originalBuffer) {
      showToast('Document buffer unavailable', 'alert');
      return;
    }

    this.isOpen = true;
    const numPages = pdfEngine.numPages;

    // Initialize page list
    this.pageItems = [];
    for (let i = 0; i < numPages; i++) {
      this.pageItems.push({
        id: 'p_' + i + '_' + Date.now(),
        originalIndex: i,
        rotation: 0,
        isBlank: false,
      });
    }

    this.renderModal();
    this.generateThumbnails();
  }

  renderModal() {
    let modal = document.getElementById('page-organizer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'page-organizer-modal';
      modal.className = 'workbench-modal organizer-backdrop';
      document.body.appendChild(modal);
    }
    this.modalEl = modal;
    modal.classList.add('visible', 'on');
    modal.hidden = false;

    modal.innerHTML = `
      <div class="workbench-dialog organizer-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="wb-icon" width="22" height="22">
              <rect x="3" y="3" width="7" height="9" rx="1"/>
              <rect x="14" y="3" width="7" height="5" rx="1"/>
              <rect x="14" y="12" width="7" height="9" rx="1"/>
              <rect x="3" y="16" width="7" height="5" rx="1"/>
            </svg>
            <div>
              <h3 class="wb-title">${t('organizerTitle')}</h3>
              <p class="wb-subtitle">${t('organizerSubtitle')}</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="btn-org-close" aria-label="${t('close')}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="org-toolbar">
          <div class="org-toolbar-left">
            <span class="org-page-badge" id="org-count-summary">
              ${this.pageItems.length} pages
            </span>
          </div>
          <div class="org-toolbar-right">
            <button type="button" class="btn btn-secondary sm rip" id="btn-org-add-blank">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>${t('insertBlank')}</span>
            </button>
          </div>
        </div>

        <main class="workbench-body org-body">
          <div class="org-grid" id="org-grid"></div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary rip" id="btn-org-cancel">${t('cancel')}</button>
          <button type="button" class="btn btn-primary rip" id="btn-org-apply">${t('saveOrganized')}</button>
        </footer>
      </div>
    `;

    modal.querySelector('#btn-org-close').addEventListener('click', () => this.hide());
    modal.querySelector('#btn-org-cancel').addEventListener('click', () => this.hide());
    modal.querySelector('#btn-org-add-blank').addEventListener('click', () => this.insertBlankPage());
    modal.querySelector('#btn-org-apply').addEventListener('click', () => this.applyChanges());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });

    this.renderGrid();
  }

  async generateThumbnails() {
    const numPages = pdfEngine.numPages;
    for (let pNum = 1; pNum <= numPages; pNum++) {
      if (this.thumbnails.has(pNum - 1)) continue;
      try {
        const page = await pdfEngine.getPage(pNum);
        const vp = page.getViewport({ scale: 0.25 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        this.thumbnails.set(pNum - 1, dataUrl);

        // Update thumbnail on screen
        const img = this.modalEl ? this.modalEl.querySelector(`.org-thumb-img[data-orig="${pNum - 1}"]`) : null;
        if (img) img.src = dataUrl;
      } catch (e) {
        console.warn(`[PageOrganizer] thumbnail error on page ${pNum}:`, e);
      }
    }
  }

  renderGrid() {
    const grid = this.modalEl ? this.modalEl.querySelector('#org-grid') : null;
    if (!grid) return;

    grid.innerHTML = '';

    const summary = this.modalEl.querySelector('#org-count-summary');
    if (summary) {
      summary.textContent = `${this.pageItems.length} page${this.pageItems.length === 1 ? '' : 's'}`;
    }

    this.pageItems.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'org-page-card';
      card.draggable = true;
      card.dataset.index = index;

      const thumbSrc = item.isBlank ? '' : (this.thumbnails.get(item.originalIndex) || '');
      const rotationStyle = `transform: rotate(${item.rotation}deg);`;

      card.innerHTML = `
        <div class="org-thumb-container" style="${rotationStyle}">
          ${item.isBlank 
            ? `<div class="org-thumb-placeholder"><span>Blank Page</span></div>` 
            : `<img class="org-thumb-img" data-orig="${item.originalIndex}" src="${thumbSrc || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22140%22><rect fill=%22%23eee%22 width=%22100%22 height=%22140%22/></svg>'}" alt="Page ${index + 1}" />`
          }
        </div>
        <div class="org-card-footer">
          <span class="org-page-badge">${index + 1}</span>
          ${item.rotation ? `<span class="org-rot-indicator">${item.rotation}°</span>` : ''}
          <div class="org-card-actions">
            <button type="button" class="org-btn-action" title="Move Left / Earlier" data-act="move-prev" aria-label="Move Earlier" ${index === 0 ? 'disabled style="opacity:0.25;cursor:not-allowed;"' : ''}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" class="org-btn-action" title="Move Right / Later" data-act="move-next" aria-label="Move Later" ${index === this.pageItems.length - 1 ? 'disabled style="opacity:0.25;cursor:not-allowed;"' : ''}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button type="button" class="org-btn-action" title="${t('rotatePage')}" data-act="rotate" aria-label="Rotate">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
            <button type="button" class="org-btn-action" title="${t('duplicatePage')}" data-act="duplicate" aria-label="Duplicate">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button type="button" class="org-btn-action org-btn-del" title="${t('deletePage')}" data-act="delete" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;

      // Event handlers
      card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'move-prev') this.reorderPage(index, index - 1);
          else if (act === 'move-next') this.reorderPage(index, index + 1);
          else if (act === 'rotate') this.rotatePage(index);
          else if (act === 'duplicate') this.duplicatePage(index);
          else if (act === 'delete') this.deletePage(index);
        });
      });

      // Drag and Drop reordering
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(index));
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = index;
        if (!isNaN(fromIdx) && fromIdx !== toIdx) {
          this.reorderPage(fromIdx, toIdx);
        }
      });

      grid.appendChild(card);
    });
  }

  reorderPage(fromIdx, toIdx) {
    const item = this.pageItems.splice(fromIdx, 1)[0];
    this.pageItems.splice(toIdx, 0, item);
    this.renderGrid();
  }

  rotatePage(index) {
    if (!this.pageItems[index]) return;
    this.pageItems[index].rotation = (this.pageItems[index].rotation + 90) % 360;
    this.renderGrid();
  }

  duplicatePage(index) {
    const original = this.pageItems[index];
    if (!original) return;
    const copy = {
      ...original,
      id: 'p_copy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    };
    this.pageItems.splice(index + 1, 0, copy);
    this.renderGrid();
    showToast(`Page ${index + 1} duplicated`, 'check');
  }

  deletePage(index) {
    if (this.pageItems.length <= 1) {
      showToast('Cannot delete the only page in the document', 'alert');
      return;
    }
    this.pageItems.splice(index, 1);
    this.renderGrid();
    showToast(`Page ${index + 1} removed`, 'trash');
  }

  insertBlankPage() {
    this.pageItems.push({
      id: 'blank_' + Date.now(),
      originalIndex: -1,
      rotation: 0,
      isBlank: true,
    });
    this.renderGrid();
    showToast('Blank page inserted at the end', 'check');
  }

  async applyChanges() {
    if (this.pageItems.length === 0) {
      showToast('No pages left to save', 'alert');
      return;
    }

    try {
      showToast('Rebuilding PDF with new page organization…', 'info');

      const originalBytes = this._buffer || (this.getPdfBuffer ? await this.getPdfBuffer() : null);
      if (!originalBytes) throw new Error('Source PDF bytes not available');
      const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();

      for (const item of this.pageItems) {
        if (item.isBlank) {
          newDoc.addPage([595.28, 841.89]); // A4 blank page
        } else {
          const [copiedPage] = await newDoc.copyPages(srcDoc, [item.originalIndex]);
          if (item.rotation !== 0) {
            const currentRot = copiedPage.getRotation().angle;
            copiedPage.setRotation(degrees((currentRot + item.rotation) % 360));
          }
          newDoc.addPage(copiedPage);
        }
      }

      const newPdfBytes = await newDoc.save({ useObjectStreams: true });
      const isolatedBuffer = newPdfBytes.buffer.slice(newPdfBytes.byteOffset, newPdfBytes.byteOffset + newPdfBytes.byteLength);

      this.hide();

      if (typeof this.onApplyChanges === 'function') {
        await this.onApplyChanges(isolatedBuffer, this._docName || `Organized_Document.pdf`);
      }

      showToast('Document reordered and updated successfully', 'check');
    } catch (err) {
      console.error('[PageOrganizer] Apply changes error:', err);
      showToast('Failed to organize PDF: ' + err.message, 'alert');
    }
  }

  hide() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.classList.remove('on', 'visible');
      this.modalEl.hidden = true;
    }
  }
}
