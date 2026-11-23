/**
 * Sheeta Operations Research
 * Standalone Zero-Dependency Icon Generator
 * Generates spec-compliant PNG and binary Windows ICO icons
 * for Web/PWA (including Safari Add to Home Screen), Android, and Windows/Linux desktop builds.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
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

export function generatePngIcon(size, isMaskable = false) {
  const width = size;
  const height = size;

  // 1 scanline = 1 filter byte (0) + width * 4 bytes RGBA
  const rawScanlines = Buffer.alloc((1 + width * 4) * height);

  const bgR = 0x43, bgG = 0x38, bgB = 0xca;
  const endR = 0x63, endG = 0x66, endB = 0xf1;
  const white = 0xff;

  const radius = isMaskable ? 0 : Math.floor(size * 0.22);
  const padding = isMaskable ? Math.floor(size * 0.15) : Math.floor(size * 0.08);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawScanlines[rowOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Rounded rect mask for standard icon
      let inBounds = true;
      if (!isMaskable && radius > 0) {
        const dx = Math.max(0, Math.max(radius - x, x - (width - 1 - radius)));
        const dy = Math.max(0, Math.max(radius - y, y - (height - 1 - radius)));
        if (dx * dx + dy * dy > radius * radius) {
          inBounds = false;
        }
      }

      if (!inBounds) {
        rawScanlines[pixelOffset] = 0;
        rawScanlines[pixelOffset + 1] = 0;
        rawScanlines[pixelOffset + 2] = 0;
        rawScanlines[pixelOffset + 3] = 0;
        continue;
      }

      // Linear gradient background
      const t = (x + y) / (width + height);
      const r = Math.round(bgR + t * (endR - bgR));
      const g = Math.round(bgG + t * (endG - bgG));
      const b = Math.round(bgB + t * (endB - bgB));

      // Draw stylized Sigma glyph in center
      const nx = (x - padding) / (width - 2 * padding);
      const ny = (y - padding) / (height - 2 * padding);

      let isGlyph = false;
      if (nx >= 0.15 && nx <= 0.85 && ny >= 0.15 && ny <= 0.85) {
        // Top bar
        if (ny <= 0.28 && nx >= 0.18 && nx <= 0.82) isGlyph = true;
        // Bottom bar
        if (ny >= 0.72 && nx >= 0.18 && nx <= 0.82) isGlyph = true;
        // Upper diagonal towards center
        const distUpper = Math.abs((0.5 - 0.28) * nx + (0.82 - 0.42) * ny + (0.42 * 0.28 - 0.82 * 0.5));
        if (nx >= 0.38 && nx <= 0.82 && ny >= 0.25 && ny <= 0.52 && distUpper < 0.055) isGlyph = true;
        // Lower diagonal from center to bottom
        const distLower = Math.abs((0.72 - 0.5) * nx - (0.82 - 0.42) * ny + (0.42 * 0.72 - 0.82 * 0.5));
        if (nx >= 0.38 && nx <= 0.82 && ny >= 0.48 && ny <= 0.75 && distLower < 0.055) isGlyph = true;
      }

      if (isGlyph) {
        rawScanlines[pixelOffset] = white;
        rawScanlines[pixelOffset + 1] = white;
        rawScanlines[pixelOffset + 2] = white;
        rawScanlines[pixelOffset + 3] = 0xff;
      } else {
        rawScanlines[pixelOffset] = r;
        rawScanlines[pixelOffset + 1] = g;
        rawScanlines[pixelOffset + 2] = b;
        rawScanlines[pixelOffset + 3] = 0xff;
      }
    }
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color
  ihdr[10] = 0; // compression deflate
  ihdr[11] = 0; // filter default
  ihdr[12] = 0; // interlace none

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Generates a valid binary Windows ICO container embedding PNG payloads.
 */
export function generateIcoIcon(sizes = [16, 32, 48, 64, 256]) {
  const images = sizes.map((size) => ({
    size,
    data: generatePngIcon(size, false),
  }));

  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * images.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const payloads = [];

  for (const img of images) {
    const entry = Buffer.alloc(entrySize);
    const dim = img.size >= 256 ? 0 : img.size;
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2); // Color count (0 for RGBA)
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);

    entries.push(entry);
    payloads.push(img.data);
    offset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...payloads]);
}

// Write PWA icons to public/
const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const icoBuffer = generateIcoIcon([16, 32, 48, 64, 256]);

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePngIcon(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePngIcon(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePngIcon(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePngIcon(180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

// Write Tauri 2 desktop icons to src-tauri/icons/ (Windows & Linux)
const tauriIconsDir = path.resolve(process.cwd(), 'src-tauri', 'icons');
if (!fs.existsSync(tauriIconsDir)) {
  fs.mkdirSync(tauriIconsDir, { recursive: true });
}

fs.writeFileSync(path.join(tauriIconsDir, '32x32.png'), generatePngIcon(32, false));
fs.writeFileSync(path.join(tauriIconsDir, '128x128.png'), generatePngIcon(128, false));
fs.writeFileSync(path.join(tauriIconsDir, '128x128@2x.png'), generatePngIcon(256, false));
fs.writeFileSync(path.join(tauriIconsDir, 'icon.png'), generatePngIcon(512, false));
fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), icoBuffer);

console.log('Successfully generated PWA, ICO, and Windows/Linux Tauri 2 desktop icons.');
