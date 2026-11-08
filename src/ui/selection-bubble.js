/**
 * Selection Action Bubble
 * Floating contextual callout menu appearing above text selection:
 * Multi-color highlight chips, Add Note, Copy, and Read Aloud (TTS).
 */

import { highlightManager, PALETTE } from '../annotations/highlight-manager.js';

export class SelectionBubble {
  constructor(options = {}) {
    this.container = null;
    this.currentSelection = null;
    this.render();
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'selection-bubble';
    this.container.style.display = 'none';

    // Color chips
    const chipsHtml = Object.keys(PALETTE).map(key => {
      const p = PALETTE[key];
      return `<button class="color-chip" data-color="${key}" style="background-color: ${p.color};" title="${p.label}"></button>`;
    }).join('');

    this.container.innerHTML = `
      <div class="bubble-colors">
        ${chipsHtml}
      </div>
      <div class="bubble-divider"></div>
      <button class="b sm" id="bubble-btn-copy" title="Copy text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="b sm" id="bubble-btn-speak" title="Read Aloud">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      </button>
    `;

    document.body.appendChild(this.container);

    // Event listeners
    this.container.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const colorKey = e.currentTarget.dataset.color;
        this.applyHighlight(colorKey);
      });
    });

    this.container.querySelector('#bubble-btn-copy').addEventListener('click', () => {
      if (this.currentSelection && this.currentSelection.text) {
        navigator.clipboard.writeText(this.currentSelection.text).then(() => {
          this.showFeedback('Copied!');
        });
      }
    });

    this.container.querySelector('#bubble-btn-speak').addEventListener('click', () => {
      if (this.currentSelection && this.currentSelection.text) {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(this.currentSelection.text);
          window.speechSynthesis.speak(utterance);
        }
      }
    });
  }

  show(selectionData) {
    this.currentSelection = selectionData;
    if (!selectionData || !selectionData.chars || !selectionData.chars.length) {
      this.hide();
      return;
    }

    const bounds = selectionData.bounds || this.computeBounds(selectionData.chars);
    if (!bounds) return;

    this.container.style.display = 'flex';

    // Position above selection if space permits, else below
    const bubbleWidth = 240;
    const bubbleHeight = 44;
    let left = bounds.left + bounds.width / 2 - bubbleWidth / 2;
    let top = bounds.top - bubbleHeight - 12;

    if (top < 64) {
      top = bounds.bottom + 12; // Flip below
    }

    // Keep within window viewport boundaries
    left = Math.max(16, Math.min(window.innerWidth - bubbleWidth - 16, left));

    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
  }

  computeBounds(chars) {
    if (!chars.length) return null;
    const pageNum = chars[0].pageNum || 1;
    const pageEl = document.getElementById(`page-${pageNum}`);
    const pageRect = pageEl ? pageEl.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 1000 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    chars.forEach(c => {
      const q = c.quad;
      minX = Math.min(minX, q.lt.x, q.lb.x);
      minY = Math.min(minY, q.lt.y, q.rt.y);
      maxX = Math.max(maxX, q.rt.x, q.rb.x);
      maxY = Math.max(maxY, q.lb.y, q.rb.y);
    });

    const isNorm = (minX <= 1.0 && minY <= 1.0 && maxX <= 1.0 && maxY <= 1.0);
    const sx = isNorm ? pageRect.width : 1;
    const sy = isNorm ? pageRect.height : 1;

    const screenLeft = pageRect.left + (minX * sx);
    const screenTop = pageRect.top + (minY * sy);
    const screenWidth = Math.max(10, (maxX - minX) * sx);
    const screenHeight = Math.max(14, (maxY - minY) * sy);

    return {
      left: screenLeft,
      top: screenTop,
      width: screenWidth,
      height: screenHeight,
      bottom: screenTop + screenHeight,
    };
  }

  applyHighlight(colorKey) {
    if (!this.currentSelection) return;
    const { pageNum, chars } = this.currentSelection;
    highlightManager.createHighlight(pageNum, chars, colorKey);
    this.hide();

    // Trigger overlay clear event
    window.dispatchEvent(new CustomEvent('clear-selection', { detail: { pageNum } }));
  }

  hide() {
    this.container.style.display = 'none';
    this.currentSelection = null;
  }

  showFeedback(msg) {
    const orig = this.container.innerHTML;
    this.container.innerHTML = `<span style="font-size: 13px; font-weight: 500; padding: 4px 12px;">${msg}</span>`;
    setTimeout(() => {
      this.container.innerHTML = orig;
      this.hide();
    }, 800);
  }
}
