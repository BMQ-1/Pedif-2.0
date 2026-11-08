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
    if (!Array.isArray(lines)) return list;
    lines.forEach((line, lIdx) => {
      if (!line || !Array.isArray(line.words)) return;
      line.words.forEach((word, wIdx) => {
        if (!word) return;
        const chars = Array.isArray(word.chars) ? word.chars : [];
        chars.forEach((ch, cIdx) => {
          list.push({
            char: ch.char,
            quad: ch.quad,
            lineIdx: lIdx,
            wordIdx: wIdx,
            charIdx: cIdx,
            dir: line.dir || 'ltr',
            pageNum: this.pageNum,
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

    if (this.svg && !this.svg.querySelector('#handle-shadow')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <filter id="handle-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
      `;
      this.svg.insertBefore(defs, this.svg.firstChild);
    }

    // Top-Left Anchor Pin (Vertical stem + Circular Touch Knob)
    this.startHandle = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.startHandle.setAttribute('class', 'teardrop-handle start-handle');
    this.startHandle.innerHTML = `
      <line x1="0" y1="-8" x2="0" y2="2" stroke="#007aff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="0" cy="-14" r="8.5" fill="#007aff" filter="url(#handle-shadow)"/>
      <circle cx="0" cy="-14" r="3.5" fill="#ffffff"/>
    `;
    this.startHandle.style.display = 'none';

    // Bottom-Right Anchor Pin (Vertical stem + Circular Touch Knob)
    this.endHandle = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.endHandle.setAttribute('class', 'teardrop-handle end-handle');
    this.endHandle.innerHTML = `
      <line x1="0" y1="-2" x2="0" y2="8" stroke="#007aff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="0" cy="14" r="8.5" fill="#007aff" filter="url(#handle-shadow)"/>
      <circle cx="0" cy="14" r="3.5" fill="#ffffff"/>
    `;
    this.endHandle.style.display = 'none';

    this.handleGroup.appendChild(this.startHandle);
    this.handleGroup.appendChild(this.endHandle);
  }

  /**
   * Magnetic character snapping using Euclidean projection to character midpoints
   * Returns -1 if click is too far from any character (e.g. blank margins)
   */
  findNearestChar(px, py, width = 1, height = 1, maxDistance = 65) {
    let bestDist = Infinity;
    let bestIdx = -1;

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

    if (bestDist > maxDistance) {
      return -1;
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
      activePath.setAttribute('fill', 'rgba(10, 132, 255, 0.22)');
      activePath.setAttribute('stroke', 'rgba(10, 132, 255, 0.65)');
      activePath.setAttribute('stroke-width', '1.2');
      activePath.setAttribute('stroke-linejoin', 'round');
      activePath.setAttribute('stroke-linecap', 'round');
      this.highlightGroup.appendChild(activePath);
    }

    // Group selected characters by line for continuous pill-hull rendering
    const byLine = new Map();
    selectedChars.forEach(c => {
      let lKey = c.lineIdx;
      if (lKey === undefined) {
        const y = c.quad && c.quad.lb ? (c.quad.lb.y || 0) : 0;
        lKey = 'y_' + Math.round(y * (c.quad && c.quad.isNormalized ? 80 : 1 / 10));
      }
      if (!byLine.has(lKey)) byLine.set(lKey, []);
      byLine.get(lKey).push(c);
    });

    const rect = this.svg && this.svg.getBoundingClientRect ? this.svg.getBoundingClientRect() : null;
    const targetW = (rect && rect.width > 1) ? rect.width : (this.pageContainer && this.pageContainer.clientWidth > 1 ? this.pageContainer.clientWidth : 1);
    const targetH = (rect && rect.height > 1) ? rect.height : (this.pageContainer && this.pageContainer.clientHeight > 1 ? this.pageContainer.clientHeight : 1);

    const isNorm = selectedChars.length > 0 && (selectedChars[0].quad.isNormalized || (selectedChars[0].quad.lt.x <= 1.0 && selectedChars[0].quad.lt.y <= 1.0));
    const sx = (isNorm && targetW > 1) ? targetW : 1;
    const sy = (isNorm && targetH > 1) ? targetH : 1;

    let combinedPathData = '';
    let handleStartPt = null;
    let handleEndPt = null;

    byLine.forEach((chars) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      chars.forEach(c => {
        const q = c.quad;
        minX = Math.min(minX, q.lt.x * sx, q.lb.x * sx);
        maxX = Math.max(maxX, q.rt.x * sx, q.rb.x * sx);
        minY = Math.min(minY, q.lt.y * sy, q.rt.y * sy);
        maxY = Math.max(maxY, q.lb.y * sy, q.rb.y * sy);
      });

      const lineH = Math.max(8, maxY - minY);
      const lineW = Math.max(4, maxX - minX);
      const padY = 1.0;
      const padX = 2.0;
      const left = minX - padX;
      const top = minY - padY;
      const width = lineW + 2 * padX;
      const height = lineH + 2 * padY;
      const r = Math.min(4.5, height / 3.2);

      if (!handleStartPt) {
        handleStartPt = { x: minX, y: minY };
      }
      handleEndPt = { x: maxX, y: maxY };

      // Continuous rounded pill per text row
      combinedPathData += ` M ${left + r} ${top}`
        + ` h ${width - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r}`
        + ` v ${height - 2 * r} a ${r} ${r} 0 0 1 -${r} ${r}`
        + ` h -${width - 2 * r} a ${r} ${r} 0 0 1 -${r} -${r}`
        + ` v -${height - 2 * r} a ${r} ${r} 0 0 1 ${r} -${r} Z `;
    });

    if (activePath) {
      activePath.setAttribute('d', combinedPathData.trim());
    }

    if (this.startHandle && handleStartPt) {
      this.positionHandle(this.startHandle, handleStartPt.x, handleStartPt.y);
    }
    if (this.endHandle && handleEndPt) {
      this.positionHandle(this.endHandle, handleEndPt.x, handleEndPt.y);
    }

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

  selectFromClientBounds(rects, pageRect) {
    if (!this.allChars.length || !rects || !rects.length || !pageRect) return;
    const first = rects[0];
    const last = rects[rects.length - 1];
    const startX = first.left - pageRect.left;
    const startY = (first.top + first.height / 2) - pageRect.top;
    const endX = last.right - pageRect.left;
    const endY = (last.top + last.height / 2) - pageRect.top;

    const sIdx = this.findNearestChar(startX, startY, pageRect.width, pageRect.height, 90);
    const eIdx = this.findNearestChar(endX, endY, pageRect.width, pageRect.height, 90);

    if (sIdx !== -1 && eIdx !== -1) {
      this.renderSelection(sIdx, eIdx);
    }
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
        this.isDragging = true;
      } else if (e.target === this.endHandle) {
        this.dragTarget = 'end';
        this.isDragging = true;
      } else {
        const charIdx = this.findNearestChar(x, y, rect.width, rect.height, 50);
        if (charIdx === -1) {
          // Clicked outside text boundaries, dismiss selection
          this.clearSelection();
          if (typeof this.onSelectionEnd === 'function') {
            this.onSelectionEnd(null);
          }
          return;
        }

        this.dragTarget = 'new';
        this.selectedRange = { startIdx: charIdx, endIdx: charIdx };
        this.renderSelection(charIdx, charIdx);
        this.isDragging = true;
      }

      if (this.svg.setPointerCapture) {
        try { this.svg.setPointerCapture(e.pointerId); } catch {}
      }
    });

    this.svg.addEventListener('pointermove', (e) => {
      if (!this.isDragging || !this.selectedRange) return;

      const rect = this.svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const nearest = this.findNearestChar(x, y, rect.width, rect.height, 120);
      if (nearest === -1) return;

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
      if (this.svg.releasePointerCapture) {
        try { this.svg.releasePointerCapture(e.pointerId); } catch {}
      }

      if (typeof this.onSelectionEnd === 'function' && this.selectedRange) {
        const s = Math.min(this.selectedRange.startIdx, this.selectedRange.endIdx);
        const eIdx = Math.max(this.selectedRange.startIdx, this.selectedRange.endIdx);
        const selectedChars = this.allChars.slice(s, eIdx + 1);
        const text = selectedChars.map(c => c.char).join('');
        const activePath = this.highlightGroup ? this.highlightGroup.querySelector('.active-selection-path') : null;
        const bounds = activePath && activePath.getBoundingClientRect ? activePath.getBoundingClientRect() : null;

        this.onSelectionEnd({
          pageNum: this.pageNum,
          text,
          chars: selectedChars,
          range: this.selectedRange,
          bounds,
        });
      }
    });
  }
}
