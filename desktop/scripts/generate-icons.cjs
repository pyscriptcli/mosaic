const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const outputDir = path.join(__dirname, "..", "build");
fs.mkdirSync(outputDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
}

function createPng(size) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  const blue = [0x00, 0x33, 0x66, 0xff];
  const gold = [0xc9, 0xa8, 0x4c, 0xff];
  const warmWhite = [0xff, 0xfc, 0xfb, 0xff];

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const sx = (x + 0.5) * 160 / size;
      const sy = (y + 0.5) * 160 / size;
      const isGoldTile = sx >= 60 && sx < 100 && sy >= 32 && sy < 72;
      const isWhiteTile = sy >= 80 && sy < 120 && ((sx >= 24 && sx < 64) || (sx >= 96 && sx < 136));
      const color = isGoldTile ? gold : isWhiteTile ? warmWhite : blue;
      for (let channel = 0; channel < 4; channel += 1) scanlines[row + 1 + x * 4 + channel] = color[channel];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map((size) => ({ size, bytes: createPng(size) }));
fs.writeFileSync(path.join(outputDir, "mosaic.png"), images[1].bytes);

const directoryBytes = 6 + images.length * 16;
let imageOffset = directoryBytes;
const header = Buffer.alloc(directoryBytes);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
for (let i = 0; i < images.length; i += 1) {
  const { size, bytes } = images[i];
  const entry = 6 + i * 16;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = size === 256 ? 0 : size;
  header[entry + 2] = 0;
  header[entry + 3] = 0;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8);
  header.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += bytes.length;
}
fs.writeFileSync(path.join(outputDir, "mosaic.ico"), Buffer.concat([header, ...images.map((image) => image.bytes)]));
console.log("Generated Mosaic 16, 32, 48, and 256 pixel icons.");
