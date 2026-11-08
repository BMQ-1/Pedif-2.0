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

      // Propagate lineIdx down to words and chars for line-by-line highlight rendering
      words.forEach(w => {
        w.lineIdx = currentLine.lineIdx;
        if (w.chars) {
          w.chars.forEach(c => {
            c.lineIdx = currentLine.lineIdx;
          });
        }
      });

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
    const normLines = textData.lines.map((line, lIdx) => {
      const lineIdx = line.lineIdx !== undefined ? line.lineIdx : lIdx;
      return {
        ...line,
        lineIdx,
        baselineY: line.baselineY / height,
        words: line.words.map((w, wIdx) => ({
          ...w,
          lineIdx,
          wordIdx: w.wordIdx !== undefined ? w.wordIdx : wIdx,
          quad: w.quad.toNormalized(width, height),
          chars: w.chars.map((c, cIdx) => ({
            ...c,
            lineIdx,
            wordIdx: w.wordIdx !== undefined ? w.wordIdx : wIdx,
            charIdx: c.charIdx !== undefined ? c.charIdx : cIdx,
            quad: c.quad.toNormalized(width, height),
          })),
        })),
      };
    });
    return {
      ...textData,
      lines: normLines,
    };
  }

  /**
   * Computes oriented 8-point quad from PDF.js item.transform and viewport.
   * Accurately converts PDF user space coordinates [LB, RB, RT, LT] to viewport space
   * respecting font ascent, scale, and arbitrary rotation.
   */
  static computeItemQuad(item, viewport) {
    const tx = item.transform;
    const width = item.width;
    const height = item.height || Math.hypot(tx[2], tx[3]);

    // Unit vectors in PDF user space
    const fontScaleX = Math.hypot(tx[0], tx[1]) || 1;
    const fontScaleY = Math.hypot(tx[2], tx[3]) || fontScaleX;

    const uBasX = tx[0] / fontScaleX;
    const uBasY = tx[1] / fontScaleX;
    const uAscX = tx[2] / fontScaleY;
    const uAscY = tx[3] / fontScaleY;

    // Corner coordinates in PDF user space (origin bottom-left):
    // In standard typographic font metrics, ascent reaches ~0.84*height above baseline
    // and descent reaches ~0.16*height below baseline.
    // Centering the bounding box around the baseline ensures true pixel alignment with glyphs.
    const e = tx[4], f = tx[5];
    const descentFactor = 0.16;
    const ascentFactor = 0.84;

    const pLB = [e - uAscX * (descentFactor * height), f - uAscY * (descentFactor * height)];
    const pRB = [e + uBasX * width - uAscX * (descentFactor * height), f + uBasY * width - uAscY * (descentFactor * height)];
    const pLT = [e + uAscX * (ascentFactor * height), f + uAscY * (ascentFactor * height)];
    const pRT = [e + uBasX * width + uAscX * (ascentFactor * height), f + uBasY * width + uAscY * (ascentFactor * height)];

    const [lbX, lbY] = viewport.convertToViewportPoint(...pLB);
    const [rbX, rbY] = viewport.convertToViewportPoint(...pRB);
    const [ltX, ltY] = viewport.convertToViewportPoint(...pLT);
    const [rtX, rtY] = viewport.convertToViewportPoint(...pRT);

    const lb = new Point(lbX, lbY);
    const rb = new Point(rbX, rbY);
    const lt = new Point(ltX, ltY);
    const rt = new Point(rtX, rtY);

    return new Quad(lt, rt, rb, lb);
  }

  /**
   * Proportional typographic character advance weight relative to 1em
   */
  static getCharacterWeight(char) {
    const code = char.charCodeAt(0);
    if (code <= 32) return 0.28;
    if ('ijl|!I1:;.,\'`'.includes(char)) return 0.28;
    if ('frtJ()-[]{}'.includes(char)) return 0.35;
    if ('abcdeghknopquvxyzs$023456789?'.includes(char)) return 0.54;
    if ('ABCDEFGHIKLNOPQRSTUVXYZ#+*^'.includes(char)) return 0.68;
    if ('mwMW_@%&~'.includes(char)) return 0.88;
    return 0.58;
  }

  /**
   * Subdivides a text item into individual words and characters with their quads
   * Uses proportional glyph advance weights for pixel-accurate typographic quad mapping.
   */
  static subdivideItemIntoWords(item, itemQuad, viewport) {
    const text = item.str;
    const wordStrings = text.split(/(\s+)/);
    const totalChars = text.length;
    if (totalChars === 0) return [];

    // Precalculate cumulative character advance weights
    const weights = new Float32Array(totalChars);
    let totalWeight = 0;
    for (let i = 0; i < totalChars; i++) {
      const w = this.getCharacterWeight(text[i]);
      weights[i] = w;
      totalWeight += w;
    }
    if (totalWeight <= 0) totalWeight = 1;

    const words = [];
    let charOffset = 0;
    let accumulatedWeight = 0;

    for (const token of wordStrings) {
      if (!token) continue;
      const isWhitespace = /^\s+$/.test(token);
      const tokenLen = token.length;

      let tokenWeight = 0;
      for (let c = 0; c < tokenLen; c++) {
        tokenWeight += weights[charOffset + c];
      }

      if (!isWhitespace) {
        const startRatio = accumulatedWeight / totalWeight;
        const endRatio = (accumulatedWeight + tokenWeight) / totalWeight;

        const wordQuad = this.interpolateQuad(itemQuad, startRatio, endRatio);
        const chars = [];

        let charAcc = accumulatedWeight;
        for (let c = 0; c < tokenLen; c++) {
          const cW = weights[charOffset + c];
          const cStart = charAcc / totalWeight;
          const cEnd = (charAcc + cW) / totalWeight;
          const charQuad = this.interpolateQuad(itemQuad, cStart, cEnd);
          chars.push({
            char: token[c],
            quad: charQuad,
          });
          charAcc += cW;
        }

        words.push({
          text: token,
          quad: wordQuad,
          chars,
        });
      }

      accumulatedWeight += tokenWeight;
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
