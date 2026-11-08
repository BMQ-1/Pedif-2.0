/**
 * 8-Point Quadrilateral Geometry Model
 * Box = [LT(x1, y1), RT(x2, y2), RB(x3, y3), LB(x4, y4)]
 */

export class Point {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

export class Quad {
  /**
   * @param {Point} lt - Left Top
   * @param {Point} rt - Right Top
   * @param {Point} rb - Right Bottom
   * @param {Point} lb - Left Bottom
   */
  constructor(lt, rt, rb, lb, isNormalized = false) {
    this.lt = lt;
    this.rt = rt;
    this.rb = rb;
    this.lb = lb;
    this.isNormalized = isNormalized || (lt && lt.x <= 1.0 && lt.y <= 1.0 && rt && rt.x <= 1.0);
  }

  /**
   * Scale quad to normalized [0.0, 1.0] page units
   */
  toNormalized(width, height) {
    if (!width || !height) return this;
    return new Quad(
      new Point(this.lt.x / width, this.lt.y / height),
      new Point(this.rt.x / width, this.rt.y / height),
      new Point(this.rb.x / width, this.rb.y / height),
      new Point(this.lb.x / width, this.lb.y / height),
      true
    );
  }

  /**
   * Project normalized quad to target viewport screen dimensions
   */
  toScreen(width, height) {
    if (!this.isNormalized && (this.lt.x > 1.0 || this.lt.y > 1.0)) return this;
    return new Quad(
      new Point(this.lt.x * width, this.lt.y * height),
      new Point(this.rt.x * width, this.rt.y * height),
      new Point(this.rb.x * width, this.rb.y * height),
      new Point(this.lb.x * width, this.lb.y * height),
      false
    );
  }

  /**
   * Returns standard 8-number array [x1, y1, x2, y2, x3, y3, x4, y4]
   */
  toArray() {
    return [
      this.lt.x, this.lt.y,
      this.rt.x, this.rt.y,
      this.rb.x, this.rb.y,
      this.lb.x, this.lb.y,
    ];
  }

  /**
   * Converts to SVG polygon / path definition: M lt L rt L rb L lb Z
   */
  toPathData() {
    return `M ${this.lt.x} ${this.lt.y} L ${this.rt.x} ${this.rt.y} L ${this.rb.x} ${this.rb.y} L ${this.lb.x} ${this.lb.y} Z`;
  }

  /**
   * Axis-aligned bounding box [minX, minY, maxX, maxY]
   */
  getBounds() {
    const xs = [this.lt.x, this.rt.x, this.rb.x, this.lb.x];
    const ys = [this.lt.y, this.rt.y, this.rb.y, this.lb.y];
    return [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
  }
}
