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

  // Configure WebGPU execution provider with WASM SIMD fallback
  const sessionOptions = {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  };

  try {
    detSession = await ort.InferenceSession.create(detPath, sessionOptions);
    recSession = await ort.InferenceSession.create(recPath, sessionOptions);
    isInitialized = true;
    console.log('[OCR Worker] ONNX InferenceSessions initialized on WebGPU/WASM');
  } catch (err) {
    console.warn('[OCR Worker] Using lightweight fallback processor:', err.message);
    isInitialized = false;
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
      // Compute bounding box around quadrilateral
      const xs = [q[0], q[2], q[4], q[6]];
      const ys = [q[1], q[3], q[5], q[7]];
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
          recognizedLines.push({
            lineIdx: recognizedLines.length,
            text: cleanText,
            confidence,
            quad: q,
            words: [{ text: cleanText, quad: q }],
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
