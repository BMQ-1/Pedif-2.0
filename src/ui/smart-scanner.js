/**
 * Precision Smart Text Scanner ("T" Button)
 * Sovereign local document text extraction:
 * 1. Analyzes document pages with local on-device PP-OCRv4 (WebGPU / WASM)
 * 2. Visualizes detected text blocks with glowing interactive bounds
 * 3. Provides instant "Copy All" and individual word selection
 * 4. Injects quads into pageTextData so scanned pages become permanently selectable & searchable
 */

import { ocrManager } from '../ocr/ocr-manager.js';
import { showToast } from './toast.js';

export class SmartScanner {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.button = null;
    this.overlayPanel = null;
    this.activeOverlays = new Map(); // pageNum -> SVG group
    this.isScanning = false;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    this.createFloatingButton();
    this.createBottomPill();
  }

  createFloatingButton() {
    // Floating "T" Smart Scan action button in the bottom dock or reader
    const dock = document.getElementById('dk');
    if (!dock) return;

    this.button = document.createElement('button');
    this.button.className = 'b rip btn-smart-scan';
    this.button.id = 'btn-smart-scan-t';
    this.button.title = 'Smart Scan (Extract Text from Page)';
    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:16px;height:16px;">
        <polyline points="4 7 4 4 20 4 20 7"></polyline>
        <line x1="9" y1="20" x2="15" y2="20"></line>
        <line x1="12" y1="4" x2="12" y2="20"></line>
      </svg>
      <span class="smart-scan-badge">AI</span>
    `;

    this.button.addEventListener('click', () => this.toggleScanCurrentPage());
    dock.insertBefore(this.button, dock.firstChild);
  }

  createBottomPill() {
    this.overlayPanel = document.createElement('div');
    this.overlayPanel.className = 'smart-scan-pill glass';
    this.overlayPanel.style.display = 'none';
    this.overlayPanel.innerHTML = `
      <div class="smart-scan-info">
        <span class="smart-scan-dot"></span>
        <span id="smart-scan-status">Text Extracted</span>
      </div>
      <div class="smart-scan-actions">
        <button class="btn-primary sm rip" id="btn-smart-copy-all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy All</span>
        </button>
        <button class="b sm rip" id="btn-smart-scan-close" title="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.overlayPanel);

    this.overlayPanel.querySelector('#btn-smart-scan-close')?.addEventListener('click', () => {
      this.clearOverlays();
      this.overlayPanel.style.display = 'none';
    });
  }

  async toggleScanCurrentPage() {
    if (this.isScanning) return;
    const curPage = (this.viewer && this.viewer.currentPage) || 1;
    const record = this.viewer ? this.viewer.renderedPages.get(curPage) : null;

    if (!record || !record.layer0) {
      showToast('No active page to scan', 'alert');
      return;
    }

    // Toggle off if already active
    if (this.activeOverlays.has(curPage)) {
      this.clearOverlays();
      this.overlayPanel.style.display = 'none';
      return;
    }

    try {
      this.isScanning = true;
      if (this.button) this.button.classList.add('scanning');
      showToast(`Smart Scanning Page ${curPage} with WebGPU...`, 'star');

      const ocrResult = await ocrManager.processPageCanvas(record.layer0, curPage);

      if (!ocrResult || !ocrResult.lines || !ocrResult.lines.length) {
        showToast('No text detected on this page', 'alert');
        this.isScanning = false;
        if (this.button) this.button.classList.remove('scanning');
        return;
      }

      // Update viewer data so page is permanently selectable & searchable
      this.viewer.pageTextData.set(curPage, ocrResult);
      if (record.overlay) {
        record.overlay.updateLines(ocrResult.lines);
      }

      this.renderExtractedOverlay(curPage, ocrResult, record);

      // Show bottom pill
      const wordCount = ocrResult.lines.reduce((acc, l) => acc + (l.words ? l.words.length : 1), 0);
      const statusEl = this.overlayPanel.querySelector('#smart-scan-status');
      if (statusEl) statusEl.textContent = `${wordCount} Words Extracted`;

      const copyAllBtn = this.overlayPanel.querySelector('#btn-smart-copy-all');
      if (copyAllBtn) {
        copyAllBtn.onclick = () => {
          if (ocrResult.fullText && navigator.clipboard) {
            navigator.clipboard.writeText(ocrResult.fullText).then(() => {
              showToast(`Copied ${wordCount} words to clipboard`, 'check');
            });
          }
        };
      }

      this.overlayPanel.style.display = 'flex';
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
      showToast('Tap any text block to copy or highlight', 'check');

    } catch (err) {
      console.warn('[SmartScanner] Error scanning page:', err);
      showToast('Scan error: ' + err.message, 'alert');
    } finally {
      this.isScanning = false;
      if (this.button) this.button.classList.remove('scanning');
    }
  }

  renderExtractedOverlay(pageNum, ocrResult, record) {
    if (!record || !record.layer1) return;
    this.clearOverlays();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'smart-scan-overlay-group');

    const metrics = this.viewer.pageMetrics.get(pageNum);
    const targetW = metrics ? metrics.width : (record.container.clientWidth || 800);
    const targetH = metrics ? metrics.height : (record.container.clientHeight || 1000);

    ocrResult.lines.forEach(line => {
      const q = line.quad;
      if (!q) return;

      const isNorm = (q.isNormalized || (q.lt && q.lt.x <= 1.0));
      const sx = isNorm ? targetW : 1;
      const sy = isNorm ? targetH : 1;

      let minX, minY, maxX, maxY;
      if (Array.isArray(q)) {
        minX = Math.min(q[0], q[2], q[4], q[6]);
        maxX = Math.max(q[0], q[2], q[4], q[6]);
        minY = Math.min(q[1], q[3], q[5], q[7]);
        maxY = Math.max(q[1], q[3], q[5], q[7]);
      } else {
        minX = Math.min(q.lt.x, q.lb.x) * sx;
        maxX = Math.max(q.rt.x, q.rb.x) * sx;
        minY = Math.min(q.lt.y, q.rt.y) * sy;
        maxY = Math.max(q.lb.y, q.rb.y) * sy;
      }

      const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectEl.setAttribute('x', minX);
      rectEl.setAttribute('y', minY);
      rectEl.setAttribute('width', Math.max(8, maxX - minX));
      rectEl.setAttribute('height', Math.max(10, maxY - minY));
      rectEl.setAttribute('rx', '4');
      rectEl.setAttribute('class', 'smart-scan-box');

      rectEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (line.text && navigator.clipboard) {
          navigator.clipboard.writeText(line.text).then(() => {
            showToast(`Copied: "${line.text.slice(0, 24)}..."`, 'check');
          });
        }
      });

      g.appendChild(rectEl);
    });

    record.layer1.appendChild(g);
    this.activeOverlays.set(pageNum, g);
  }

  clearOverlays() {
    this.activeOverlays.forEach(g => g.remove());
    this.activeOverlays.clear();
  }
}
