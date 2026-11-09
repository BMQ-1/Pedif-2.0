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
      this.zoomResetBtn.title = "Toggle zoom (100% / Fit Width) — Right-click for presets";

      // Zoom preset popover
      const zoomMenu = document.createElement('div');
      zoomMenu.className = 'dock-zoom-popover';
      zoomMenu.style.display = 'none';
      zoomMenu.innerHTML = `
        <div class="dock-zoom-title">Zoom Presets</div>
        <button type="button" class="dock-zoom-item" data-preset="fit-width">Fit Width (W)</button>
        <button type="button" class="dock-zoom-item" data-preset="fit-page">Fit Page (0)</button>
        <div class="dock-zoom-sep"></div>
        <button type="button" class="dock-zoom-item" data-scale="0.5">50%</button>
        <button type="button" class="dock-zoom-item" data-scale="0.75">75%</button>
        <button type="button" class="dock-zoom-item" data-scale="1.0">100%</button>
        <button type="button" class="dock-zoom-item" data-scale="1.25">125%</button>
        <button type="button" class="dock-zoom-item" data-scale="1.5">150%</button>
        <button type="button" class="dock-zoom-item" data-scale="2.0">200%</button>
        <button type="button" class="dock-zoom-item" data-scale="3.0">300%</button>
      `;
      document.body.appendChild(zoomMenu);

      const closeZoomMenu = () => {
        zoomMenu.style.display = 'none';
      };

      const openZoomMenu = () => {
        const rect = this.zoomResetBtn.getBoundingClientRect();
        zoomMenu.style.position = 'fixed';
        zoomMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
        zoomMenu.style.left = `${rect.left + rect.width / 2}px`;
        zoomMenu.style.transform = 'translateX(-50%)';
        zoomMenu.style.display = 'flex';
      };

      this.zoomResetBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (zoomMenu.style.display === 'none') openZoomMenu();
        else closeZoomMenu();
      });

      document.addEventListener('click', (e) => {
        if (!zoomMenu.contains(e.target) && e.target !== this.zoomResetBtn) {
          closeZoomMenu();
        }
      });

      zoomMenu.querySelectorAll('.dock-zoom-item').forEach(item => {
        item.addEventListener('click', () => {
          closeZoomMenu();
          if (!this.viewer) return;
          if (item.dataset.preset === 'fit-width') {
            if (typeof this.viewer.fitWidth === 'function') {
              const s = this.viewer.fitWidth();
              this.updateZoom(s || this.viewer.scale);
              showToast('Fit Width', 'check');
            }
          } else if (item.dataset.preset === 'fit-page') {
            this.viewer.setScale(1.25);
            this.updateZoom(1.25);
            showToast('Fit Page (100%)', 'check');
          } else if (item.dataset.scale) {
            const factor = parseFloat(item.dataset.scale);
            const newScale = factor * 1.25;
            this.viewer.setScale(newScale);
            this.updateZoom(newScale);
            showToast(`${Math.round(factor * 100)}%`, 'check');
          }
        });
      });

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
