/**
 * Генератор иконок приложения: рисует полумесяц и пишет готовый PNG.
 * Нужен, чтобы в репозитории не лежали бинарники, которые нельзя
 * ни прочитать, ни поправить. Запуск: npm run icons
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG_TOP = [27, 33, 53];
const BG_BOTTOM = [14, 17, 24];
const MOON = [140, 154, 255];

/** Мягкая граница: плавный переход на ширину feather пикселей */
function coverage(signedInside, feather = 1.5) {
  return Math.max(0, Math.min(1, signedInside / feather + 0.5));
}

function roundedRectInside(x, y, w, h, radius) {
  const qx = Math.abs(x - w / 2) - (w / 2 - radius);
  const qy = Math.abs(y - h / 2) - (h / 2 - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return -(Math.min(Math.max(qx, qy), 0) + outside - radius);
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 бит на канал
  ihdr[9] = 6;  // RGBA
  // 10..12 — compression / filter / interlace, все нули

  // Каждой строке нужен ведущий байт фильтра (0 — без фильтра)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param size   сторона иконки
 * @param inset  доля отступа от края до луны (для maskable нужен запас)
 * @param round  радиус скругления фона, в долях стороны (0 — квадрат)
 */
function drawIcon(size, { inset = 0.2, round = 0.22 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = round * size;

  const moonRadius = size * (0.5 - inset);
  const cx = size * 0.52;
  const cy = size * 0.48;
  const cutRadius = moonRadius * 0.9;
  const cutX = cx + moonRadius * 0.44;
  const cutY = cy - moonRadius * 0.3;

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bg = [
      BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
      BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
      BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
    ];

    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const bgAlpha = round > 0
        ? coverage(roundedRectInside(px, py, size, size, radius))
        : 1;

      const moonCov = coverage(moonRadius - Math.hypot(px - cx, py - cy));
      const cutCov = coverage(cutRadius - Math.hypot(px - cutX, py - cutY));
      const moonAlpha = moonCov * (1 - cutCov);

      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[offset + c] = Math.round(bg[c] * (1 - moonAlpha) + MOON[c] * moonAlpha);
      }
      rgba[offset + 3] = Math.round(255 * bgAlpha);
    }
  }

  return encodePNG(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', drawIcon(192, { inset: 0.19, round: 0.22 })],
  ['icon-512.png', drawIcon(512, { inset: 0.19, round: 0.22 })],
  // maskable: фон во всю площадь, луна в безопасной зоне (система обрежет края)
  ['icon-maskable-512.png', drawIcon(512, { inset: 0.29, round: 0 })],
  // iOS сам скругляет apple-touch-icon, поэтому квадрат без скругления
  ['icon-180.png', drawIcon(180, { inset: 0.19, round: 0 })],
];

for (const [name, buffer] of files) {
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`${name} — ${(buffer.length / 1024).toFixed(1)} КБ`);
}
