/**
 * Inking & Vector Stroke Model
 * Supports Catmull-Rom smoothing points, dynamic pressure, and hold-to-snap flags.
 */

export class Stroke {
  constructor(options = {}) {
    this.id = options.id || ('stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    this.type = options.type || 'pen'; // 'pen' | 'highlighter'
    this.color = options.color || '#000000';
    this.width = options.width || 3;
    this.opacity = options.opacity !== undefined ? options.opacity : 1.0;
    this.points = options.points || []; // Array of { x, y, pressure } (Normalized [0.0, 1.0])
    this.isSnapped = !!options.isSnapped;
    this.isNormalized = options.isNormalized !== undefined ? options.isNormalized : true;
  }

  addPoint(x, y, pressure = 0.5) {
    this.points.push({ x, y, pressure });
  }

  getBounds(canvasWidth = 1, canvasHeight = 1) {
    if (!this.points.length) return [0, 0, 0, 0];
    const isNorm = this.isNormalized && canvasWidth > 1 && this.points[0].x <= 1.0 && this.points[0].y <= 1.0;
    const sx = isNorm ? canvasWidth : 1;
    const sy = isNorm ? canvasHeight : 1;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of this.points) {
      const px = pt.x * sx;
      const py = pt.y * sy;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const pad = this.width / 2;
    return [minX - pad, minY - pad, maxX + pad, maxY + pad];
  }

  intersectsPoint(x, y, tolerance = 6, canvasWidth = 1, canvasHeight = 1) {
    if (!this.points.length) return false;
    const isNorm = this.isNormalized && canvasWidth > 1 && this.points[0].x <= 1.0 && this.points[0].y <= 1.0;
    const sx = isNorm ? canvasWidth : 1;
    const sy = isNorm ? canvasHeight : 1;

    const [minX, minY, maxX, maxY] = this.getBounds(canvasWidth, canvasHeight);
    if (x < minX - tolerance || x > maxX + tolerance || y < minY - tolerance || y > maxY + tolerance) {
      return false;
    }
    // Check distance to line segments
    const tolSq = (tolerance + this.width / 2) ** 2;
    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = { x: this.points[i].x * sx, y: this.points[i].y * sy };
      const p2 = { x: this.points[i + 1].x * sx, y: this.points[i + 1].y * sy };
      const distSq = distToSegmentSquared({ x, y }, p1, p2);
      if (distSq <= tolSq) return true;
    }
    return false;
  }
}

function distToSegmentSquared(p, v, w) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}
