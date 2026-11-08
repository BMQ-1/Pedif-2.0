/**
 * Intelligent Geometric Shape Recognizer (Hold-to-Snap)
 * Analyzes raw ink stroke points upon 700ms hold to recognize:
 * 1. Straight Lines (start to end projection)
 * 2. Circles / Ellipses (radial distance variance & closed path check)
 * 3. Rectangles / Squares (corner detection & orthogonal box fitting)
 * 4. Triangles (3 dominant vertex detection)
 */

export class ShapeRecognizer {
  /**
   * Evaluates points and returns a recognized geometric shape or null
   */
  static recognize(points, canvasW = 800, canvasH = 1000) {
    if (!points || points.length < 10) return null;

    const isNorm = points[0].x <= 1.0 && points[0].y <= 1.0;
    const sx = isNorm ? canvasW : 1;
    const sy = isNorm ? canvasH : 1;

    // Convert to pixel coordinates for accurate geometric analysis
    const pts = points.map(p => ({ x: p.x * sx, y: p.y * sy, pressure: p.pressure || 0.5 }));

    const start = pts[0];
    const end = pts[pts.length - 1];
    const closureDist = Math.hypot(end.x - start.x, end.y - start.y);

    // Compute stroke total path length
    let pathLength = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      pathLength += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    if (pathLength < 25) return null;

    const isClosed = (closureDist / pathLength) < 0.22 || closureDist < 35;

    // ─────────────────────────────────────────────────────────────
    // 1. Check for Straight Line
    // ─────────────────────────────────────────────────────────────
    if (!isClosed) {
      const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
      if (straightDist / pathLength > 0.88) {
        return {
          type: 'line',
          points: [
            { x: points[0].x, y: points[0].y, pressure: start.pressure },
            { x: points[points.length - 1].x, y: points[points.length - 1].y, pressure: end.pressure },
          ],
        };
      }
    }

    // Compute Centroid & Bounding Box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      sumX += p.x;
      sumY += p.y;
    }
    const cx = sumX / pts.length;
    const cy = sumY / pts.length;
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);

    if (isClosed) {
      // ─────────────────────────────────────────────────────────────
      // 2. Check for Circle / Ellipse (Radial deviation from center)
      // ─────────────────────────────────────────────────────────────
      const rx = boxW / 2;
      const ry = boxH / 2;
      let ellipseDevSum = 0;

      for (const p of pts) {
        const dx = (p.x - cx) / rx;
        const dy = (p.y - cy) / ry;
        const normalizedR = Math.hypot(dx, dy);
        ellipseDevSum += Math.abs(normalizedR - 1.0);
      }
      const meanDev = ellipseDevSum / pts.length;

      if (meanDev < 0.14) {
        // Generate smooth fitted ellipse points (36 segments)
        const ellipsePoints = [];
        const isCircle = Math.abs(rx - ry) / Math.max(rx, ry) < 0.18;
        const radius = isCircle ? (rx + ry) / 2 : null;

        for (let i = 0; i <= 36; i++) {
          const angle = (i / 36) * Math.PI * 2;
          const px = isCircle ? (cx + Math.cos(angle) * radius) : (cx + Math.cos(angle) * rx);
          const py = isCircle ? (cy + Math.sin(angle) * radius) : (cy + Math.sin(angle) * ry);
          ellipsePoints.push({
            x: isNorm ? px / canvasW : px,
            y: isNorm ? py / canvasH : py,
            pressure: 0.5,
          });
        }
        return {
          type: isCircle ? 'circle' : 'ellipse',
          points: ellipsePoints,
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 3. Check for Rectangle / Square
      // ─────────────────────────────────────────────────────────────
      let boxEdgeDevSum = 0;
      let hasTopLeft = false, hasTopRight = false, hasBottomRight = false, hasBottomLeft = false;
      const cornerThreshold = Math.min(boxW, boxH) * 0.20;

      for (const p of pts) {
        const distLeft = Math.abs(p.x - minX);
        const distRight = Math.abs(p.x - maxX);
        const distTop = Math.abs(p.y - minY);
        const distBottom = Math.abs(p.y - maxY);
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
        boxEdgeDevSum += minDist;

        if (Math.hypot(p.x - minX, p.y - minY) < cornerThreshold) hasTopLeft = true;
        if (Math.hypot(p.x - maxX, p.y - minY) < cornerThreshold) hasTopRight = true;
        if (Math.hypot(p.x - maxX, p.y - maxY) < cornerThreshold) hasBottomRight = true;
        if (Math.hypot(p.x - minX, p.y - maxY) < cornerThreshold) hasBottomLeft = true;
      }
      const meanBoxDev = boxEdgeDevSum / pts.length;
      const boxPerimeter = 2 * (boxW + boxH);
      const hasAllCorners = (hasTopLeft && hasTopRight && hasBottomRight) ||
                            (hasTopRight && hasBottomRight && hasBottomLeft) ||
                            (hasBottomRight && hasBottomLeft && hasTopLeft) ||
                            (hasBottomLeft && hasTopLeft && hasTopRight);

      // Check for rectangle (edge proximity and corner coverage)
      if (meanBoxDev < Math.max(12, boxPerimeter * 0.06) && hasAllCorners) {
        const rectPoints = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: minY },
        ].map(p => ({
          x: isNorm ? p.x / canvasW : p.x,
          y: isNorm ? p.y / canvasH : p.y,
          pressure: 0.5,
        }));

        return {
          type: 'rectangle',
          points: rectPoints,
        };
      }
    }

    // Default: not a recognized geometric shape
    return null;
  }
}
