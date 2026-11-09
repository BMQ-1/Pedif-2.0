/**
 * Desktop & Mobile Sidebar — Apple Studio Edition
 * Collapsible high-craft panel containing:
 * 1. Outline (Table of Contents) with hierarchical tree & active chapter tracking
 * 2. Thumbnails Grid with physical paper shadows, active page ring & smooth auto-scroll
 * 3. Bookmarks List with quick-bookmark current page banner & jump navigation
 * 4. Annotations Drawer with color category filters, quotes & note badges
 * 5. Display & Margins Inspector (Continuous, Two-Page Spread, Auto-Trim & PP-OCRv4)
 */

import { pdfEngine } from '../core/pdf-engine.js';
import { highlightManager, PALETTE } from '../annotations/highlight-manager.js';
import { showToast } from './toast.js';

export class Sidebar {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.container = null;
    this.backdrop = null;
    this.isOpen = false;
    this.activeTab = 'outline'; // 'outline' | 'thumbnails' | 'bookmarks' | 'annotations' | 'view'
    this.bookmarks = new Set();
    this.onJumpToPage = options.onJumpToPage || null;
    this.currentPage = (this.viewer && this.viewer.currentPage) || 1;
    this.annotationFilterColor = 'all';

    this.render();
  }

  render() {
    this.container = document.createElement('aside');
    this.container.className = 'app-sidebar';
    if (typeof this.container.setAttribute === 'function') {
      this.container.setAttribute('aria-label', 'Document navigation and inspector sidebar');
    }
    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-tabs" role="tablist" aria-label="Sidebar navigation tabs">
          <button class="tab-btn active" data-tab="outline" role="tab" aria-selected="true" title="Table of Contents" aria-label="Table of Contents">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>
          <button class="tab-btn" data-tab="thumbnails" role="tab" aria-selected="false" title="Page Thumbnails" aria-label="Page Thumbnails">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
            </svg>
          </button>
          <button class="tab-btn" data-tab="bookmarks" role="tab" aria-selected="false" title="Bookmarks" aria-label="Bookmarks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span class="tab-badge" id="tab-badge-bookmarks" style="display:none">0</span>
          </button>
          <button class="tab-btn" data-tab="annotations" role="tab" aria-selected="false" title="Highlights & Notes" aria-label="Highlights and Notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span class="tab-badge" id="tab-badge-annotations" style="display:none">0</span>
          </button>
          <button class="tab-btn" data-tab="view" role="tab" aria-selected="false" title="Display & Margins" aria-label="Display and Margins">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>
        <button class="b sm rip" id="sidebar-close-btn" title="Close Sidebar" aria-label="Close Sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="sidebar-body">
        <div id="tab-content-outline" class="tab-pane active" role="tabpanel"></div>
        <div id="tab-content-thumbnails" class="tab-pane" role="tabpanel"></div>
        <div id="tab-content-bookmarks" class="tab-pane" role="tabpanel"></div>
        <div id="tab-content-annotations" class="tab-pane" role="tabpanel"></div>
        <div id="tab-content-view" class="tab-pane" role="tabpanel"></div>
      </div>
    `;

    // Mobile dismissal backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sidebar-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    const host = document.getElementById('rd') || document.body;
    host.appendChild(this.backdrop);
    host.appendChild(this.container);

    // Tab buttons event listeners
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    this.container.querySelector('#sidebar-close-btn').addEventListener('click', () => {
      this.close();
    });

    // Listen to highlight updates to refresh Annotations tab dynamically
    highlightManager.onChange(() => {
      this.updateTabBadges();
      if (this.isOpen && this.activeTab === 'annotations') {
        this.renderAnnotations();
      }
    });

    this.updateTabBadges();
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset && btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
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

  onCurrentPageChange(current) {
    this.currentPage = current;
    if (!this.container) return;

    // 1. Highlight active thumbnail in grid
    const allBoxes = this.container.querySelectorAll('.thumb-canvas-box');
    allBoxes.forEach(box => {
      const isCur = parseInt(box.dataset.page, 10) === current;
      box.classList.toggle('active-thumb', isCur);
    });

    // If thumbnails tab is currently displayed, smoothly center active item
    if (this.isOpen && this.activeTab === 'thumbnails') {
      const activeItem = this.container.querySelector(`.thumb-canvas-box[data-page="${current}"]`);
      if (activeItem && typeof activeItem.scrollIntoView === 'function') {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    // 2. Refresh bookmark banner if on bookmarks tab
    if (this.isOpen && this.activeTab === 'bookmarks') {
      this.updateBookmarkBanner();
    }
  }

  async renderOutline() {
    const pane = this.container.querySelector('#tab-content-outline');
    pane.innerHTML = `
      <div class="sidebar-loader">
        <div class="loader-spinner"></div>
        <span>Loading table of contents...</span>
      </div>
    `;

    const outline = await pdfEngine.getOutline();
    if (!outline || !outline.length) {
      pane.innerHTML = `
        <div class="sidebar-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <p>No table of contents embedded in this document.</p>
        </div>
      `;
      return;
    }

    const resolveDestPage = async (dest) => {
      if (!dest) return null;
      try {
        if (typeof dest === 'string') {
          const namedDest = await pdfEngine.pdfDoc.getDestination(dest);
          if (Array.isArray(namedDest) && namedDest[0]) {
            const idx = await pdfEngine.pdfDoc.getPageIndex(namedDest[0]);
            return idx + 1;
          }
        } else if (Array.isArray(dest) && dest[0]) {
          const idx = await pdfEngine.pdfDoc.getPageIndex(dest[0]);
          return idx + 1;
        }
      } catch {
        return null;
      }
      return null;
    };

    const buildTree = async (items, level = 0) => {
      const ul = document.createElement('ul');
      ul.className = `outline-list level-${level}`;

      for (const item of items) {
        const li = document.createElement('li');
        li.className = 'outline-item';
        
        const pageNum = await resolveDestPage(item.dest);
        const hasChildren = item.items && item.items.length > 0;

        const row = document.createElement('div');
        row.className = 'outline-row';
        if (pageNum && pageNum === this.currentPage) {
          row.classList.add('active-toc');
        }

        row.innerHTML = `
          ${hasChildren ? `
            <button class="toc-chevron-btn" title="Toggle subsection">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ` : '<span class="toc-bullet"></span>'}
          <span class="toc-title">${item.title}</span>
          ${pageNum ? `<span class="toc-page-badge">${pageNum}</span>` : ''}
        `;

        row.addEventListener('click', (e) => {
          if (e.target.closest('.toc-chevron-btn')) {
            const subTree = li.querySelector('.outline-list');
            if (subTree) {
              const collapsed = subTree.classList.toggle('collapsed');
              e.target.closest('.toc-chevron-btn').classList.toggle('expanded', !collapsed);
            }
            return;
          }
          if (pageNum) {
            this.jumpTo(pageNum);
          }
        });

        li.appendChild(row);

        if (hasChildren) {
          const childTree = await buildTree(item.items, level + 1);
          li.appendChild(childTree);
        }

        ul.appendChild(li);
      }
      return ul;
    };

    pane.innerHTML = '';
    const filterBox = document.createElement('div');
    filterBox.className = 'sidebar-search-box';
    filterBox.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="sidebar-search-input" id="outline-filter-input" placeholder="Filter contents..." aria-label="Filter table of contents">
    `;
    pane.appendChild(filterBox);

    const tree = await buildTree(outline);
    pane.appendChild(tree);

    const filterInp = filterBox.querySelector('#outline-filter-input');
    if (filterInp) {
      filterInp.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim().toLowerCase();
        const items = pane.querySelectorAll('.outline-item');
        items.forEach(item => {
          const title = (item.querySelector('.toc-title')?.textContent || '').toLowerCase();
          const match = !q || title.includes(q);
          item.style.display = match ? '' : 'none';
          if (match && q) {
            let parent = item.parentElement;
            while (parent && parent !== pane) {
              if (parent.classList.contains('outline-list')) parent.classList.remove('collapsed');
              parent = parent.parentElement;
            }
          }
        });
      });
    }
  }

  async renderThumbnails() {
    const pane = this.container.querySelector('#tab-content-thumbnails');
    pane.innerHTML = '';

    const numPages = pdfEngine.numPages;
    if (!numPages) {
      pane.innerHTML = '<div class="sidebar-empty">No document loaded.</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'thumbnails-grid';

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(async (entry) => {
        if (entry.isIntersecting) {
          const targetBox = entry.target;
          obs.unobserve(targetBox);
          const pageNum = parseInt(targetBox.dataset.page, 10);
          await this.renderThumbnailCanvas(targetBox, pageNum);
        }
      });
    }, { root: pane, rootMargin: '160px' });

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const item = document.createElement('div');
      item.className = 'thumbnail-item';
      const isCur = pageNum === this.currentPage;
      const isBm = this.bookmarks && this.bookmarks.has(pageNum);

      item.innerHTML = `
        <div class="thumb-canvas-box ${isCur ? 'active-thumb' : ''}" id="thumb-box-${pageNum}" data-page="${pageNum}">
          <button type="button" class="thumb-action-bm ${isBm ? 'bookmarked' : ''}" title="${isBm ? 'Remove bookmark' : 'Bookmark page'}" aria-label="Toggle bookmark for page ${pageNum}">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="${isBm ? '#ffcc00' : 'none'}" stroke="${isBm ? '#ffcc00' : 'currentColor'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <span class="thumb-page-num">${pageNum}</span>
          <span class="thumb-page-badge">Page ${pageNum}</span>
        </div>
      `;
      const box = item.querySelector('.thumb-canvas-box');
      if (box) observer.observe(box);

      const bmBtn = item.querySelector('.thumb-action-bm');
      if (bmBtn) {
        bmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleBookmark(pageNum);
        });
      }

      item.addEventListener('click', () => this.jumpTo(pageNum));
      grid.appendChild(item);
    }

    pane.appendChild(grid);
  }

  async renderThumbnailCanvas(box, pageNum) {
    try {
      const page = await pdfEngine.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.24 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.opacity = '0';
      canvas.style.transition = 'opacity 0.22s ease';

      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const numSpan = box.querySelector('.thumb-page-num');
      if (numSpan) numSpan.style.display = 'none';
      box.insertBefore(canvas, box.firstChild);

      requestAnimationFrame(() => {
        canvas.style.opacity = '1';
      });
    } catch (err) {
      console.warn(`[Sidebar] Error rendering thumbnail ${pageNum}:`, err);
    }
  }

  updateBookmarkBanner() {
    const pane = this.container.querySelector('#tab-content-bookmarks');
    if (!pane) return;
    const cur = this.currentPage;
    const isBookmarked = this.bookmarks.has(cur);

    const bannerBtn = pane.querySelector('#btn-quick-bm');
    if (bannerBtn) {
      bannerBtn.innerHTML = isBookmarked
        ? `
          <svg viewBox="0 0 24 24" fill="#ffcc00" stroke="#ffcc00" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Page ${cur} Bookmarked</span>
          <small>Tap to remove</small>
        `
        : `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Bookmark Page ${cur}</span>
          <small>Add to quick bookmarks</small>
        `;
      bannerBtn.classList.toggle('bookmarked', isBookmarked);
    }
  }

  renderBookmarks() {
    const pane = this.container.querySelector('#tab-content-bookmarks');
    pane.innerHTML = '';

    const cur = this.currentPage;
    const isBookmarked = this.bookmarks.has(cur);

    const headerCard = document.createElement('div');
    headerCard.className = 'bookmark-action-card';
    headerCard.innerHTML = `
      <button class="btn-quick-bm ${isBookmarked ? 'bookmarked' : ''}" id="btn-quick-bm">
        ${isBookmarked
          ? `
            <svg viewBox="0 0 24 24" fill="#ffcc00" stroke="#ffcc00" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Page ${cur} Bookmarked</span>
            <small>Tap to remove</small>
          `
          : `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Bookmark Page ${cur}</span>
            <small>Add to quick bookmarks</small>
          `}
      </button>
    `;
    headerCard.querySelector('#btn-quick-bm').addEventListener('click', () => {
      this.toggleBookmark(cur);
      this.renderBookmarks();
    });
    pane.appendChild(headerCard);

    if (!this.bookmarks.size) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-empty';
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <p>No saved bookmarks.<br>Tap above to pin your favorite pages.</p>
      `;
      pane.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'bookmarks-list';

    Array.from(this.bookmarks).sort((a, b) => a - b).forEach(pageNum => {
      const item = document.createElement('div');
      item.className = `bookmark-row ${pageNum === this.currentPage ? 'active-row' : ''}`;
      item.innerHTML = `
        <div class="bm-left">
          <span class="bm-star-icon">
            <svg viewBox="0 0 24 24" fill="#ffcc00" stroke="#ffcc00" stroke-width="1">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </span>
          <span class="bm-title">Page ${pageNum}</span>
        </div>
        <div class="bm-actions">
          <button class="b sm remove-bm-btn" data-page="${pageNum}" title="Remove bookmark" aria-label="Remove bookmark for page ${pageNum}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
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

    const annSearchInp = searchWrap.querySelector('#ann-search-input');
    if (annSearchInp) {
      annSearchInp.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim().toLowerCase();
        const cards = list.querySelectorAll('.annotation-card');
        cards.forEach(card => {
          const text = (card.textContent || '').toLowerCase();
          card.style.display = !q || text.includes(q) ? '' : 'none';
        });
      });
    }
  }

  renderAnnotations() {
    const pane = this.container.querySelector('#tab-content-annotations');
    pane.innerHTML = '';

    const allAnnotations = highlightManager.getAllAnnotations();
    if (!allAnnotations.length) {
      pane.innerHTML = `
        <div class="sidebar-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <p>No highlights or notes in this document.<br>Select text on any page to annotate.</p>
        </div>
      `;
      return;
    }

    // Annotations search & export bar
    const searchWrap = document.createElement('div');
    searchWrap.className = 'sidebar-search-box ann-search-row';
    searchWrap.style.marginBottom = '8px';
    searchWrap.style.display = 'flex';
    searchWrap.style.alignItems = 'center';
    searchWrap.style.gap = '6px';
    searchWrap.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="sidebar-search-input" id="ann-search-input" placeholder="Search highlights & notes..." aria-label="Search highlights and notes" style="flex:1;">
      <button class="b sm ann-export-btn" id="btn-export-annotations" title="Export Highlights & Notes Summary (Markdown)" aria-label="Export Highlights and Notes Summary" style="padding:4px 6px; border-radius:6px; flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    `;
    pane.appendChild(searchWrap);

    const exportBtn = searchWrap.querySelector('#btn-export-annotations');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.exportAnnotationsSummary(allAnnotations);
      });
    }

    // Filter toolbar
    const filterBar = document.createElement('div');
    filterBar.className = 'ann-filter-bar';
    
    const filterOptions = [
      { id: 'all', label: `All (${allAnnotations.length})` },
      ...Object.keys(PALETTE).map(key => {
        const count = allAnnotations.filter(a => a.color === PALETTE[key].color).length;
        return { id: key, label: `${PALETTE[key].label} (${count})`, color: PALETTE[key].color, count };
      }).filter(o => o.count > 0)
    ];

    filterBar.innerHTML = filterOptions.map(opt => `
      <button class="ann-filter-chip ${this.annotationFilterColor === opt.id ? 'active' : ''}" data-filter="${opt.id}">
        ${opt.color ? `<span class="chip-dot" style="background-color: ${opt.color};"></span>` : ''}
        <span>${opt.label}</span>
      </button>
    `).join('');

    filterBar.querySelectorAll('.ann-filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.annotationFilterColor = e.currentTarget.dataset.filter;
        this.renderAnnotations();
      });
    });

    pane.appendChild(filterBar);

    // Filter annotations list
    const filtered = this.annotationFilterColor === 'all'
      ? allAnnotations
      : allAnnotations.filter(a => a.color === PALETTE[this.annotationFilterColor]?.color);

    const list = document.createElement('div');
    list.className = 'annotations-list';

    filtered.forEach(ann => {
      const card = document.createElement('div');
      card.className = 'annotation-card';
      card.style.borderLeftColor = ann.color || 'var(--ac)';
      card.innerHTML = `
        <div class="ann-header">
          <div class="ann-badge-group">
            <span class="ann-dot" style="background-color: ${ann.color};"></span>
            <span class="ann-page-num">Page ${ann.page}</span>
          </div>
          <button class="b sm ann-delete-btn" title="Delete highlight" aria-label="Delete highlight on page ${ann.page}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="ann-text">“${ann.text.slice(0, 100)}${ann.text.length > 100 ? '…' : ''}”</div>
        ${ann.note ? `
          <div class="ann-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ann-note-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>${ann.note}</span>
          </div>
        ` : ''}
      `;

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.ann-delete-btn')) {
          this.jumpTo(ann.page);
        }
      });

      card.querySelector('.ann-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        highlightManager.deleteHighlight(ann.id);
        this.renderAnnotations();
      });

      list.appendChild(card);
    });

    pane.appendChild(list);

    const annSearchInp = searchWrap.querySelector('#ann-search-input');
    if (annSearchInp) {
      annSearchInp.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim().toLowerCase();
        const cards = list.querySelectorAll('.annotation-card');
        cards.forEach(card => {
          const text = (card.textContent || '').toLowerCase();
          card.style.display = !q || text.includes(q) ? '' : 'none';
        });
      });
    }
  }

  exportAnnotationsSummary(annotations) {
    if (!annotations || !annotations.length) {
      showToast('No annotations to export', 'info');
      return;
    }
    const docTitle = (typeof document !== 'undefined' && document.title) ? document.title.replace(' - Pedif', '').trim() : 'Document';
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    let md = `# Highlights & Notes Summary: ${docTitle}\n`;
    md += `*Exported from Pedif on ${dateStr} • ${annotations.length} annotation(s)*\n\n---\n\n`;

    // Group by page
    const byPage = new Map();
    annotations.forEach(a => {
      const p = a.page || 1;
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(a);
    });

    const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b);
    sortedPages.forEach(p => {
      md += `## Page ${p}\n\n`;
      byPage.get(p).forEach((ann) => {
        md += `> "${ann.text || ''}"\n\n`;
        if (ann.note) {
          md += `**Note:** ${ann.note}\n\n`;
        }
        if (ann.style && ann.style !== 'highlight') {
          md += `*Style: ${ann.style}*\n\n`;
        }
      });
      md += `---\n\n`;
    });

    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docTitle.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}_annotations.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Annotations summary exported!', 'check');
    } catch (e) {
      console.error('Export annotations failed:', e);
      showToast('Export failed', 'alert');
    }
  }

  renderViewSettings() {
    const pane = this.container.querySelector('#tab-content-view');
    if (!pane) return;

    const isSpread = this.viewer && this.viewer.mode === 'spread';
    const margins = this.viewer && this.viewer.margins;
    const hasCrop = margins && (margins.left > 0 || margins.top > 0 || margins.right > 0 || margins.bottom > 0);
    const curTheme = (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark';

    pane.innerHTML = `
      <div class="view-settings-panel">
        <div class="panel-section">
          <h3 class="panel-section-title">Color Theme</h3>
          <div class="theme-picker-grid">
            <button type="button" class="theme-choice-btn ${curTheme === 'light' ? 'active' : ''}" data-theme="light">
              <span class="theme-swatch swatch-light"></span>
              <span>Light</span>
            </button>
            <button type="button" class="theme-choice-btn ${curTheme === 'dark' ? 'active' : ''}" data-theme="dark">
              <span class="theme-swatch swatch-dark"></span>
              <span>Dark</span>
            </button>
            <button type="button" class="theme-choice-btn ${curTheme === 'sepia' ? 'active' : ''}" data-theme="sepia">
              <span class="theme-swatch swatch-sepia"></span>
              <span>Sepia</span>
            </button>
            <button type="button" class="theme-choice-btn ${curTheme === 'oled' ? 'active' : ''}" data-theme="oled">
              <span class="theme-swatch swatch-oled"></span>
              <span>OLED</span>
            </button>
          </div>
        </div>

        <div class="panel-section">
          <h3 class="panel-section-title">Reading Mode</h3>
          <div class="segmented-control" role="group" aria-label="Reading layout mode">
            <button class="segmented-btn ${!isSpread ? 'active' : ''}" id="btn-mode-continuous">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="4" x2="18" y2="4"/><line x1="6" y1="9" x2="18" y2="9"/><line x1="6" y1="14" x2="18" y2="14"/><line x1="6" y1="19" x2="18" y2="19"/></svg>
              <span>Continuous</span>
            </button>
            <button class="segmented-btn ${isSpread ? 'active' : ''}" id="btn-mode-spread">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>
              <span>Two-Page Spread</span>
            </button>
          </div>
        </div>

        <div class="panel-section">
          <h3 class="panel-section-title">Zoom & Page Fit</h3>
          <div class="panel-btn-grid">
            <button type="button" class="b sm btn-panel-action" id="btn-view-fit-width">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/></svg>
              <span>Fit Width</span>
            </button>
            <button type="button" class="b sm btn-panel-secondary" id="btn-view-fit-page">
              Fit Page
            </button>
            <button type="button" class="b sm btn-panel-secondary" id="btn-view-zoom-100">
              100%
            </button>
          </div>
        </div>

        <div class="panel-section">
          <h3 class="panel-section-title">Smart Margin Cropping</h3>
          <p class="panel-desc">
            Automatically scans and crops borders so scanned documents fill the reader area cleanly.
          </p>
          <div class="panel-btn-grid">
            <button class="b sm btn-panel-action" id="btn-auto-crop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
              <span>Auto-Trim Margins</span>
            </button>
            <button class="b sm btn-panel-secondary" id="btn-reset-crop">
              Reset
            </button>
          </div>
          <div class="crop-status-pill">
            <span class="crop-status-dot ${hasCrop ? 'active' : ''}"></span>
            <span>
              ${hasCrop 
                ? `Active Crop: L ${(margins.left * 100).toFixed(0)}% · R ${(margins.right * 100).toFixed(0)}% · T ${(margins.top * 100).toFixed(0)}% · B ${(margins.bottom * 100).toFixed(0)}%`
                : 'Zero crop — Native document dimensions'}
            </span>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-header">
            <h3 class="panel-section-title">Neural PP-OCRv4</h3>
            <span class="badge-webgpu">WebGPU / WASM</span>
          </div>
          <p class="panel-desc">
            Local OCR inference on Page ${this.currentPage}. Files never leave your browser sandbox.
          </p>
          <button class="b sm btn-panel-action btn-ocr-highlight" id="btn-ocr-page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><path d="M8 12h8M12 8v8"/></svg>
            <span>Scan Page ${this.currentPage} with OCR</span>
          </button>
        </div>
      </div>
    `;

    pane.querySelector('#btn-ocr-page')?.addEventListener('click', async () => {
      const curPage = this.currentPage;
      const btn = pane.querySelector('#btn-ocr-page');
      if (btn) {
        btn.innerHTML = `<span class="loader-spinner sm"></span><span>Running PP-OCRv4...</span>`;
        btn.disabled = true;
      }
      showToast(`Running WebGPU OCR on Page ${curPage}...`, 'info');
      const res = await this.viewer.runManualOcr(curPage);
      if (res && res.lines && res.lines.length) {
        showToast(`OCR Success: Found ${res.lines.length} lines on Page ${curPage}`, 'check');
      } else {
        showToast(`OCR Completed: Ready for text selection`, 'check');
      }
      if (btn) {
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><path d="M8 12h8M12 8v8"/></svg>
          <span>Scan Page ${curPage} with OCR</span>
        `;
        btn.disabled = false;
      }
    });

    pane.querySelector('#btn-mode-continuous')?.addEventListener('click', () => {
      this.viewer.setMode('continuous');
      this.renderViewSettings();
    });

    pane.querySelector('#btn-mode-spread')?.addEventListener('click', () => {
      this.viewer.setMode('spread');
      this.renderViewSettings();
    });

    pane.querySelector('#btn-view-fit-width')?.addEventListener('click', () => {
      if (this.viewer && typeof this.viewer.fitWidth === 'function') {
        this.viewer.fitWidth();
        showToast('Fit Width', 'check');
      }
    });

    pane.querySelector('#btn-view-fit-page')?.addEventListener('click', () => {
      if (this.viewer && typeof this.viewer.fitPage === 'function') {
        this.viewer.fitPage();
        showToast('Fit Page', 'check');
      }
    });

    pane.querySelector('#btn-view-zoom-100')?.addEventListener('click', () => {
      if (this.viewer && typeof this.viewer.setScale === 'function') {
        this.viewer.setScale(1.0);
        showToast('Zoom 100%', 'check');
      }
    });

    pane.querySelector('#btn-auto-crop')?.addEventListener('click', async () => {
      const btn = pane.querySelector('#btn-auto-crop');
      if (btn) btn.innerHTML = `<span class="loader-spinner sm"></span><span>Trimming...</span>`;
      await this.viewer.autoCropMargins();
      this.renderViewSettings();
    });

    pane.querySelector('#btn-reset-crop')?.addEventListener('click', () => {
      this.viewer.resetCropMargins();
      this.renderViewSettings();
    });

    pane.querySelectorAll('.theme-choice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const t = e.currentTarget.dataset.theme;
        if (typeof document !== 'undefined') {
          document.documentElement.dataset.theme = t;
          localStorage.setItem('pedif:theme', t);
        }
        pane.querySelectorAll('.theme-choice-btn').forEach(b => {
          if (b.classList && typeof b.classList.toggle === 'function') {
            b.classList.toggle('active', b.dataset.theme === t);
          }
        });
        showToast(`Theme: ${t.toUpperCase()}`, 'star');
      });
    });
  }

  toggleBookmark(pageNum) {
    if (this.bookmarks.has(pageNum)) {
      this.bookmarks.delete(pageNum);
    } else {
      this.bookmarks.add(pageNum);
    }
    this.updateTabBadges();

    // Synchronize thumbnail star button if rendered
    if (this.container && typeof this.container.querySelector === 'function') {
      const bmBtn = this.container.querySelector(`#thumb-box-${pageNum} .thumb-action-bm`);
      if (bmBtn && bmBtn.classList && typeof bmBtn.classList.toggle === 'function') {
        const nowBm = this.bookmarks.has(pageNum);
        bmBtn.classList.toggle('bookmarked', nowBm);
        if (typeof bmBtn.setAttribute === 'function') {
          bmBtn.setAttribute('title', nowBm ? 'Remove bookmark' : 'Bookmark page');
        }
        const svg = typeof bmBtn.querySelector === 'function' ? bmBtn.querySelector('svg') : null;
        if (svg && typeof svg.setAttribute === 'function') {
          svg.setAttribute('fill', nowBm ? '#ffcc00' : 'none');
          svg.setAttribute('stroke', nowBm ? '#ffcc00' : 'currentColor');
        }
      }
    }
  }

  updateTabBadges() {
    if (!this.container || typeof this.container.querySelector !== 'function') return;
    const bmBadge = this.container.querySelector('#tab-badge-bookmarks');
    if (bmBadge) {
      const count = this.bookmarks ? this.bookmarks.size : 0;
      bmBadge.textContent = count > 99 ? '99+' : `${count}`;
      if (bmBadge.style) {
        bmBadge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    }

    const annBadge = this.container.querySelector('#tab-badge-annotations');
    if (annBadge) {
      const allAnn = (highlightManager && typeof highlightManager.getAllAnnotations === 'function')
        ? highlightManager.getAllAnnotations()
        : [];
      const count = allAnn.length;
      annBadge.textContent = count > 99 ? '99+' : `${count}`;
      if (annBadge.style) {
        annBadge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    }
  }

  jumpTo(pageNum) {
    if (typeof this.onJumpToPage === 'function') {
      this.onJumpToPage(pageNum);
    }
    // Close sidebar on small screens automatically
    if (window.innerWidth < 768) {
      this.close();
    }
  }

  open() {
    this.container.classList.add('open');
    if (this.backdrop) this.backdrop.classList.add('open');
    this.isOpen = true;
    this.updateTabBadges();
    this.switchTab(this.activeTab);
  }

  close() {
    this.container.classList.remove('open');
    if (this.backdrop) this.backdrop.classList.remove('open');
    this.isOpen = false;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}
