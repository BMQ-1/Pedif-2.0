/**
 * Pedif 2.0 - Sovereign Multi-PDF Merger Tool
 * Combines 2 or more PDF documents entirely client-side using pdf-lib.
 * Features drag-and-drop file queue, page count auto-detection, order rearrangement,
 * and seamless loading directly into Pedif or instant download.
 */

import { PDFDocument } from 'pdf-lib';
import { i18n } from '../i18n/i18n.js';
import { toast } from '../ui/toast.js';

export class MergeTool {
  /**
   * @param {Object} options
   * @param {Function} options.onMerged - Callback when merged PDF is generated: (Uint8Array, filename) => void
   */
  constructor({ onMerged } = {}) {
    this.onMerged = onMerged;
    this.files = []; // { id, name, size, pageCount, bytes }
    this.modal = null;
    this._draggedIndex = null;
    this._initModal();
  }

  _initModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'merge-modal';
    this.modal.className = 'modal-backdrop workbench-modal';
    this.modal.hidden = true;
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', i18n.t('mergeTitle'));

    this.modal.innerHTML = `
      <div class="workbench-dialog merge-dialog">
        <header class="workbench-header">
          <div class="wb-header-left">
            <svg class="wb-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <div>
              <h2 class="wb-title" data-i18n="mergeTitle">${i18n.t('mergeTitle')}</h2>
              <p class="wb-subtitle" data-i18n="mergeDesc">${i18n.t('mergeDesc')}</p>
            </div>
          </div>
          <button type="button" class="wb-btn-close" id="merge-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <main class="workbench-body">
          <div class="merge-dropzone" id="merge-dropzone">
            <input type="file" id="merge-file-input" accept=".pdf,application/pdf" multiple hidden />
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" class="merge-upload-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="merge-drop-text" data-i18n="mergeDrop">${i18n.t('mergeDrop')}</p>
            <button type="button" class="btn btn-secondary" id="btn-merge-browse" data-i18n="mergeSelect">${i18n.t('mergeSelect')}</button>
          </div>

          <div class="merge-queue-container">
            <div class="merge-queue-header">
              <span class="merge-queue-count" id="merge-queue-count">0 files (0 pages total)</span>
              <button type="button" class="btn-text-danger" id="btn-merge-clear-all" data-i18n="clearAll" hidden>${i18n.t('clearAll') || 'Clear All'}</button>
            </div>
            <ul class="merge-file-list" id="merge-file-list" role="list">
              <li class="merge-empty-hint">No PDF documents queued yet. Add 2 or more files above.</li>
            </ul>
          </div>
        </main>

        <footer class="workbench-footer">
          <button type="button" class="btn btn-secondary" id="btn-merge-cancel" data-i18n="cancel">${i18n.t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="btn-merge-exec" disabled>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span data-i18n="mergeAction">${i18n.t('mergeAction')}</span>
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modal);
    this._bindEvents();
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('#merge-close');
    const cancelBtn = this.modal.querySelector('#btn-merge-cancel');
    const browseBtn = this.modal.querySelector('#btn-merge-browse');
    const fileInput = this.modal.querySelector('#merge-file-input');
    const dropzone = this.modal.querySelector('#merge-dropzone');
    const clearBtn = this.modal.querySelector('#btn-merge-clear-all');
    const execBtn = this.modal.querySelector('#btn-merge-exec');

    const closeHandler = () => this.hide();
    closeBtn.addEventListener('click', closeHandler);
    cancelBtn.addEventListener('click', closeHandler);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.addFiles(Array.from(e.target.files));
        fileInput.value = '';
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length) {
        this.addFiles(files);
      } else {
        toast.show('Please drop PDF files only', 'warn');
      }
    });

    clearBtn.addEventListener('click', () => {
      this.files = [];
      this.renderQueue();
    });

    execBtn.addEventListener('click', () => this.executeMerge());
  }

  show() {
    this.modal.hidden = false;
    this.modal.classList.add('visible');
    this.renderQueue();
  }

  hide() {
    this.modal.classList.remove('visible');
    this.modal.hidden = true;
  }

  /**
   * Add PDF files to queue and inspect page count
   * @param {File[]} filesList 
   */
  async downloadFile(file) {
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();
      return {
        id: 'file-' + Math.random().toString(36).slice(2, 9),
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        pageCount,
        bytes
      };
    } catch (err) {
      toast.show(`Could not read ${file.name}: ${err.message}`, 'error');
      return null;
    }
  }

  async addFiles(filesList) {
    toast.show(`Inspecting ${filesList.length} document(s)...`, 'info');
    for (const f of filesList) {
      const item = await this.downloadFile(f);
      if (item) {
        this.files.push(item);
      }
    }
    this.renderQueue();
  }

  renderQueue() {
    const list = this.modal.querySelector('#merge-file-list');
    const countLabel = this.modal.querySelector('#merge-queue-count');
    const clearBtn = this.modal.querySelector('#btn-merge-clear-all');
    const execBtn = this.modal.querySelector('#btn-merge-exec');

    const totalPages = this.files.reduce((sum, f) => sum + f.pageCount, 0);
    countLabel.textContent = `${this.files.length} document(s) · ${totalPages} page(s) total`;

    clearBtn.hidden = this.files.length === 0;
    execBtn.disabled = this.files.length < 2;

    if (this.files.length === 0) {
      list.innerHTML = `<li class="merge-empty-hint">No PDF documents queued yet. Add 2 or more files above.</li>`;
      return;
    }

    list.innerHTML = '';
    this.files.forEach((file, idx) => {
      const li = document.createElement('li');
      li.className = 'merge-item';
      li.draggable = true;
      li.dataset.index = idx;

      li.innerHTML = `
        <div class="merge-item-drag-handle" title="Drag to reorder">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
            <line x1="8" y1="6" x2="16" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="18" x2="16" y2="18"/>
          </svg>
        </div>
        <div class="merge-item-index">${idx + 1}</div>
        <div class="merge-item-details">
          <span class="merge-item-name" title="${file.name}">${file.name}</span>
          <span class="merge-item-meta">${file.pageCount} ${file.pageCount === 1 ? 'page' : 'pages'} · ${file.size}</span>
        </div>
        <div class="merge-item-actions">
          <button type="button" class="btn-icon merge-btn-up" title="Move Up" ${idx === 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" class="btn-icon merge-btn-down" title="Move Down" ${idx === this.files.length - 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button type="button" class="btn-icon merge-btn-del" title="Remove">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      // Up/Down button events
      li.querySelector('.merge-btn-up').addEventListener('click', () => {
        if (idx > 0) {
          const temp = this.files[idx];
          this.files[idx] = this.files[idx - 1];
          this.files[idx - 1] = temp;
          this.renderQueue();
        }
      });

      li.querySelector('.merge-btn-down').addEventListener('click', () => {
        if (idx < this.files.length - 1) {
          const temp = this.files[idx];
          this.files[idx] = this.files[idx + 1];
          this.files[idx + 1] = temp;
          this.renderQueue();
        }
      });

      li.querySelector('.merge-btn-del').addEventListener('click', () => {
        this.files.splice(idx, 1);
        this.renderQueue();
      });

      // Drag and drop reordering
      li.addEventListener('dragstart', (e) => {
        this._draggedIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      });

      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        this._draggedIndex = null;
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-target');
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-target');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-target');
        if (this._draggedIndex !== null && this._draggedIndex !== idx) {
          const item = this.files.splice(this._draggedIndex, 1)[0];
          this.files.splice(idx, 0, item);
          this.renderQueue();
        }
      });

      list.appendChild(li);
    });
  }

  async executeMerge() {
    if (this.files.length < 2) return;

    const execBtn = this.modal.querySelector('#btn-merge-exec');
    execBtn.disabled = true;
    execBtn.textContent = 'Merging documents...';

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i];
        const srcDoc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);
        for (const page of copiedPages) {
          mergedPdf.addPage(page);
        }
      }

      const mergedBytes = await mergedPdf.save();
      const outputFilename = `merged-${Date.now()}.pdf`;

      toast.show(`Successfully merged ${this.files.length} documents (${mergedPdf.getPageCount()} pages)!`, 'success');
      this.hide();

      if (this.onMerged) {
        this.onMerged(mergedBytes, outputFilename);
      }
    } catch (err) {
      console.error('Merge error:', err);
      toast.show('Merge failed: ' + err.message, 'error');
    } finally {
      execBtn.disabled = false;
      execBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>${i18n.t('mergeAction')}</span>
      `;
    }
  }
}
