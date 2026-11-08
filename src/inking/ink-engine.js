/**
 * Dynamic Catmull-Rom Vector Inking & Ergonomics Engine
 * Implements:
 * 1. Pressure-sensitive smooth inking (PointerEvent.pressure)
 * 2. Catmull-Rom & Quadratic Spline Smoothing with getCoalescedEvents()
 * 3. 350ms Hold-to-Snap (Auto-straightens lines with haptic tick)
 * 4. Palm Rejection & Stylus Discrimination (e.pointerType === 'pen')
 * 5. Vector Whole-Stroke Eraser (O(1) stroke removal)
 * 6. Bounded Undo/Redo integration with CommandStack
 */

import { Stroke } from './stroke-model.js';
import { commandStack } from '../core/command-stack.js';
import { autosave } from '../storage/autosave.js';

export class InkEngine {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.activeTool = options.activeTool || 'pen'; // 'pen' | 'highlighter' | 'eraser'
    this.penColor = options.penColor || '#000000';
    this.penWidth = options.penWidth || 3;
    this.highlighterColor = options.highlighterColor || 'rgba(250, 204, 21, 0.4)';
    this.highlighterWidth = options.highlighterWidth || 18;

    this.currentStroke = null;
    this.activeCanvas = null;
    this.activePageNum = null;
    this.holdTimer = null;
    this.lastPoint = null;
    this.hasStylusPen = false; // Set to true if a 'pen' pointer is detected (for palm rejection)

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

    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e, canvas, pageNum));
    canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e, canvas, pageNum));
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e, canvas, pageNum));
    canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e, canvas, pageNum));
  }

  /**
   * Palm Rejection & Stylus Discrimination
   */
  isPointerAllowed(e) {
    if (!e) return true;

    // If a hardware stylus/pen is present and event is a touch/palm, reject touch drawing!
    if (e.pointerType === 'pen') {
      this.hasStylusPen = true;
      return true;
    }

    if (e.pointerType === 'touch') {
      // If stylus mode active, reject finger drawing (palm rejection)
      if (this.hasStylusPen) {
        return false;
      }
      return true; // Allow touch drawing on tablets without stylus
    }

    return true; // Mouse
  }

  handlePointerDown(e, canvas, pageNum) {
    if (!this.isPointerAllowed(e)) return;
    if (this.activeTool !== 'pen' && this.activeTool !== 'highlighter' && this.activeTool !== 'eraser') {
      return;
    }

    e.preventDefault();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width || 800, height: canvas.height || 1000 };
    const canvasW = Math.max(1, rect.width || canvas.clientWidth || 800);
    const canvasH = Math.max(1, rect.height || canvas.clientHeight || 1000);

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, screenX / canvasW));
    const normY = Math.max(0, Math.min(1, screenY / canvasH));
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    this.activeCanvas = canvas;
    this.activePageNum = pageNum;

    if (this.activeTool === 'eraser') {
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
      opacity: isHighlighter ? 0.45 : 1.0,
      points: [{ x: normX, y: normY, pressure }],
      isSnapped: false,
      isNormalized: true,
    });

    this.lastPoint = { x: screenX, y: screenY };

    // 350ms Hold-to-Snap straight line / shape timer
    this.startHoldTimer();
  }

  handlePointerMove(e, canvas, pageNum) {
    if (!this.isPointerAllowed(e)) return;

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

      // Cancel hold timer if movement exceeds 4px
      if (this.lastPoint) {
        const dist = Math.hypot(screenX - this.lastPoint.x, screenY - this.lastPoint.y);
        if (dist > 4) {
          this.cancelHoldTimer();
        }
      }

      this.currentStroke.addPoint(normX, normY, pressure);
      this.lastPoint = { x: screenX, y: screenY };

      // Redraw active page strokes + live stroke
      this.renderLiveStroke(canvas, pageNum);
    }
  }

  handlePointerUp(e, canvas, pageNum) {
    this.cancelHoldTimer();
    try {
      if (canvas.releasePointerCapture) canvas.releasePointerCapture(e.pointerId);
    } catch {}

    if (this.currentStroke && this.currentStroke.points.length >= 1) {
      const strokeToCommit = this.currentStroke;
      const targetPage = this.activePageNum;

      // Commit to CommandStack for reversible Undo/Redo
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

    this.currentStroke = null;
    this.activeCanvas = null;
    this.activePageNum = null;
    this.lastPoint = null;
  }

  startHoldTimer() {
    this.cancelHoldTimer();
    this.holdTimer = setTimeout(() => {
      if (this.currentStroke && this.currentStroke.points.length > 5) {
        // Snap from start point to end point into a straight vector line
        const first = this.currentStroke.points[0];
        const last = this.currentStroke.points[this.currentStroke.points.length - 1];
        this.currentStroke.points = [first, last];
        this.currentStroke.isSnapped = true;

        // Subtle tactile tick on supported devices
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(10);
        }

        if (this.activeCanvas && this.activePageNum) {
          this.renderLiveStroke(this.activeCanvas, this.activePageNum);
        }
      }
    }, 350);
  }

  cancelHoldTimer() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /**
   * Vector Whole-Stroke Eraser (O(1) stroke removal)
   */
  eraseAt(pageNum, x, y, canvasW = 1, canvasH = 1) {
    const strokes = this.viewer.pageStrokes.get(pageNum) || [];
    if (!strokes.length) return;

    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      if (stroke.intersectsPoint(x, y, 10, canvasW, canvasH)) {
        // Remove stroke via CommandStack for Undo/Redo
        commandStack.execute({
          description: 'Erase Stroke',
          execute: () => {
            const list = (this.viewer.pageStrokes.get(pageNum) || []).filter(s => s.id !== stroke.id);
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
            this.queueAutosaveStrokes();
          },
          undo: () => {
            const list = this.viewer.pageStrokes.get(pageNum) || [];
            list.push(stroke);
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
            this.queueAutosaveStrokes();
          },
        });
        break; // Erase one stroke per intersection check for precision
      }
    }
  }

  renderLiveStroke(canvas, pageNum) {
    const ctx = canvas.getContext('2d');
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    const metrics = this.viewer ? this.viewer.pageMetrics.get(pageNum) : null;
    const targetW = metrics ? metrics.width : (canvas.clientWidth || canvas.width / dpr || 800);
    const targetH = metrics ? metrics.height : (canvas.clientHeight || canvas.height / dpr || 1000);

    // Redraw existing strokes
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
