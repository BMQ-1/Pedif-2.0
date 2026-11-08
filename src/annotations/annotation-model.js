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
}
