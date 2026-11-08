/**
 * VirtualViewer - 3-Tier Decoupled Page Layer & Viewport Virtualizer
 *
 * Implements:
 * 1. Infinite Viewport Virtualization via IntersectionObserver
 * 2. 3-Tier Layer Separation (Base PDF, Interactive SVG, 120 FPS Ink)
 * 3. SelectionOverlay integration with 8-Point Quads & Teardrop Handles
 * 4. Permanent Highlight Rendering & Lifecycle
 * 5. Unified Search Highlights rendering with live match navigation
 * 6. Lazy & On-Demand OCR Trigger for Scanned Pages
 */

import { pdfEngine } from './pdf-engine.js';
import { searchEngine } from './search-engine.js';
import { GlyphExtractor } from '../selection/glyph-extractor.js';
import { SelectionOverlay } from '../selection/selection-overlay.js';
import { highlightManager } from '../annotations/highlight-manager.js';
import { highlightPopover } from '../ui/highlight-popover.js';
import { ocrManager } from '../ocr/ocr-manager.js';

export class VirtualViewer {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('viewport-container');
    this.scale = options.scale || 1.25;
    this.rotation = options.rotation || 0; // 0, 90, 180, 270 degrees
    this.mode = options.mode || 'continuous'; // 'continuous' | 'page' | 'spread'
    this.margins = { left: 0, right: 0, top: 0, bottom: 0 };
    this.currentPage = 1;
    this.pageMetrics = new Map(); // pageNum -> { width, height, aspectRatio, scale }
    this.renderedPages = new Map(); // pageNum -> { container, layer0, layer1, layer2, overlay, renderTask }
    this.pageStrokes = new Map(); // pageNum -> Stroke[]
    this.pageTextData = new Map(); // pageNum -> { isScanned, lines, fullText }
    this.observer = null;
    this.activeTool = 'select'; // 'select' | 'pen' | 'highlighter' | 'eraser' | 'ocr'
    this.onPageChange = options.onPageChange || null;
    this.onSelectionEnd = options.onSelectionEnd || null;
    this.onZoomChange = options.onZoomChange || null;
    this.userHasManuallyZoomed = false;

    this.initObserver();
    this.initSearchSync();
    this.initHighlightSync();
    this.initGlobalListeners();
    this.initTouchGestures();
  }

  initTouchGestures() {
    if (!this.container) return;

    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchMidpoint = null;

    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchStartScale = this.scale;
        touchMidpoint = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
      }
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist > 0 && touchMidpoint) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (currentDist > 0) {
          e.preventDefault();
          const factor = currentDist / touchStartDist;
          const targetScale = Math.max(0.25, Math.min(5.0, touchStartScale * factor));
          if (Math.abs(this.scale - targetScale) > 0.02) {
            this.setScale(targetScale, touchMidpoint);
          }
        }
      }
    }, { passive: false });

    this.container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        touchStartDist = 0;
        touchMidpoint = null;
      }
    }, { passive: true });
  }

  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!pageNum) return;

        if (entry.isIntersecting) {
          this.mountPage(pageNum, entry.target);
        } else {
          this.unmountPage(pageNum, entry.target);
        }
      });
    }, {
      root: this.container,
      rootMargin: '100% 0px 100% 0px',
      threshold: [0, 0.1, 0.5],
    });
  }

  initSearchSync() {
    searchEngine.onChange(({ activeMatch }) => {
      this.renderedPages.forEach((record, pageNum) => {
        this.renderSearchHits(pageNum);
      });

      if (activeMatch && activeMatch.match) {
        this.scrollToPage(activeMatch.match.pageNum);
      }
    });
  }

  initHighlightSync() {
    highlightManager.onChange((targetPage) => {
      if (targetPage) {
        this.renderPermanentHighlights(targetPage);
      } else {
        this.renderedPages.forEach((record, pageNum) => {
          this.renderPermanentHighlights(pageNum);
        });
      }
    });
  }

  initGlobalListeners() {
    window.addEventListener('clear-selection', (e) => {
      const pageNum = e.detail && e.detail.pageNum;
      if (pageNum) {
        const record = this.renderedPages.get(pageNum);
        if (record && record.overlay) record.overlay.clearSelection();
      } else {
        this.renderedPages.forEach(r => {
          if (r.overlay) r.overlay.clearSelection();
        });
      }
    });

    if (typeof window !== 'undefined') {
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          this.handleResize();
        }, 150);
      });
    }
  }

  handleResize() {
    this.renderedPages.forEach((record, pageNum) => {
      this.unmountPage(pageNum, record.container);
      this.mountPage(pageNum, record.container);
    });
  }

  async loadDocument() {
    this.container.innerHTML = '';
    this.pageMetrics.clear();
    this.renderedPages.clear();
    this.pageTextData.clear();

    const numPages = pdfEngine.numPages;
    if (numPages === 0) return;

    const firstPage = await pdfEngine.getPage(1);
    const effectiveRotation = (firstPage.rotate + this.rotation) % 360;
    const firstViewport = firstPage.getViewport({ scale: 1, rotation: effectiveRotation });
    const defaultAspect = firstViewport.width / firstViewport.height;

    // Auto fit-width on initial document load if user hasn't explicitly zoomed
    const availW = Math.max(280, this.container.clientWidth - 48);
    if (!this.userHasManuallyZoomed) {
      this.scale = Math.max(0.35, Math.min(2.5, availW / firstViewport.width));
    }

    const fragment = document.createDocumentFragment();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'page-container virtual-placeholder';
      pageEl.id = `page-${pageNum}`;
      pageEl.dataset.page = pageNum;

      const width = Math.round(firstViewport.width * this.scale);
      const height = Math.round(width / defaultAspect);

      pageEl.style.width = `${width}px`;
      pageEl.style.height = `${height}px`;
      pageEl.style.minHeight = `${height}px`;

      this.pageMetrics.set(pageNum, {
        width,
        height,
        aspectRatio: defaultAspect,
        scale: this.scale,
        unscaledWidth: firstViewport.width,
        unscaledHeight: firstViewport.height,
        rotation: effectiveRotation,
      });

      fragment.appendChild(pageEl);
      this.observer.observe(pageEl);
    }

    this.container.appendChild(fragment);
    this.setupScrollTracker();
  }

  async mountPage(pageNum, pageEl) {
    if (this.renderedPages.has(pageNum)) return;

    try {
      const page = await pdfEngine.getPage(pageNum);
      const effectiveRotation = (page.rotate + this.rotation) % 360;
      const unscaledViewport = page.getViewport({ scale: 1, rotation: effectiveRotation });
      const aspect = unscaledViewport.width / unscaledViewport.height;

      const targetScale = this.scale;
      const targetWidth = Math.round(unscaledViewport.width * targetScale);
      const targetHeight = Math.round(unscaledViewport.height * targetScale);

      this.pageMetrics.set(pageNum, {
        width: targetWidth,
        height: targetHeight,
        aspectRatio: aspect,
        scale: targetScale,
        unscaledWidth: unscaledViewport.width,
        unscaledHeight: unscaledViewport.height,
        rotation: effectiveRotation,
      });

      pageEl.style.width = `${targetWidth}px`;
      pageEl.style.height = `${targetHeight}px`;
      pageEl.style.minHeight = `${targetHeight}px`;
      pageEl.classList.remove('virtual-placeholder');
      pageEl.dataset.tool = this.activeTool || 'select';

      if (this.margins && (this.margins.left || this.margins.right || this.margins.top || this.margins.bottom)) {
        const leftPct = (this.margins.left * 100).toFixed(1) + '%';
        const rightPct = ((1 - this.margins.right) * 100).toFixed(1) + '%';
        const topPct = (this.margins.top * 100).toFixed(1) + '%';
        const bottomPct = ((1 - this.margins.bottom) * 100).toFixed(1) + '%';
        pageEl.style.clipPath = `polygon(${leftPct} ${topPct}, ${rightPct} ${topPct}, ${rightPct} ${bottomPct}, ${leftPct} ${bottomPct})`;
      } else {
        pageEl.style.clipPath = 'none';
      }

      // ─────────────────────────────────────────────────────────────
      // LAYER 0: Base PDF Tile Canvas (High-DPI / DPR)
      // ─────────────────────────────────────────────────────────────
      let canvas0 = pageEl.querySelector('.layer-0-canvas');
      if (!canvas0) {
        canvas0 = document.createElement('canvas');
        canvas0.className = 'layer-0-canvas';
        pageEl.appendChild(canvas0);
      }

      // ─────────────────────────────────────────────────────────────
      // LAYER 1: Interactive SVG Selection & 8-Pt Quad Layer
      // ─────────────────────────────────────────────────────────────
      let svg1 = pageEl.querySelector('.layer-1-selection');
      if (!svg1) {
        svg1 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg1.setAttribute('class', 'layer-1-selection');
        svg1.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);

        const dimmer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dimmer.setAttribute('class', 'focus-dimmer');
        dimmer.setAttribute('width', '100%');
        dimmer.setAttribute('height', '100%');

        const searchGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        searchGroup.setAttribute('class', 'search-hits-group');

        const highlightGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        highlightGroup.setAttribute('class', 'highlight-group');

        const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        handleGroup.setAttribute('class', 'handle-group');

        svg1.appendChild(dimmer);
        svg1.appendChild(highlightGroup);
        svg1.appendChild(searchGroup);
        svg1.appendChild(handleGroup);
        pageEl.appendChild(svg1);
      }
      svg1.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);

      // ─────────────────────────────────────────────────────────────
      // LAYER 1.5: Native PDF.js Text Layer (Zero-lag native browser selection)
      // ─────────────────────────────────────────────────────────────
      let textLayerDiv = pageEl.querySelector('.textLayer');
      if (!textLayerDiv) {
        textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        pageEl.appendChild(textLayerDiv);
      }
      textLayerDiv.style.width = `${targetWidth}px`;
      textLayerDiv.style.height = `${targetHeight}px`;

      // ─────────────────────────────────────────────────────────────
      // LAYER 2: Vector Ink & Annotation Canvas (120 FPS Inking)
      // ─────────────────────────────────────────────────────────────
      let canvas2 = pageEl.querySelector('.layer-2-ink');
      if (!canvas2) {
        canvas2 = document.createElement('canvas');
        canvas2.className = `layer-2-ink mode-${this.activeTool}`;
        pageEl.appendChild(canvas2);
      }

      const dpr = window.devicePixelRatio || 1;
      canvas2.width = targetWidth * dpr;
      canvas2.height = targetHeight * dpr;
      canvas2.style.width = `${targetWidth}px`;
      canvas2.style.height = `${targetHeight}px`;

      // Extract native glyph quads for this page at current viewport and normalize to [0.0, 1.0]
      const targetViewport = page.getViewport({ scale: targetScale, rotation: effectiveRotation });
      let textData = this.pageTextData.get(pageNum);
      if (!textData) {
        textData = await GlyphExtractor.extractPageText(page, targetViewport);
        if (targetViewport.width && targetViewport.height) {
          textData = GlyphExtractor.normalizeTextData(textData, targetViewport.width, targetViewport.height);
        }
        this.pageTextData.set(pageNum, textData);
      }

      // Create SelectionOverlay instance for precision text selection
      const overlay = new SelectionOverlay({
        pageContainer: pageEl,
        svg: svg1,
        pageNum,
        lines: textData.lines,
        onSelectionEnd: (sel) => {
          if (typeof this.onSelectionEnd === 'function') {
            this.onSelectionEnd(sel);
          }
        },
      });

      const record = {
        pageNum,
        container: pageEl,
        layer0: canvas0,
        layer1: svg1,
        textLayer: textLayerDiv,
        layer2: canvas2,
        overlay,
        renderTask: null,
      };
      this.renderedPages.set(pageNum, record);

      record.renderTask = pdfEngine.renderPageToCanvas(page, canvas0, targetScale, effectiveRotation);
      await record.renderTask;

      // Render native text spans into textLayerDiv for seamless browser selection
      pdfEngine.renderTextLayerToContainer(page, textLayerDiv, targetViewport).catch((err) => {
        console.warn(`[VirtualViewer] textLayer render error on page ${pageNum}:`, err);
      });

      // Lazy Scanned Page OCR: If page has no digital text, trigger OCR
      if (textData.isScanned) {
        this.runLazyOcrOnPage(pageNum, canvas0, overlay);
      }

      // Replay strokes, permanent highlights, and search hits
      this.redrawPageStrokes(pageNum);
      this.renderPermanentHighlights(pageNum);
      this.renderSearchHits(pageNum);

      pageEl.dispatchEvent(new CustomEvent('page-mounted', {
        bubbles: true,
        detail: { pageNum, page, targetWidth, targetHeight, targetScale, svg1 }
      }));

    } catch (err) {
      console.warn(`[VirtualViewer] Error mounting page ${pageNum}:`, err);
    }
  }

  async runLazyOcrOnPage(pageNum, canvas0, overlay) {
    try {
      const ocrResult = await ocrManager.processPageCanvas(canvas0, pageNum);
      if (ocrResult && ocrResult.lines && ocrResult.lines.length) {
        this.pageTextData.set(pageNum, ocrResult);
        if (overlay) {
          overlay.updateLines(ocrResult.lines);
        }
      }
      return ocrResult;
    } catch (err) {
      console.warn(`[VirtualViewer] Lazy OCR error on page ${pageNum}:`, err);
      return null;
    }
  }

  async runManualOcr(pageNum = this.currentPage) {
    const record = this.renderedPages.get(pageNum);
    if (!record || !record.layer0) return null;
    return this.runLazyOcrOnPage(pageNum, record.layer0, record.overlay);
  }

  unmountPage(pageNum, pageEl) {
    const record = this.renderedPages.get(pageNum);
    if (!record) return;

    if (record.renderTask && typeof record.renderTask.cancel === 'function') {
      try { record.renderTask.cancel(); } catch {}
    }

    if (record.layer0) {
      record.layer0.width = 0;
      record.layer0.height = 0;
      record.layer0.remove();
    }
    if (record.layer1) record.layer1.remove();
    if (record.textLayer) {
      record.textLayer.innerHTML = '';
      record.textLayer.remove();
    }
    if (record.layer2) {
      record.layer2.width = 0;
      record.layer2.height = 0;
      record.layer2.remove();
    }

    pageEl.classList.add('virtual-placeholder');
    this.renderedPages.delete(pageNum);
  }

  renderPermanentHighlights(pageNum) {
    const record = this.renderedPages.get(pageNum);
    if (!record || !record.layer1) return;

    const highlightGroup = record.layer1.querySelector('.highlight-group');
    if (!highlightGroup) return;

    const oldHighlights = highlightGroup.querySelectorAll('.permanent-highlight');
    oldHighlights.forEach(h => h.remove());

    const metrics = this.pageMetrics.get(pageNum);
    const targetW = metrics ? metrics.width : (record.container.clientWidth || 800);
    const targetH = metrics ? metrics.height : (record.container.clientHeight || 1000);

    const annotations = highlightManager.getAnnotationsForPage(pageNum);
    annotations.forEach(ann => {
      let pathData = '';
      const isUnderline = ann.style === 'underline';
      const isStrike = ann.style === 'strikethrough';

      ann.quads.forEach(q => {
        const isNorm = (q.isNormalized || (q.lt.x <= 1.0 && q.lt.y <= 1.0));
        const sx = isNorm ? targetW : 1;
        const sy = isNorm ? targetH : 1;
        const ltX = q.lt.x * sx, ltY = q.lt.y * sy;
        const rtX = q.rt.x * sx, rtY = q.rt.y * sy;
        const rbX = q.rb.x * sx, rbY = q.rb.y * sy;
        const lbX = q.lb.x * sx, lbY = q.lb.y * sy;

        const minX = Math.min(ltX, lbX);
        const maxX = Math.max(rtX, rbX);
        const minY = Math.min(ltY, rtY);
        const maxY = Math.max(lbY, rbY);
        const w = Math.max(4, maxX - minX);
        const h = Math.max(6, maxY - minY);

        if (isUnderline) {
          pathData += ` M ${minX} ${maxY - 1} L ${maxX} ${maxY - 1}`;
        } else if (isStrike) {
          const midY = minY + h / 2;
          pathData += ` M ${minX} ${midY} L ${maxX} ${midY}`;
        } else {
          const r = Math.min(4, h / 3);
          pathData += ` M ${minX + r} ${minY} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 -${r} ${r} h -${w - 2 * r} a ${r} ${r} 0 0 1 -${r} -${r} v -${h - 2 * r} a ${r} ${r} 0 0 1 ${r} -${r} Z`;
        }
      });

      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathData.trim());
      pathEl.setAttribute('class', `permanent-highlight style-${ann.style || 'highlight'}`);
      if (isUnderline || isStrike) {
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', ann.color);
        pathEl.setAttribute('stroke-width', isUnderline ? '2.5' : '2');
        pathEl.setAttribute('stroke-linecap', 'round');
      } else {
        pathEl.setAttribute('fill', ann.color);
        pathEl.setAttribute('fill-opacity', ann.opacity || 0.38);
        pathEl.setAttribute('stroke', ann.color);
        pathEl.setAttribute('stroke-width', '1');
      }
      pathEl.dataset.annId = ann.id;

      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        highlightPopover.showForHighlight(ann, pageNum, e);
      });

      highlightGroup.appendChild(pathEl);
    });
  }

  renderSearchHits(pageNum) {
    const record = this.renderedPages.get(pageNum);
    if (!record || !record.layer1) return;

    const searchGroup = record.layer1.querySelector('.search-hits-group');
    if (!searchGroup) return;

    searchGroup.innerHTML = '';
    const matches = searchEngine.getMatchesForPage(pageNum);
    if (!matches.length) return;

    const active = searchEngine.getActiveMatch();
    const metrics = this.pageMetrics.get(pageNum);
    const targetW = metrics ? metrics.width : (record.container.clientWidth || 800);
    const targetH = metrics ? metrics.height : (record.container.clientHeight || 1000);

    matches.forEach(m => {
      const q = m.quad;
      const isNorm = (q.isNormalized || (q.lt.x <= 1.0 && q.lt.y <= 1.0));
      const sx = isNorm ? targetW : 1;
      const sy = isNorm ? targetH : 1;
      const pathData = `M ${q.lt.x * sx} ${q.lt.y * sy} L ${q.rt.x * sx} ${q.rt.y * sy} L ${q.rb.x * sx} ${q.rb.y * sy} L ${q.lb.x * sx} ${q.lb.y * sy} Z`;
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathData);

      const isActive = active && active.match && active.match.id === m.id;
      pathEl.setAttribute('class', isActive ? 'search-hit active-hit' : 'search-hit');
      pathEl.dataset.matchId = m.id;

      searchGroup.appendChild(pathEl);
    });
  }

  redrawPageStrokes(pageNum) {
    const record = this.renderedPages.get(pageNum);
    if (!record || !record.layer2) return;

    const canvas = record.layer2;
    const ctx = canvas.getContext('2d');
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const strokes = this.pageStrokes.get(pageNum) || [];

    const metrics = this.pageMetrics.get(pageNum);
    const targetW = metrics ? metrics.width : (canvas.width / dpr);
    const targetH = metrics ? metrics.height : (canvas.height / dpr);

    strokes.forEach(stroke => {
      this.renderStroke(ctx, stroke, dpr, targetW, targetH);
    });
  }

  renderStroke(ctx, stroke, dpr = 1, targetW = 800, targetH = 1000) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    const w = targetW || (ctx.canvas ? ctx.canvas.width / dpr : 800);
    const h = targetH || (ctx.canvas ? ctx.canvas.height / dpr : 1000);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = stroke.color;

    // Dynamically scale stroke width by page zoom (relative to 800px base width)
    const scaleFactor = Math.max(0.4, Math.min(3.5, w / 800));
    ctx.lineWidth = (stroke.width || 3) * scaleFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = stroke.opacity !== undefined ? stroke.opacity : 1.0;

    if (stroke.type === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
    }

    const isNorm = stroke.isNormalized && (stroke.points[0].x <= 1.0 && stroke.points[0].y <= 1.0);
    const toPx = (pt) => ({
      x: isNorm ? pt.x * w : pt.x,
      y: isNorm ? pt.y * h : pt.y,
    });

    const p0 = toPx(stroke.points[0]);

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, Math.max(1.5, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);

    if (stroke.isSnapped && stroke.points.length === 2) {
      const p1 = toPx(stroke.points[1]);
      ctx.lineTo(p1.x, p1.y);
    } else if (stroke.isSnapped && stroke.points.length > 2) {
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = toPx(stroke.points[i]);
        ctx.lineTo(pt.x, pt.y);
      }
    } else if (stroke.points.length === 2) {
      const p1 = toPx(stroke.points[1]);
      ctx.lineTo(p1.x, p1.y);
    } else {
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const curr = toPx(stroke.points[i]);
        const next = toPx(stroke.points[i + 1]);
        const xc = (curr.x + next.x) / 2;
        const yc = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, xc, yc);
      }
      const last = toPx(stroke.points[stroke.points.length - 1]);
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  setTool(tool) {
    this.activeTool = tool;
    this.renderedPages.forEach(({ layer2, container }) => {
      if (layer2) {
        layer2.className = `layer-2-ink mode-${tool}`;
      }
      if (container) {
        container.dataset.tool = tool;
      }
    });
  }

  setScale(newScale, anchorPoint = null) {
    if (newScale < 0.25 || newScale > 5.0 || Math.abs(this.scale - newScale) < 0.005) return;
    this.userHasManuallyZoomed = true;
    const oldScale = this.scale;
    const ratio = newScale / oldScale;
    this.scale = newScale;

    // Anchor calculation for cursor or viewport-centered zooming
    let scrollX = 0, scrollY = 0;
    if (this.container) {
      let clientX, clientY;
      if (anchorPoint && typeof anchorPoint.x === 'number' && typeof anchorPoint.y === 'number') {
        clientX = anchorPoint.x;
        clientY = anchorPoint.y;
      } else {
        clientX = this.container.clientWidth / 2;
        clientY = this.container.clientHeight / 2;
      }
      const rect = this.container.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;

      const docX = this.container.scrollLeft + offsetX;
      const docY = this.container.scrollTop + offsetY;

      scrollX = Math.round((docX * ratio) - offsetX);
      scrollY = Math.round((docY * ratio) - offsetY);
    }

    // Resize ALL page containers across the entire virtual document
    const numPages = pdfEngine.numPages;
    for (let pNum = 1; pNum <= numPages; pNum++) {
      const el = document.getElementById(`page-${pNum}`);
      if (!el) continue;

      let unscaledW = 600, unscaledH = 800;
      const metrics = this.pageMetrics.get(pNum);
      if (metrics && metrics.unscaledWidth && metrics.unscaledHeight) {
        unscaledW = metrics.unscaledWidth;
        unscaledH = metrics.unscaledHeight;
      } else if (metrics && metrics.scale) {
        unscaledW = metrics.width / metrics.scale;
        unscaledH = metrics.height / metrics.scale;
      }

      const newW = Math.round(unscaledW * newScale);
      const newH = Math.round(unscaledH * newScale);

      el.style.width = `${newW}px`;
      el.style.height = `${newH}px`;
      el.style.minHeight = `${newH}px`;

      if (metrics) {
        metrics.width = newW;
        metrics.height = newH;
        metrics.scale = newScale;
      }
    }

    // Re-render currently visible active pages at new DPR scale
    this.renderedPages.forEach((record, pageNum) => {
      this.unmountPage(pageNum, record.container);
      this.mountPage(pageNum, record.container);
    });

    if (this.container) {
      this.container.scrollLeft = scrollX;
      this.container.scrollTop = scrollY;
    }

    if (typeof this.onZoomChange === 'function') {
      this.onZoomChange(newScale);
    }
  }

  fitWidth() {
    if (!this.container || !this.pageMetrics.size) return this.scale;
    const targetPage = this.currentPage || 1;
    const m = this.pageMetrics.get(targetPage) || this.pageMetrics.get(1);
    if (!m) return this.scale;
    const unscaledW = m.unscaledWidth || (m.width / m.scale);
    const availW = Math.max(280, this.container.clientWidth - 48);
    const targetScale = Math.max(0.3, Math.min(4.5, availW / unscaledW));
    this.setScale(targetScale);
    return targetScale;
  }

  fitPage() {
    if (!this.container || !this.pageMetrics.size) return this.scale;
    const targetPage = this.currentPage || 1;
    const m = this.pageMetrics.get(targetPage) || this.pageMetrics.get(1);
    if (!m) return this.scale;
    const unscaledW = m.unscaledWidth || (m.width / m.scale);
    const unscaledH = m.unscaledHeight || (m.height / m.scale);
    const availW = Math.max(280, this.container.clientWidth - 48);
    const availH = Math.max(280, this.container.clientHeight - 64);
    const targetScale = Math.max(0.3, Math.min(4.5, Math.min(availW / unscaledW, availH / unscaledH)));
    this.setScale(targetScale);
    return targetScale;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode; // 'continuous' | 'spread'
    if (this.container) {
      this.container.classList.toggle('mode-spread', mode === 'spread');
    }
    this.renderedPages.forEach((record, pageNum) => {
      this.unmountPage(pageNum, record.container);
      this.mountPage(pageNum, record.container);
    });
  }

  rotateClockwise() {
    this.rotation = (this.rotation + 90) % 360;
    this.pageTextData.clear();

    // Invert unscaledWidth & unscaledHeight for placeholders
    const numPages = pdfEngine.numPages;
    for (let pNum = 1; pNum <= numPages; pNum++) {
      const el = document.getElementById(`page-${pNum}`);
      const metrics = this.pageMetrics.get(pNum);
      if (metrics) {
        const temp = metrics.unscaledWidth;
        metrics.unscaledWidth = metrics.unscaledHeight;
        metrics.unscaledHeight = temp;
        const newW = Math.round(metrics.unscaledWidth * this.scale);
        const newH = Math.round(metrics.unscaledHeight * this.scale);
        metrics.width = newW;
        metrics.height = newH;
        if (el) {
          el.style.width = `${newW}px`;
          el.style.height = `${newH}px`;
          el.style.minHeight = `${newH}px`;
        }
      }
    }

    this.renderedPages.forEach((record, pageNum) => {
      this.unmountPage(pageNum, record.container);
      this.mountPage(pageNum, record.container);
    });
    return this.rotation;
  }

  setCropMargins(margins) {
    this.margins = margins;
    const leftPct = (margins.left * 100).toFixed(1) + '%';
    const rightPct = ((1 - margins.right) * 100).toFixed(1) + '%';
    const topPct = (margins.top * 100).toFixed(1) + '%';
    const bottomPct = ((1 - margins.bottom) * 100).toFixed(1) + '%';
    const clip = `polygon(${leftPct} ${topPct}, ${rightPct} ${topPct}, ${rightPct} ${bottomPct}, ${leftPct} ${bottomPct})`;
    if (this.container) {
      this.container.querySelectorAll('.page-container').forEach(el => {
        el.style.clipPath = clip;
      });
    }
  }

  resetCropMargins() {
    this.margins = { left: 0, right: 0, top: 0, bottom: 0 };
    if (this.container) {
      this.container.querySelectorAll('.page-container').forEach(el => {
        el.style.clipPath = 'none';
      });
    }
  }

  async autoCropMargins() {
    try {
      const page = await pdfEngine.getPage(this.currentPage || 1);
      const vp = page.getViewport({ scale: 0.35 });
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(vp.width));
      c.height = Math.max(1, Math.round(vp.height));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const imgData = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, maxX = -1, minY = c.height, maxY = -1;

      for (let y = 0; y < c.height; y++) {
        const row = y * c.width;
        for (let x = 0; x < c.width; x++) {
          const idx = (row + x) * 4;
          const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
          if (lum < 230) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX <= minX || maxY <= minY) return { left: 0, right: 0, top: 0, bottom: 0 };

      const pad = 4;
      const left = Math.max(0, Math.min(0.35, (minX - pad) / c.width));
      const right = Math.max(0, Math.min(0.35, (c.width - maxX - pad) / c.width));
      const top = Math.max(0, Math.min(0.35, (minY - pad) / c.height));
      const bottom = Math.max(0, Math.min(0.35, (c.height - maxY - pad) / c.height));

      const margins = { left, right, top, bottom };
      this.setCropMargins(margins);
      return margins;
    } catch (err) {
      console.warn('[VirtualViewer] autoCropMargins error:', err);
      return null;
    }
  }

  setupScrollTracker() {
    let scrollTimeout = null;
    this.container.addEventListener('scroll', () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        this.updateCurrentPage();
      }, 80);
    });
  }

  updateCurrentPage() {
    const containerTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    const centerY = containerTop + containerHeight / 2;

    for (let pageNum = 1; pageNum <= pdfEngine.numPages; pageNum++) {
      const pageEl = document.getElementById(`page-${pageNum}`);
      if (pageEl) {
        const top = pageEl.offsetTop;
        const bottom = top + pageEl.offsetHeight;
        if (centerY >= top && centerY <= bottom) {
          if (this.currentPage !== pageNum) {
            this.currentPage = pageNum;
            if (typeof this.onPageChange === 'function') {
              this.onPageChange(pageNum, pdfEngine.numPages);
            }
          }
          break;
        }
      }
    }
  }

  scrollToPage(pageNum) {
    const pageEl = document.getElementById(`page-${pageNum}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  destroy() {
    if (this.observer) this.observer.disconnect();
    this.renderedPages.clear();
    this.pageMetrics.clear();
    this.pageTextData.clear();
  }
}
