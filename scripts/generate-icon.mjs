// generate-icon.mjs — regenerates media/icon.png, the Marketplace icon.
//
// VS Code requires a raster icon (SVG is rejected), so this draws one from
// scratch: no image dependencies, just zlib and a hand-rolled PNG writer.
// Edit the constants below and re-run `npm run icon` to restyle it.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 128;         // Marketplace icons are 128x128
const SUPERSAMPLE = 4;    // samples per axis — 16 per pixel, enough for clean curves
const CORNER = 27;        // background corner radius
const GLYPH_ROUND = 7;    // play-triangle corner radius

const TOP = [0x5B, 0x4B, 0xF2];     // indigo
const BOTTOM = [0x8B, 0x3F, 0xE8];  // violet
const GLYPH = [0xFF, 0xFF, 0xFF];

// Play triangle, apex right. Nudged right of true centre so it reads as
// optically centred — a left-heavy shape looks off-centre at true centre.
const TRIANGLE = [[50, 33], [50, 95], [97, 64]];

// ===== Signed distance fields =====

function roundedRectSd(px, py, size, radius) {
  const half = size / 2;
  const qx = Math.abs(px - half) - (half - radius);
  const qy = Math.abs(py - half) - (half - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function triangleSd(px, py, tri) {
  let nearest = Infinity;
  let sign = 0;
  let inside = true;

  for (let i = 0; i < 3; i++) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const wx = px - a[0];
    const wy = py - a[1];

    // distance to this edge segment
    const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    nearest = Math.min(nearest, dx * dx + dy * dy);

    // consistent winding means the point is inside
    const cross = ex * wy - ey * wx;
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) { sign = s; }
      else if (s !== sign) { inside = false; }
    }
  }

  return Math.sqrt(nearest) * (inside ? -1 : 1);
}

// Shrink a triangle so that offsetting it back out by `r` yields rounded
// corners while preserving the original incircle.
function shrinkToward(tri, r) {
  const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
  const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;

  const area = Math.abs(
    (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) -
    (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1])
  ) / 2;
  const perimeter =
    Math.hypot(tri[1][0] - tri[0][0], tri[1][1] - tri[0][1]) +
    Math.hypot(tri[2][0] - tri[1][0], tri[2][1] - tri[1][1]) +
    Math.hypot(tri[0][0] - tri[2][0], tri[0][1] - tri[2][1]);

  const inradius = area / (perimeter / 2);
  const k = (inradius - r) / inradius;

  return tri.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

// ===== Rasterise =====

const innerTriangle = shrinkToward(TRIANGLE, GLYPH_ROUND);
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const step = 1 / SUPERSAMPLE;
const samples = SUPERSAMPLE * SUPERSAMPLE;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // Accumulate premultiplied colour so edge pixels don't fringe dark
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      for (let sx = 0; sx < SUPERSAMPLE; sx++) {
        const px = x + (sx + 0.5) * step;
        const py = y + (sy + 0.5) * step;

        if (roundedRectSd(px, py, SIZE, CORNER) > 0) { continue; }

        let color;
        if (triangleSd(px, py, innerTriangle) <= GLYPH_ROUND) {
          color = GLYPH;
        } else {
          const t = (px / SIZE) * 0.35 + (py / SIZE) * 0.65; // mostly vertical gradient
          color = [
            TOP[0] + (BOTTOM[0] - TOP[0]) * t,
            TOP[1] + (BOTTOM[1] - TOP[1]) * t,
            TOP[2] + (BOTTOM[2] - TOP[2]) * t,
          ];
        }

        rSum += color[0];
        gSum += color[1];
        bSum += color[2];
        aSum += 1;
      }
    }

    const offset = (y * SIZE + x) * 4;
    if (aSum > 0) {
      pixels[offset] = Math.round(rSum / aSum);
      pixels[offset + 1] = Math.round(gSum / aSum);
      pixels[offset + 2] = Math.round(bSum / aSum);
      pixels[offset + 3] = Math.round((aSum / samples) * 255);
    }
  }
}

// ===== PNG encoding =====

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // colour type: RGBA
// bytes 10-12: deflate compression, adaptive filtering, no interlace — all 0

// Each scanline is prefixed with its filter type (0 = none)
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'media', 'icon.png');
writeFileSync(out, png);
console.log('Wrote ' + out + ' (' + SIZE + 'x' + SIZE + ', ' + png.length + ' bytes)');
