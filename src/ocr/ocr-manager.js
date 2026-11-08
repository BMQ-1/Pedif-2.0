/**
 * Main-Thread OCR Manager
 * Manages the background OCR Web Worker, Area Snippet OCR, and scanned page processing.
 */

import { searchEngine } from '../core/search-engine.js';

export class OcrManager {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.pendingRequests = new Map();
    this.reqCounter = 0;

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      this.initWorker();
    }
  }

  initWorker() {
    try {
      this.worker = new Worker(new URL('./ocr.worker.js', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e) => {
        const { type, id, results, error } = e.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        this.pendingRequests.delete(id);
        if (type === 'PROCESS_SUCCESS' || type === 'INIT_SUCCESS') {
          pending.resolve(results);
        } else {
          pending.reject(new Error(error || 'OCR Worker failure'));
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[OcrManager] Worker error:', err);
      };

      // Send initial init message with verified local PP-OCRv4 model paths
      const base = (typeof window !== 'undefined' && window.location)
        ? new URL('.', window.location.href).href
        : './';

      this.send('INIT', {
        detModelUrl: new URL('models/ch_PP-OCRv4_det.onnx', base).href,
        recModelUrl: new URL('models/ch_PP-OCRv4_rec.onnx', base).href,
        dictUrl: new URL('models/ch_PP-OCR_keys_v1.txt', base).href,
      }).then(() => {
        this.isReady = true;
        console.log('[OcrManager] Worker ready with WebGPU / WASM acceleration');
      }).catch((e) => {
        console.warn('[OcrManager] Init non-fatal fallback:', e);
      });

    } catch (err) {
      console.warn('[OcrManager] Web Worker initialization fallback:', err);
    }
  }

  send(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        resolve({ lines: [], fullText: '' });
        return;
      }
      const id = ++this.reqCounter;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, payload });
    });
  }

  /**
   * Run OCR on a rendered page canvas
   */
  async processPageCanvas(canvas, pageNum) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const res = await this.send('PROCESS_PAGE', {
      imageData,
      pageNum,
    });

    if (res && res.lines && res.lines.length) {
      // Register with unified search engine
      const words = [];
      res.lines.forEach(l => {
        if (l.words) words.push(...l.words);
      });
      searchEngine.registerOcrPage(pageNum, res.lines, words, res.fullText);
    }

    return res;
  }

  /**
   * Run Area OCR Snippet on a crop rectangle
   */
  async processAreaCrop(canvas, rect) {
    if (!canvas) return '';
    const ctx = canvas.getContext('2d');
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(canvas.width - x, Math.ceil(rect.width));
    const h = Math.min(canvas.height - y, Math.ceil(rect.height));

    if (w < 4 || h < 4) return '';

    const cropData = ctx.getImageData(x, y, w, h);
    const res = await this.send('PROCESS_PAGE', {
      imageData: cropData,
      pageNum: 0,
    });

    return res ? res.fullText : '';
  }
}

export const ocrManager = new OcrManager();
