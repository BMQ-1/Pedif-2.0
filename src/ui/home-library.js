/**
 * Home Library Screen
 * Renders the Apple Books style library view with saved PDF cards,
 * covers, reading progress, and dropzone.
 */

import { libraryStore, toValidArrayBuffer } from '../storage/library.js';
import { showToast } from './toast.js';

export class HomeLibrary {
  constructor(options = {}) {
    this.container = options.container || (typeof document !== 'undefined' ? document.getElementById('libwrap') : null);
    this.dropzone = options.dropzone || (typeof document !== 'undefined' ? document.getElementById('drop') : null);
    this.fileInput = options.fileInput || (typeof document !== 'undefined' ? document.getElementById('file-input') : null);
    this.onOpenFile = options.onOpenFile || null;
    this.onOpenDocument = options.onOpenDocument || null;
    this.onOpenSample = options.onOpenSample || null;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  async init() {
    this.setupDropzone();
    this.setupSampleButton();
    await this.renderLibrary();
  }

  setupSampleButton() {
    const btn = document.getElementById('btn-sample-doc');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.onOpenSample) this.onOpenSample();
      });
    }
  }

  setupDropzone() {
    if (!this.dropzone) return;

    // Only add programmatic click if dropzone is not a native <label>
    if (this.dropzone.tagName !== 'LABEL') {
      this.dropzone.addEventListener('click', () => {
        if (this.fileInput) this.fileInput.click();
      });
    }

    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('drag');
    });

    this.dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      document.body.classList.remove('drag');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          if (this.onOpenFile) this.onOpenFile(file);
        }
      }
    });

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && this.onOpenFile) {
          this.onOpenFile(file);
        }
      });
    }
  }

  async renderLibrary() {
    if (!this.container) return;

    const docs = await libraryStore.listDocuments();
    if (!docs || docs.length === 0) {
      this.container.innerHTML = `
        <div class="sect">
          <h2>Recents</h2>
        </div>
        <div class="empty">
          <p>No documents in your library yet. Tap above to open a PDF, or experience the demo right now:</p>
          <button class="btn-sample rip" id="btn-empty-sample" style="margin-top: 14px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--accent);">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Launch Interactive Showcase Document</span>
          </button>
        </div>
      `;
      const emptyBtn = this.container.querySelector('#btn-empty-sample');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', () => {
          if (this.onOpenSample) this.onOpenSample();
        });
      }
      return;
    }

    const itemsHtml = docs.map((doc) => {
      const cur = doc.currentPage || 1;
      const total = doc.pageCount || 1;
      const pct = Math.min(100, Math.max(0, Math.round((cur / total) * 100)));
      const timeStr = this.formatTimeAgo(doc.updatedAt || doc.createdAt);

      return `
        <div class="libtile rip" data-id="${doc.id}">
          <div class="cov">
            ${doc.thumbnail
              ? `<img src="${doc.thumbnail}" alt="${this.escapeHtml(doc.name)}" style="width:100%;height:100%;object-fit:cover;">`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:var(--tx3);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
            }
          </div>
          <div class="meta">
            <b title="${this.escapeHtml(doc.name)}">${this.escapeHtml(doc.name)}</b>
            <div class="sub">
              <span>Page ${cur} of ${total}</span>
              <span>·</span>
              <span>${pct}% read</span>
              <span>·</span>
              <span>${timeStr}</span>
            </div>
            <div class="pbar"><i style="width: ${pct}%;"></i></div>
          </div>
          <button class="del" data-del="${doc.id}" title="Remove from library">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="sect">
        <h2>Your Library (${docs.length})</h2>
      </div>
      <div class="lib">
        ${itemsHtml}
      </div>
    `;

    // Bind click events
    this.container.querySelectorAll('.libtile').forEach(tile => {
      tile.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('.del');
        if (delBtn) {
          e.stopPropagation();
          const docId = delBtn.dataset.del;
          await libraryStore.removeDocument(docId);
          showToast('Removed from library', 'trash');
          await this.renderLibrary();
          return;
        }

        const docId = tile.dataset.id;
        const fullDoc = await libraryStore.getDocument(docId);
        const validBuf = fullDoc ? toValidArrayBuffer(fullDoc.buffer) : null;
        if (validBuf && this.onOpenDocument) {
          this.onOpenDocument({ ...fullDoc, buffer: validBuf });
        } else {
          showToast('Please open or drop the PDF file to read', 'alert');
        }
      });
    });
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }
}
