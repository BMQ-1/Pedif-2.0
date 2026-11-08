/**
 * Dynamic Catmull-Rom Vector Inking & Ergonomics Engine
 * Implements:
 * 1. Continuous uninterrupted smooth inking with zero mid-stroke cuts
 * 2. Catmull-Rom & Quadratic Spline live smoothing with getCoalescedEvents()
 * 3. Gentle End-of-Stroke Hold-to-Snap (Auto-straightens only when held stationary for 700ms)
 * 4. Palm Rejection & Stylus Discrimination (e.pointerType === 'pen')
 * 5. Unified Vector & Highlight Eraser with single-gesture Undo/Redo batching
 * 6. Bounded Undo/Redo integration with CommandStack
 */

import { Stroke } from './stroke-model.js';
import { commandStack } from '../core/command-stack.js';
import { autosave } from '../storage/autosave.js';
import { highlightManager } from '../annotations/highlight-manager.js';

export class InkEngine {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.activeTool = options.activeTool || 'pen'; // 'pen' | 'highlighter' | 'eraser'
    this.penColor = options.penColor || '#000000';
    this.penWidth = options.penWidth || 3;
    this.highlighterColor = options.highlighterColor || 'rgba(250, 204, 21, 0.45)';
    this.highlighterWidth = options.highlighterWidth || 22;

    this.currentStroke = null;
    this.activeCanvas = null;
    this.activePageNum = null;
    this.isPointerDown = false;
    this.holdTimer = null;
    this.lastPoint = null;
    this.hasStylusPen = false;
    this._animFrame = null;

    // Batch records for eraser gestures
    this.erasedStrokesBatch = [];
    this.erasedHighlightsBatch = [];

    // Bound handlers for global window tracking
    this._onWindowPointerMove = this.onWindowPointerMove.bind(this);
    this._onWindowPointerUp = this.onWindowPointerUp.bind(this);

    if (typeof window !== 'undefined') {
      this.initCanvasListeners();
    }
  }

  setTool(tool) {
    this.activeTool = tool;
  }

  setPenColor(color) {
    this.penColor = color;
  }

  setPenWidth(width) {
    this.penWidth = width;
  }

  setHighlighterColor(color) {
    this.highlighterColor = color;
  }

  setHighlighterWidth(width) {
    this.highlighterWidth = width;
  }

  initCanvasListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('page-mounted', (e) => {
      const { pageNum } = e.detail;
      if (this.viewer && this.viewer.renderedPages) {
        const record = this.viewer.renderedPages.get(pageNum);
        if (record && record.layer2) {
          this.attachToCanvas(record.layer2, pageNum);
        }
      }
    });
  }

  attachToCanvas(canvas, pageNum) {
    if (!canvas || canvas._inkAttached) return;
    canvas._inkAttached = true;

    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e, canvas, pageNum), { passive: false });
  }

  /**
   * Palm Rejection & Stylus Discrimination
   */
  isPointerAllowed(e) {
    if (!e) return true;

    if (e.pointerType === 'pen') {
      this.hasStylusPen = true;
      return true;
    }

    if (e.pointerType === 'touch') {
      if (this.hasStylusPen) {
        return false;
      }
      return true;
    }

    return true; // Mouse
  }

  handlePointerDown(e, canvas, pageNum) {
    if (!this.isPointerAllowed(e)) return;
    if (this.activeTool !== 'pen' && this.activeTool !== 'highlighter' && this.activeTool !== 'eraser') {
      return;
    }

    e.preventDefault();
    if (e.button !== undefined && e.button !== 0) return; // Only primary button

    this.isPointerDown = true;
    this.activeCanvas = canvas;
    this.activePageNum = pageNum;
    this.activePointerId = e.pointerId;

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
    }

    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width || 800, height: canvas.height || 1000 };
    const canvasW = Math.max(1, rect.width || canvas.clientWidth || 800);
    const canvasH = Math.max(1, rect.height || canvas.clientHeight || 1000);

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, screenX / canvasW));
    const normY = Math.max(0, Math.min(1, screenY / canvasH));
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    // Attach global tracking on window so fast drawing never loses capture
    window.addEventListener('pointermove', this._onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onWindowPointerUp, { passive: false });
    window.addEventListener('pointercancel', this._onWindowPointerUp, { passive: false });

    if (this.activeTool === 'eraser') {
      this.erasedStrokesBatch = [];
      this.erasedHighlightsBatch = [];
      this.eraseAt(pageNum, screenX, screenY, canvasW, canvasH);
      return;
    }

    // Initialize new vector stroke with normalized coordinates [0.0, 1.0]
    const isHighlighter = this.activeTool === 'highlighter';
    const baseWidth = isHighlighter ? this.highlighterWidth : this.penWidth;
    const strokeColor = isHighlighter ? this.highlighterColor : this.penColor;

    this.currentStroke = new Stroke({
      type: this.activeTool,
      color: strokeColor,
      width: baseWidth,
      opacity: isHighlighter ? 0.38 : 1.0,
      points: [{ x: normX, y: normY, pressure }],
      isSnapped: false,
      isNormalized: true,
    });

    this.lastPoint = { x: screenX, y: screenY };

    // Initial dot render
    this.renderLiveStroke(canvas, pageNum);
  }

  onWindowPointerMove(e) {
    if (!this.isPointerDown || !this.activeCanvas) return;
    e.preventDefault();

    const canvas = this.activeCanvas;
    const pageNum = this.activePageNum;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width || 800, height: canvas.height || 1000 };
    const canvasW = Math.max(1, rect.width || canvas.clientWidth || 800);
    const canvasH = Math.max(1, rect.height || canvas.clientHeight || 1000);

    const events = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [e];

    for (const ev of events) {
      const screenX = ev.clientX - rect.left;
      const screenY = ev.clientY - rect.top;
      const normX = Math.max(0, Math.min(1, screenX / canvasW));
      const normY = Math.max(0, Math.min(1, screenY / canvasH));
      const pressure = ev.pressure > 0 ? ev.pressure : 0.5;

      if (this.activeTool === 'eraser') {
        this.eraseAt(pageNum, screenX, screenY, canvasW, canvasH);
        continue;
      }

      if (!this.currentStroke) continue;

      // Reset hold-to-snap timer on movement
      this.cancelHoldTimer();

      // Check movement distance from last point
      if (this.lastPoint) {
        const dist = Math.hypot(screenX - this.lastPoint.x, screenY - this.lastPoint.y);
        // If stroke was snapped but user resumed moving, un-snap to continue fluid drawing
        if (dist > 3 && this.currentStroke.isSnapped) {
          this.currentStroke.isSnapped = false;
        }
      }

      this.currentStroke.addPoint(normX, normY, pressure);
      this.lastPoint = { x: screenX, y: screenY };
    }

    if (this.activeTool !== 'eraser' && this.currentStroke) {
      this.scheduleLiveRender(canvas, pageNum);

      // Start stillness timer for gentle hold-to-snap at line end
      this.startHoldTimer();
    }
  }

  scheduleLiveRender(canvas, pageNum) {
    if (this._animFrame) return;
    this._animFrame = requestAnimationFrame(() => {
      this._animFrame = null;
      if (this.currentStroke && this.activeCanvas) {
        this.renderLiveStroke(this.activeCanvas, this.activePageNum);
      }
    });
  }

  onWindowPointerUp(e) {
    this.cancelHoldTimer();
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }

    window.removeEventListener('pointermove', this._onWindowPointerMove);
    window.removeEventListener('pointerup', this._onWindowPointerUp);
    window.removeEventListener('pointercancel', this._onWindowPointerUp);

    const canvas = this.activeCanvas;
    if (canvas && canvas.releasePointerCapture && this.activePointerId !== undefined) {
      try {
        canvas.releasePointerCapture(this.activePointerId);
      } catch {}
    }

    if (this.activeTool === 'eraser') {
      this.finishEraserDrag();
      this.isPointerDown = false;
      this.activeCanvas = null;
      this.activePageNum = null;
      return;
    }

    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      const strokeToCommit = this.currentStroke;
      const targetPage = this.activePageNum;

      // Commit completed stroke to CommandStack for reversible Undo/Redo
      commandStack.execute({
        description: `Draw ${strokeToCommit.type}`,
        execute: () => {
          let strokes = this.viewer.pageStrokes.get(targetPage) || [];
          strokes.push(strokeToCommit);
          this.viewer.pageStrokes.set(targetPage, strokes);
          this.viewer.redrawPageStrokes(targetPage);
          this.queueAutosaveStrokes();
        },
        undo: () => {
          let strokes = this.viewer.pageStrokes.get(targetPage) || [];
          strokes = strokes.filter(s => s.id !== strokeToCommit.id);
          this.viewer.pageStrokes.set(targetPage, strokes);
          this.viewer.redrawPageStrokes(targetPage);
          this.queueAutosaveStrokes();
        },
      });
    }

    this.isPointerDown = false;
    this.currentStroke = null;
    this.activeCanvas = null;
    this.activePageNum = null;
    this.lastPoint = null;
  }

  /**
   * Hold-to-Snap: Auto-straightens a line ONLY when user holds still at the end for 700ms
   */
  startHoldTimer() {
    this.cancelHoldTimer();
    this.holdTimer = setTimeout(() => {
      // Must have enough points to form a meaningful line
      if (this.isPointerDown && this.currentStroke && this.currentStroke.points.length > 8) {
        const first = this.currentStroke.points[0];
        const last = this.currentStroke.points[this.currentStroke.points.length - 1];

        // Only snap if the total distance is significant (at least 20px)
        const dx = (last.x - first.x);
        const dy = (last.y - first.y);
        const totalDist = Math.hypot(dx, dy);

        if (totalDist > 0.03) {
          this.currentStroke.points = [first, last];
          this.currentStroke.isSnapped = true;

          // Subtle tactile tick on supported devices
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(8);
          }

          if (this.activeCanvas && this.activePageNum) {
            this.renderLiveStroke(this.activeCanvas, this.activePageNum);
          }
        }
      }
    }, 700);
  }

  cancelHoldTimer() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /**
   * Unified Eraser: Sweeps across vector strokes AND text highlights
   */
  eraseAt(pageNum, x, y, canvasW = 1, canvasH = 1) {
    const eraserRadius = 24; // Generous natural sweep radius

    // 1. Erase vector strokes on this page
    const strokes = this.viewer ? (this.viewer.pageStrokes.get(pageNum) || []) : [];
    if (strokes.length) {
      let changed = false;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const stroke = strokes[i];
        if (stroke.intersectsPoint(x, y, eraserRadius, canvasW, canvasH)) {
          strokes.splice(i, 1);
          this.erasedStrokesBatch.push({ stroke, pageNum });
          changed = true;
        }
      }
      if (changed) {
        this.viewer.pageStrokes.set(pageNum, strokes);
        this.viewer.redrawPageStrokes(pageNum);
      }
    }

    // 2. Erase text highlights on this page
    const hitHighlight = highlightManager.findHighlightAt(pageNum, x, y, eraserRadius, canvasW, canvasH);
    if (hitHighlight) {
      const removed = highlightManager.removeHighlightSilently(hitHighlight.id);
      if (removed) {
        this.erasedHighlightsBatch.push(removed);
      }
    }

    // If called directly outside a pointer drag (e.g. programmatic erase or test), commit immediately
    if (!this.isPointerDown && (this.erasedStrokesBatch.length > 0 || this.erasedHighlightsBatch.length > 0)) {
      this.finishEraserDrag();
    }
  }

  /**
   * Finalizes an eraser swipe into a single cohesive undoable CommandStack operation
   */
  finishEraserDrag() {
    const strokesToRestore = [...this.erasedStrokesBatch];
    const highlightsToRestore = [...this.erasedHighlightsBatch];
    this.erasedStrokesBatch = [];
    this.erasedHighlightsBatch = [];

    const totalCount = strokesToRestore.length + highlightsToRestore.length;
    if (totalCount === 0) return;

    commandStack.execute({
      description: `Erase ${totalCount} item${totalCount > 1 ? 's' : ''}`,
      execute: () => {
        // Remove strokes on initial execute / redo
        strokesToRestore.forEach(({ stroke, pageNum }) => {
          const list = (this.viewer.pageStrokes.get(pageNum) || []).filter(s => s.id !== stroke.id);
          this.viewer.pageStrokes.set(pageNum, list);
          this.viewer.redrawPageStrokes(pageNum);
        });
        // Remove highlights on initial execute / redo
        highlightsToRestore.forEach(ann => {
          highlightManager.removeHighlightSilently(ann.id);
        });
        this.queueAutosaveStrokes();
      },
      undo: () => {
        // Restore strokes grouped by page
        strokesToRestore.forEach(({ stroke, pageNum }) => {
          const pageList = this.viewer.pageStrokes.get(pageNum) || [];
          if (!pageList.some(s => s.id === stroke.id)) {
            pageList.push(stroke);
            this.viewer.pageStrokes.set(pageNum, pageList);
            this.viewer.redrawPageStrokes(pageNum);
          }
        });

        // Restore highlights
        highlightsToRestore.forEach(ann => {
          highlightManager.restoreHighlightSilently(ann);
        });

        this.queueAutosaveStrokes();
      },
    });

    this.queueAutosaveStrokes();
  }

  renderLiveStroke(canvas, pageNum) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    const metrics = this.viewer ? this.viewer.pageMetrics.get(pageNum) : null;
    const targetW = metrics ? metrics.width : (canvas.clientWidth || canvas.width / dpr || 800);
    const targetH = metrics ? metrics.height : (canvas.clientHeight || canvas.height / dpr || 1000);

    // Redraw existing strokes on this page
    this.viewer.redrawPageStrokes(pageNum);

    // Draw active in-progress stroke with exact matching targetW and targetH
    if (this.currentStroke) {
      this.viewer.renderStroke(ctx, this.currentStroke, dpr, targetW, targetH);
    }
  }

  queueAutosaveStrokes() {
    const allStrokes = {};
    if (this.viewer && this.viewer.pageStrokes) {
      this.viewer.pageStrokes.forEach((strokes, pNum) => {
        allStrokes[pNum] = strokes;
      });
    }
    autosave.queueStateSave({ strokes: allStrokes });
  }
}
