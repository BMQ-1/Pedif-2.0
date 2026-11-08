/**
 * Unified Search Engine
 * Indexes both native PDF glyph streams and OCR text streams.
 * Computes exact 8-point quads for all search matches and supports
 * real-time match navigation (Enter / Shift+Enter).
 */

import { pdfEngine } from './pdf-engine.js';
import { GlyphExtractor } from '../selection/glyph-extractor.js';

export class SearchEngine {
  constructor() {
    this.pageIndices = new Map(); // pageNum -> { lines, fullText, words }
    this.currentQuery = '';
    this.matches = [];
    this.activeMatchIndex = -1;
    this.isIndexing = false;
    this.listeners = new Set();
  }

  /**
   * Pre-indexes or lazily indexes document text
   */
  async indexDocument(onProgress) {
    if (this.isIndexing) return;
    this.isIndexing = true;
    this.pageIndices.clear();

    const numPages = pdfEngine.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfEngine.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const textData = await GlyphExtractor.extractPageText(page, viewport);

        // Flatten words for fast searching
        const words = [];
        textData.lines.forEach(line => {
          line.words.forEach(word => {
            words.push({ ...word, pageNum, lineIdx: line.lineIdx });
          });
        });

        this.pageIndices.set(pageNum, {
          pageNum,
          isScanned: textData.isScanned,
          lines: textData.lines,
          fullText: textData.fullText,
          words,
        });

        if (typeof onProgress === 'function') {
          onProgress(pageNum, numPages);
        }
      } catch (err) {
        console.warn(`[SearchEngine] Error indexing page ${pageNum}:`, err);
      }
    }

    this.isIndexing = false;
  }

  /**
   * Register OCR page text into search index (used in Phase 6 for scanned pages)
   */
  registerOcrPage(pageNum, lines, words, fullText) {
    this.pageIndices.set(pageNum, {
      pageNum,
      isScanned: false,
      lines,
      words,
      fullText,
    });
    // Re-run current search if query is active
    if (this.currentQuery) {
      this.search(this.currentQuery);
    }
  }

  /**
   * Search for text across all pages
   * @param {string} query
   * @returns {Array} matches
   */
  search(query) {
    this.currentQuery = (query || '').trim();
    this.matches = [];
    this.activeMatchIndex = -1;

    if (!this.currentQuery || this.currentQuery.length < 2) {
      this._notify();
      return [];
    }

    const lowerQ = this.currentQuery.toLowerCase();

    this.pageIndices.forEach((pageData, pageNum) => {
      const words = pageData.words;
      if (!words || !words.length) return;

      // Single-word search or multi-word phrase matching
      const queryTokens = lowerQ.split(/\s+/).filter(Boolean);
      const tokenCount = queryTokens.length;

      for (let i = 0; i <= words.length - tokenCount; i++) {
        let isMatch = true;

        if (tokenCount === 1) {
          const wText = words[i].text.toLowerCase();
          isMatch = wText.includes(lowerQ);
        } else {
          for (let j = 0; j < tokenCount; j++) {
            if (!words[i + j].text.toLowerCase().includes(queryTokens[j])) {
              isMatch = false;
              break;
            }
          }
        }

        if (isMatch) {
          const matchedWords = words.slice(i, i + tokenCount);
          const firstQuad = matchedWords[0].quad;
          const lastQuad = matchedWords[matchedWords.length - 1].quad;

          // Merge quad boundaries
          const matchQuad = {
            lt: firstQuad.lt,
            rt: lastQuad.rt,
            rb: lastQuad.rb,
            lb: firstQuad.lb,
          };

          this.matches.push({
            id: `match_${this.matches.length}`,
            pageNum,
            text: matchedWords.map(w => w.text).join(' '),
            quad: matchQuad,
            words: matchedWords,
          });

          if (tokenCount > 1) {
            i += tokenCount - 1; // Advance past matched phrase
          }
        }
      }
    });

    if (this.matches.length > 0) {
      this.activeMatchIndex = 0;
    }

    this._notify();
    return this.matches;
  }

  nextMatch() {
    if (this.matches.length === 0) return null;
    this.activeMatchIndex = (this.activeMatchIndex + 1) % this.matches.length;
    this._notify();
    return this.getActiveMatch();
  }

  prevMatch() {
    if (this.matches.length === 0) return null;
    this.activeMatchIndex = (this.activeMatchIndex - 1 + this.matches.length) % this.matches.length;
    this._notify();
    return this.getActiveMatch();
  }

  getActiveMatch() {
    if (this.activeMatchIndex < 0 || this.activeMatchIndex >= this.matches.length) {
      return null;
    }
    return {
      index: this.activeMatchIndex + 1,
      total: this.matches.length,
      match: this.matches[this.activeMatchIndex],
    };
  }

  getMatchesForPage(pageNum) {
    return this.matches.filter(m => m.pageNum === pageNum);
  }

  clear() {
    this.currentQuery = '';
    this.matches = [];
    this.activeMatchIndex = -1;
    this._notify();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    const data = {
      query: this.currentQuery,
      totalMatches: this.matches.length,
      activeMatch: this.getActiveMatch(),
    };
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (e) {
        console.error('[SearchEngine] Listener error:', e);
      }
    }
  }
}

export const searchEngine = new SearchEngine();
