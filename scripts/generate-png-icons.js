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

  const cornerRadius = size * 0.225;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Base: transparent
      let r = 0, g = 0, b = 0, a = 0;

      // Check squircle boundary
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
        // Deep Ultramarine Obsidian gradient
        const t = (x + y) / (width + height);
        r = Math.round(11 * (1 - t) + 2 * t);
        g = Math.round(17 * (1 - t) + 5 * t);
        b = Math.round(32 * (1 - t) + 11 * t);
        a = 255;

        // Subtle squircle border highlight
        if (dx <= 1.5 || dy <= 1.5) {
          r = Math.round(r * 0.7 + 56 * 0.3);
          g = Math.round(g * 0.7 + 189 * 0.3);
          b = Math.round(b * 0.7 + 248 * 0.3);
        }

        const nx = x / size;
        const ny = y / size;

        // Ghosted sub-layer sheet (translucent cyan-blue)
        // Rotated slightly behind: nx in [0.35, 0.72], ny in [0.26, 0.76]
        if (nx >= 0.35 && nx <= 0.72 && ny >= 0.26 && ny <= 0.76) {
          r = Math.round(r * 0.75 + 56 * 0.25);
          g = Math.round(g * 0.75 + 189 * 0.25);
          b = Math.round(b * 0.75 + 248 * 0.25);
        }

        // Primary Architectural Folio Sheet
        // nx in [0.28, 0.70], ny in [0.22, 0.80]
        if (nx >= 0.28 && nx <= 0.70 && ny >= 0.22 && ny <= 0.80) {
          // Check folded top-right corner: nx > 0.57 and ny < 0.35
          const isFoldZone = (nx > 0.57 && ny < 0.35);
          const isFoldCut = isFoldZone && ((nx - 0.57) + (0.35 - ny) > 0.13);

          if (!isFoldCut) {
            if (isFoldZone) {
              // Royal Cobalt fold
              const ft = (nx - 0.57 + ny - 0.22) / 0.26;
              r = Math.round(56 * (1 - ft) + 37 * ft);
              g = Math.round(189 * (1 - ft) + 99 * ft);
              b = Math.round(248 * (1 - ft) + 235 * ft);
            } else {
              // Pure Architectural Ivory Sheet
              const st = (ny - 0.22) / 0.58;
              r = Math.round(255 * (1 - st) + 236 * st);
              g = Math.round(255 * (1 - st) + 240 * st);
              b = Math.round(255 * (1 - st) + 246 * st);

              // Modernist Document Grid Lines
              // Line 1: Navy
              if (ny >= 0.44 && ny <= 0.465 && nx >= 0.33 && nx <= 0.58) {
                r = 30; g = 41; b = 59;
              }
              // Line 2: Slate
              else if (ny >= 0.505 && ny <= 0.525 && nx >= 0.33 && nx <= 0.63) {
                r = 100; g = 116; b = 139;
              }
              // Line 3: Slate
              else if (ny >= 0.565 && ny <= 0.585 && nx >= 0.33 && nx <= 0.59) {
                r = 100; g = 116; b = 139;
              }
              // Line 4: Electric Cyan
              else if (ny >= 0.625 && ny <= 0.645 && nx >= 0.33 && nx <= 0.49) {
                r = 56; g = 189; b = 248;
              }
              // Precision Stylus Dot (circle at nx=0.55, ny=0.635)
              const dotDist = Math.hypot((nx - 0.55) * size, (ny - 0.635) * size);
              if (dotDist <= size * 0.02) {
                r = 56; g = 189; b = 248;
              }
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