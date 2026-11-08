/**
 * Desktop & Mobile Sidebar
 * Collapsible panel containing:
 * 1. Outline (Table of Contents) with tap-to-jump
 * 2. Thumbnails Grid for fast page jumps
 * 3. Bookmarks List
 * 4. Annotations Drawer with color filter and search
 */

import { pdfEngine } from '../core/pdf-engine.js';
import { highlightManager, PALETTE } from '../annotations/highlight-manager.js';

export class Sidebar {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.container = null;
    this.isOpen = false;
    this.activeTab = 'outline'; // 'outline' | 'thumbnails' | 'bookmarks' | 'annotations'
    this.bookmarks = new Set();
    this.onJumpToPage = options.onJumpToPage || null;

    this.render();
  }

  render() {
    this.container = document.createElement('aside');
    this.container.className = 'app-sidebar';
    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-tabs">
          <button class="tab-btn active" data-tab="outline" title="Table of Contents">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
          <button class="tab-btn" data-tab="thumbnails" title="Page Thumbnails">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </button>
          <button class="tab-btn" data-tab="bookmarks" title="Bookmarks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <button class="tab-btn" data-tab="annotations" title="Highlights & Notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <button class="tab-btn" data-tab="view" title="Display & Margins">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>
        <button class="b sm" id="sidebar-close-btn" title="Close Sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="sidebar-body">
        <div id="tab-content-outline" class="tab-pane active"></div>
        <div id="tab-content-thumbnails" class="tab-pane"></div>
        <div id="tab-content-bookmarks" class="tab-pane"></div>
        <div id="tab-content-annotations" class="tab-pane"></div>
        <div id="tab-content-view" class="tab-pane"></div>
      </div>
    `;

    document.getElementById('app').appendChild(this.container);

    // Event listeners
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    this.container.querySelector('#sidebar-close-btn').addEventListener('click', () => {
      this.close();
    });

    // Listen to highlight updates to refresh Annotations tab
    highlightManager.onChange(() => {
      if (this.isOpen && this.activeTab === 'annotations') {
        this.renderAnnotations();
      }
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.container.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-content-${tab}`);
    });

    if (tab === 'outline') this.renderOutline();
    if (tab === 'thumbnails') this.renderThumbnails();
    if (tab === 'bookmarks') this.renderBookmarks();
    if (tab === 'annotations') this.renderAnnotations();
    if (tab === 'view') this.renderViewSettings();
  }

  async renderOutline() {
    const pane = this.container.querySelector('#tab-content-outline');
    pane.innerHTML = '<div class="sidebar-loader">Loading outline...</div>';

    const outline = await pdfEngine.getOutline();
    if (!outline || !outline.length) {
      pane.innerHTML = '<div class="sidebar-empty">No table of contents in this document.</div>';
      return;
    }

    const buildTree = (items) => {
      const ul = document.createElement('ul');
      ul.className = 'outline-list';
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'outline-item';
        li.innerHTML = `<span>${item.title}</span>`;
        li.addEventListener('click', () => {
          if (typeof item.dest === 'string') {
            // Named destination
          } else if (Array.isArray(item.dest)) {
            // Page index ref
            const pageRef = item.dest[0];
            pdfEngine.pdfDoc.getPageIndex(pageRef).then(pIdx => {
              this.jumpTo(pIdx + 1);
            });
          }
        });
        if (item.items && item.items.length) {
          li.appendChild(buildTree(item.items));
        }
        ul.appendChild(li);
      });
      return ul;
    };

    pane.innerHTML = '';
    pane.appendChild(buildTree(outline));
  }

  async renderThumbnails() {
    const pane = this.container.querySelector('#tab-content-thumbnails');
    pane.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'thumbnails-grid';

    const numPages = pdfEngine.numPages;
    if (!numPages) {
      pane.innerHTML = '<div class="sidebar-empty">No document loaded.</div>';
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const targetBox = entry.target;
          obs.unobserve(targetBox);
          const pageNum = parseInt(targetBox.dataset.page, 10);
          await this.renderThumbnailCanvas(targetBox, pageNum);
        }
      });
    }, { root: pane, rootMargin: '120px' });

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      item.innerHTML = `
        <div class="thumb-canvas-box" id="thumb-box-${pageNum}" data-page="${pageNum}">
          <span class="thumb-page-num">${pageNum}</span>
          <span class="thumb-page-badge">${pageNum}</span>
        </div>
      `;
      const box = item.querySelector('.thumb-canvas-box');
      if (box) observer.observe(box);

      item.addEventListener('click', () => this.jumpTo(pageNum));
      grid.appendChild(item);
    }

    pane.appendChild(grid);
  }

  async renderThumbnailCanvas(box, pageNum) {
    try {
      const page = await pdfEngine.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.22 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const numSpan = box.querySelector('.thumb-page-num');
      if (numSpan) numSpan.style.display = 'none';
      box.insertBefore(canvas, box.firstChild);
    } catch (err) {
      console.warn(`[Sidebar] Error rendering thumbnail ${pageNum}:`, err);
    }
  }

  renderViewSettings() {
    const pane = this.container.querySelector('#tab-content-view');
    if (!pane) return;

    const isSpread = this.viewer && this.viewer.mode === 'spread';
    const margins = this.viewer && this.viewer.margins;
    const hasCrop = margins && (margins.left > 0 || margins.top > 0 || margins.right > 0 || margins.bottom > 0);

    pane.innerHTML = `
      <div class="view-settings-panel" style="padding: 12px 8px;">
        <h3 class="panel-section-title" style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Reading Layout</h3>
        <div class="view-btn-group" style="display: flex; gap: 8px; margin-bottom: 20px;">
          <button class="b sm ${!isSpread ? 'active' : ''}" id="btn-mode-continuous" style="flex: 1;">
            Continuous
          </button>
          <button class="b sm ${isSpread ? 'active' : ''}" id="btn-mode-spread" style="flex: 1;">
            Two-Page Spread
          </button>
        </div>

        <h3 class="panel-section-title" style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Margins &amp; Auto-Trim</h3>
        <p class="panel-desc" style="font-size: 12px; color: var(--tx2); margin-bottom: 12px; line-height: 1.4;">
          Automatically scan and crop white borders on scanned books so pages fill the viewport cleanly.
        </p>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="b sm" id="btn-auto-crop" style="width: 100%; justify-content: center; font-weight: 600;">
            Auto-Trim White Margins
          </button>
          <button class="b sm" id="btn-reset-crop" style="width: 100%; justify-content: center;">
            Reset Margins
          </button>
        </div>

        <div id="crop-status-box" style="margin-top: 14px; font-size: 11px; color: var(--tx3); text-align: center;">
          ${hasCrop 
            ? `Active margins: L ${(margins.left * 100).toFixed(0)}%, R ${(margins.right * 100).toFixed(0)}%, T ${(margins.top * 100).toFixed(0)}%, B ${(margins.bottom * 100).toFixed(0)}%`
            : 'No margin crop active'}
        </div>
      </div>
    `;

    pane.querySelector('#btn-mode-continuous')?.addEventListener('click', () => {
      this.viewer.setMode('continuous');
      this.renderViewSettings();
    });

    pane.querySelector('#btn-mode-spread')?.addEventListener('click', () => {
      this.viewer.setMode('spread');
      this.renderViewSettings();
    });

    pane.querySelector('#btn-auto-crop')?.addEventListener('click', async () => {
      const btn = pane.querySelector('#btn-auto-crop');
      if (btn) btn.textContent = 'Scanning margins...';
      await this.viewer.autoCropMargins();
      this.renderViewSettings();
    });

    pane.querySelector('#btn-reset-crop')?.addEventListener('click', () => {
      this.viewer.resetCropMargins();
      this.renderViewSettings();
    });
  }

  renderBookmarks() {
    const pane = this.container.querySelector('#tab-content-bookmarks');
    pane.innerHTML = '';

    if (!this.bookmarks.size) {
      pane.innerHTML = `
        <div class="sidebar-empty">
          <p>No bookmarked pages.</p>
          <button class="btn-secondary" id="btn-add-bookmark" style="margin-top: 8px;">Bookmark Current Page</button>
        </div>
      `;
      pane.querySelector('#btn-add-bookmark')?.addEventListener('click', () => {
        this.toggleBookmark(this.viewer.currentPage);
        this.renderBookmarks();
      });
      return;
    }

    const list = document.createElement('div');
    list.className = 'bookmarks-list';

    Array.from(this.bookmarks).sort((a, b) => a - b).forEach(pageNum => {
      const item = document.createElement('div');
      item.className = 'bookmark-row';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg viewBox="0 0 24 24" fill="#ffcc00" stroke="#ffcc00" stroke-width="1" style="width: 16px; height: 16px;">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>Page ${pageNum}</span>
        </div>
        <button class="b sm remove-bm-btn" data-page="${pageNum}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (!e.target.closest('.remove-bm-btn')) {
          this.jumpTo(pageNum);
        }
      });

      item.querySelector('.remove-bm-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.bookmarks.delete(pageNum);
        this.renderBookmarks();
      });

      list.appendChild(item);
    });

    pane.appendChild(list);
  }

  renderAnnotations() {
    const pane = this.container.querySelector('#tab-content-annotations');
    pane.innerHTML = '';

    const annotations = highlightManager.getAllAnnotations();
    if (!annotations.length) {
      pane.innerHTML = '<div class="sidebar-empty">No highlights or notes in this document.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'annotations-list';

    annotations.forEach(ann => {
      const card = document.createElement('div');
      card.className = 'annotation-card';
      card.innerHTML = `
        <div class="ann-header">
          <span class="ann-badge" style="background-color: ${ann.color};"></span>
          <span class="ann-page-num">Page ${ann.page}</span>
        </div>
        <div class="ann-text">"${ann.text.slice(0, 80)}${ann.text.length > 80 ? '...' : ''}"</div>
        ${ann.note ? `<div class="ann-note">💬 ${ann.note}</div>` : ''}
      `;

      card.addEventListener('click', () => {
        this.jumpTo(ann.page);
      });

      list.appendChild(card);
    });

    pane.appendChild(list);
  }

  toggleBookmark(pageNum) {
    if (this.bookmarks.has(pageNum)) {
      this.bookmarks.delete(pageNum);
    } else {
      this.bookmarks.add(pageNum);
    }
  }

  jumpTo(pageNum) {
    if (typeof this.onJumpToPage === 'function') {
      this.onJumpToPage(pageNum);
    }
    // Close sidebar on mobile screens automatically
    if (window.innerWidth < 640) {
      this.close();
    }
  }

  open() {
    this.container.classList.add('open');
    this.isOpen = true;
    this.switchTab(this.activeTab);
  }

  close() {
    this.container.classList.remove('open');
    this.isOpen = false;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}
