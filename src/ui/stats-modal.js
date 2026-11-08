/**
 * Reading Statistics Modal
 * Shows reading time, current progress, pages viewed, and estimated completion time.
 */

export class StatsModal {
  constructor(options = {}) {
    this.getCurrentPage = options.getCurrentPage || (() => 1);
    this.getTotalPages = options.getTotalPages || (() => 1);
    this.getDocName = options.getDocName || (() => 'Document.pdf');

    this.sessionStartTime = Date.now();
    this.pagesViewed = new Set([1]);
    this.modalEl = null;
    this.isOpen = false;
  }

  recordPage(pageNum) {
    if (pageNum >= 1) {
      this.pagesViewed.add(pageNum);
    }
  }

  resetSession(totalPages = 1) {
    this.sessionStartTime = Date.now();
    this.pagesViewed = new Set([1]);
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;

    const totalPages = this.getTotalPages();
    const curPage = this.getCurrentPage();
    const docName = this.getDocName();

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - this.sessionStartTime) / 1000));
    const elapsedMinutes = (elapsedSeconds / 60).toFixed(1);

    const progressPct = Math.round((curPage / Math.max(1, totalPages)) * 100);
    const uniqueViewed = this.pagesViewed.size;

    // Estimate remaining: avg 1.5 mins per unread page
    const remainingPages = Math.max(0, totalPages - curPage);
    const estRemainingMins = Math.round(remainingPages * 1.5);

    let modal = document.getElementById('stats-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'stats-modal';
      modal.className = 'extract-modal-backdrop';
      document.body.appendChild(modal);
    }
    this.modalEl = modal;

    modal.innerHTML = `
      <div class="extract-modal-card glass stagger">
        <div class="extract-modal-header">
          <div class="extract-header-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="extract-icon">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <div>
              <h3>Reading Statistics</h3>
              <p>${docName}</p>
            </div>
          </div>
          <button class="b sm rip" id="btn-stats-close" title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="extract-modal-body">
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-val">${progressPct}%</span>
              <span class="stat-lbl">Progress</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">${curPage} / ${totalPages}</span>
              <span class="stat-lbl">Current Page</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">${uniqueViewed}</span>
              <span class="stat-lbl">Pages Seen</span>
            </div>
            <div class="stat-card">
              <span class="stat-val">${elapsedMinutes} min</span>
              <span class="stat-lbl">Time Reading</span>
            </div>
          </div>

          <div class="stat-est-box">
            <div class="stat-est-text">
              <strong>Estimated time remaining:</strong>
              <span>~${estRemainingMins > 0 ? `${estRemainingMins} minutes` : 'Complete!'}</span>
            </div>
            <div class="pbar" style="margin-top: 10px;">
              <i style="width: ${progressPct}%;"></i>
            </div>
          </div>
        </div>

        <div class="extract-modal-footer">
          <button class="btn-primary rip" id="btn-stats-ok" style="width: 100%;">Done</button>
        </div>
      </div>
    `;

    modal.classList.add('on');

    const closeBtn = modal.querySelector('#btn-stats-close');
    const okBtn = modal.querySelector('#btn-stats-ok');
    const close = () => this.hide();

    closeBtn.addEventListener('click', close);
    okBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  hide() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.classList.remove('on');
    }
  }
}
