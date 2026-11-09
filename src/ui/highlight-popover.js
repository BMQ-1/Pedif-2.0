/**
 * Apple-Grade Highlight Contextual Popover
 * Floats directly above any clicked permanent highlight, providing:
 * 1. Instant color switching (Yellow, Coral, Green, Blue, Purple)
 * 2. Inline note viewer & editor (Zero browser prompts)
 * 3. Quick Copy text
 * 4. One-tap Delete with Undo (Zero browser confirms)
 */

import { highlightManager, PALETTE } from '../annotations/highlight-manager.js';
import { showToast } from './toast.js';

export class HighlightPopover {
  constructor() {
    this.container = null;
    this.activeAnnotation = null;
    this.activePageNum = null;
    this.isEditingNote = false;

    if (typeof document !== 'undefined') {
      this.render();
      this.bindGlobalDismiss();
    }
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'highlight-popover glass';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  bindGlobalDismiss() {
    document.addEventListener('pointerdown', (e) => {
      if (!this.container || this.container.style.display === 'none') return;
      if (this.container.contains(e.target) || e.target.closest('.permanent-highlight')) {
        return;
      }
      this.hide();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.container || this.container.style.display === 'none') return;
      if (e.key === 'Escape') {
        this.hide();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !this.isEditingNote) {
        const activeInp = document.activeElement;
        if (activeInp && (activeInp.tagName === 'INPUT' || activeInp.tagName === 'TEXTAREA')) return;
        if (this.activeAnnotation) {
          e.preventDefault();
          const id = this.activeAnnotation.id;
          highlightManager.removeHighlight(id);
          showToast('Highlight deleted (Ctrl+Z to undo)', 'trash');
          this.hide();
        }
      }
    });
  }

  showForHighlight(ann, pageNum, clickEvent) {
    this.activeAnnotation = ann;
    this.activePageNum = pageNum;
    this.isEditingNote = false;

    if (typeof document !== 'undefined') {
      document.querySelectorAll('.permanent-highlight.highlight-selected').forEach(el => el.classList.remove('highlight-selected'));
      const activeEl = document.querySelector(`.permanent-highlight[data-ann-id="${ann.id}"]`);
      if (activeEl) activeEl.classList.add('highlight-selected');
    }

    this.updateContent();
    this.container.style.display = 'flex';

    // Position above target or click event
    const popoverWidth = 280;
    const popoverHeight = this.activeAnnotation.note ? 110 : 48;
    const clientX = clickEvent.clientX;
    const clientY = clickEvent.clientY;

    let left = clientX - popoverWidth / 2;
    let top = clientY - popoverHeight - 16;

    if (top < 64) {
      top = clientY + 24;
    }

    left = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, left));
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
  }

  updateContent() {
    if (!this.activeAnnotation) return;
    const ann = this.activeAnnotation;

    const chipsHtml = Object.keys(PALETTE).map(key => {
      const p = PALETTE[key];
      const isSelected = ann.color.toLowerCase() === p.color.toLowerCase();
      return `<button class="color-chip ${isSelected ? 'active-chip' : ''}" data-color="${key}" style="background-color: ${p.color};" title="${p.label}"></button>`;
    }).join('');

    const hasNote = !!(ann.note && ann.note.trim());

    this.container.innerHTML = `
      <div class="popover-main-row">
        <div class="popover-colors">
          ${chipsHtml}
        </div>
        <div class="popover-divider"></div>
        <button class="b sm rip popover-btn" id="popover-btn-note" title="${hasNote ? 'Edit Note' : 'Add Note'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;${hasNote ? 'color:var(--accent);' : ''}">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="b sm rip popover-btn" id="popover-btn-copy" title="Copy Highlight Text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="b sm rip popover-btn btn-danger" id="popover-btn-delete" title="Delete Highlight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;color:#ff3b30;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="popover-note-area" id="popover-note-area" style="${this.isEditingNote || hasNote ? 'display:block;' : 'display:none;'}">
        <div class="note-input-wrap">
          <input type="text" class="note-inline-input" id="popover-note-input" placeholder="Type a note..." value="${this.escapeHtml(ann.note || '')}">
          <button class="btn-note-save rip" id="popover-btn-note-save">Save</button>
        </div>
      </div>
    `;

    // Bind swatches
    this.container.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const colorKey = e.currentTarget.dataset.color;
        highlightManager.updateColor(ann.id, colorKey);
        this.updateContent();
        showToast('Color updated', 'check');
      });
    });

    // Toggle note editor
    const noteBtn = this.container.querySelector('#popover-btn-note');
    if (noteBtn) {
      noteBtn.addEventListener('click', () => {
        this.isEditingNote = !this.isEditingNote;
        const area = this.container.querySelector('#popover-note-area');
        if (area) {
          area.style.display = this.isEditingNote ? 'block' : 'none';
          if (this.isEditingNote) {
            const inp = area.querySelector('#popover-note-input');
            if (inp) {
              inp.focus();
              inp.select();
            }
          }
        }
      });
    }

    // Save note
    const saveNoteBtn = this.container.querySelector('#popover-btn-note-save');
    const noteInput = this.container.querySelector('#popover-note-input');
    if (saveNoteBtn && noteInput) {
      const commitNote = () => {
        const newNote = noteInput.value.trim();
        highlightManager.updateNote(ann.id, newNote);
        showToast(newNote ? 'Note saved' : 'Note cleared', 'check');
        this.isEditingNote = false;
        this.updateContent();
      };

      saveNoteBtn.addEventListener('click', commitNote);
      noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitNote();
        }
      });
    }

    // Copy text
    const copyBtn = this.container.querySelector('#popover-btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (ann.text && navigator.clipboard) {
          navigator.clipboard.writeText(ann.text).then(() => {
            showToast('Copied text', 'check');
            this.hide();
          });
        }
      });
    }

    // Delete highlight with single click & undo
    const delBtn = this.container.querySelector('#popover-btn-delete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        highlightManager.removeHighlight(ann.id);
        showToast('Highlight deleted (Ctrl+Z to undo)', 'trash');
        this.hide();
      });
    }
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  hide() {
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.permanent-highlight.highlight-selected').forEach(el => el.classList.remove('highlight-selected'));
    }
    if (this.container) {
      this.container.style.display = 'none';
    }
    this.activeAnnotation = null;
    this.isEditingNote = false;
  }
}

export const highlightPopover = new HighlightPopover();
