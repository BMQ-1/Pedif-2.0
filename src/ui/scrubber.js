/**
 * Reading Progress Scrubber
 * Interactive scrubber along the top navigation bar with a floating page preview bubble.
 */

export class Scrubber {
  constructor(options = {}) {
    this.scrubEl = typeof document !== 'undefined' ? document.getElementById('scrub') : null;
    this.progressEl = typeof document !== 'undefined' ? document.getElementById('pr') : null;
    this.bubbleEl = typeof document !== 'undefined' ? document.getElementById('scrub-bub') : null;
    this.onJumpPage = options.onJumpPage || null;

    this.currentPage = 1;
    this.totalPages = 1;
    this.isDragging = false;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    if (!this.scrubEl) return;

    const handlePointer = (e) => {
      const rect = this.scrubEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const ratio = rect.width > 0 ? (x / rect.width) : 0;
      const targetPage = Math.max(1, Math.min(this.totalPages, Math.round(ratio * (this.totalPages - 1)) + 1));

      if (this.bubbleEl) {
        this.bubbleEl.textContent = `Page ${targetPage} of ${this.totalPages}`;
        this.bubbleEl.style.left = `${x}px`;
        this.bubbleEl.classList.add('on');
      }

      return targetPage;
    };

    this.scrubEl.addEventListener('pointerenter', (e) => {
      if (this.totalPages > 1) {
        handlePointer(e);
      }
    });

    this.scrubEl.addEventListener('pointermove', (e) => {
      if (this.totalPages > 1) {
        const targetPage = handlePointer(e);
        if (this.isDragging && this.onJumpPage) {
          this.onJumpPage(targetPage);
        }
      }
    });

    this.scrubEl.addEventListener('pointerleave', () => {
      if (!this.isDragging && this.bubbleEl) {
        this.bubbleEl.classList.remove('on');
      }
    });

    this.scrubEl.addEventListener('pointerdown', (e) => {
      if (this.totalPages <= 1) return;
      this.isDragging = true;
      if (this.scrubEl.setPointerCapture) {
        try { this.scrubEl.setPointerCapture(e.pointerId); } catch {}
      }
      const targetPage = handlePointer(e);
      if (this.onJumpPage) {
        this.onJumpPage(targetPage);
      }
    });

    const stopDrag = (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.bubbleEl) this.bubbleEl.classList.remove('on');
        if (this.scrubEl.releasePointerCapture) {
          try { this.scrubEl.releasePointerCapture(e.pointerId); } catch {}
        }
      }
    };

    this.scrubEl.addEventListener('pointerup', stopDrag);
    this.scrubEl.addEventListener('pointercancel', stopDrag);
  }

  updateProgress(current, total) {
    this.currentPage = current;
    this.totalPages = total;

    if (this.progressEl) {
      const ratio = total > 1 ? (current / total) : 0;
      this.progressEl.style.transform = `scaleX(${ratio})`;
    }
  }
}
