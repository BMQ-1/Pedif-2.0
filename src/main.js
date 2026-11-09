import './styles/app.css';
import './styles/viewer.css';
import './styles/workbench.css';
import { i18n } from './i18n/i18n.js';
import { PageOrganizer } from './organizer/page-organizer.js';
import { MergeTool } from './tools/merge-tool.js';
import { WatermarkDialog } from './tools/watermark-dialog.js';
import { NumberingDialog } from './tools/numbering-dialog.js';
import { MetadataDialog } from './tools/metadata-dialog.js';
import { autosave } from './storage/autosave.js';
import { libraryStore, toValidArrayBuffer } from './storage/library.js';
import { pdfEngine } from './core/pdf-engine.js';
import { VirtualViewer } from './core/virtual-viewer.js';
import { searchEngine } from './core/search-engine.js';
import { commandStack } from './core/command-stack.js';
import { SearchBar } from './ui/search-bar.js';
import { SelectionBubble } from './ui/selection-bubble.js';
import { InkEngine } from './inking/ink-engine.js';
import { Stroke } from './inking/stroke-model.js';
import { highlightManager } from './annotations/highlight-manager.js';
import { SnippetTool } from './ui/snippet-tool.js';
import { ocrManager } from './ocr/ocr-manager.js';
import { PdfExporter } from './annotations/pdf-exporter.js';
import { Sidebar } from './ui/sidebar.js';
import { ShortcutsModal } from './ui/shortcuts-modal.js';
import { InkToolbar } from './ui/ink-toolbar.js';
import { HomeLibrary } from './ui/home-library.js';
import { Dock } from './ui/dock.js';
import { Scrubber } from './ui/scrubber.js';
import { showToast } from './ui/toast.js';
import { createShowcasePdf } from './core/sample-document.js';
import { SmartScanner } from './ui/smart-scanner.js';
import { passwordDialog } from './ui/password-dialog.js';
import { CropTool } from './ui/crop-tool.js';
import { LassoTool } from './inking/lasso-tool.js';
import { ExtractDialog } from './ui/extract-dialog.js';
import { StatsModal } from './ui/stats-modal.js';
import { SignatureDialog } from './tools/signature-dialog.js';
import { StampDialog } from './tools/stamp-dialog.js';

// Sovereign UI Guard: Intercept any accidental browser modal alerts and route to non-blocking studio toast
if (typeof window !== 'undefined') {
  window.alert = (msg) => {
    console.warn('[Pedif] Intercepted browser alert modal:', msg);
    showToast(String(msg), 'alert', 3500);
  };
}

class PedifApp {
  constructor() {
    this.currentDoc = null;
    this.currentMode = 'select'; // 'select' | 'pen' | 'highlighter' | 'eraser' | 'ocr'
    this.activeTheme = localStorage.getItem('pedif:theme') || 'light';
    this.themes = ['light', 'dark', 'oled', 'sepia'];
    this.viewer = null;
    this.sidebar = null;
    this.shortcutsModal = null;
    this.searchBar = null;
    this.selectionBubble = null;
    this.inkEngine = null;
    this.inkToolbar = null;
    this.snippetTool = null;
    this.homeLibrary = null;
    this.dock = null;
    this.scrubber = null;
    this.smartScanner = null;
    this.cropTool = null;
    this.lassoTool = null;
    this.extractDialog = null;
    this.statsModal = null;
    this.pageOrganizer = null;
    this.mergeTool = null;
    this.watermarkDialog = null;
    this.numberingDialog = null;
    this.metadataDialog = null;
    this.signatureDialog = null;
    this.stampDialog = null;

    this.init();
  }

  async init() {
    // 1. Initialize offline autosave and library
    await autosave.init();
    await libraryStore.init();

    // 2. Initialize Home Library View
    this.homeLibrary = new HomeLibrary({
      container: document.getElementById('libwrap'),
      dropzone: document.getElementById('drop'),
      fileInput: document.getElementById('file-input'),
      onOpenFile: (file) => this.handleFileOpen(file),
      onOpenDocument: (docRecord) => this.loadPdfBuffer(docRecord.buffer, docRecord.name, docRecord.state),
      onOpenSample: async () => {
        try {
          showToast('Generating interactive showcase PDF...', 'info');
          const sampleBuf = await createShowcasePdf();
          await this.loadPdfBuffer(sampleBuf, 'Pedif-2.0-Showcase.pdf');
          showToast('Showcase loaded! Enjoy testing text highlights & inking.', 'check');
        } catch (err) {
          console.error('[Pedif] Error opening sample PDF:', err);
          showToast('Failed to open sample: ' + err.message, 'alert');
        }
      },
    });

    // 4. Initialize Selection Bubble & Shortcuts Modal
    this.selectionBubble = new SelectionBubble({
      onSearchRequest: (query) => {
        if (this.searchBar) {
          this.searchBar.openWithQuery(query);
        }
      },
    });
    this.shortcutsModal = new ShortcutsModal();

    // 5. Initialize 3-Tier Virtual Viewer
    const viewportContainer = document.getElementById('viewport-container');
    this.viewer = new VirtualViewer({
      container: viewportContainer,
      onPageChange: (current, total) => this.updatePageIndicator(current, total),
      onSelectionEnd: (sel) => {
        if (this.currentMode === 'select' && sel) {
          this.selectionBubble.show(sel);
        } else {
          this.selectionBubble.hide();
        }
      },
      onZoomChange: (scale) => {
        if (this.dock) this.dock.updateZoom(scale);
      },
    });

    // 6. Initialize Floating Dock & Scrubber
    this.dock = new Dock({
      viewer: this.viewer,
      onJumpPage: (pNum) => this.viewer.scrollToPage(pNum),
      onZoomChange: (scale) => this.viewer.setScale(scale),
    });

    this.scrubber = new Scrubber({
      onJumpPage: (pNum) => this.viewer.scrollToPage(pNum),
    });

    // 7. Initialize Sidebar
    this.sidebar = new Sidebar({
      viewer: this.viewer,
      onJumpToPage: (pNum) => this.viewer.scrollToPage(pNum),
    });

    // 8. Initialize Vector Inking & Ergonomics Engine
    this.inkEngine = new InkEngine({
      viewer: this.viewer,
      activeTool: this.currentMode,
    });
    this.inkToolbar = new InkToolbar({
      inkEngine: this.inkEngine,
    });

    // 9. Initialize Area OCR Snippet Tool
    this.snippetTool = new SnippetTool({
      viewer: this.viewer,
    });

    // 10. Initialize Unified Search Bar
    this.searchBar = new SearchBar({
      onMatchSelect: (match) => {
        if (match) {
          this.viewer.scrollToPage(match.pageNum);
        }
      },
    });

    // 11. Initialize Precision Stylus Lasso & Smart Tools
    this.smartScanner = new SmartScanner({ viewer: this.viewer });
    this.cropTool = new CropTool({ viewer: this.viewer });
    this.lassoTool = new LassoTool({ viewer: this.viewer });
    this.extractDialog = new ExtractDialog({
      getPdfBuffer: async () => await this.getAnnotatedPdfBuffer(),
      getCurrentPage: () => this.viewer?.currentPage || 1,
      getTotalPages: () => pdfEngine.numPages || 1,
      getDocName: () => this.currentDoc?.name || 'Document.pdf',
    });
    this.statsModal = new StatsModal({
      getCurrentPage: () => this.viewer?.currentPage || 1,
      getTotalPages: () => pdfEngine.numPages || 1,
      getDocName: () => this.currentDoc?.name || 'Document.pdf',
    });

    // 12. Initialize Sovereign Workbench & Globalization Studio
    this.pageOrganizer = new PageOrganizer({
      onApplied: async (newBytes) => {
        showToast('Updating document layout...', 'check');
        highlightManager.clearAll();
        if (this.viewer && this.viewer.pageStrokes) {
          this.viewer.pageStrokes.clear();
        }
        await this.loadPdfBuffer(newBytes, this.currentDoc?.name || 'reordered.pdf');
      },
    });

    this.mergeTool = new MergeTool({
      onMerged: async (mergedBytes, outName) => {
        showToast('Loading combined document...', 'check');
        await this.loadPdfBuffer(mergedBytes, outName);
      },
    });

    this.watermarkDialog = new WatermarkDialog({
      onApplied: async (wmBytes) => {
        showToast('Updating with watermark...', 'check');
        await this.loadPdfBuffer(wmBytes, this.currentDoc?.name || 'watermarked.pdf');
      },
    });

    this.numberingDialog = new NumberingDialog({
      onApplied: async (numBytes) => {
        showToast('Updating page numbering...', 'check');
        await this.loadPdfBuffer(numBytes, this.currentDoc?.name || 'numbered.pdf');
      },
    });

    this.metadataDialog = new MetadataDialog({
      onApplied: async (metaBytes) => {
        showToast('Updating document metadata...', 'check');
        await this.loadPdfBuffer(metaBytes, this.currentDoc?.name || 'metadata.pdf');
      },
    });

    this.signatureDialog = new SignatureDialog({
      viewer: this.viewer,
      onSignaturePlaced: (pageNum) => {
        if (this.currentDoc) {
          this.currentDoc.currentPage = pageNum;
        }
      },
    });

    this.stampDialog = new StampDialog({
      onApplied: async (stampedBytes) => {
        showToast('Applying rubber stamp...', 'check');
        await this.loadPdfBuffer(stampedBytes, this.currentDoc?.name || 'stamped.pdf');
      },
    });

    this.setupGlobalization();

    // 12. Setup UI interactions, shortcuts & CommandStack
    this.setupTheme();
    this.setupEventListeners();
    this.setupNativeSelectionHandler();
    this.setupKeyboardShortcuts();
    this.setupCommandStack();

    // 12. Check for unsaved session to restore
    await this.checkRestoreSession();

    // 13. Register sovereign Service Worker for PWA offline operation
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[Pedif SW] Registration non-fatal:', err);
      });
    }

    console.log('[Pedif] App initialized with full Cupertino Studio UI. Cross-Origin Isolated:', window.crossOriginIsolated);
  }

  setupGlobalization() {
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
      langSelect.value = i18n.currentLang;
      langSelect.addEventListener('change', (e) => {
        i18n.setLanguage(e.target.value);
        showToast(`Language: ${e.target.selectedOptions[0]?.text || e.target.value}`, 'check');
      });
    }

    i18n.onChange(() => {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const translated = i18n.t(key);
        if (translated) {
          el.textContent = translated;
        }
      });
    });
  }

  setupTheme() {
    document.documentElement.dataset.theme = this.activeTheme;
  }

  setTheme(themeName) {
    if (!this.themes.includes(themeName)) return;
    this.activeTheme = themeName;
    document.documentElement.dataset.theme = this.activeTheme;
    localStorage.setItem('pedif:theme', this.activeTheme);
    showToast(`Theme: ${this.activeTheme.toUpperCase()}`, 'star');
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.theme-choice-btn').forEach(b => {
        if (b.classList && typeof b.classList.toggle === 'function') {
          b.classList.toggle('active', b.dataset.theme === this.activeTheme);
        }
      });
    }
  }

  toggleTheme() {
    const currentIndex = this.themes.indexOf(this.activeTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    this.setTheme(this.themes[nextIndex]);
  }

  setToolMode(mode) {
    this.currentMode = mode;
    document.querySelectorAll('.top-bar-center .b').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${mode}`);
    if (btn) btn.classList.add('active');

    if (this.selectionBubble) this.selectionBubble.hide();

    if (this.viewer) {
      this.viewer.setTool(mode);
    }
    if (this.inkEngine) {
      this.inkEngine.setTool(mode);
    }
    if (this.inkToolbar) {
      this.inkToolbar.setMode(mode);
    }
    if (this.snippetTool) {
      this.snippetTool.setMode(mode);
    }
    if (this.lassoTool) {
      this.lassoTool.setMode(mode);
    }
  }

  setupCommandStack() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    const updateButtons = (state) => {
      if (btnUndo) {
        btnUndo.disabled = !state.canUndo;
        btnUndo.style.opacity = state.canUndo ? '1' : '0.35';
      }
      if (btnRedo) {
        btnRedo.disabled = !state.canRedo;
        btnRedo.style.opacity = state.canRedo ? '1' : '0.35';
      }
    };

    updateButtons({ canUndo: false, canRedo: false });
    commandStack.onChange(updateButtons);

    if (btnUndo) btnUndo.addEventListener('click', () => commandStack.undo());
    if (btnRedo) btnRedo.addEventListener('click', () => commandStack.redo());
  }

  setupNativeSelectionHandler() {
    let selDebounce = null;

    document.addEventListener('selectionchange', () => {
      if (this.currentMode !== 'select') return;
      clearTimeout(selDebounce);

      selDebounce = setTimeout(() => {
        try {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || !String(sel).trim()) {
            this.selectionBubble.hide();
            return;
          }

          const range = sel.getRangeAt(0);
          const startNode = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
          const pageEl = startNode ? startNode.closest('.page-container') : null;
          if (!pageEl) {
            this.selectionBubble.hide();
            return;
          }

          const pageNum = parseInt(pageEl.dataset.page, 10);
          const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
          if (!rects.length) {
            this.selectionBubble.hide();
            return;
          }

          // Trigger continuous pill-hull quads & teardrop handles
          const record = this.viewer ? this.viewer.renderedPages.get(pageNum) : null;
          let matchedChars = null;
          if (record && record.overlay) {
            record.overlay.selectFromClientBounds(rects, pageEl.getBoundingClientRect());
            if (record.overlay.selectedRange) {
              const s = Math.min(record.overlay.selectedRange.startIdx, record.overlay.selectedRange.endIdx);
              const e = Math.max(record.overlay.selectedRange.startIdx, record.overlay.selectedRange.endIdx);
              matchedChars = record.overlay.allChars.slice(s, e + 1);
            }
          }

          const b = range.getBoundingClientRect();
          this.selectionBubble.showAtRange({
            pageNum,
            range,
            text: String(sel).trim(),
            bounds: b,
            rects,
            pageEl,
            chars: matchedChars,
          });
        } catch {
          this.selectionBubble.hide();
        }
      }, 90);
    });

    const viewportContainer = document.getElementById('viewport-container');
    if (viewportContainer) {
      viewportContainer.addEventListener('scroll', () => {
        if (this.selectionBubble) this.selectionBubble.hide();
      }, { passive: true });
    }
  }

  async getAnnotatedPdfBuffer() {
    if (!this.currentDoc || !this.currentDoc.buffer) return null;
    if (!this.viewer) return this.currentDoc.buffer;
    try {
      const bytes = await PdfExporter.exportAnnotatedPdf(
        this.currentDoc.buffer,
        this.viewer.pageStrokes,
        this.viewer.pageMetrics
      );
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } catch (e) {
      console.warn('[Pedif] Annotation export for workflow non-fatal:', e);
      return this.currentDoc.buffer;
    }
  }

  setupEventListeners() {
    const btnBackHome = document.getElementById('btn-back-home');
    const btnTheme = document.getElementById('btn-theme');
    const hTheme = document.getElementById('hTheme');
    const btnSearch = document.getElementById('btn-search');
    const btnExport = document.getElementById('btn-export');
    const btnSidebar = document.getElementById('btn-sidebar');
    const btnShortcuts = document.getElementById('btn-shortcuts');
    const hHelp = document.getElementById('hHelp');
    const popover = document.getElementById('workbench-popover');

    if (btnBackHome) {
      btnBackHome.addEventListener('click', async () => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          this.hideTtsHud();
        }
        if (this.currentDoc && this.currentDoc.buffer) {
          await libraryStore.saveDocument({
            name: this.currentDoc.name,
            pageCount: this.currentDoc.pageCount,
            currentPage: this.currentDoc.currentPage || 1,
            buffer: this.currentDoc.buffer.slice(0),
          }).catch(() => {});
        }
        document.body.classList.remove('open');
        if (this.homeLibrary) {
          await this.homeLibrary.renderLibrary();
        }
      });
    }

    if (btnSidebar) {
      btnSidebar.addEventListener('click', () => {
        if (this.sidebar) this.sidebar.toggle();
      });
    }

    if (btnShortcuts) {
      btnShortcuts.addEventListener('click', () => {
        if (this.shortcutsModal) this.shortcutsModal.toggle();
      });
    }

    if (hHelp) {
      hHelp.addEventListener('click', () => {
        if (this.shortcutsModal) this.shortcutsModal.toggle();
      });
    }

    if (btnSearch) {
      btnSearch.addEventListener('click', () => {
        if (popover && !popover.hidden) {
          popover.hidden = true;
        }
        if (this.searchBar) this.searchBar.toggle();
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => this.handleExportPdf());
    }

    const btnExtract = document.getElementById('btn-extract');
    if (btnExtract) {
      btnExtract.addEventListener('click', () => {
        if (!this.currentDoc) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.extractDialog) this.extractDialog.show();
      });
    }

    const btnRotate = document.getElementById('btn-rotate');
    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        if (this.viewer) {
          const rot = this.viewer.rotateClockwise();
          showToast(`Rotated ${rot}°`, 'check');
        }
      });
    }

    const btnReadAloud = document.getElementById('btn-read-aloud');
    if (btnReadAloud) {
      btnReadAloud.addEventListener('click', () => this.readAloudPage());
    }

    const btnStats = document.getElementById('btn-stats');
    if (btnStats) {
      btnStats.addEventListener('click', () => {
        if (!this.currentDoc) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.statsModal) this.statsModal.show();
      });
    }

    if (btnTheme) btnTheme.addEventListener('click', () => this.toggleTheme());
    if (hTheme) hTheme.addEventListener('click', () => this.toggleTheme());

    // Sovereign Workbench Tool Listeners
    const btnQuickOpen = document.getElementById('btn-quick-open');
    if (btnQuickOpen) {
      btnQuickOpen.addEventListener('click', () => {
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
      });
    }

    const btnHomeMerge = document.getElementById('btn-home-merge');
    if (btnHomeMerge) {
      btnHomeMerge.addEventListener('click', () => {
        if (this.mergeTool) this.mergeTool.show();
      });
    }

    const btnOrganize = document.getElementById('btn-organize');
    if (btnOrganize) {
      btnOrganize.addEventListener('click', async () => {
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.pageOrganizer) {
          const buf = await this.getAnnotatedPdfBuffer();
          this.pageOrganizer.show(buf || this.currentDoc.buffer, this.currentDoc.name);
        }
      });
    }

    const btnWorkbench = document.getElementById('btn-workbench');
    if (btnWorkbench && popover) {
      const positionWorkbenchPopover = () => {
        const rect = btnWorkbench.getBoundingClientRect();
        const popoverW = popover.offsetWidth || 250;
        let left = rect.right - popoverW;
        if (left < 16) left = 16;
        if (left + popoverW > window.innerWidth - 16) {
          left = window.innerWidth - popoverW - 16;
        }
        popover.style.position = 'fixed';
        popover.style.top = `${rect.bottom + 8}px`;
        popover.style.left = `${left}px`;
        popover.style.right = 'auto';
      };

      btnWorkbench.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = popover.hidden;
        if (willOpen && this.searchBar && this.searchBar.isOpen) {
          this.searchBar.close();
        }
        if (willOpen) {
          popover.hidden = false;
          positionWorkbenchPopover();
        } else {
          popover.hidden = true;
        }
      });

      window.addEventListener('resize', () => {
        if (!popover.hidden) positionWorkbenchPopover();
      });

      document.addEventListener('click', (e) => {
        if (!popover.hidden && !popover.contains(e.target) && e.target !== btnWorkbench) {
          popover.hidden = true;
        }
      });
    }

    const btnAppMenu = document.getElementById('btn-app-menu');
    const appMenu = document.getElementById('app-menu-dropdown');
    if (btnAppMenu && appMenu) {
      const positionAppMenu = () => {
        const rect = btnAppMenu.getBoundingClientRect();
        const menuW = appMenu.offsetWidth || 560;
        let left = rect.left;
        if (document.documentElement.dir === 'rtl' || document.body.classList.contains('rtl-mode')) {
          left = rect.right - menuW;
        }
        if (left < 16) left = 16;
        if (left + menuW > window.innerWidth - 16) {
          left = window.innerWidth - menuW - 16;
        }
        appMenu.style.position = 'fixed';
        appMenu.style.top = `${rect.bottom + 8}px`;
        appMenu.style.left = `${left}px`;
        appMenu.style.right = 'auto';
      };

      btnAppMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = appMenu.hidden;
        if (popover && !popover.hidden) popover.hidden = true;
        if (this.searchBar && this.searchBar.isOpen) this.searchBar.close();
        if (willOpen) {
          appMenu.hidden = false;
          btnAppMenu.setAttribute('aria-expanded', 'true');
          positionAppMenu();
          this.updateMenuRecents();
          if (typeof document !== 'undefined') {
            document.querySelectorAll('.menu-theme-btn').forEach(b => {
              if (b.classList && typeof b.classList.toggle === 'function') {
                b.classList.toggle('active', b.dataset.theme === this.activeTheme);
              }
            });
          }
        } else {
          appMenu.hidden = true;
          btnAppMenu.setAttribute('aria-expanded', 'false');
        }
      });

      window.addEventListener('resize', () => {
        if (!appMenu.hidden) positionAppMenu();
      });

      document.addEventListener('click', (e) => {
        if (!appMenu.hidden && !appMenu.contains(e.target) && e.target !== btnAppMenu) {
          appMenu.hidden = true;
          btnAppMenu.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Studio Application Menu Item Actions
    const bindMenuAction = (id, action) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          if (appMenu) {
            appMenu.hidden = true;
            if (btnAppMenu) btnAppMenu.setAttribute('aria-expanded', 'false');
          }
          action();
        });
      }
    };

    bindMenuAction('app-menu-open', () => {
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.click();
    });
    bindMenuAction('app-menu-export', () => this.handleExportPdf());
    bindMenuAction('app-menu-print', () => {
      if (!this.currentDoc) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      window.print();
    });
    bindMenuAction('app-menu-extract', () => {
      if (!this.currentDoc) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.extractDialog) this.extractDialog.show();
    });
    bindMenuAction('app-menu-metadata', () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.metadataDialog) this.metadataDialog.show(this.currentDoc.buffer);
    });
    bindMenuAction('app-menu-close', async () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        this.hideTtsHud();
      }
      if (this.currentDoc && this.currentDoc.buffer) {
        await libraryStore.saveDocument({
          name: this.currentDoc.name,
          pageCount: this.currentDoc.pageCount,
          currentPage: this.currentDoc.currentPage || 1,
          buffer: this.currentDoc.buffer.slice(0),
        }).catch(() => {});
      }
      document.body.classList.remove('open');
      if (this.homeLibrary) await this.homeLibrary.renderLibrary();
    });
    bindMenuAction('app-menu-undo', () => commandStack.undo());
    bindMenuAction('app-menu-redo', () => commandStack.redo());
    bindMenuAction('app-menu-find', () => {
      if (this.searchBar) this.searchBar.open();
    });
    bindMenuAction('app-menu-organize', async () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.pageOrganizer) {
        const buf = await this.getAnnotatedPdfBuffer();
        this.pageOrganizer.show(buf || this.currentDoc.buffer, this.currentDoc.name);
      }
    });
    bindMenuAction('app-menu-rotate', () => {
      if (this.viewer) {
        const rot = this.viewer.rotateClockwise();
        showToast(`Rotated ${rot}°`, 'check');
      }
    });
    bindMenuAction('app-menu-spread', () => {
      if (this.viewer) {
        const nextMode = this.viewer.mode === 'spread' ? 'continuous' : 'spread';
        this.viewer.setMode(nextMode);
        showToast(nextMode === 'spread' ? 'Two-page book spread enabled' : 'Continuous reading enabled', 'check');
      }
    });
    bindMenuAction('app-menu-zen', () => this.toggleZenMode());
    bindMenuAction('app-menu-theme', () => this.toggleTheme());
    document.querySelectorAll('.menu-theme-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const th = btn.dataset.theme;
        if (th) {
          this.setTheme(th);
        }
      });
    });
    bindMenuAction('app-menu-stats', () => {
      if (!this.currentDoc) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.statsModal) this.statsModal.show();
    });
    bindMenuAction('app-menu-read-aloud', () => this.readAloudPage());
    bindMenuAction('app-menu-merge', () => {
      if (this.mergeTool) this.mergeTool.show();
    });
    bindMenuAction('app-menu-watermark', () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.watermarkDialog) this.watermarkDialog.show(this.currentDoc.buffer);
    });
    bindMenuAction('app-menu-numbering', () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.numberingDialog) this.numberingDialog.show(this.currentDoc.buffer);
    });
    bindMenuAction('app-menu-signature', () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.signatureDialog) {
        this.signatureDialog.show(this.currentDoc.pageCount || 1, this.viewer?.currentPage || 1);
      }
    });
    bindMenuAction('app-menu-stamp', () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      if (this.stampDialog) {
        this.stampDialog.show(this.currentDoc.buffer, this.viewer?.currentPage || 1, this.currentDoc.pageCount || 1);
      }
    });
    bindMenuAction('app-menu-ocr', async () => {
      if (!this.currentDoc || !this.currentDoc.buffer) {
        showToast('Please open a PDF document first', 'alert');
        return;
      }
      const curPage = (this.viewer && this.viewer.currentPage) || 1;
      showToast(`Running WebGPU OCR on Page ${curPage}...`, 'info');
      const res = await this.viewer.runManualOcr(curPage);
      if (res && res.lines && res.lines.length) {
        showToast(`OCR Success: Found ${res.lines.length} lines on Page ${curPage}. Text is now selectable!`, 'check');
      } else {
        showToast('OCR scan completed', 'check');
      }
    });
    bindMenuAction('app-menu-shortcuts', () => {
      if (this.shortcutsModal) this.shortcutsModal.toggle();
    });

    const docTitlePropsBtn = document.getElementById('btn-doc-title-props');
    if (docTitlePropsBtn) {
      const openProps = () => {
        if (!this.currentDoc || !this.currentDoc.buffer) return;
        if (this.metadataDialog) this.metadataDialog.show(this.currentDoc.buffer);
      };
      docTitlePropsBtn.addEventListener('click', openProps);
      docTitlePropsBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProps();
        }
      });
    }

    // Real-Time Tool Search Filter
    const wbToolsSearch = document.getElementById('wb-tools-search');
    if (wbToolsSearch && popover) {
      wbToolsSearch.addEventListener('input', (e) => {
        const q = (e.target.value || '').trim().toLowerCase();
        const cards = popover.querySelectorAll('.wb-card-item');
        cards.forEach((card) => {
          const text = (card.textContent || '').toLowerCase();
          const matches = !q || text.includes(q);
          card.style.display = matches ? '' : 'none';
        });
      });
    }

    const wbItemOrganize = document.getElementById('wb-item-organize');
    if (wbItemOrganize) {
      wbItemOrganize.addEventListener('click', async () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.pageOrganizer) {
          const buf = await this.getAnnotatedPdfBuffer();
          this.pageOrganizer.show(buf || this.currentDoc.buffer, this.currentDoc.name);
        }
      });
    }

    const wbItemMerge = document.getElementById('wb-item-merge');
    if (wbItemMerge) {
      wbItemMerge.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (this.mergeTool) this.mergeTool.show();
      });
    }

    const wbItemWatermark = document.getElementById('wb-item-watermark');
    if (wbItemWatermark) {
      wbItemWatermark.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.watermarkDialog) this.watermarkDialog.show(this.currentDoc.buffer);
      });
    }

    const wbItemNumbering = document.getElementById('wb-item-numbering');
    if (wbItemNumbering) {
      wbItemNumbering.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.numberingDialog) this.numberingDialog.show(this.currentDoc.buffer);
      });
    }

    const wbItemMetadata = document.getElementById('wb-item-metadata');
    if (wbItemMetadata) {
      wbItemMetadata.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.metadataDialog) this.metadataDialog.show(this.currentDoc.buffer);
      });
    }

    const wbItemSignature = document.getElementById('wb-item-signature');
    if (wbItemSignature) {
      wbItemSignature.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.signatureDialog) {
          this.signatureDialog.show(this.currentDoc.pageCount || 1, this.viewer?.currentPage || 1);
        }
      });
    }

    const wbItemStamp = document.getElementById('wb-item-stamp');
    if (wbItemStamp) {
      wbItemStamp.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.stampDialog) {
          this.stampDialog.show(this.currentDoc.buffer, this.viewer?.currentPage || 1, this.currentDoc.pageCount || 1);
        }
      });
    }

    const wbItemExtract = document.getElementById('wb-item-extract');
    if (wbItemExtract) {
      wbItemExtract.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.extractDialog) this.extractDialog.show();
      });
    }

    const wbItemStats = document.getElementById('wb-item-stats');
    if (wbItemStats) {
      wbItemStats.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        if (this.statsModal) this.statsModal.show();
      });
    }

    const wbItemReadAloud = document.getElementById('wb-item-read-aloud');
    if (wbItemReadAloud) {
      wbItemReadAloud.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        this.readAloudPage();
      });
    }

    const wbItemOcr = document.getElementById('wb-item-ocr');
    if (wbItemOcr) {
      wbItemOcr.addEventListener('click', async () => {
        if (popover) popover.hidden = true;
        if (!this.currentDoc || !this.currentDoc.buffer) {
          showToast('Please open a PDF document first', 'alert');
          return;
        }
        const curPage = (this.viewer && this.viewer.currentPage) || 1;
        showToast(`Running WebGPU OCR on Page ${curPage}...`, 'info');
        const res = await this.viewer.runManualOcr(curPage);
        if (res && res.lines && res.lines.length) {
          showToast(`OCR Success: Found ${res.lines.length} lines on Page ${curPage}. Text is now selectable!`, 'check');
        } else {
          showToast('OCR scan completed', 'check');
        }
      });
    }

    const wbItemSpread = document.getElementById('wb-item-spread');
    if (wbItemSpread) {
      wbItemSpread.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (this.viewer) {
          const nextMode = this.viewer.mode === 'spread' ? 'continuous' : 'spread';
          this.viewer.setMode(nextMode);
          showToast(nextMode === 'spread' ? 'Two-page book spread enabled' : 'Continuous reading enabled', 'check');
        }
      });
    }

    const wbItemZen = document.getElementById('wb-item-zen');
    if (wbItemZen) {
      wbItemZen.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        this.toggleZenMode();
      });
    }

    const btnZenExit = document.getElementById('btn-zen-exit');
    if (btnZenExit) {
      btnZenExit.addEventListener('click', () => {
        this.toggleZenMode();
      });
    }

    const wbItemUndo = document.getElementById('wb-item-undo');
    if (wbItemUndo) {
      wbItemUndo.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        commandStack.undo();
      });
    }

    const wbItemRedo = document.getElementById('wb-item-redo');
    if (wbItemRedo) {
      wbItemRedo.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        commandStack.redo();
      });
    }

    const wbItemRotate = document.getElementById('wb-item-rotate');
    if (wbItemRotate) {
      wbItemRotate.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (this.viewer) {
          const rot = this.viewer.rotateClockwise();
          showToast(`Rotated ${rot}°`, 'check');
        }
      });
    }

    const wbItemTheme = document.getElementById('wb-item-theme');
    if (wbItemTheme) {
      wbItemTheme.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        this.toggleTheme();
      });
    }

    const wbItemShortcuts = document.getElementById('wb-item-shortcuts');
    if (wbItemShortcuts) {
      wbItemShortcuts.addEventListener('click', () => {
        if (popover) popover.hidden = true;
        if (this.shortcutsModal) this.shortcutsModal.toggle();
      });
    }

    // Floating TTS Speech HUD controls
    const btnTtsPause = document.getElementById('btn-tts-pause');
    const btnTtsStop = document.getElementById('btn-tts-stop');
    const ttsEq = document.getElementById('tts-equalizer');
    const playPauseIcon = document.getElementById('icon-tts-playpause');

    if (btnTtsPause) {
      btnTtsPause.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          if (ttsEq) ttsEq.classList.remove('paused');
          if (playPauseIcon) playPauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          btnTtsPause.setAttribute('title', 'Pause Speech');
        } else if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          if (ttsEq) ttsEq.classList.add('paused');
          if (playPauseIcon) playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
          btnTtsPause.setAttribute('title', 'Resume Speech');
        }
      });
    }

    if (btnTtsStop) {
      btnTtsStop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && ('speechSynthesis' in window)) {
          window.speechSynthesis.cancel();
        }
        this.hideTtsHud();
      });
    }

    const tools = ['select', 'pen', 'highlighter', 'eraser', 'ocr'];
    tools.forEach(tool => {
      const el = document.getElementById(`tool-${tool}`);
      if (el) el.addEventListener('click', () => this.setToolMode(tool));
    });

    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const isTrackpad = Math.abs(e.deltaY) < 50;
        let delta;
        if (isTrackpad) {
          delta = -e.deltaY * 0.008 * (this.viewer ? this.viewer.scale : 1);
        } else {
          delta = e.deltaY < 0 ? 0.15 : -0.15;
        }
        if (this.viewer) {
          const newScale = Math.max(0.25, Math.min(5.0, this.viewer.scale + delta));
          this.viewer.setScale(newScale, { x: e.clientX, y: e.clientY });
          if (this.dock) this.dock.updateZoom(newScale);
        }
      }
    }, { passive: false });
  }

  async handleExportPdf() {
    if (!this.currentDoc || !this.currentDoc.buffer) {
      showToast('Please open a PDF document first.', 'alert');
      return;
    }

    const btnExport = document.getElementById('btn-export');
    const origOpacity = btnExport ? btnExport.style.opacity : '1';
    if (btnExport) {
      btnExport.disabled = true;
      btnExport.style.opacity = '0.5';
    }

    try {
      showToast('Exporting ISO 32000-1 PDF...', 'check');
      const modifiedBytes = await PdfExporter.exportAnnotatedPdf(
        this.currentDoc.buffer,
        this.viewer.pageStrokes,
        this.viewer.pageMetrics
      );

      const baseName = (this.currentDoc.name || 'document').replace(/\.pdf$/i, '');
      const exportName = `${baseName}_annotated.pdf`;
      PdfExporter.downloadPdf(modifiedBytes, exportName);
      showToast('PDF Saved', 'check');

    } catch (err) {
      console.error('[Pedif] Export PDF error:', err);
      showToast('Failed to export PDF: ' + err.message, 'alert');
    } finally {
      if (btnExport) {
        btnExport.disabled = false;
        btnExport.style.opacity = origOpacity;
      }
    }
  }

  toggleZenMode() {
    if (!this.currentDoc) {
      showToast('Please open a PDF document first', 'alert');
      return;
    }
    const isZen = document.body.classList.toggle('zen-mode');
    if (isZen) {
      showToast('Zen Mode enabled (Press Z or Esc to exit)', 'check', 2200);
    } else {
      showToast('Exited Zen Mode', 'check', 1500);
    }
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Escape key to dismiss modals / search bar / workbench popover / app menu / zen mode
      if (e.key === 'Escape') {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          this.hideTtsHud();
        }
        if (typeof document !== 'undefined' && document.body.classList.contains('zen-mode')) {
          this.toggleZenMode();
          return;
        }
        const appMenu = document.getElementById('app-menu-dropdown');
        if (appMenu && !appMenu.hidden) {
          appMenu.hidden = true;
          const btnAppMenu = document.getElementById('btn-app-menu');
          if (btnAppMenu) btnAppMenu.setAttribute('aria-expanded', 'false');
          return;
        }
        if (this.shortcutsModal && this.shortcutsModal.isOpen()) {
          this.shortcutsModal.close();
          return;
        }
        const popover = document.getElementById('workbench-popover');
        if (popover && !popover.hidden) {
          popover.hidden = true;
          return;
        }
        if (this.searchBar && this.searchBar.isOpen) {
          this.searchBar.close();
          return;
        }
      }

      // Open Document (Ctrl+O)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.click();
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          commandStack.redo();
        } else {
          commandStack.undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        commandStack.redo();
        return;
      }

      // Print shortcut Ctrl+P
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        window.print();
        return;
      }

      // Save / Export shortcut Ctrl+S
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.handleExportPdf();
        return;
      }

      // Digital Signature shortcut Ctrl+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (this.signatureDialog && this.currentDoc && this.currentDoc.buffer) {
          this.signatureDialog.show(this.currentDoc.pageCount || 1, this.viewer?.currentPage || 1);
        } else {
          showToast('Please open a PDF document first', 'alert');
        }
        return;
      }

      // Find in document Ctrl+F
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (this.searchBar) this.searchBar.toggle();
        return;
      }

      // Fullscreen toggle (F11)
      if (e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
        return;
      }

      // Navigation: J/K, Arrow keys, PageUp/PageDown, Space
      if (e.key === 'j' || e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        if (this.viewer && this.viewer.currentPage < pdfEngine.numPages) {
          this.viewer.scrollToPage(this.viewer.currentPage + 1);
        }
      } else if (e.key === 'k' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (this.viewer && this.viewer.currentPage > 1) {
          this.viewer.scrollToPage(this.viewer.currentPage - 1);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (this.viewer) this.viewer.scrollToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (this.viewer) this.viewer.scrollToPage(pdfEngine.numPages);
      }

      // Zooming
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const newScale = Math.min(3.5, this.viewer.scale + 0.15);
        this.viewer.setScale(newScale);
        if (this.dock) this.dock.updateZoom(newScale);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        const newScale = Math.max(0.4, this.viewer.scale - 0.15);
        this.viewer.setScale(newScale);
        if (this.dock) this.dock.updateZoom(newScale);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.viewer.setScale(1.25);
        if (this.dock) this.dock.updateZoom(1.25);
      }

      // Single-Key Tool & Action Shortcuts (Protected from Ctrl / Meta / Alt chord collisions)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') {
          this.setToolMode('select');
        } else if (e.key === 'p' || e.key === 'P') {
          this.setToolMode('pen');
        } else if (e.key === 'h' || e.key === 'H') {
          this.setToolMode('highlighter');
        } else if (e.key === 'e' || e.key === 'E') {
          this.setToolMode('eraser');
        } else if (e.key === 'o' || e.key === 'O') {
          this.setToolMode('ocr');
        } else if (e.key === 'l' || e.key === 'L') {
          this.setToolMode('lasso');
        } else if (e.key === 'c' || e.key === 'C') {
          if (this.cropTool) this.cropTool.open(this.viewer.currentPage);
        } else if (e.key === 't' || e.key === 'T') {
          if (this.smartScanner) this.smartScanner.toggleScanCurrentPage();
        } else if (e.key === 'w' || e.key === 'W') {
          if (this.viewer) {
            const newScale = this.viewer.fitWidth();
            if (this.dock) this.dock.updateZoom(newScale);
          }
        } else if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          const pageBtn = document.getElementById('btn-dock-page');
          if (pageBtn) pageBtn.click();
        } else if (e.key === 'r' || e.key === 'R') {
          if (this.viewer) {
            const rot = this.viewer.rotateClockwise();
            showToast(`Rotated ${rot}°`, 'check');
          }
        } else if (e.key === 'x' || e.key === 'X') {
          if (this.currentDoc && this.extractDialog) {
            this.extractDialog.show();
          } else {
            showToast('Please open a PDF document first', 'alert');
          }
        } else if (e.key === 'm' || e.key === 'M') {
          if (this.currentDoc && this.pageOrganizer) {
            this.getAnnotatedPdfBuffer().then(buf => {
              this.pageOrganizer.show(buf || this.currentDoc.buffer, this.currentDoc.name);
            });
          } else if (this.mergeTool) {
            this.mergeTool.show();
          }
        } else if (e.key === 'a' || e.key === 'A') {
          this.readAloudPage();
        } else if (e.key === 's' || e.key === 'S') {
          if (this.currentDoc && this.statsModal) {
            this.statsModal.show();
          } else {
            showToast('Please open a PDF document first', 'alert');
          }
        } else if (e.key === 'b' || e.key === 'B') {
          if (this.sidebar && this.viewer) {
            e.preventDefault();
            this.sidebar.toggleBookmark(this.viewer.currentPage || 1);
          }
        } else if (e.key === 'd' || e.key === 'D') {
          this.toggleTheme();
        } else if (e.key === 'z' || e.key === 'Z') {
          this.toggleZenMode();
        }
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        if (this.shortcutsModal) this.shortcutsModal.toggle();
      }
    });
  }

  async handleFileOpen(file) {
    try {
      if (!file || file.size === 0) {
        showToast('Selected file is empty', 'alert');
        return;
      }
      const buffer = await file.arrayBuffer();
      await this.loadPdfBuffer(buffer, file.name);
    } catch (err) {
      console.error('[Pedif] File read error:', err);
      showToast('Could not read file: ' + err.message, 'alert');
    }
  }

  async generateThumbnail(pdf) {
    try {
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.warn('[Pedif] Thumbnail generation non-fatal:', e);
      return null;
    }
  }

  async loadPdfBuffer(inputBuffer, fileName = 'Document.pdf', savedState = null) {
    try {
      const validBuffer = toValidArrayBuffer(inputBuffer);
      if (!validBuffer) {
        console.warn('[Pedif] Buffer empty or invalid for:', fileName);
        showToast('PDF file data could not be read. Please choose a file.', 'alert');
        return;
      }

      // Create independent copies so worker transfers never detach the stored buffer
      const pdfJsBuffer = validBuffer.slice(0);
      const docBuffer = validBuffer.slice(0);

      const pdf = await pdfEngine.loadDocument(
        pdfJsBuffer,
        '',
        async (updatePassword, reason) => {
          const pwd = await passwordDialog.show(reason);
          if (pwd) {
            updatePassword(pwd);
          } else {
            showToast('Password required to view encrypted document', 'alert');
          }
        }
      );
      this.currentDoc = { buffer: docBuffer, name: fileName, pageCount: pdf.numPages, currentPage: 1 };

      // Switch view to Reader Screen
      document.body.classList.add('open');

      const titleEl = document.getElementById('ti');
      if (titleEl) titleEl.textContent = fileName.replace(/\.pdf$/i, '');
      const subEl = document.getElementById('sub');
      if (subEl) subEl.textContent = `PAGE 1 OF ${pdf.numPages}`;

      if (savedState) {
        if (savedState.annotations) {
          highlightManager.loadState(savedState.annotations);
        }
        if (savedState.strokes) {
          Object.keys(savedState.strokes).forEach(pNum => {
            const list = savedState.strokes[pNum].map(s => new Stroke(s));
            this.viewer.pageStrokes.set(parseInt(pNum, 10), list);
          });
        }
      }

      await this.viewer.loadDocument();
      if (this.statsModal) {
        this.statsModal.resetSession(pdf.numPages);
      }
      this.updatePageIndicator(1, pdf.numPages);

      // Refresh sidebar outline if open
      if (this.sidebar && this.sidebar.isOpen) {
        this.sidebar.switchTab(this.sidebar.activeTab);
      }

      searchEngine.indexDocument((page, total) => {});

      // Non-blocking persistent saves
      autosave.savePdfBuffer(docBuffer.slice(0), {
        name: fileName,
        pageCount: pdf.numPages,
        currentPage: 1,
      }).catch(e => console.warn('[Autosave] Non-fatal save failure:', e));

      // Asynchronously render real cover thumbnail for the library card
      this.generateThumbnail(pdf).then(thumbnail => {
        libraryStore.saveDocument({
          name: fileName,
          pageCount: pdf.numPages,
          currentPage: 1,
          thumbnail: thumbnail || null,
          buffer: docBuffer.slice(0),
        }).catch(e => console.warn('[LibraryStore] Non-fatal save failure:', e));
      }).catch(() => {
        libraryStore.saveDocument({
          name: fileName,
          pageCount: pdf.numPages,
          currentPage: 1,
          buffer: docBuffer.slice(0),
        }).catch(e => console.warn('[LibraryStore] Non-fatal save failure:', e));
      });

    } catch (err) {
      console.error('[Pedif] Error opening PDF:', err);
      showToast('Could not open PDF: ' + err.message, 'alert');
    }
  }

  updatePageIndicator(current, total) {
    const sub = document.getElementById('sub');
    if (sub) {
      sub.textContent = `PAGE ${current} OF ${total}`;
    }
    if (this.dock) {
      this.dock.updatePage(current, total);
    }
    if (this.scrubber) {
      this.scrubber.updateProgress(current, total);
    }
    if (this.sidebar && typeof this.sidebar.onCurrentPageChange === 'function') {
      this.sidebar.onCurrentPageChange(current);
    }
    if (this.statsModal) {
      this.statsModal.recordPage(current);
    }
    if (this.currentDoc) {
      this.currentDoc.currentPage = current;
    }
  }

  async readAloudPage(pageNum) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported in this browser', 'alert');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.hideTtsHud();
      showToast('Speech stopped', 'check');
      return;
    }

    const p = pageNum || (this.viewer ? this.viewer.currentPage : 1);
    const textData = this.viewer ? this.viewer.pageTextData.get(p) : null;
    let pageText = textData ? textData.fullText : '';

    if (!pageText && pdfEngine.pdfDoc) {
      try {
        const page = await pdfEngine.getPage(p);
        const tc = await page.getTextContent();
        pageText = tc.items.map(it => it.str).join(' ');
      } catch (err) {
        console.warn('[Pedif] Text extraction for speech failed:', err);
      }
    }

    if (!pageText || !pageText.trim()) {
      showToast('No readable text on this page to speak', 'alert');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(pageText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    this.showTtsHud(p);

    utterance.onstart = () => {
      this.showTtsHud(p);
      showToast(`Reading Page ${p} aloud…`, 'star');
    };
    utterance.onend = () => {
      this.hideTtsHud();
      showToast(`Finished reading Page ${p}`, 'check');
    };
    utterance.onerror = (e) => {
      this.hideTtsHud();
      if (e.error !== 'canceled') {
        showToast('Speech error: ' + e.error, 'alert');
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  showTtsHud(pageNum) {
    if (typeof document === 'undefined') return;
    const hud = document.getElementById('tts-hud');
    if (!hud) return;
    const txt = document.getElementById('tts-hud-text');
    if (txt) txt.textContent = `Reading Page ${pageNum}...`;
    const eq = document.getElementById('tts-equalizer');
    if (eq) eq.classList.remove('paused');
    const playPauseIcon = document.getElementById('icon-tts-playpause');
    if (playPauseIcon) {
      playPauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
    hud.hidden = false;
    requestAnimationFrame(() => hud.classList.add('visible'));
  }

  hideTtsHud() {
    if (typeof document === 'undefined') return;
    const hud = document.getElementById('tts-hud');
    if (!hud) return;
    hud.classList.remove('visible');
    setTimeout(() => {
      if (!hud.classList.contains('visible')) hud.hidden = true;
    }, 240);
  }

  async checkRestoreSession() {
    const { hasSession, metadata } = await autosave.checkRestoreSession();
    if (!hasSession || !metadata) return;

    const bannerContainer = document.getElementById('restore-banner-container');
    if (!bannerContainer) return;
    const timeStr = new Date(metadata.updatedAt).toLocaleTimeString();

    const banner = document.createElement('div');
    banner.className = 'restore-banner';
    banner.innerHTML = `
      <div>
        <strong>Resume unsaved session?</strong>
        <div style="font-size: 13px; color: var(--tx2); margin-top: 2px;">
          "${metadata.name}" (${metadata.pageCount || 1} pages) from ${timeStr}
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-primary" id="btn-restore-yes">Resume</button>
        <button class="btn-secondary" id="btn-restore-no">Discard</button>
      </div>
    `;

    bannerContainer.appendChild(banner);

    document.getElementById('btn-restore-yes').addEventListener('click', async () => {
      const restored = await autosave.restoreSession();
      banner.remove();
      if (restored && restored.pdfBuffer) {
        await this.loadPdfBuffer(restored.pdfBuffer, restored.metadata.name, restored.state);
      } else {
        showToast('Previous session could not be resumed. Please open a PDF.', 'alert');
      }
    });

    document.getElementById('btn-restore-no').addEventListener('click', async () => {
      await autosave.clearSession();
      banner.remove();
    });
  }

  async updateMenuRecents() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('app-menu-recents');
    if (!container) return;
    try {
      const docs = await libraryStore.listDocuments();
      if (!docs || !docs.length) {
        container.innerHTML = '';
        return;
      }
      const recents = docs.slice(0, 3);
      container.innerHTML = recents.map(d => `
        <button type="button" class="app-menu-recent-item" data-id="${d.id}" title="${d.name}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="recent-name">${d.name}</span>
          <span class="recent-badge">${d.pageCount}p</span>
        </button>
      `).join('');

      container.querySelectorAll('.app-menu-recent-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const appMenu = document.getElementById('app-menu-dropdown');
          if (appMenu) appMenu.hidden = true;
          const btnAppMenu = document.getElementById('btn-app-menu');
          if (btnAppMenu) btnAppMenu.setAttribute('aria-expanded', 'false');
          const doc = await libraryStore.getDocument(id);
          if (doc && doc.buffer) {
            await this.loadPdfBuffer(doc.buffer, doc.name);
          } else {
            showToast('Document buffer not found in library', 'alert');
          }
        });
      });
    } catch {
      container.innerHTML = '';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.pedif = new PedifApp();
});
