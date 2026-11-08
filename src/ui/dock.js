/**
 * Floating Glass Bottom Dock
 * Provides page jumping pill, previous/next buttons, and zoom controls.
 */

import { showToast } from './toast.js';

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
      pagePill.addEventListener('click', (e) => {
        if (pagePill.querySelector('.dock-page-input')) return;
        const cur = this.currentPage;
        pagePill.innerHTML = `<input type="number" class="dock-page-input" min="1" max="${this.totalPages}" value="${cur}"><i>/</i><span id="dock-total-pages">${this.totalPages}</span>`;
        const inp = pagePill.querySelector('.dock-page-input');
        if (inp) {
          inp.focus();
          inp.select();

          const commitJump = () => {
            const val = parseInt(inp.value, 10);
            if (!isNaN(val) && val >= 1 && val <= this.totalPages && this.onJumpPage) {
              this.onJumpPage(val);
            }
            this.updatePage(this.currentPage, this.totalPages);
          };

          inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              commitJump();
            } else if (ev.key === 'Escape') {
              this.updatePage(this.currentPage, this.totalPages);
            }
          });

          inp.addEventListener('blur', () => {
            commitJump();
          });
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
          const curScale = this.viewer.scale;
          // Toggle between 100% (1.25) and Fit Width
          if (Math.abs(curScale - 1.25) < 0.08) {
            if (typeof this.viewer.fitWidth === 'function') {
              const fitScale = this.viewer.fitWidth();
              this.updateZoom(fitScale || this.viewer.scale);
              showToast('Fit Width', 'check');
            } else {
              this.viewer.setScale(1.25);
              this.updateZoom(1.25);
            }
          } else {
            this.viewer.setScale(1.25);
            this.updateZoom(1.25);
            showToast('100%', 'check');
          }
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
    if (typeof document === 'undefined') return;
    const pagePill = document.getElementById('btn-dock-page');
    if (pagePill && !pagePill.querySelector('.dock-page-input')) {
      pagePill.innerHTML = `<span id="dock-cur-page">${cur}</span><i>/</i><span id="dock-total-pages">${total}</span>`;
      this.curPageEl = document.getElementById('dock-cur-page');
      this.totalPagesEl = document.getElementById('dock-total-pages');
    }
  }

  updateZoom(scale) {
    if (this.zoomResetBtn) {
      // Relative to base 1.25 scale as 100%
      const pct = Math.round((scale / 1.25) * 100);
      this.zoomResetBtn.textContent = `${pct}%`;
    }
  }
}
