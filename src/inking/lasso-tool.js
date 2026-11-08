/**
 * Precision Vector Lasso Selection Tool
 * Allows circling vector ink strokes to move, recolor, duplicate, or delete them.
 */

import { commandStack } from '../core/command-stack.js';
import { Stroke } from './stroke-model.js';
import { showToast } from '../ui/toast.js';

export class LassoTool {
  constructor(options = {}) {
    this.viewer = options.viewer;
    this.isActive = false;
    this.isDrawingLasso = false;
    this.isDraggingSelection = false;
    this.lassoPoints = [];
    this.selectedStrokes = [];
    this.activePageNum = null;
    this.container = null;
    this.dragStartPoint = null;

    if (typeof document !== 'undefined') {
      this.init();
    }
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'lasso-selection-overlay';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <svg class="lasso-svg-canvas"></svg>
      <div class="lasso-action-bar glass" style="display:none;">
        <button class="b sm rip btn-danger" id="btn-lasso-delete" title="Delete Selected Notes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:#ff3b30;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <button class="b sm rip" id="btn-lasso-duplicate" title="Duplicate Notes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <div class="lasso-divider"></div>
        <button class="ink-chip" data-lasso-color="#007aff" style="background:#007aff;" title="Blue"></button>
        <button class="ink-chip" data-lasso-color="#ff3b30" style="background:#ff3b30;" title="Red"></button>
        <button class="ink-chip" data-lasso-color="#34c759" style="background:#34c759;" title="Green"></button>
        <button class="ink-chip" data-lasso-color="#1c1c1e" style="background:#1c1c1e;" title="Black"></button>
      </div>
    `;

    document.body.appendChild(this.container);
    this.bindEvents();
  }

  setMode(mode) {
    this.isActive = mode === 'lasso';
    if (!this.isActive) {
      this.clearSelection();
      this.container.style.display = 'none';
    } else {
      this.container.style.display = 'block';
    }
  }

  bindEvents() {
    window.addEventListener('pointerdown', (e) => {
      if (!this.isActive) return;
      const pageEl = e.target.closest('.page-container');
      if (!pageEl) return;

      const pageNum = parseInt(pageEl.dataset.page, 10);
      this.activePageNum = pageNum;
      this.isDrawingLasso = true;
      this.lassoPoints = [{ x: e.clientX, y: e.clientY }];
      this.drawLassoPath();
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isActive || !this.isDrawingLasso) return;
      this.lassoPoints.push({ x: e.clientX, y: e.clientY });
      this.drawLassoPath();
    });

    window.addEventListener('pointerup', () => {
      if (!this.isActive || !this.isDrawingLasso) return;
      this.isDrawingLasso = false;
      this.finalizeLassoSelection();
    });

    // Action bar buttons
    const delBtn = this.container.querySelector('#btn-lasso-delete');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (!this.selectedStrokes.length || !this.activePageNum) return;
        const pageNum = this.activePageNum;
        const strokesToRemove = [...this.selectedStrokes];

        commandStack.execute({
          description: `Delete ${strokesToRemove.length} strokes`,
          execute: () => {
            const list = (this.viewer.pageStrokes.get(pageNum) || []).filter(s => !strokesToRemove.some(r => r.id === s.id));
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
          },
          undo: () => {
            const list = this.viewer.pageStrokes.get(pageNum) || [];
            list.push(...strokesToRemove);
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
          },
        });

        showToast('Notes deleted', 'trash');
        this.clearSelection();
      });
    }

    // Color swatches
    this.container.querySelectorAll('[data-lasso-color]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newColor = e.currentTarget.dataset.lassoColor;
        if (!this.selectedStrokes.length || !this.activePageNum) return;
        const pageNum = this.activePageNum;
        const targets = this.selectedStrokes.map(s => ({ stroke: s, oldColor: s.color }));

        commandStack.execute({
          description: 'Recolor strokes',
          execute: () => {
            targets.forEach(({ stroke }) => { stroke.color = newColor; });
            this.viewer.redrawPageStrokes(pageNum);
          },
          undo: () => {
            targets.forEach(({ stroke, oldColor }) => { stroke.color = oldColor; });
            this.viewer.redrawPageStrokes(pageNum);
          },
        });

        showToast('Recolored', 'check');
      });
    });

    // Duplicate
    const dupBtn = this.container.querySelector('#btn-lasso-duplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        if (!this.selectedStrokes.length || !this.activePageNum) return;
        const pageNum = this.activePageNum;
        const copies = this.selectedStrokes.map(s => new Stroke({
          ...s,
          id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          points: s.points.map(p => ({ x: Math.min(1, p.x + 0.02), y: Math.min(1, p.y + 0.02), pressure: p.pressure })),
        }));

        commandStack.execute({
          description: `Duplicate ${copies.length} strokes`,
          execute: () => {
            const list = this.viewer.pageStrokes.get(pageNum) || [];
            list.push(...copies);
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
          },
          undo: () => {
            const list = (this.viewer.pageStrokes.get(pageNum) || []).filter(s => !copies.some(c => c.id === s.id));
            this.viewer.pageStrokes.set(pageNum, list);
            this.viewer.redrawPageStrokes(pageNum);
          },
        });

        showToast('Notes duplicated', 'check');
      });
    }
  }

  drawLassoPath() {
    const svg = this.container.querySelector('.lasso-svg-canvas');
    if (!svg || !this.lassoPoints.length) return;

    let d = `M ${this.lassoPoints[0].x} ${this.lassoPoints[0].y}`;
    for (let i = 1; i < this.lassoPoints.length; i++) {
      d += ` L ${this.lassoPoints[i].x} ${this.lassoPoints[i].y}`;
    }

    svg.innerHTML = `<path d="${d}" class="lasso-drawn-path" />`;
  }

  finalizeLassoSelection() {
    const svg = this.container.querySelector('.lasso-svg-canvas');
    if (!svg || this.lassoPoints.length < 5 || !this.activePageNum) {
      this.clearSelection();
      return;
    }

    const pageEl = document.getElementById(`page-${this.activePageNum}`);
    if (!pageEl) {
      this.clearSelection();
      return;
    }

    const pageRect = pageEl.getBoundingClientRect();
    const strokes = this.viewer.pageStrokes.get(this.activePageNum) || [];

    // Check which strokes have points inside the drawn lasso polygon
    this.selectedStrokes = this.findStrokesInLasso(this.lassoPoints, strokes, pageRect);

    if (this.selectedStrokes.length === 0) {
      this.clearSelection();
      return;
    }

    // Position action bar above selection
    const bar = this.container.querySelector('.lasso-action-bar');
    if (bar && this.lassoPoints.length) {
      const xs = this.lassoPoints.map(p => p.x);
      const ys = this.lassoPoints.map(p => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      bar.style.left = `${Math.max(16, minX)}px`;
      bar.style.top = `${Math.max(64, minY - 50)}px`;
      bar.style.display = 'flex';
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(8);
    }
  }

  findStrokesInLasso(polygon, strokes, pageRect = null) {
    if (!polygon || !polygon.length || !strokes) return [];
    return strokes.filter(stroke => {
      if (!stroke.points || !stroke.points.length) return false;
      const isNorm = pageRect && stroke.isNormalized && (stroke.points[0].x <= 1.0);
      const sx = (pageRect && isNorm) ? pageRect.width : 1;
      const sy = (pageRect && isNorm) ? pageRect.height : 1;
      const ox = pageRect ? pageRect.left : 0;
      const oy = pageRect ? pageRect.top : 0;

      for (const pt of stroke.points) {
        const px = ox + pt.x * sx;
        const py = oy + pt.y * sy;
        if (this.pointInPolygon(px, py, polygon)) {
          return true;
        }
      }
      return false;
    });
  }

  pointInPolygon(xOrPt, yOrVs, maybeVs) {
    let x, y, vs;
    if (typeof xOrPt === 'object' && xOrPt !== null) {
      x = xOrPt.x;
      y = xOrPt.y;
      vs = yOrVs;
    } else {
      x = xOrPt;
      y = yOrVs;
      vs = maybeVs;
    }
    if (!vs || !vs.length) return false;

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  clearSelection() {
    this.selectedStrokes = [];
    this.lassoPoints = [];
    const svg = this.container.querySelector('.lasso-svg-canvas');
    if (svg) svg.innerHTML = '';
    const bar = this.container.querySelector('.lasso-action-bar');
    if (bar) bar.style.display = 'none';
  }
}
