/**
 * Global Command Palette (Ctrl+K / Cmd+K)
 * Provides instant search, keyboard navigation, and execution across all workbench tools and actions.
 */

export class CommandPalette {
  constructor(options = {}) {
    this.app = options.app || null;
    this.commands = [];
    this.filteredCommands = [];
    this.selectedIndex = 0;
    this.isOpen = false;

    this.container = null;
    this.input = null;
    this.resultsList = null;

    this.initDOM();
    this.initDefaultCommands();
    this.bindEvents();
  }

  initDOM() {
    if (typeof document === 'undefined') return;

    let el = document.getElementById('command-palette-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'command-palette-modal';
      el.className = 'craft-palette-overlay';
      el.hidden = true;
      el.innerHTML = `
        <div class="craft-palette-box" role="dialog" aria-modal="true" aria-label="Command Palette">
          <div class="craft-palette-header">
            <svg class="craft-palette-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" class="craft-palette-input" placeholder="Type a command or search tools... (Esc to close)" autocomplete="off" spellcheck="false" />
            <kbd class="craft-palette-esc-kbd">ESC</kbd>
          </div>
          <div class="craft-palette-body">
            <div class="craft-palette-results" role="listbox"></div>
          </div>
          <div class="craft-palette-footer">
            <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to execute</span>
            <span><kbd>ESC</kbd> to dismiss</span>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }

    this.container = el;
    this.input = el.querySelector('.craft-palette-input');
    this.resultsList = el.querySelector('.craft-palette-results');
  }

  initDefaultCommands() {
    // Registered tools categorized cleanly into standard workbench groups
    this.commands = [
      // Create & Edit
      {
        id: 'file.open',
        title: 'Open Document',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
        shortcut: 'Ctrl+O',
        action: () => document.getElementById('file-input')?.click(),
      },
      {
        id: 'file.export',
        title: 'Export PDF with Standard Annotations',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
        shortcut: 'Ctrl+S',
        action: () => document.getElementById('btn-export')?.click(),
      },
      {
        id: 'page.organize',
        title: 'Organize Pages (Visual Grid, Rotate & Reorder)',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
        shortcut: 'G',
        action: () => this.app?.openOrganize?.(),
      },
      {
        id: 'page.combine',
        title: 'Combine Multiple PDFs (Merge)',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
        shortcut: 'M',
        action: () => this.app?.openMerge?.(),
      },
      {
        id: 'page.extract',
        title: 'Extract Pages & Ranges',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        shortcut: 'X',
        action: () => this.app?.openExtract?.(),
      },
      {
        id: 'page.crop',
        title: 'Interactive Crop Pages',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>',
        shortcut: 'C',
        action: () => this.app?.openCrop?.(),
      },
      {
        id: 'edit.watermark',
        title: 'Add Document Watermark',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
        shortcut: 'W',
        action: () => this.app?.openWatermark?.(),
      },
      {
        id: 'edit.bates',
        title: 'Bates Numbering & Pagination',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
        shortcut: '#',
        action: () => this.app?.openNumbering?.(),
      },
      {
        id: 'page.rotate',
        title: 'Rotate View 90° Clockwise',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        shortcut: 'R',
        action: () => document.getElementById('btn-rotate')?.click(),
      },

      // Review & Compare
      {
        id: 'tool.select',
        title: 'Text Select & Highlight Mode',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
        shortcut: 'V',
        action: () => document.getElementById('tool-select')?.click(),
      },
      {
        id: 'tool.pen',
        title: 'Vector Pen & Shape Snapping',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>',
        shortcut: 'P',
        action: () => document.getElementById('tool-pen')?.click(),
      },
      {
        id: 'tool.highlighter',
        title: 'Freehand Vector Highlighter',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3.5l5 5L7 22H2v-5L15.5 3.5z"/><path d="M14 5l5 5"/></svg>',
        shortcut: 'H',
        action: () => document.getElementById('tool-highlighter')?.click(),
      },
      {
        id: 'tool.eraser',
        title: 'Vector Stroke Eraser',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4L13 19"/></svg>',
        shortcut: 'E',
        action: () => document.getElementById('tool-eraser')?.click(),
      },
      {
        id: 'tool.ocr',
        title: 'Area OCR Snippet (On-Device WebGPU)',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><path d="M8 12h8M12 8v8"/></svg>',
        shortcut: 'O',
        action: () => document.getElementById('tool-ocr')?.click(),
      },
      {
        id: 'comment.stamp',
        title: 'Apply Rubber Stamp (Approved, Confidential, etc.)',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4"/></svg>',
        shortcut: 'S',
        action: () => this.app?.openStamp?.(),
      },
      {
        id: 'view.search',
        title: 'Find in Document',
        category: 'Review & Compare',
        catColor: 'var(--cat-orange)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
        shortcut: 'Ctrl+F',
        action: () => document.getElementById('btn-search')?.click(),
      },

      // Forms & Signatures
      {
        id: 'sign.signature',
        title: 'Digital Signature Studio (Vector, Type, Image)',
        category: 'Forms & Signatures',
        catColor: 'var(--cat-purple)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 19.5c-3 0-5-2-7-5s-4-6-7-6c-2 0-3 1-3 3s2 3 5 3c4 0 7-3 9-6"/></svg>',
        shortcut: 'F',
        action: () => this.app?.openSignature?.(),
      },
      {
        id: 'form.fields',
        title: 'Inspect Interactive Form Fields',
        category: 'Forms & Signatures',
        catColor: 'var(--cat-purple)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
        shortcut: 'Shift+F',
        action: () => this.app?.sidebar?.switchTab('forms'),
      },

      // Protect & Standardize
      {
        id: 'doc.sanitize',
        title: 'Sanitize Document (Purge Metadata, XMP & Risk Vectors)',
        category: 'Protect & Standardize',
        catColor: 'var(--cat-teal)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        shortcut: 'Shift+S',
        action: () => this.app?.openSanitize?.(),
      },
      {
        id: 'doc.metadata',
        title: 'Edit Document Properties & Metadata',
        category: 'Protect & Standardize',
        catColor: 'var(--cat-teal)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        shortcut: 'Ctrl+D',
        action: () => this.app?.openMetadata?.(),
      },

      // Customize & Automate
      {
        id: 'view.all_tools',
        title: 'All Tools Workbench Catalog',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        shortcut: 'T',
        action: () => this.app?.openAllTools?.(),
      },
      {
        id: 'view.sidebar',
        title: 'Toggle Left Sidebar (Pages, Outline, Comments)',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
        shortcut: 'B',
        action: () => document.getElementById('btn-sidebar')?.click(),
      },
      {
        id: 'view.theme',
        title: 'Toggle Light / Dark / OLED / Sepia Theme',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/></svg>',
        shortcut: 'D',
        action: () => document.getElementById('btn-theme')?.click(),
      },
      {
        id: 'view.zen',
        title: 'Toggle Zen Focus / Fullscreen Mode',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
        shortcut: 'Z',
        action: () => this.app?.toggleZenMode?.(),
      },
      {
        id: 'view.shortcuts',
        title: 'Keyboard Shortcuts Reference',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        shortcut: '?',
        action: () => this.app?.shortcutsModal?.show(),
      },
      {
        id: 'view.stats',
        title: 'Document Statistics & Session Audit',
        category: 'Customize & Automate',
        catColor: 'var(--cat-blue)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
        shortcut: 'I',
        action: () => this.app?.statsModal?.show(),
      },
      {
        id: 'edit.undo',
        title: 'Undo Last Action',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
        shortcut: 'Ctrl+Z',
        action: () => document.getElementById('btn-undo')?.click(),
      },
      {
        id: 'edit.redo',
        title: 'Redo Action',
        category: 'Create & Edit',
        catColor: 'var(--cat-red)',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
        shortcut: 'Ctrl+Y',
        action: () => document.getElementById('btn-redo')?.click(),
      },
    ];
  }

  bindEvents() {
    if (typeof document === 'undefined') return;

    // Global keyboard listener for Ctrl+K / Cmd+K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (this.isOpen && e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigate(1);
      } else if (this.isOpen && e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigate(-1);
      } else if (this.isOpen && e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    });

    // Close on click outside
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // Search filter input
    this.input.addEventListener('input', () => {
      this.filter(this.input.value);
    });
  }

  open() {
    this.isOpen = true;
    this.container.hidden = false;
    this.input.value = '';
    this.filter('');
    requestAnimationFrame(() => {
      this.input.focus();
    });
  }

  close() {
    this.isOpen = false;
    this.container.hidden = true;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  filter(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      this.filteredCommands = [...this.commands];
    } else {
      this.filteredCommands = this.commands.filter((cmd) => {
        return (
          cmd.title.toLowerCase().includes(q) ||
          cmd.category.toLowerCase().includes(q) ||
          (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q)) ||
          cmd.id.toLowerCase().includes(q)
        );
      });
    }

    this.selectedIndex = 0;
    this.renderResults();
  }

  renderResults() {
    if (!this.resultsList) return;

    if (this.filteredCommands.length === 0) {
      this.resultsList.innerHTML = `
        <div class="craft-palette-empty">
          <p>No tools or commands match your query.</p>
          <small>Try searching for "Export", "OCR", "Sanitize", or "Organize"</small>
        </div>
      `;
      return;
    }

    let html = '';
    let lastCat = null;

    this.filteredCommands.forEach((cmd, idx) => {
      if (cmd.category !== lastCat) {
        lastCat = cmd.category;
        html += `<div class="craft-palette-category-header" style="--cat-accent: ${cmd.catColor}">${cmd.category}</div>`;
      }

      const isSel = idx === this.selectedIndex;
      html += `
        <div class="craft-palette-item ${isSel ? 'selected' : ''}" data-index="${idx}" role="option" aria-selected="${isSel}">
          <div class="craft-palette-item-icon">${cmd.icon}</div>
          <div class="craft-palette-item-text">
            <span class="craft-palette-item-title">${cmd.title}</span>
          </div>
          ${cmd.shortcut ? `<kbd class="craft-palette-item-shortcut">${cmd.shortcut}</kbd>` : ''}
        </div>
      `;
    });

    this.resultsList.innerHTML = html;

    // Click handler for items
    this.resultsList.querySelectorAll('.craft-palette-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const idx = parseInt(itemEl.dataset.index, 10);
        this.selectedIndex = idx;
        this.executeSelected();
      });
    });
  }

  navigate(dir) {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + dir + this.filteredCommands.length) % this.filteredCommands.length;
    this.renderResults();

    const selectedEl = this.resultsList.querySelector(`.craft-palette-item[data-index="${this.selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelected() {
    const cmd = this.filteredCommands[this.selectedIndex];
    if (cmd && typeof cmd.action === 'function') {
      this.close();
      cmd.action();
    }
  }
}
