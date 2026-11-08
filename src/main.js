import './styles/app.css';
import './styles/viewer.css';
import { autosave } from './storage/autosave.js';
import { libraryStore } from './storage/library.js';
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

    this.init();
  }

  async init() {
    // 1. Initialize offline autosave and library
    await autosave.init();
    await libraryStore.init();

    // 2. Register PWA Service Worker
    this.registerServiceWorker();

    // 3. Initialize Selection Bubble & Shortcuts Modal
    this.selectionBubble = new SelectionBubble();
    this.shortcutsModal = new ShortcutsModal();

    // 4. Initialize 3-Tier Virtual Viewer
    const viewportContainer = document.getElementById('viewport-container');
    this.viewer = new VirtualViewer({
      container: viewportContainer,
      onPageChange: (current, total) => this.updatePageIndicator(current, total),
      onSelectionEnd: (sel) => {
        if (this.currentMode === 'select' && sel && sel.chars && sel.chars.length > 0) {
          this.selectionBubble.show(sel);
        } else {
          this.selectionBubble.hide();
        }
      },
    });

    // 5. Initialize Sidebar
    this.sidebar = new Sidebar({
      viewer: this.viewer,
      onJumpToPage: (pNum) => this.viewer.scrollToPage(pNum),
    });

    // 6. Initialize Vector Inking & Ergonomics Engine
    this.inkEngine = new InkEngine({
      viewer: this.viewer,
      activeTool: this.currentMode,
    });
    this.inkToolbar = new InkToolbar({
      inkEngine: this.inkEngine,
    });

    // 7. Initialize Area OCR Snippet Tool
    this.snippetTool = new SnippetTool({
      viewer: this.viewer,
    });

    // 8. Initialize Unified Search Bar
    this.searchBar = new SearchBar({
      onMatchSelect: (match) => {
        if (match) {
          this.viewer.scrollToPage(match.pageNum);
        }
      },
    });

    // 9. Setup UI interactions & CommandStack
    this.setupTheme();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupCommandStack();

    // 10. Check for unsaved session to restore
    await this.checkRestoreSession();

    console.log('[Pedif] App initialized with complete Desktop & Mobile UI. Cross-Origin Isolated:', window.crossOriginIsolated);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost') && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[PWA] Service Worker registered:', reg.scope);
      }).catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
    }
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

  setupEventListeners() {
    const fileInput = document.getElementById('file-input');
    const btnOpenFile = document.getElementById('btn-open-file');
    const btnOpenPrompt = document.getElementById('btn-open-prompt');
    const btnTheme = document.getElementById('btn-theme');
    const btnSearch = document.getElementById('btn-search');
    const btnExport = document.getElementById('btn-export');
    const btnSidebar = document.getElementById('btn-sidebar');
    const btnShortcuts = document.getElementById('btn-shortcuts');

    const triggerOpen = () => fileInput.click();
    if (btnOpenFile) btnOpenFile.addEventListener('click', triggerOpen);
    if (btnOpenPrompt) btnOpenPrompt.addEventListener('click', triggerOpen);

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleFileOpen(file);
      }
    });

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          await this.handleFileOpen(file);
        }
      }
    });

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

    if (btnSearch) {
      btnSearch.addEventListener('click', () => {
        if (this.searchBar) this.searchBar.toggle();
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => this.handleExportPdf());
    }

    if (btnTheme) btnTheme.addEventListener('click', () => this.toggleTheme());

    const tools = ['select', 'pen', 'highlighter', 'eraser', 'ocr'];
    tools.forEach(tool => {
      const el = document.getElementById(`tool-${tool}`);
      if (el) el.addEventListener('click', () => this.setToolMode(tool));
    });

    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.viewer.setScale(this.viewer.scale + delta);
      }
    }, { passive: false });
  }

  async handleExportPdf() {
    if (!this.currentDoc || !this.currentDoc.buffer) {
      alert('Please open a PDF document first.');
      return;
    }

    const btnExport = document.getElementById('btn-export');
    const origOpacity = btnExport ? btnExport.style.opacity : '1';
    if (btnExport) {
      btnExport.disabled = true;
      btnExport.style.opacity = '0.5';
    }

    try {
      const modifiedBytes = await PdfExporter.exportAnnotatedPdf(
        this.currentDoc.buffer,
        this.viewer.pageStrokes,
        this.viewer.pageMetrics
      );

      const baseName = (this.currentDoc.name || 'document').replace(/\.pdf$/i, '');
      const exportName = `${baseName}_annotated.pdf`;
      PdfExporter.downloadPdf(modifiedBytes, exportName);

    } catch (err) {
      console.error('[Pedif] Export PDF error:', err);
      alert('Failed to export PDF: ' + err.message);
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

      // Save / Export shortcut Ctrl+S
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.handleExportPdf();
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
        this.viewer.setScale(this.viewer.scale + 0.15);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        this.viewer.setScale(this.viewer.scale - 0.15);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.viewer.setScale(1.25);
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
      } else if (e.key === 'd') {
        this.toggleTheme();
      }
    });
  }

  async handleFileOpen(file) {
    try {
      const buffer = await file.arrayBuffer();
      await this.loadPdfBuffer(buffer, file.name);
    } catch (err) {
      console.error('[Pedif] File read error:', err);
      alert('Could not read file: ' + err.message);
    }
  }

  async loadPdfBuffer(buffer, fileName = 'Document.pdf', savedState = null) {
    try {
      // Create independent copies so worker transfers never detach the stored buffer
      const pdfJsBuffer = buffer.slice(0);
      const docBuffer = buffer.slice(0);

      const pdf = await pdfEngine.loadDocument(pdfJsBuffer);
      this.currentDoc = { buffer: docBuffer, name: fileName, pageCount: pdf.numPages };

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

      libraryStore.saveDocument({
        name: fileName,
        pageCount: pdf.numPages,
        buffer: docBuffer.slice(0),
      }).catch(e => console.warn('[LibraryStore] Non-fatal save failure:', e));

    } catch (err) {
      console.error('[Pedif] Error opening PDF:', err);
      alert('Could not open PDF: ' + err.message);
    }
  }

  updatePageIndicator(current, total) {
    let hud = document.getElementById('page-indicator-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'page-indicator-hud';
      hud.className = 'page-indicator-hud';
      document.body.appendChild(hud);
    }
    hud.textContent = `${current} / ${total}`;
    hud.style.opacity = '1';

    if (this._hudTimer) clearTimeout(this._hudTimer);
    this._hudTimer = setTimeout(() => {
      hud.style.opacity = '0';
    }, 2500);
  }

  async checkRestoreSession() {
    const { hasSession, metadata } = await autosave.checkRestoreSession();
    if (!hasSession || !metadata) return;

    const bannerContainer = document.getElementById('restore-banner-container');
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
