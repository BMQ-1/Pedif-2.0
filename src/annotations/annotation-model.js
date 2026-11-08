/**
 * Annotation Model
 * Standardized annotation structure supporting highlights, quads, notes, and PDF-Lib serialization.
 */

export class Annotation {
  constructor(options = {}) {
    this.id = options.id || ('ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    this.type = options.type || 'highlight'; // 'highlight' | 'note' | 'box'
    this.page = options.page || 1;
    this.color = options.color || '#ffcc00';
    this.opacity = options.opacity !== undefined ? options.opacity : 0.35;
    this.quads = options.quads || []; // Array of Quads
    this.text = options.text || '';
    this.note = options.note || '';
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
  }

  intersectsPoint(x, y, tolerance = 12, canvasWidth = 800, canvasHeight = 1000) {
    if (!this.quads || !this.quads.length) return false;
    for (const q of this.quads) {
      const isNorm = q.isNormalized || (q.lt.x <= 1.0 && q.lt.y <= 1.0);
      const sx = isNorm ? canvasWidth : 1;
      const sy = isNorm ? canvasHeight : 1;
      const minX = Math.min(q.lt.x, q.lb.x) * sx - tolerance;
      const maxX = Math.max(q.rt.x, q.rb.x) * sx + tolerance;
      const minY = Math.min(q.lt.y, q.rt.y) * sy - tolerance;
      const maxY = Math.max(q.lb.y, q.rb.y) * sy + tolerance;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return true;
      }
    }
    return false;
  }
}
