// A tiny raster bar chart as PNG, for the Excel report (exceljs cannot create
// native charts and the server has no canvas). Pure Node: an RGB buffer, a 5x7
// bitmap font (upper case, digits and a few signs) and zlib for the PNG stream.
import { deflateSync } from 'node:zlib';

const GLYPHS = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '%': '##...|##..#|...#.|..#..|.#...|#..##|...##', '-': '.....|.....|.....|#####|.....|.....|.....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '.': '.....|.....|.....|.....|.....|.##..|.##..', '/': '.....|....#|...#.|..#..|.#...|#....|.....',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....', ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([char, rows]) => [char, rows.split('|')]));

// Characters outside the font (en dash, lower case) map onto it.
const normalizeText = (text) => String(text ?? '').replace(/[–—]/g, '-').toUpperCase().replace(/[^A-Z0-9%\-().:/ ]/g, '');

export function textWidth(text, scale = 2) {
  const length = normalizeText(text).length;
  return length ? length * 6 * scale - scale : 0;
}

function canvas(width, height, background = [255, 255, 255]) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) pixels.set(background, index * 3);
  const fillRect = (x, y, w, h, color) => {
    const x0 = Math.max(0, Math.round(x)); const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(width, Math.round(x + w)); const y1 = Math.min(height, Math.round(y + h));
    for (let row = y0; row < y1; row += 1) for (let col = x0; col < x1; col += 1) pixels.set(color, (row * width + col) * 3);
  };
  const drawText = (text, x, y, color, scale = 2) => {
    let cursor = Math.round(x);
    for (const char of normalizeText(text)) {
      const glyph = FONT[char] || FONT[' '];
      glyph.forEach((line, row) => {
        for (let col = 0; col < 5; col += 1) if (line[col] === '#') fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
      });
      cursor += 6 * scale;
    }
  };
  return { pixels, width, height, fillRect, drawText };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes an RGB pixel buffer as PNG. */
export function encodePng({ pixels, width, height }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0; // 8-bit RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (width * 3 + 1)] = 0;
    pixels.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(String(hex).slice(offset, offset + 2), 16));
const INK = hexToRgb('#334155');
const MUTED = hexToRgb('#64748b');
const GRID = hexToRgb('#e2e8f0');

/**
 * Vertical bar chart: bars [{ label, count, percent, color: '#rrggbb' }].
 * Each bar is labelled "count (percent%)" above and with its category below.
 */
export function renderBarChartPng({ title = '', bars = [], width = 720, height = 340 } = {}) {
  const image = canvas(width, height);
  const top = title ? 52 : 24;
  const bottom = height - 44;
  const left = 24;
  const right = width - 24;
  if (title) image.drawText(title, left, 16, INK, 2);
  const max = Math.max(1, ...bars.map((bar) => Number(bar.count) || 0));
  const plotTop = top + 26; // room for the value labels
  for (let line = 0; line <= 4; line += 1) {
    const y = Math.round(bottom - ((bottom - plotTop) * line) / 4);
    image.fillRect(left, y, right - left, line === 0 ? 2 : 1, line === 0 ? MUTED : GRID);
  }
  const slot = (right - left) / Math.max(1, bars.length);
  bars.forEach((bar, index) => {
    const count = Number(bar.count) || 0;
    const barWidth = Math.min(110, slot * 0.56);
    const x = left + slot * index + (slot - barWidth) / 2;
    const barHeight = Math.round(((bottom - plotTop) * count) / max);
    if (barHeight > 0) image.fillRect(x, bottom - barHeight, barWidth, barHeight, hexToRgb(bar.color || '#0284c7'));
    const value = `${count} (${Number(bar.percent || 0).toFixed(1)}%)`;
    const valueScale = textWidth(value, 2) <= slot - 6 ? 2 : 1;
    image.drawText(value, left + slot * index + (slot - textWidth(value, valueScale)) / 2, bottom - barHeight - 8 - 7 * valueScale, INK, valueScale);
    const labelScale = textWidth(bar.label, 2) <= slot - 6 ? 2 : 1;
    image.drawText(bar.label, left + slot * index + (slot - textWidth(bar.label, labelScale)) / 2, bottom + 12, MUTED, labelScale);
  });
  return encodePng(image);
}
