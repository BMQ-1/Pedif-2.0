/**
 * Glyph & Quad Extractor
 * Converts PDF.js textContent items and transform matrices into
 * Precision 8-point oriented quadrilaterals:
 * [LT(x1, y1), RT(x2, y2), RB(x3, y3), LB(x4, y4)]
 */

import { Point, Quad } from './quad-model.js';

export class GlyphExtractor {
  /**
   * Extracts words and characters with their 8-point quads from a PDF.js page
   * @param {Object} page - PDFPageProxy
   * @param {Object} viewport - PDFPageViewport at scale
   * @returns {Promise<{ isScanned: boolean, lines: Array, fullText: string }>}
   */
  static async extractPageText(page, viewport) {
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    const items = textContent.items || [];
    if (items.length === 0) {
      return { isScanned: true, lines: [], fullText: '' };
    }

    const lines = [];
    let currentLine = null;
    let fullText = '';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str = item.str;
      if (!str || !str.trim()) continue;

      fullText += str + ' ';

      // Extract quad for the text item
      const itemQuad = this.computeItemQuad(item, viewport);
      const words = this.subdivideItemIntoWords(item, itemQuad, viewport);

      // Group into lines based on baseline Y coordinates
      const baselineY = itemQuad.lb.y;
      if (!currentLine || Math.abs(currentLine.baselineY - baselineY) > 8) {
        currentLine = {
          lineIdx: lines.length,
          baselineY,
          dir: item.dir || 'ltr',
          words: [],
          text: '',
        };
        lines.push(currentLine);
      }

      currentLine.words.push(...words);
      currentLine.text += (currentLine.text ? ' ' : '') + str;
    }

    return {
      isScanned: false,
      lines,
      fullText: fullText.trim(),
    };
  }

  /**
   * Normalizes all quad coordinates across extracted lines into [0.0, 1.0] page space
   */
  static normalizeTextData(textData, width, height) {
    if (!textData || !textData.lines || !width || !height) return textData;
    const normLines = textData.lines.map(line => ({
      ...line,
      baselineY: line.baselineY / height,
      words: line.words.map(w => ({
        ...w,
        quad: w.quad.toNormalized(width, height),
        chars: w.chars.map(c => ({
          ...c,
          quad: c.quad.toNormalized(width, height),
        })),
      })),
    }));
    return {
      ...textData,
      lines: normLines,
    };
  }

  /**
   * Computes oriented 8-point quad from PDF.js item.transform and viewport
   */
  static computeItemQuad(item, viewport) {
    // PDF.js transform: [scaleX, skewY, skewX, scaleY, transX, transY]
    const tx = item.transform;
    const width = item.width;
    const height = item.height || Math.hypot(tx[2], tx[3]);

    // Local glyph box corners in PDF user space:
    // LB: (0, 0), RB: (width, 0), RT: (width, height), LT: (0, height)
    const pLB = [0, 0];
    const pRB = [width, 0];
    const pRT = [width, height];
    const pLT = [0, height];

    const applyTransform = ([x, y]) => {
      // Affine transform: x' = a*x + c*y + e, y' = b*x + d*y + f
      const px = tx[0] * x + tx[2] * y + tx[4];
      const py = tx[1] * x + tx[3] * y + tx[5];
      // Convert PDF coordinates (origin bottom-left) to Viewport space (origin top-left)
      const [vx, vy] = viewport.convertToViewportPoint(px, py);
      return new Point(vx, vy);
    };

    const lb = applyTransform(pLB);
    const rb = applyTransform(pRB);
    const rt = applyTransform(pRT);
    const lt = applyTransform(pLT);

    return new Quad(lt, rt, rb, lb);
  }

  /**
   * Subdivides a text item into individual words and characters with their quads
   */
  static subdivideItemIntoWords(item, itemQuad, viewport) {
    const text = item.str;
    const wordStrings = text.split(/(\s+)/);
    const totalChars = text.length;
    if (totalChars === 0) return [];

    const words = [];
    let charOffset = 0;

    for (const token of wordStrings) {
      if (!token) continue;
      const isWhitespace = /^\s+$/.test(token);
      const tokenLen = token.length;

      if (!isWhitespace) {
        const startRatio = charOffset / totalChars;
        const endRatio = (charOffset + tokenLen) / totalChars;

        const wordQuad = this.interpolateQuad(itemQuad, startRatio, endRatio);
        const chars = [];

        for (let c = 0; c < tokenLen; c++) {
          const cStart = (charOffset + c) / totalChars;
          const cEnd = (charOffset + c + 1) / totalChars;
          const charQuad = this.interpolateQuad(itemQuad, cStart, cEnd);
          chars.push({
            char: token[c],
            quad: charQuad,
          });
        }

        words.push({
          text: token,
          quad: wordQuad,
          chars,
        });
      }

      charOffset += tokenLen;
    }

    return words;
  }

  /**
   * Interpolates an 8-point quad along its top and bottom baseline vectors
   */
  static interpolateQuad(quad, startRatio, endRatio) {
    const lerp = (p1, p2, t) => new Point(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t);

    const lt = lerp(quad.lt, quad.rt, startRatio);
    const rt = lerp(quad.lt, quad.rt, endRatio);
    const lb = lerp(quad.lb, quad.rb, startRatio);
    const rb = lerp(quad.lb, quad.rb, endRatio);

    return new Quad(lt, rt, rb, lb);
  }
}
