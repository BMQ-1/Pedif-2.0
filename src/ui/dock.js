/**
 * Floating Glass Bottom Dock
 * Provides page jumping pill, previous/next buttons, and zoom controls.
 */

export class Dock {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.onJumpPage = options.onJumpPage || null;
    this.onZoomChange = options.onZoomChange || null;

    this.dockEl = typeof document !== 'undefined' ? document.getElementById('dk') : null;
    this.curPageEl = typeof document !== 'undefined' ? document.getElementById('dock-cur-page') : null;
    this.totalPagesEl = typeof document !== 'undefined' ? document.getElementById('dock-total-pages') : null;
    this.zoomResetBtn = typeof document !== 'undefined' ? document.getElementById('btn-dock-zoom-reset') : null;

    this.currentPage = 1;
    this.totalPages = 1;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    if (typeof document === 'undefined') return;
    const prevBtn = document.getElementById('btn-dock-prev');
    const nextBtn = document.getElementById('btn-dock-next');
    const pagePill = document.getElementById('btn-dock-page');
    const zoomOutBtn = document.getElementById('btn-dock-zoom-out');
    const zoomInBtn = document.getElementById('btn-dock-zoom-in');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1 && this.onJumpPage) {
          this.onJumpPage(this.currentPage - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentPage < this.totalPages && this.onJumpPage) {
          this.onJumpPage(this.currentPage + 1);
        }
      });
    }

    if (pagePill) {
      pagePill.addEventListener('click', () => {
        const input = prompt(`Go to page (1 - ${this.totalPages}):`, this.currentPage);
        if (input !== null) {
          const target = parseInt(input, 10);
          if (!isNaN(target) && target >= 1 && target <= this.totalPages && this.onJumpPage) {
            this.onJumpPage(target);
          }
        }
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (this.viewer) {
          const newScale = Math.max(0.4, this.viewer.scale - 0.15);
          this.viewer.setScale(newScale);
          this.updateZoom(newScale);
        }
      });
    }

    if (this.zoomResetBtn) {
      this.zoomResetBtn.addEventListener('click', () => {
        if (this.viewer) {
          this.viewer.setScale(1.25);
          this.updateZoom(1.25);
        }
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (this.viewer) {
          const newScale = Math.min(3.5, this.viewer.scale + 0.15);
          this.viewer.setScale(newScale);
          this.updateZoom(newScale);
        }
      });
    }
  }

  updatePage(cur, total) {
    this.currentPage = cur;
    this.totalPages = total;
    if (this.curPageEl) this.curPageEl.textContent = cur;
    if (this.totalPagesEl) this.totalPagesEl.textContent = total;
  }

  updateZoom(scale) {
    if (this.zoomResetBtn) {
      // Relative to base 1.25 scale as 100%
      const pct = Math.round((scale / 1.25) * 100);
      this.zoomResetBtn.textContent = `${pct}%`;
    }
  }
}
