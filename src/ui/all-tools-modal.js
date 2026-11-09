/**
 * Expanded "All Tools" Mega-Catalog Modal
 * Categorizes all tools under standard categories with instant search filter,
 * card-lift elevation physics, and direct command execution.
 */

export class AllToolsModal {
  constructor(options = {}) {
    this.app = options.app || null;
    this.isOpen = false;
    this.container = null;
    this.searchInput = null;
    this.catalogGrid = null;

    this.toolCategories = [
      {
        id: 'create_edit',
        title: 'Create & Edit',
        hue: 'var(--cat-pink)',
        tools: [
          {
            id: 'organize',
            label: 'Organize Pages',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
            desc: 'Rearrange, rotate, delete, insert blank pages, and duplicate sheets in a visual grid.',
            action: () => this.app?.openOrganize?.(),
          },
          {
            id: 'combine',
            label: 'Combine Files',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
            desc: 'Merge multiple PDF documents or chapters into a single coherent file.',
            action: () => this.app?.openMerge?.(),
          },
          {
            id: 'extract',
            label: 'Extract Pages',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            desc: 'Extract specific page numbers or custom intervals (e.g. 1-3, 5, 8) into a fresh PDF.',
            action: () => this.app?.openExtract?.(),
          },
          {
            id: 'crop',
            label: 'Interactive Crop',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>',
            desc: 'Crop margins and headers with live draggable visual crop guides.',
            action: () => this.app?.openCrop?.(),
          },
          {
            id: 'watermark',
            label: 'Watermark',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
            desc: 'Inject diagonal or horizontal text watermarks with custom opacity and rotation.',
            action: () => this.app?.openWatermark?.(),
          },
          {
            id: 'bates',
            label: 'Bates Numbering',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
            desc: 'Apply sequential legal pagination and case identifier prefix/suffix stamps.',
            action: () => this.app?.openNumbering?.(),
          },
          {
            id: 'rotate_view',
            label: 'Rotate View',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
            desc: 'Rotate viewing canvas 90° clockwise with coordinate-invariant math.',
            action: () => document.getElementById('btn-rotate')?.click(),
          },
        ],
      },
      {
        id: 'review_compare',
        title: 'Review & Compare',
        hue: 'var(--cat-orange)',
        tools: [
          {
            id: 'select_highlight',
            label: 'Text Select & Highlight',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
            desc: 'Sub-character magnetic snapping, continuous text selection, and multi-color markups.',
            action: () => document.getElementById('tool-select')?.click(),
          },
          {
            id: 'vector_pen',
            label: 'Vector Stylus & Pen',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>',
            desc: 'Low-latency inking with palm rejection, Apple Pencil / S-Pen tilt, and geometric snapping.',
            action: () => document.getElementById('tool-pen')?.click(),
          },
          {
            id: 'rubber_stamp',
            label: 'Rubber Stamps',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4"/></svg>',
            desc: 'Stamp APPROVED, CONFIDENTIAL, DRAFT, VOID, or custom legal status marks.',
            action: () => this.app?.openStamp?.(),
          },
          {
            id: 'area_ocr',
            label: 'On-Device AI OCR',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/><path d="M8 12h8M12 8v8"/></svg>',
            desc: 'WebGPU-accelerated PP-OCRv4 text recognition snippet extractor.',
            action: () => document.getElementById('tool-ocr')?.click(),
          },
          {
            id: 'find_text',
            label: 'Full-Text Search',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
            desc: 'Multi-word phrase search across all pages with jump-to-match highlights.',
            action: () => document.getElementById('btn-search')?.click(),
          },
        ],
      },
      {
        id: 'forms_signatures',
        title: 'Forms & Signatures',
        hue: 'var(--cat-purple)',
        tools: [
          {
            id: 'digital_sign',
            label: 'Digital Signature Studio',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 19.5c-3 0-5-2-7-5s-4-6-7-6c-2 0-3 1-3 3s2 3 5 3c4 0 7-3 9-6"/></svg>',
            desc: 'Draw vector ink signature, choose calligraphy styles, or import transparent seal.',
            action: () => this.app?.openSignature?.(),
          },
          {
            id: 'inspect_forms',
            label: 'Interactive Form Fields',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
            desc: 'Inspect, fill, and flatten interactive AcroForm text fields, checkboxes, and buttons.',
            action: () => this.app?.sidebar?.switchTab('forms'),
          },
        ],
      },
      {
        id: 'protect_standardize',
        title: 'Protect & Standardize',
        hue: 'var(--cat-teal)',
        tools: [
          {
            id: 'sanitize_doc',
            label: 'Sanitize Document',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            desc: 'Inspect and purge private author metadata, GPS streams, revisions, and hidden attachments.',
            action: () => this.app?.openSanitize?.(),
          },
          {
            id: 'doc_properties',
            label: 'Document Technical Properties',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
            desc: 'View PDF version, security permissions, encryption ciphers, dimensions, and metadata.',
            action: () => this.app?.openMetadata?.(),
          },
          {
            id: 'export_iso',
            label: 'ISO 32000-1 Standard Export',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
            desc: 'Produce compliant /Highlight with /QuadPoints and /Ink annotations for Acrobat/Preview.',
            action: () => document.getElementById('btn-export')?.click(),
          },
        ],
      },
      {
        id: 'customize_automate',
        title: 'Customize & Automate',
        hue: 'var(--cat-blue)',
        tools: [
          {
            id: 'cmd_palette',
            label: 'Command Palette',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
            desc: 'Global Spotlight-style keyboard search across all 184 commands and tools.',
            action: () => this.app?.commandPalette?.open(),
          },
          {
            id: 'doc_stats',
            label: 'Document Statistics & Analytics',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
            desc: 'View character count, word density, reading time estimates, and annotation counters.',
            action: () => this.app?.statsModal?.show(),
          },
          {
            id: 'shortcuts_ref',
            label: 'Keyboard Shortcuts Reference',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            desc: 'Comprehensive keyboard accelerator shortcuts cheat sheet for power users.',
            action: () => this.app?.shortcutsModal?.show(),
          },
          {
            id: 'zen_mode',
            label: 'Zen Focus Mode',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
            desc: 'Distraction-free pure canvas mode with hidden toolbars.',
            action: () => this.app?.toggleZenMode?.(),
          },
        ],
      },
    ];

    this.initDOM();
  }

  initDOM() {
    if (typeof document === 'undefined') return;

    let el = document.getElementById('all-tools-catalog-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'all-tools-catalog-modal';
      el.className = 'craft-alltools-overlay';
      el.hidden = true;
      el.style.display = 'none';
      el.classList.remove('open');
      el.innerHTML = `
        <div class="craft-alltools-container" role="dialog" aria-modal="true" aria-label="All Tools">
          <header class="craft-alltools-header">
            <div class="craft-alltools-title-area">
              <div class="craft-alltools-title-badge">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </div>
              <div>
                <h2>All tools</h2>
                <p>Complete sovereign PDF workbench capabilities</p>
              </div>
            </div>

            <div class="craft-alltools-search-box">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="craft-alltools-search-input" placeholder="Search tools and commands..." autocomplete="off" />
            </div>

            <button type="button" class="craft-alltools-close-btn" title="Collapse (Esc)" aria-label="Collapse all tools">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </header>

          <div class="craft-alltools-scroll-body">
            <div class="craft-alltools-categories"></div>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }

    this.container = el;
    this.searchInput = el.querySelector('.craft-alltools-search-input');
    this.catalogGrid = el.querySelector('.craft-alltools-categories');

    // Close button
    el.querySelector('.craft-alltools-close-btn').addEventListener('click', () => {
      this.close();
    });

    // Close on click outside
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        this.close();
      }
    });

    // Search filter
    this.searchInput.addEventListener('input', () => {
      this.renderCategories(this.searchInput.value);
    });

    // Keyboard ESC to close
    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.container.hidden = false;
    this.container.style.display = 'flex';
    this.container.classList.add('open');
    this.searchInput.value = '';
    this.renderCategories('');
    requestAnimationFrame(() => {
      this.searchInput.focus();
    });
  }

  close() {
    this.isOpen = false;
    this.container.hidden = true;
    this.container.style.display = 'none';
    this.container.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  renderCategories(query = '') {
    const q = (query || '').trim().toLowerCase();
    let html = '';
    let matchesCount = 0;

    this.toolCategories.forEach((cat) => {
      const filteredTools = cat.tools.filter((t) => {
        if (!q) return true;
        return (
          t.label.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
        );
      });

      if (filteredTools.length === 0) return;
      matchesCount += filteredTools.length;

      html += `
        <section class="craft-alltools-category-section" style="--cat-hue: ${cat.hue}">
          <div class="craft-alltools-category-header">
            <span class="craft-alltools-cat-pill"></span>
            <h3>${cat.title}</h3>
            <span class="craft-alltools-cat-count">${filteredTools.length}</span>
          </div>

          <div class="craft-alltools-cards-grid">
            ${filteredTools
              .map(
                (tool) => `
              <div class="craft-tool-tile" data-tool-id="${tool.id}" role="button" tabindex="0">
                <div class="craft-tool-tile-top">
                  <div class="craft-tool-tile-icon" style="color: ${cat.hue}">
                    ${tool.icon}
                  </div>
                  <span class="craft-tool-tile-arrow">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="7" y1="17" x2="17" y2="7"></line>
                      <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                  </span>
                </div>
                <div class="craft-tool-tile-info">
                  <strong>${tool.label}</strong>
                  <p>${tool.desc}</p>
                </div>
                <div class="craft-tool-tile-action">
                  <span>Use now</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </section>
      `;
    });

    if (matchesCount === 0) {
      html = `
        <div class="craft-alltools-empty">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <p>No tools match "<strong>${query}</strong>"</p>
          <small>Check your spelling or search by general keyword like "Page", "Sign", "OCR", or "Export".</small>
        </div>
      `;
    }

    this.catalogGrid.innerHTML = html;

    // Attach click handlers
    this.catalogGrid.querySelectorAll('.craft-tool-tile').forEach((tileEl) => {
      const toolId = tileEl.dataset.toolId;
      const toolObj = this.toolCategories
        .flatMap((c) => c.tools)
        .find((t) => t.id === toolId);

      const runTool = () => {
        this.close();
        if (toolObj && typeof toolObj.action === 'function') {
          toolObj.action();
        }
      };

      tileEl.addEventListener('click', runTool);
      tileEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          runTool();
        }
      });
    });
  }
}
