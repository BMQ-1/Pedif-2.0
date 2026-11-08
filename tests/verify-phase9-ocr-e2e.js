import * as ort from 'onnxruntime-web';
import path from 'path';
import fs from 'fs';
import { DBNet } from '../src/ocr/dbnet.js';
import { SVTR } from '../src/ocr/svtr.js';

console.log('--- Running Live PP-OCRv4 ONNX Inference Verification ---');

async function run() {
  const detPath = path.join(process.cwd(), 'public', 'models', 'ch_PP-OCRv4_det.onnx');
  const recPath = path.join(process.cwd(), 'public', 'models', 'ch_PP-OCRv4_rec.onnx');
  const dictPath = path.join(process.cwd(), 'public', 'models', 'ch_PP-OCR_keys_v1.txt');

  if (!fs.existsSync(detPath) || !fs.existsSync(recPath) || !fs.existsSync(dictPath)) {
    throw new Error('Missing ONNX model files in public/models');
  }

  const dictText = fs.readFileSync(dictPath, 'utf8');
  const svtr = new SVTR(dictText);

  // 1. Create ONNX sessions
  const detSession = await ort.InferenceSession.create(detPath);
  const recSession = await ort.InferenceSession.create(recPath);

  if (!detSession || !recSession) throw new Error('Failed to create ONNX sessions');
  console.log('✅ ONNX sessions loaded successfully');

  // 2. Test Detection inference with normalized dummy image (320x320)
  const dummyImg = {
    width: 320,
    height: 320,
    data: new Uint8ClampedArray(320 * 320 * 4).fill(255)
  };
  const pre = DBNet.preprocess(dummyImg);
  const detTensor = new ort.Tensor('float32', pre.tensorData, pre.dims);
  const detOut = await detSession.run({ x: detTensor });
  const detOutName = detSession.outputNames[0];
  const predMap = detOut[detOutName].data;

  if (!predMap || predMap.length !== pre.dims[2] * pre.dims[3]) {
    throw new Error('Detection output map size unexpected');
  }
  console.log('✅ PP-OCRv4 DBNet++ detection pass executed (dims: ' + detOut[detOutName].dims.join('x') + ')');

  // 3. Test Recognition inference with synthetic crop (48x160)
  const dummyCrop = {
    width: 160,
    height: 48,
    data: new Uint8ClampedArray(160 * 48 * 4).fill(255)
  };
  const recPre = svtr.preprocessCrop(dummyCrop, 320);
  const recTensor = new ort.Tensor('float32', recPre.tensorData, recPre.dims);
  const recOut = await recSession.run({ x: recTensor });
  const recOutName = recSession.outputNames[0];
  const logits = recOut[recOutName].data;
  const dims = recOut[recOutName].dims; // [1, seqLen, 6625]

  if (dims[0] !== 1 || dims[2] !== 6625) {
    throw new Error('Recognition output shape unexpected: ' + dims.join('x'));
  }

  const decoded = svtr.decodeLogits(logits, dims[1], dims[2]);
  console.log('✅ PP-OCRv4 SVTR recognition & CTC decoder pass executed (vocab size: ' + dims[2] + ')');
  console.log('--- All Live Model Inference Tests Passed Successfully ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
