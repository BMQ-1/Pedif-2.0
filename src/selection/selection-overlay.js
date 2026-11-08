/**
 * Precision Quad-Selection Overlay
 * Implements:
 * 1. 8-Point Quadrilateral tracking
 * 2. Continuous Pill-Hull Boolean Path Union (rounded continuous highlights)
 * 3. Dynamic Teardrop Anchor Pins with RTL Inversion
 * 4. Magnetic Character-Snapping with Haptic Feedback (navigator.vibrate(5))
 * 5. Cubic Bézier Focus Dimmer Backdrop
 */

import { Point, Quad } from './quad-model.js';

export class SelectionOverlay {
  constructor(options = {}) {
    this.pageContainer = options.pageContainer;
    this.svg = options.svg;
    this.pageNum = options.pageNum;
    this.lines = options.lines || []; // Array of lines from GlyphExtractor / OCR
    this.onSelectionChange = options.onSelectionChange || null;
    this.onSelectionEnd = options.onSelectionEnd || null;

    this.allChars = this.flattenChars(this.lines);
    this.selectedRange = null; // { startIdx, endIdx }
    this.lastHapticIdx = -1;

    this.dimmer = this.svg && this.svg.querySelector ? this.svg.querySelector('.focus-dimmer') : null;
    this.highlightGroup = this.svg && this.svg.querySelector ? this.svg.querySelector('.highlight-group') : null;
    this.handleGroup = this.svg && this.svg.querySelector ? this.svg.querySelector('.handle-group') : null;

    this.startHandle = null;
    this.endHandle = null;
    this.isDragging = false;
    this.dragTarget = null; // 'start' | 'end' | 'new'

    if (typeof document !== 'undefined' && this.svg) {
      this.initElements();
      this.initGestures();
    }
  }

  flattenChars(lines) {
    const list = [];
    lines.forEach((line, lIdx) => {
      line.words.forEach((word, wIdx) => {
        word.chars.forEach((ch, cIdx) => {
          list.push({
            char: ch.char,
            quad: ch.quad,
            lineIdx: lIdx,
            wordIdx: wIdx,
            charIdx: cIdx,
            dir: line.dir || 'ltr',
          });
        });
      });
    });
    return list;
  }

  updateLines(lines) {
    this.lines = lines;
    this.allChars = this.flattenChars(lines);
  }

  initElements() {
    if (!this.handleGroup) return;

    // Teardrop Start Handle (Top-Left Anchor Pin)
    this.startHandle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.startHandle.setAttribute('class', 'teardrop-handle start-handle');
    this.startHandle.setAttribute('d', 'M 0 0 C -6 0 -10 -4 -10 -10 C -10 -16 0 -24 0 -24 C 0 -24 10 -16 10 -10 C 10 -4 6 0 0 0 Z');
    this.startHandle.setAttribute('fill', '#007aff');
    this.startHandle.style.display = 'none';

    // Teardrop End Handle (Bottom-Right Anchor Pin)
    this.endHandle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.endHandle.setAttribute('class', 'teardrop-handle end-handle');
    this.endHandle.setAttribute('d', 'M 0 0 C -6 0 -10 4 -10 10 C -10 16 0 24 0 24 C 0 24 10 16 10 10 C 10 4 6 0 0 0 Z');
    this.endHandle.setAttribute('fill', '#007aff');
    this.endHandle.style.display = 'none';

    this.handleGroup.appendChild(this.startHandle);
    this.handleGroup.appendChild(this.endHandle);
  }

  /**
   * Magnetic character snapping using Euclidean projection to character midpoints
   */
  findNearestChar(px, py, width = 1, height = 1) {
    let bestDist = Infinity;
    let bestIdx = 0;

    const isNorm = this.allChars.length > 0 && (this.allChars[0].quad.isNormalized || (this.allChars[0].quad.lt.x <= 1.0 && this.allChars[0].quad.lt.y <= 1.0));
    const targetW = (isNorm && width > 1) ? width : 1;
    const targetH = (isNorm && height > 1) ? height : 1;

    for (let i = 0; i < this.allChars.length; i++) {
      const q = this.allChars[i].quad;
      const cx = ((q.lt.x + q.rt.x + q.rb.x + q.lb.x) / 4) * targetW;
      const cy = ((q.lt.y + q.rt.y + q.rb.y + q.lb.y) / 4) * targetH;
      const dist = Math.hypot(px - cx, py - cy);

      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  /**
   * Renders smooth pill-hull polygons across the selected character range
   */
  renderSelection(startIdx, endIdx) {
    if (this.allChars.length === 0) return;

    let s = Math.max(0, Math.min(startIdx, endIdx));
    let e = Math.min(this.allChars.length - 1, Math.max(startIdx, endIdx));

    // Magnetic haptic tick on mobile when crossing character threshold
    if (e !== this.lastHapticIdx) {
      this.lastHapticIdx = e;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(5);
      }
    }

    this.selectedRange = { startIdx: s, endIdx: e };
    const selectedChars = this.allChars.slice(s, e + 1);
    if (!selectedChars.length) return;

    // Activate Focus Dimmer
    if (this.dimmer) {
      this.dimmer.style.opacity = '1';
    }

    if (!this.highlightGroup) return;

    let activePath = this.highlightGroup.querySelector('.active-selection-path');
    if (!activePath && typeof document !== 'undefined') {
      activePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      activePath.setAttribute('class', 'active-selection-path');
      activePath.setAttribute('fill', 'rgba(0, 122, 255, 0.28)'); // System highlight blue
      activePath.setAttribute('stroke', 'rgba(0, 122, 255, 0.5)');
      activePath.setAttribute('stroke-width', '2');
      activePath.setAttribute('stroke-linejoin', 'round');
      activePath.setAttribute('stroke-linecap', 'round');
      this.highlightGroup.appendChild(activePath);
    }

    // Group selected characters by line for continuous pill-hull rendering
    const byLine = new Map();
    selectedChars.forEach(c => {
      if (!byLine.has(c.lineIdx)) byLine.set(c.lineIdx, []);
      byLine.get(c.lineIdx).push(c);
    });

    const rect = this.svg && this.svg.getBoundingClientRect ? this.svg.getBoundingClientRect() : null;
    const targetW = (rect && rect.width > 1) ? rect.width : (this.pageContainer && this.pageContainer.clientWidth > 1 ? this.pageContainer.clientWidth : 1);
    const targetH = (rect && rect.height > 1) ? rect.height : (this.pageContainer && this.pageContainer.clientHeight > 1 ? this.pageContainer.clientHeight : 1);

    const isNorm = selectedChars.length > 0 && (selectedChars[0].quad.isNormalized || (selectedChars[0].quad.lt.x <= 1.0 && selectedChars[0].quad.lt.y <= 1.0));
    const sx = (isNorm && targetW > 1) ? targetW : 1;
    const sy = (isNorm && targetH > 1) ? targetH : 1;

    let combinedPathData = '';
    byLine.forEach(chars => {
      const isRtl = chars[0].dir === 'rtl';
      const first = isRtl ? chars[chars.length - 1].quad : chars[0].quad;
      const last = isRtl ? chars[0].quad : chars[chars.length - 1].quad;

      combinedPathData += ` M ${first.lt.x * sx} ${first.lt.y * sy}`
        + ` L ${last.rt.x * sx} ${last.rt.y * sy}`
        + ` L ${last.rb.x * sx} ${last.rb.y * sy}`
        + ` L ${first.lb.x * sx} ${first.lb.y * sy}`
        + ` Z`;
    });

    if (activePath) {
      activePath.setAttribute('d', combinedPathData.trim());
    }

    // Position teardrop handles
    const firstQuad = selectedChars[0].quad;
    const lastQuad = selectedChars[selectedChars.length - 1].quad;

    if (this.startHandle) this.positionHandle(this.startHandle, firstQuad.lt.x * sx, firstQuad.lt.y * sy);
    if (this.endHandle) this.positionHandle(this.endHandle, lastQuad.rb.x * sx, lastQuad.rb.y * sy);

    if (typeof this.onSelectionChange === 'function') {
      const selectedText = selectedChars.map(c => c.char).join('');
      const bounds = activePath && activePath.getBoundingClientRect ? activePath.getBoundingClientRect() : null;
      this.onSelectionChange({
        pageNum: this.pageNum,
        text: selectedText,
        range: this.selectedRange,
        bounds,
      });
    }
  }

  positionHandle(elem, x, y) {
    if (!elem) return;
    elem.style.display = 'block';
    elem.setAttribute('transform', `translate(${x}, ${y})`);
  }

  clearSelection() {
    this.selectedRange = null;
    if (this.highlightGroup) {
      const activePath = this.highlightGroup.querySelector('.active-selection-path');
      if (activePath) activePath.remove();
    }

    if (this.startHandle) this.startHandle.style.display = 'none';
    if (this.endHandle) this.endHandle.style.display = 'none';

    if (this.dimmer) {
      this.dimmer.style.opacity = '0';
    }

    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange(null);
    }
  }

  initGestures() {
    if (!this.svg || !this.svg.addEventListener) return;

    this.svg.addEventListener('pointerdown', (e) => {
      if (this.allChars.length === 0) return;

      const rect = this.svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (e.target === this.startHandle) {
        this.dragTarget = 'start';
      } else if (e.target === this.endHandle) {
        this.dragTarget = 'end';
      } else {
        this.dragTarget = 'new';
        const charIdx = this.findNearestChar(x, y, rect.width, rect.height);
        this.selectedRange = { startIdx: charIdx, endIdx: charIdx };
        this.renderSelection(charIdx, charIdx);
      }

      this.isDragging = true;
      if (this.svg.setPointerCapture) this.svg.setPointerCapture(e.pointerId);
    });

    this.svg.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.selectedRange) return;

      const rect = this.svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const nearest = this.findNearestChar(x, y, rect.width, rect.height);

      if (this.dragTarget === 'start') {
        this.selectedRange.startIdx = nearest;
      } else {
        this.selectedRange.endIdx = nearest;
      }

      this.renderSelection(this.selectedRange.startIdx, this.selectedRange.endIdx);
    });

    this.svg.addEventListener('pointerup', (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (this.svg.releasePointerCapture) this.svg.releasePointerCapture(e.pointerId);

      if (typeof this.onSelectionEnd === 'function' && this.selectedRange) {
        const s = Math.min(this.selectedRange.startIdx, this.selectedRange.endIdx);
        const eIdx = Math.max(this.selectedRange.startIdx, this.selectedRange.endIdx);
        const selectedChars = this.allChars.slice(s, eIdx + 1);
        const text = selectedChars.map(c => c.char).join('');
        this.onSelectionEnd({
          pageNum: this.pageNum,
          text,
          chars: selectedChars,
          range: this.selectedRange,
        });
      }
    });
  }
}
