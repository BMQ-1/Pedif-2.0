import fs from 'node:fs';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePedifIcon(size) {
  const width = size;
  const height = size;

  // Uncompressed scanline buffer: (1 filter byte + width * 4 RGBA bytes) * height
  const rowStride = 1 + width * 4;
  const rawData = Buffer.alloc(rowStride * height);

  const cornerRadius = size * 0.22;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Base: transparent
      let r = 0, g = 0, b = 0, a = 0;

      // Check rounded rect boundary
      let inside = true;
      const dx = Math.min(x, width - 1 - x);
      const dy = Math.min(y, height - 1 - y);

      if (dx < cornerRadius && dy < cornerRadius) {
        const dist = Math.hypot(cornerRadius - dx, cornerRadius - dy);
        if (dist > cornerRadius) {
          inside = false;
        }
      }

      if (inside) {
        // Deep evergreen field gradient
        const t = (x + y) / (width + height);
        r = Math.round(27 * (1 - t) + 16 * t);
        g = Math.round(69 * (1 - t) + 46 * t);
        b = Math.round(65 * (1 - t) + 45 * t);
        a = 255;

        // Paper sheet rect (normalized coordinates)
        const nx = x / size;
        const ny = y / size;

        // Paper body: nx in [0.34, 0.72], ny in [0.18, 0.82]
        if (nx >= 0.34 && nx <= 0.72 && ny >= 0.18 && ny <= 0.82) {
          // Check fold at top right: nx > 0.58 and ny < 0.32
          const foldCut = (nx - 0.58) + (0.32 - ny) < 0.14;
          if (nx > 0.58 && ny < 0.32 && !foldCut) {
            // Fold corner color: warm copper fold
            r = 200; g = 124; b = 86;
          } else {
            // Ivory paper color
            r = 250; g = 247; b = 240;

            // Content lines on paper
            if (ny >= 0.42 && ny <= 0.45 && nx >= 0.39 && nx <= 0.62) {
              // Primary header bar (deep spruce)
              r = 36; g = 72; b = 69;
            } else if (ny >= 0.49 && ny <= 0.51 && nx >= 0.39 && nx <= 0.57) {
              // Line 2
              r = 169; g = 162; b = 147;
            } else if (ny >= 0.55 && ny <= 0.57 && nx >= 0.39 && nx <= 0.60) {
              // Line 3
              r = 169; g = 162; b = 147;
            } else if (ny >= 0.66 && ny <= 0.68 && nx >= 0.39 && nx <= 0.50) {
              // Accent signature line (copper)
              r = 200; g = 124; b = 86;
            }
          }
        }
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk: compressed scanlines
  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate 192x192 and 512x512 PNG assets
const icon192 = generatePedifIcon(192);
const icon512 = generatePedifIcon(512);

fs.writeFileSync('public/icon-192.png', icon192);
fs.writeFileSync('public/icon-512.png', icon512);

console.log(`Generated public/icon-192.png (${icon192.length} bytes)`);
console.log(`Generated public/icon-512.png (${icon512.length} bytes)`);
