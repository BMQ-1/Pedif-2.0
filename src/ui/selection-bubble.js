/**
 * Selection Action Bubble
 * Floating contextual callout menu appearing above text selection:
 * Multi-color highlight chips, Add Note, Copy, Search, and Read Aloud (TTS).
 */

import { highlightManager, PALETTE } from '../annotations/highlight-manager.js';
import { showToast } from './toast.js';

export class SelectionBubble {
  constructor(options = {}) {
    this.container = null;
    this.currentSelection = null;
    this.activeStyle = 'highlight'; // 'highlight' | 'underline' | 'strikethrough'
    this.onSearchRequest = options.onSearchRequest || null;
    this.render();
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'selection-bubble glass';
    this.container.style.display = 'none';

    // Color chips
    const chipsHtml = Object.keys(PALETTE).map(key => {
      const p = PALETTE[key];
      return `<button class="color-chip" data-color="${key}" style="background-color: ${p.color};" title="${p.label} highlight"></button>`;
    }).join('');

    this.container.innerHTML = `
      <div class="bubble-row" style="display: flex; align-items: center; gap: 4px;">
        <div class="bubble-colors">
          ${chipsHtml}
        </div>
        <div class="bubble-divider"></div>
        <div class="bubble-style-group" style="display: flex; gap: 2px;">
          <button class="b sm rip style-btn active" data-style="highlight" title="Highlight">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
          </button>
          <button class="b sm rip style-btn" data-style="underline" title="Underline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
          </button>
          <button class="b sm rip style-btn" data-style="strikethrough" title="Strikethrough">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><line x1="4" y1="12" x2="20" y2="12"/><path d="M16 6a4 4 0 0 0-8 0c0 4 8 2 8 6a4 4 0 0 1-8 0"/></svg>
          </button>
        </div>
        <div class="bubble-divider"></div>
        <button class="b sm rip" id="bubble-btn-note" title="Add Note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="b sm rip" id="bubble-btn-copy" title="Copy text (Ctrl+C)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="b sm rip" id="bubble-btn-search" title="Search in document">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button class="b sm rip" id="bubble-btn-speak" title="Read Aloud">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        </button>
        <button class="b sm rip btn-danger" id="bubble-btn-delete" title="Remove Highlight (Delete)" style="display: none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#ff3b30;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="bubble-note-row" id="bubble-note-row" style="display: none; padding-top: 6px; width: 100%;">
        <div class="note-input-wrap">
          <input type="text" class="note-inline-input" id="bubble-note-input" placeholder="Type a note...">
          <button class="btn-note-save rip" id="bubble-note-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Style toggles
    this.container.querySelectorAll('.style-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.container.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeStyle = e.currentTarget.dataset.style;
      });
    });

    // Event listeners
    this.container.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const colorKey = e.currentTarget.dataset.color;
        this.applyHighlight(colorKey);
      });
    });

    const noteRow = this.container.querySelector('#bubble-note-row');
    const noteInp = this.container.querySelector('#bubble-note-input');
    const noteSave = this.container.querySelector('#bubble-note-save');

    this.container.querySelector('#bubble-btn-note').addEventListener('click', () => {
      if (noteRow) {
        const isHidden = noteRow.style.display === 'none';
        noteRow.style.display = isHidden ? 'block' : 'none';
        if (isHidden && noteInp) {
          noteInp.focus();
        }
      }
    });

    if (noteSave && noteInp) {
      const commitBubbleNote = () => {
        const note = noteInp.value.trim();
        this.applyHighlight('yellow', note);
        noteInp.value = '';
        if (noteRow) noteRow.style.display = 'none';
      };

      noteSave.addEventListener('click', commitBubbleNote);
      noteInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitBubbleNote();
        }
      });
    }

    this.container.querySelector('#bubble-btn-copy').addEventListener('click', () => {
      const text = this.getSelectedText();
      if (text) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Copied', 'check');
            this.hide();
          }).catch(() => {
            showToast('Copy failed');
            this.hide();
          });
        }
      }
    });

    this.container.querySelector('#bubble-btn-search').addEventListener('click', () => {
      const text = this.getSelectedText();
      this.hide();
      if (text) {
        if (typeof this.onSearchRequest === 'function') {
          this.onSearchRequest(text);
        } else {
          window.dispatchEvent(new CustomEvent('pedif:search', { detail: { query: text } }));
        }
      }
    });

    this.container.querySelector('#bubble-btn-speak').addEventListener('click', () => {
      const text = this.getSelectedText();
      this.hide();
      if (text && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
        showToast('Reading selection', 'star');
      }
    });

    const deleteBtn = this.container.querySelector('#bubble-btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.deleteOverlappingHighlights();
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (!this.container || this.container.style.display === 'none') return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const noteInp = this.container.querySelector('#bubble-note-input');
          if (noteInp && document.activeElement === noteInp) return;
          if (this.overlappingHighlights && this.overlappingHighlights.length > 0) {
            e.preventDefault();
            this.deleteOverlappingHighlights();
          }
        }
      });
    }
  }

  deleteOverlappingHighlights() {
    if (this.overlappingHighlights && this.overlappingHighlights.length > 0) {
      const count = this.overlappingHighlights.length;
      highlightManager.removeHighlights(this.overlappingHighlights);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(8);
      }
      showToast(`Removed ${count} highlight${count > 1 ? 's' : ''} (Ctrl+Z to undo)`, 'trash');
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      this.hide();
    }
  }

  getSelectedText() {
    if (this.currentSelection && this.currentSelection.text) {
      return this.currentSelection.text;
    }
    const sel = window.getSelection();
    return sel ? String(sel).trim() : '';
  }

  showAtRange(data) {
    this.currentSelection = data;
    if (!data || !data.bounds) {
      this.hide();
      return;
    }

    // Detect if selection intersects any existing highlights on this page
    const pageEl = data.pageEl || (typeof document !== 'undefined' ? document.getElementById(`page-${data.pageNum}`) : null);
    const pageRect = pageEl ? pageEl.getBoundingClientRect() : null;
    const itemsToCheck = (data.chars && data.chars.length) ? data.chars : (data.rects || (data.range ? Array.from(data.range.getClientRects()) : []));
    this.overlappingHighlights = highlightManager.findOverlappingHighlights(data.pageNum, itemsToCheck, pageRect);

    const deleteBtn = this.container.querySelector('#bubble-btn-delete');
    if (deleteBtn) {
      deleteBtn.style.display = (this.overlappingHighlights && this.overlappingHighlights.length > 0) ? 'inline-flex' : 'none';
    }

    const bounds = data.bounds;
    this.container.style.display = 'flex';

    const bubbleWidth = this.container.offsetWidth || 340;
    const bubbleHeight = this.container.offsetHeight || 46;
    let left = bounds.left + bounds.width / 2 - bubbleWidth / 2;
    let top = bounds.top - bubbleHeight - 14;

    if (top < 64) {
      top = bounds.bottom + 14;
    }

    left = Math.max(16, Math.min(window.innerWidth - bubbleWidth - 16, left));
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
  }

  show(selectionData) {
    if (!selectionData) {
      this.hide();
      return;
    }
    if (selectionData.range && selectionData.bounds) {
      this.showAtRange(selectionData);
      return;
    }

    this.currentSelection = selectionData;
    if (!selectionData.chars || !selectionData.chars.length) {
      this.hide();
      return;
    }

    const bounds = selectionData.bounds || this.computeBounds(selectionData.chars);
    if (!bounds) return;

    this.showAtRange({
      ...selectionData,
      bounds,
    });
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

  applyHighlight(colorKey, note = '') {
    if (!this.currentSelection) return;
    const { pageNum, range, pageEl, chars, text } = this.currentSelection;

    if (chars && chars.length > 0) {
      // 1. Prioritize precision normalized character quads from glyph engine
      highlightManager.createHighlight(pageNum, chars, colorKey, note, this.activeStyle || 'highlight');
    } else if (range && pageEl) {
      // 2. Fallback: Calculate normalized scale-invariant quads from browser selection rects
      const pageRect = pageEl.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      const quads = [];

      clientRects.forEach(rect => {
        const minX = Math.max(0, Math.min(1, (rect.left - pageRect.left) / pageRect.width));
        const maxX = Math.max(0, Math.min(1, (rect.right - pageRect.left) / pageRect.width));
        const minY = Math.max(0, Math.min(1, (rect.top - pageRect.top) / pageRect.height));
        const maxY = Math.max(0, Math.min(1, (rect.bottom - pageRect.top) / pageRect.height));

        quads.push({
          lt: { x: minX, y: minY },
          rt: { x: maxX, y: minY },
          rb: { x: maxX, y: maxY },
          lb: { x: minX, y: maxY },
          isNormalized: true,
        });
      });

      if (quads.length > 0) {
        highlightManager.createHighlightFromQuads(pageNum, quads, text || this.getSelectedText(), colorKey, note, this.activeStyle || 'highlight');
      }
    }

    // Dismiss selection cleanly
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(6);
    }

    const label = (this.activeStyle || 'highlight').charAt(0).toUpperCase() + (this.activeStyle || 'highlight').slice(1);
    showToast(`${label} added`, 'check');
    this.hide();

    // Trigger overlay clear event
    window.dispatchEvent(new CustomEvent('clear-selection', { detail: { pageNum } }));
  }

  hide() {
    this.container.style.display = 'none';
    if (this.currentSelection && this.currentSelection.pageNum) {
      window.dispatchEvent(new CustomEvent('clear-selection', { detail: { pageNum: this.currentSelection.pageNum } }));
    }
    this.currentSelection = null;
  }
}
