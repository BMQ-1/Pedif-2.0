import './styles/app.css';
import './styles/viewer.css';
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
      getPdfBuffer: () => this.currentDoc?.buffer || null,
      getCurrentPage: () => this.viewer?.currentPage || 1,
      getTotalPages: () => pdfEngine.numPages || 1,
      getDocName: () => this.currentDoc?.name || 'Document.pdf',
    });
    this.statsModal = new StatsModal({
      getCurrentPage: () => this.viewer?.currentPage || 1,
      getTotalPages: () => pdfEngine.numPages || 1,
      getDocName: () => this.currentDoc?.name || 'Document.pdf',
    });

    // 12. Setup UI interactions, shortcuts & CommandStack
    this.setupTheme();
    this.setupEventListeners();
    this.setupNativeSelectionHandler();
    this.setupKeyboardShortcuts();
    this.setupCommandStack();

    // 12. Check for unsaved session to restore
    await this.checkRestoreSession();

    console.log('[Pedif] App initialized with full Cupertino Studio UI. Cross-Origin Isolated:', window.crossOriginIsolated);
  }

  setupTheme() {
    document.documentElement.dataset.theme = this.activeTheme;
  }

  toggleTheme() {
    const currentIndex = this.themes.indexOf(this.activeTheme);
    const nextIndex = (currentIndex + 1) % this.themes.length;
    this.activeTheme = this.themes[nextIndex];
    document.documentElement.dataset.theme = this.activeTheme;
    localStorage.setItem('pedif:theme', this.activeTheme);
    showToast(`Theme: ${this.activeTheme.toUpperCase()}`, 'star');
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

  setupEventListeners() {
    const btnBackHome = document.getElementById('btn-back-home');
    const btnTheme = document.getElementById('btn-theme');
    const hTheme = document.getElementById('hTheme');
    const btnSearch = document.getElementById('btn-search');
    const btnExport = document.getElementById('btn-export');
    const btnSidebar = document.getElementById('btn-sidebar');
    const btnShortcuts = document.getElementById('btn-shortcuts');
    const hHelp = document.getElementById('hHelp');

    if (btnBackHome) {
      btnBackHome.addEventListener('click', async () => {
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

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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

      // Find in document Ctrl+F
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (this.searchBar) this.searchBar.open();
        return;
      }

      // Navigation: J/K or Arrow keys
      if (e.key === 'j' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (this.viewer && this.viewer.currentPage < pdfEngine.numPages) {
          this.viewer.scrollToPage(this.viewer.currentPage + 1);
        }
      } else if (e.key === 'k' || e.key === 'ArrowLeft') {
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
      } else if (e.key === 'v') {
        this.setToolMode('select');
      } else if (e.key === 'p') {
        this.setToolMode('pen');
      } else if (e.key === 'h') {
        this.setToolMode('highlighter');
      } else if (e.key === 'e') {
        this.setToolMode('eraser');
      } else if (e.key === 'o') {
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
      } else if (e.key === 'a' || e.key === 'A') {
        this.readAloudPage();
      } else if (!e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')) {
        if (this.currentDoc && this.statsModal) {
          this.statsModal.show();
        } else {
          showToast('Please open a PDF document first', 'alert');
        }
      } else if (e.key === 'd') {
        this.toggleTheme();
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
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
    utterance.onstart = () => showToast(`Reading Page ${p} aloud… Click Read Aloud to stop`, 'star');
    utterance.onend = () => showToast(`Finished reading Page ${p}`, 'check');
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        showToast('Speech error: ' + e.error, 'alert');
      }
    };

    window.speechSynthesis.speak(utterance);
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
}

window.addEventListener('DOMContentLoaded', () => {
  window.pedif = new PedifApp();
});
