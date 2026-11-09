/**
 * Highlight & Annotation Manager
 * Manages persistent user highlights and notes across document pages,
 * with complete Undo/Redo CommandStack integration.
 */

import { Annotation } from './annotation-model.js';
import { commandStack } from '../core/command-stack.js';
import { autosave } from '../storage/autosave.js';

export const PALETTE = {
  yellow: { id: 'yellow', label: 'Yellow', color: '#ffcc00', fill: 'rgba(255, 204, 0, 0.38)', stroke: 'rgba(255, 204, 0, 0.75)' },
  coral:  { id: 'coral',  label: 'Coral',  color: '#ff2d55', fill: 'rgba(255, 45, 85, 0.34)',  stroke: 'rgba(255, 45, 85, 0.70)' },
  green:  { id: 'green',  label: 'Mint',   color: '#34c759', fill: 'rgba(52, 199, 89, 0.34)',  stroke: 'rgba(52, 199, 89, 0.70)' },
  blue:   { id: 'blue',   label: 'Sky',    color: '#007aff', fill: 'rgba(0, 122, 255, 0.32)', stroke: 'rgba(0, 122, 255, 0.70)' },
  purple: { id: 'purple', label: 'Violet', color: '#af52de', fill: 'rgba(175, 82, 222, 0.34)', stroke: 'rgba(175, 82, 222, 0.70)' },
  charcoal: { id: 'charcoal', label: 'Blackout', color: '#000000', fill: '#000000', stroke: '#000000' },
};

export class HighlightManager {
  constructor() {
    this.annotations = new Map(); // id -> Annotation
    this.listeners = new Set();
  }

  /**
   * Creates an undoable highlight from selected characters
   */
  createHighlight(pageNum, chars, colorKey = 'yellow', note = '', style = 'highlight') {
    if (!chars || !chars.length) return null;

    const paletteItem = PALETTE[colorKey] || PALETTE.yellow;
    const text = chars.map(c => c.char).join('');

    // Group by line to construct pill-hull quads
    const byLine = new Map();
    chars.forEach(c => {
      let lKey = c.lineIdx;
      if (lKey === undefined) {
        // Fallback: cluster by baseline Y (within ~10 units)
        const y = c.quad && c.quad.lb ? (c.quad.lb.y || 0) : 0;
        lKey = 'y_' + Math.round(y * (c.quad && c.quad.isNormalized ? 80 : 1 / 10));
      }
      if (!byLine.has(lKey)) byLine.set(lKey, []);
      byLine.get(lKey).push(c);
    });

    const quads = [];
    byLine.forEach(lineChars => {
      if (!lineChars.length) return;
      const isRtl = lineChars[0].dir === 'rtl';

      // Sort characters along reading axis to guarantee leftmost and rightmost endpoints
      lineChars.sort((a, b) => {
        const ax = a.quad ? (a.quad.lt.x + a.quad.rt.x) / 2 : 0;
        const bx = b.quad ? (b.quad.lt.x + b.quad.rt.x) / 2 : 0;
        return isRtl ? bx - ax : ax - bx;
      });

      const first = lineChars[0].quad;
      const last = lineChars[lineChars.length - 1].quad;

      quads.push({
        lt: first.lt,
        rt: last.rt,
        rb: last.rb,
        lb: first.lb,
        isNormalized: first.isNormalized !== undefined ? first.isNormalized : true,
      });
    });

    const ann = new Annotation({
      type: 'highlight',
      style,
      page: pageNum,
      color: style === 'redact' ? '#000000' : paletteItem.color,
      opacity: style === 'redact' ? 1.0 : (style === 'highlight' ? 0.35 : 0.9),
      quads,
      text,
      note,
    });

    // Execute via CommandStack for Undo/Redo
    commandStack.execute({
      description: `Highlight "${text.slice(0, 15)}..."`,
      execute: () => {
        this.annotations.set(ann.id, ann);
        this._notify(pageNum);
      },
      undo: () => {
        this.annotations.delete(ann.id);
        this._notify(pageNum);
      },
    });

    return ann;
  }

  /**
   * Creates an undoable highlight directly from normalized quads
   */
  createHighlightFromQuads(pageNum, quads, text = '', colorKey = 'yellow', note = '', style = 'highlight') {
    if (!quads || !quads.length) return null;
    const paletteItem = PALETTE[colorKey] || PALETTE.yellow;

    const ann = new Annotation({
      type: 'highlight',
      style,
      page: pageNum,
      color: style === 'redact' ? '#000000' : paletteItem.color,
      opacity: style === 'redact' ? 1.0 : (style === 'highlight' ? 0.35 : 0.9),
      quads,
      text: text || '',
      note,
    });

    commandStack.execute({
      description: `Highlight "${(text || 'text').slice(0, 15)}..."`,
      execute: () => {
        this.annotations.set(ann.id, ann);
        this._notify(pageNum);
      },
      undo: () => {
        this.annotations.delete(ann.id);
        this._notify(pageNum);
      },
    });

    return ann;
  }

  findHighlightAt(pageNum, x, y, tolerance = 14, canvasWidth = 800, canvasHeight = 1000) {
    const list = this.getAnnotationsForPage(pageNum);
    for (let i = list.length - 1; i >= 0; i--) {
      const ann = list[i];
      if (typeof ann.intersectsPoint === 'function' && ann.intersectsPoint(x, y, tolerance, canvasWidth, canvasHeight)) {
        return ann;
      }
    }
    return null;
  }

  /**
   * Finds all highlights on pageNum that intersect with a given set of client rects or character quads
   */
  findOverlappingHighlights(pageNum, items, pageRect = null) {
    if (!items || !items.length) return [];
    const list = this.getAnnotationsForPage(pageNum);
    if (!list.length) return [];

    // Normalize input boxes to [0.0, 1.0]
    const searchBoxes = [];
    items.forEach(it => {
      if (pageRect && it.left !== undefined && it.top !== undefined) {
        // DOM ClientRect
        const minX = Math.max(0, Math.min(1, (it.left - pageRect.left) / pageRect.width));
        const maxX = Math.max(0, Math.min(1, (it.right - pageRect.left) / pageRect.width));
        const minY = Math.max(0, Math.min(1, (it.top - pageRect.top) / pageRect.height));
        const maxY = Math.max(0, Math.min(1, (it.bottom - pageRect.top) / pageRect.height));
        if (maxX > minX && maxY > minY) {
          searchBoxes.push({ minX, maxX, minY, maxY });
        }
      } else if (it.quad) {
        // Char quad
        const q = it.quad;
        const pLt = q.lt || q.p1 || { x: 0, y: 0 };
        const pRt = q.rt || q.p2 || { x: 0, y: 0 };
        const pRb = q.rb || q.p3 || { x: 0, y: 0 };
        const pLb = q.lb || q.p4 || { x: 0, y: 0 };
        const minX = Math.min(pLt.x, pLb.x);
        const maxX = Math.max(pRt.x, pRb.x);
        const minY = Math.min(pLt.y, pRt.y);
        const maxY = Math.max(pLb.y, pRb.y);
        if (maxX > minX && maxY > minY) {
          searchBoxes.push({ minX, maxX, minY, maxY });
        }
      }
    });

    if (!searchBoxes.length) return [];

    const overlapping = [];
    list.forEach(ann => {
      if (!ann.quads || !ann.quads.length) return;
      const isOverlap = ann.quads.some(q => {
        const pLt = q.lt || q.p1 || { x: 0, y: 0 };
        const pRt = q.rt || q.p2 || { x: 0, y: 0 };
        const pRb = q.rb || q.p3 || { x: 0, y: 0 };
        const pLb = q.lb || q.p4 || { x: 0, y: 0 };
        const aMinX = Math.min(pLt.x, pLb.x);
        const aMaxX = Math.max(pRt.x, pRb.x);
        const aMinY = Math.min(pLt.y, pRt.y);
        const aMaxY = Math.max(pLb.y, pRb.y);

        return searchBoxes.some(b => {
          return !(b.maxX <= aMinX + 0.002 || b.minX >= aMaxX - 0.002 || b.maxY <= aMinY + 0.002 || b.minY >= aMaxY - 0.002);
        });
      });

      if (isOverlap) {
        overlapping.push(ann);
      }
    });

    return overlapping;
  }

  /**
   * Batch deletes multiple highlights with single atomic Undo/Redo command
   */
  removeHighlights(targets) {
    if (!targets || !targets.length) return;
    const annList = targets.map(t => typeof t === 'string' ? this.annotations.get(t) : (t && t.id ? this.annotations.get(t.id) : null)).filter(Boolean);
    if (!annList.length) return;

    const count = annList.length;
    commandStack.execute({
      description: `Delete ${count} Highlight${count > 1 ? 's' : ''}`,
      execute: () => {
        annList.forEach(a => this.annotations.delete(a.id));
        const pages = new Set(annList.map(a => a.page));
        pages.forEach(p => this._notify(p));
      },
      undo: () => {
        annList.forEach(a => this.annotations.set(a.id, a));
        const pages = new Set(annList.map(a => a.page));
        pages.forEach(p => this._notify(p));
      },
    });
  }

  removeHighlightSilently(id) {
    const ann = this.annotations.get(id);
    if (!ann) return null;
    this.annotations.delete(id);
    this._notify(ann.page);
    return ann;
  }

  restoreHighlightSilently(ann) {
    if (!ann) return;
    this.annotations.set(ann.id, ann);
    this._notify(ann.page);
  }

  removeHighlight(id) {
    const ann = this.annotations.get(id);
    if (!ann) return;

    commandStack.execute({
      description: 'Delete Highlight',
      execute: () => {
        this.annotations.delete(id);
        this._notify(ann.page);
      },
      undo: () => {
        this.annotations.set(id, ann);
        this._notify(ann.page);
      },
    });
  }

  updateNote(id, newNote) {
    const ann = this.annotations.get(id);
    if (!ann) return;
    const oldNote = ann.note;

    commandStack.execute({
      description: 'Edit Note',
      execute: () => {
        ann.note = newNote;
        ann.updatedAt = Date.now();
        this._notify(ann.page);
      },
      undo: () => {
        ann.note = oldNote;
        ann.updatedAt = Date.now();
        this._notify(ann.page);
      },
    });
  }

  updateColor(id, colorKey) {
    const ann = this.annotations.get(id);
    if (!ann) return;
    const oldColor = ann.color;
    const paletteItem = PALETTE[colorKey] || PALETTE.yellow;

    commandStack.execute({
      description: 'Change Highlight Color',
      execute: () => {
        ann.color = paletteItem.color;
        ann.updatedAt = Date.now();
        this._notify(ann.page);
      },
      undo: () => {
        ann.color = oldColor;
        ann.updatedAt = Date.now();
        this._notify(ann.page);
      },
    });
  }

  getAnnotationsForPage(pageNum) {
    const list = [];
    this.annotations.forEach(ann => {
      if (ann.page === pageNum) list.push(ann);
    });
    return list;
  }

  getAllAnnotations() {
    return Array.from(this.annotations.values());
  }

  loadState(annotationsArray) {
    this.annotations.clear();
    if (Array.isArray(annotationsArray)) {
      annotationsArray.forEach(a => {
        const ann = new Annotation(a);
        this.annotations.set(ann.id, ann);
      });
    }
    this._notify();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(pageNum = null) {
    // Autosave state delta
    autosave.queueStateSave({
      annotations: this.getAllAnnotations(),
    });

    for (const listener of this.listeners) {
      try {
        listener(pageNum);
      } catch (e) {
        console.error('[HighlightManager] Listener error:', e);
      }
    }
  }
}

export const highlightManager = new HighlightManager();
