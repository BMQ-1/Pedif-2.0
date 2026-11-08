import { CTCDecoder } from '../src/ocr/ctc-decoder.js';
import { DBNet } from '../src/ocr/dbnet.js';
import { SVTR } from '../src/ocr/svtr.js';
import { Quad } from '../src/selection/quad-model.js';

console.log('--- Running Phase 6 PP-OCRv4 WebGPU / WASM Local AI Pipeline Tests ---');

// 1. Test CTC Greedy Decoder
const decoder = new CTCDecoder();
// Character list: index 0 = blank. 'a' is at index of 'a'
const charAIdx = decoder.charList.indexOf('a');
const charBIdx = decoder.charList.indexOf('b');
const numClasses = decoder.charList.length;

// Sequence: [blank, 'a', 'a', blank, 'b', 'b'] -> should collapse to "ab"
const seqLen = 6;
const logits = new Float32Array(seqLen * numClasses);

const setToken = (t, tokenIdx) => {
  for (let c = 0; c < numClasses; c++) {
    logits[t * numClasses + c] = c === tokenIdx ? 5.0 : -5.0;
  }
};

setToken(0, 0); // blank
setToken(1, charAIdx); // 'a'
setToken(2, charAIdx); // 'a' (repeated, should collapse)
setToken(3, 0); // blank
setToken(4, charBIdx); // 'b'
setToken(5, charBIdx); // 'b' (repeated, should collapse)

const ctcRes = decoder.decode(logits, seqLen, numClasses);
if (ctcRes.text !== 'ab') {
  throw new Error(`CTC decoding failed: expected "ab", got "${ctcRes.text}"`);
}
console.log('✅ CTC greedy decoding & character collapse passed');

// 2. Test DBNet++ Preprocessing
const mockWidth = 100;
const mockHeight = 80;
const mockPixels = new Uint8ClampedArray(mockWidth * mockHeight * 4);
// Fill with dummy color
for (let i = 0; i < mockPixels.length; i += 4) {
  mockPixels[i] = 200;     // R
  mockPixels[i + 1] = 100; // G
  mockPixels[i + 2] = 50;  // B
  mockPixels[i + 3] = 255; // A
}

const mockImgData = { width: mockWidth, height: mockHeight, data: mockPixels };
const pre = DBNet.preprocess(mockImgData, 960);

// Check that target dimensions are multiples of 32
if (pre.dims[2] % 32 !== 0 || pre.dims[3] % 32 !== 0) {
  throw new Error(`DBNet target dimensions must be multiples of 32, got ${pre.dims[2]}x${pre.dims[3]}`);
}
if (pre.tensorData.length !== 3 * pre.dims[2] * pre.dims[3]) {
  throw new Error('DBNet tensor shape mismatch');
}
console.log('✅ DBNet++ image preprocessing & 32-multiple normalization passed');

// 3. Test DBNet++ Postprocessing & Unclip Quads
const targetH = pre.dims[2];
const targetW = pre.dims[3];
const predMap = new Float32Array(targetH * targetW);

// Paint a synthetic text box in the probability map
for (let y = 10; y < 25; y++) {
  for (let x = 10; x < 60; x++) {
    predMap[y * targetW + x] = 0.95; // High confidence text probability
  }
}

const quads = DBNet.postprocess(predMap, targetH, targetW, pre.scaleX, pre.scaleY, 0.3);
if (quads.length === 0 || !(quads[0] instanceof Quad)) {
  throw new Error('DBNet postprocessing failed to extract valid Quad');
}
const b = quads[0].getBounds();
if (b[2] <= b[0] || b[3] <= b[1]) {
  throw new Error('Invalid quad bounding box coordinates');
}
console.log('✅ DBNet++ connected component extraction & unclip quads passed');

// 4. Test SVTR Preprocessor
const svtr = new SVTR();
const cropW = 60;
const cropH = 20;
const cropPixels = new Uint8ClampedArray(cropW * cropH * 4);
const cropData = { width: cropW, height: cropH, data: cropPixels };

const svtrPre = svtr.preprocessCrop(cropData);
if (svtrPre.dims[2] !== 48) {
  throw new Error(`SVTR input height must be 48, got ${svtrPre.dims[2]}`);
}
if (svtrPre.tensorData.length !== 3 * 48 * svtrPre.dims[3]) {
  throw new Error('SVTR tensor length mismatch');
}
console.log('✅ SVTR image crop preprocessor passed');

console.log('--- All Phase 6 Core Tests Passed Successfully ---');
