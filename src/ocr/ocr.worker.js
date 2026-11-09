/**
 * Dedicated OCR Web Worker
 * Runs onnxruntime-web with WebGPU acceleration (WASM fallback) in the background.
 */

import * as ort from 'onnxruntime-web';
import { DBNet } from './dbnet.js';
import { SVTR } from './svtr.js';

let detSession = null;
let recSession = null;
let svtr = null;
let isInitialized = false;

self.onmessage = async (e) => {
  const { type, id, payload } = e.data;

  if (type === 'INIT') {
    try {
      await initializeOcr(payload);
      self.postMessage({ type: 'INIT_SUCCESS', id });
    } catch (err) {
      console.warn('[OCR Worker] Init warning:', err);
      self.postMessage({ type: 'INIT_ERROR', id, error: err.message });
    }
  } else if (type === 'PROCESS_PAGE') {
    try {
      const results = await processPageImage(payload);
      self.postMessage({ type: 'PROCESS_SUCCESS', id, results });
    } catch (err) {
      console.error('[OCR Worker] Processing error:', err);
      self.postMessage({ type: 'PROCESS_ERROR', id, error: err.message });
    }
  }
};

async function initializeOcr(config = {}) {
  if (isInitialized) return;

  const detPath = config.detModelUrl || './models/ch_PP-OCRv4_det.onnx';
  const recPath = config.recModelUrl || './models/ch_PP-OCRv4_rec.onnx';
  const dictUrl = config.dictUrl || './models/ch_PP-OCR_keys_v1.txt';
  let dictText = config.dictText || '';

  if (!dictText && typeof fetch !== 'undefined') {
    try {
      const resp = await fetch(dictUrl);
      if (resp.ok) {
        dictText = await resp.text();
      }
    } catch (e) {
      console.warn('[OCR Worker] Could not load dictionary from', dictUrl, e);
    }
  }

  svtr = new SVTR(dictText);

  if (ort && ort.env && ort.env.wasm) {
    ort.env.wasm.numThreads = Math.min(4, (self.navigator && self.navigator.hardwareConcurrency) || 2);
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false;
  }

  // Configure WebGPU execution provider with WASM SIMD fallback
  const sessionOptions = {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  };

  try {
    detSession = await ort.InferenceSession.create(detPath, sessionOptions);
  } catch (err) {
    console.warn('[OCR Worker] WebGPU det session failed, falling back to WASM:', err.message);
    try {
      detSession = await ort.InferenceSession.create(detPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (e2) {
      console.warn('[OCR Worker] WASM det session failed:', e2.message);
    }
  }

  try {
    recSession = await ort.InferenceSession.create(recPath, sessionOptions);
  } catch (err) {
    console.warn('[OCR Worker] WebGPU rec session failed, falling back to WASM:', err.message);
    try {
      recSession = await ort.InferenceSession.create(recPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (e2) {
      console.warn('[OCR Worker] WASM rec session failed:', e2.message);
    }
  }

  if (detSession && recSession) {
    isInitialized = true;
    console.log('[OCR Worker] PP-OCRv4 ONNX InferenceSessions initialized successfully');
  } else {
    isInitialized = false;
    console.warn('[OCR Worker] Running in heuristic fallback mode');
  }
}

function extractCropData(imageData, minX, minY, cropW, cropH) {
  const srcW = imageData.width;
  const srcData = imageData.data;
  const cropData = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRowStart = ((minY + y) * srcW + minX) * 4;
    const destRowStart = (y * cropW) * 4;
    cropData.set(srcData.subarray(srcRowStart, srcRowStart + cropW * 4), destRowStart);
  }
  return { width: cropW, height: cropH, data: cropData };
}

async function processPageImage({ imageData, pageNum }) {
  const width = imageData.width;
  const height = imageData.height;

  // 1. Detection preprocessing
  const pre = DBNet.preprocess(imageData);

  // If live ONNX sessions are loaded, run full forward pass
  if (detSession && recSession && svtr) {
    const detTensor = new ort.Tensor('float32', pre.tensorData, pre.dims);
    const detResults = await detSession.run({ x: detTensor });
    const outputName = Object.keys(detResults)[0];
    const predMap = detResults[outputName].data;

    // 2. Postprocess detection map to obtain 4-point quads
    const quads = DBNet.postprocess(predMap, pre.dims[2], pre.dims[3], pre.scaleX, pre.scaleY);

    // 3. Crop & Recognize each text box
    const recognizedLines = [];
    let fullText = '';

    for (let i = 0; i < quads.length; i++) {
      const q = quads[i];
      // Compute bounding box around quadrilateral (supports Quad instance, array, or p1..p4)
      const pLt = q.lt || (q[0] !== undefined ? { x: q[0], y: q[1] } : (q.p1 || { x: 0, y: 0 }));
      const pRt = q.rt || (q[2] !== undefined ? { x: q[2], y: q[3] } : (q.p2 || { x: 0, y: 0 }));
      const pRb = q.rb || (q[4] !== undefined ? { x: q[4], y: q[5] } : (q.p3 || { x: 0, y: 0 }));
      const pLb = q.lb || (q[6] !== undefined ? { x: q[6], y: q[7] } : (q.p4 || { x: 0, y: 0 }));

      const xs = [pLt.x, pRt.x, pRb.x, pLb.x];
      const ys = [pLt.y, pRt.y, pRb.y, pLb.y];
      const minX = Math.max(0, Math.floor(Math.min(...xs)));
      const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys)));
      const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

      const boxW = maxX - minX;
      const boxH = maxY - minY;

      if (boxW >= 4 && boxH >= 4) {
        const crop = extractCropData(imageData, minX, minY, boxW, boxH);
        const recPre = svtr.preprocessCrop(crop, 320);
        const recTensor = new ort.Tensor('float32', recPre.tensorData, recPre.dims);
        const recResults = await recSession.run({ x: recTensor });
        const recOutName = Object.keys(recResults)[0];
        const logits = recResults[recOutName].data;
        const dims = recResults[recOutName].dims; // [1, seqLen, numClasses]
        const seqLen = dims[1];
        const numClasses = dims[2];

        const { text, confidence } = svtr.decodeLogits(logits, seqLen, numClasses);
        if (text && text.trim()) {
          const cleanText = text.trim();
          fullText += cleanText + ' ';

          // Subdivide recognized line quad across characters for pixel-accurate selection
          const chars = [];
          const numChars = cleanText.length;
          for (let c = 0; c < numChars; c++) {
            const t0 = c / numChars;
            const t1 = (c + 1) / numChars;
            const cLt = { x: pLt.x + (pRt.x - pLt.x) * t0, y: pLt.y + (pRt.y - pLt.y) * t0 };
            const cRt = { x: pLt.x + (pRt.x - pLt.x) * t1, y: pLt.y + (pRt.y - pLt.y) * t1 };
            const cRb = { x: pLb.x + (pRb.x - pLb.x) * t1, y: pLb.y + (pRb.y - pLb.y) * t1 };
            const cLb = { x: pLb.x + (pRb.x - pLb.x) * t0, y: pLb.y + (pRb.y - pLb.y) * t0 };

            chars.push({
              char: cleanText[c],
              quad: {
                lt: cLt,
                rt: cRt,
                rb: cRb,
                lb: cLb,
                p1: cLt,
                p2: cRt,
                p3: cRb,
                p4: cLb,
                isNormalized: false,
              },
            });
          }

          const lineQuad = {
            lt: pLt,
            rt: pRt,
            rb: pRb,
            lb: pLb,
            p1: pLt,
            p2: pRt,
            p3: pRb,
            p4: pLb,
            isNormalized: false,
          };

          recognizedLines.push({
            lineIdx: recognizedLines.length,
            text: cleanText,
            confidence,
            quad: lineQuad,
            words: [{ text: cleanText, quad: lineQuad, chars }],
          });
        }
      }
    }

    return {
      pageNum,
      isScanned: false,
      lines: recognizedLines,
      fullText: fullText.trim(),
    };
  }

  // Graceful fallback when models are loading
  return {
    pageNum,
    isScanned: false,
    lines: [],
    fullText: '',
  };
}
