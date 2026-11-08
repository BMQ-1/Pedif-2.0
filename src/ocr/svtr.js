/**
 * SVTR (Vision Transformer) Text Recognition Pipeline
 * Preprocesses cropped text box image tensors and decodes strings via CTCDecoder.
 */

import { CTCDecoder } from './ctc-decoder.js';

export class SVTR {
  constructor(dictionaryText = '') {
    this.decoder = new CTCDecoder(dictionaryText);
    this.targetHeight = 48; // PP-OCRv4 standard recognition input height
  }

  /**
   * Preprocesses a cropped text box image into an SVTR input tensor [1, 3, 48, targetW]
   * @param {ImageData} cropData
   * @param {number} maxWidth
   * @returns {{ tensorData: Float32Array, dims: number[] }}
   */
  preprocessCrop(cropData, maxWidth = 320) {
    const srcW = cropData.width;
    const srcH = cropData.height;

    // Scale height to 48 while preserving aspect ratio
    const ratio = this.targetHeight / srcH;
    let targetW = Math.round(srcW * ratio);
    targetW = Math.max(32, Math.min(maxWidth, targetW));

    const scaleX = targetW / srcW;
    const scaleY = this.targetHeight / srcH;

    const tensorData = new Float32Array(3 * this.targetHeight * targetW);
    const channelSize = this.targetHeight * targetW;
    const srcPixels = cropData.data;

    // Normalization: (pixel / 255.0 - 0.5) / 0.5
    for (let y = 0; y < this.targetHeight; y++) {
      const srcY = Math.min(srcH - 1, Math.floor(y / scaleY));
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.min(srcW - 1, Math.floor(x / scaleX));
        const srcIdx = (srcY * srcW + srcX) * 4;
        const targetIdx = y * targetW + x;

        const r = (srcPixels[srcIdx] / 255.0 - 0.5) / 0.5;
        const g = (srcPixels[srcIdx + 1] / 255.0 - 0.5) / 0.5;
        const b = (srcPixels[srcIdx + 2] / 255.0 - 0.5) / 0.5;

        tensorData[targetIdx] = r;
        tensorData[channelSize + targetIdx] = g;
        tensorData[2 * channelSize + targetIdx] = b;
      }
    }

    return {
      tensorData,
      dims: [1, 3, this.targetHeight, targetW],
    };
  }

  /**
   * Decodes model output logits using CTC Greedy decoding
   */
  decodeLogits(logits, seqLen, numClasses) {
    return this.decoder.decode(logits, seqLen, numClasses);
  }
}
