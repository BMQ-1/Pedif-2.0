/**
 * CTC Greedy Decoder & Dictionary Mapper for PP-OCRv4
 */

export class CTCDecoder {
  constructor(dictionaryText = '') {
    this.charList = ['blank']; // Index 0 is CTC blank token
    if (dictionaryText) {
      this.loadDictionary(dictionaryText);
    } else {
      this.loadDefaultAscii();
    }
  }

  loadDictionary(text) {
    const lines = text.split(/\r?\n/);
    for (const char of lines) {
      if (char) this.charList.push(char);
    }
    this.charList.push(' '); // Space token
  }

  loadDefaultAscii() {
    // Fallback standard PP-OCR Latin/English character set
    const ascii = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ ";
    for (const ch of ascii) {
      this.charList.push(ch);
    }
  }

  /**
   * Greedy CTC Decoding: Argmax along sequence length, collapses repeated tokens and removes blanks
   * @param {Float32Array|Array} logits - Shape [batch, seqLen, numClasses] or [seqLen, numClasses]
   * @param {number} seqLen
   * @param {number} numClasses
   * @returns {{ text: string, confidence: number }}
   */
  decode(logits, seqLen, numClasses) {
    let text = '';
    let totalScore = 0;
    let count = 0;
    let prevIndex = -1;

    for (let t = 0; t < seqLen; t++) {
      let maxProb = -Infinity;
      let maxIdx = 0;
      const offset = t * numClasses;

      for (let c = 0; c < numClasses; c++) {
        const val = logits[offset + c];
        if (val > maxProb) {
          maxProb = val;
          maxIdx = c;
        }
      }

      // 0 is CTC blank token
      if (maxIdx > 0 && maxIdx !== prevIndex) {
        if (maxIdx < this.charList.length) {
          text += this.charList[maxIdx];
          totalScore += Math.exp(maxProb) / (1 + Math.exp(maxProb)); // Sigmoid approx
          count++;
        }
      }

      prevIndex = maxIdx;
    }

    const confidence = count > 0 ? (totalScore / count) : 0;
    return { text: text.trim(), confidence };
  }
}
