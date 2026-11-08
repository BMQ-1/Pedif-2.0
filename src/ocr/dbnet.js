/**
 * DBNet++ Detection Preprocessing and Polygon Extraction
 * Generates 4-point oriented quads [LT, RT, RB, LB] from image tensors.
 */

import { Point, Quad } from '../selection/quad-model.js';

export class DBNet {
  /**
   * Prepares image data for DBNet ONNX inference
   * @param {ImageData} imageData
   * @param {number} maxSide
   * @returns {{ tensorData: Float32Array, dims: number[], scaleX: number, scaleY: number }}
   */
  static preprocess(imageData, maxSide = 960) {
    const srcW = imageData.width;
    const srcH = imageData.height;

    // Resize such that max side is <= maxSide and both dimensions are multiples of 32
    let ratio = 1.0;
    if (Math.max(srcW, srcH) > maxSide) {
      ratio = maxSide / Math.max(srcW, srcH);
    }

    let targetW = Math.round((srcW * ratio) / 32) * 32;
    let targetH = Math.round((srcH * ratio) / 32) * 32;
    targetW = Math.max(32, targetW);
    targetH = Math.max(32, targetH);

    const scaleX = targetW / srcW;
    const scaleY = targetH / srcH;

    // Allocate NCHW Float32Array [1, 3, targetH, targetW]
    const tensorData = new Float32Array(3 * targetH * targetW);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    const srcPixels = imageData.data;
    const channelSize = targetH * targetW;

    // Bilinear or nearest-neighbor sampling for tensor creation
    for (let y = 0; y < targetH; y++) {
      const srcY = Math.min(srcH - 1, Math.floor(y / scaleY));
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.min(srcW - 1, Math.floor(x / scaleX));
        const srcIdx = (srcY * srcW + srcX) * 4;
        const targetIdx = y * targetW + x;

        // R, G, B channels
        const r = srcPixels[srcIdx] / 255.0;
        const g = srcPixels[srcIdx + 1] / 255.0;
        const b = srcPixels[srcIdx + 2] / 255.0;

        tensorData[targetIdx] = (r - mean[0]) / std[0];
        tensorData[channelSize + targetIdx] = (g - mean[1]) / std[1];
        tensorData[2 * channelSize + targetIdx] = (b - mean[2]) / std[2];
      }
    }

    return {
      tensorData,
      dims: [1, 3, targetH, targetW],
      scaleX,
      scaleY,
      origWidth: srcW,
      origHeight: srcH,
    };
  }

  /**
   * Post-processes probability map into 4-point quadrilateral bounding boxes
   * @param {Float32Array} predMap - shape [targetH, targetW]
   * @param {number} targetH
   * @param {number} targetW
   * @param {number} scaleX
   * @param {number} scaleY
   * @param {number} thresh
   * @returns {Array<Quad>}
   */
  static postprocess(predMap, targetH, targetW, scaleX, scaleY, thresh = 0.3) {
    const binary = new Uint8Array(targetH * targetW);
    for (let i = 0; i < predMap.length; i++) {
      binary[i] = predMap[i] > thresh ? 1 : 0;
    }

    // Connected component bounding boxes (raster scan grouping)
    const boxes = this.extractBoundingBoxes(binary, targetH, targetW);
    const quads = [];

    for (const box of boxes) {
      // Unclip expansion (1.5 factor) to cover ascenders and descenders
      const unclipDist = (box.w * box.h * 1.5) / Math.max(1, 2 * (box.w + box.h));
      const minX = Math.max(0, (box.x - unclipDist) / scaleX);
      const minY = Math.max(0, (box.y - unclipDist) / scaleY);
      const maxX = (box.x + box.w + unclipDist) / scaleX;
      const maxY = (box.y + box.h + unclipDist) / scaleY;

      if ((maxX - minX) > 8 && (maxY - minY) > 6) {
        quads.push(new Quad(
          new Point(minX, minY),
          new Point(maxX, minY),
          new Point(maxX, maxY),
          new Point(minX, maxY)
        ));
      }
    }

    return quads;
  }

  /**
   * Basic connected-component bounding box extraction on binary segmentation map
   */
  static extractBoundingBoxes(binary, H, W) {
    const visited = new Uint8Array(H * W);
    const boxes = [];

    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const idx = y * W + x;
        if (binary[idx] === 1 && !visited[idx]) {
          // BFS component exploration
          let minX = x, maxX = x, minY = y, maxY = y;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop();
            const cy = Math.floor(curr / W);
            const cx = curr % W;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            // 4-neighborhood
            const neighbors = [
              cy > 0 ? (cy - 1) * W + cx : -1,
              cy < H - 1 ? (cy + 1) * W + cx : -1,
              cx > 0 ? cy * W + (cx - 1) : -1,
              cx < W - 1 ? cy * W + (cx + 1) : -1,
            ];

            for (const n of neighbors) {
              if (n >= 0 && binary[n] === 1 && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          const w = maxX - minX + 1;
          const h = maxY - minY + 1;
          if (w >= 6 && h >= 6) {
            boxes.push({ x: minX, y: minY, w, h });
          }
        }
      }
    }

    return boxes;
  }
}
