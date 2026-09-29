const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
async function artwork(name, width) {
  const trimmed = await sharp(path.join(__dirname, '..', 'assets', name), { density: 192 }).trim().png().toBuffer();
  return sharp(trimmed).resize({ width }).png().toBuffer({ resolveWithObject: true });
}
async function main() {
  const width = 640, height = 400;
  const mark = await artwork('canonical-mark.svg', 100);
  const wordmark = await artwork('wordmark.svg', 270);
  const gap = 30;
  const top = Math.round((height - mark.info.height - gap - wordmark.info.height) / 2);
  const png = await sharp({ create: { width, height, channels: 3, background: '#09121d' } })
    .composite([
      { input: mark.data, left: Math.round((width - mark.info.width) / 2), top },
      { input: wordmark.data, left: Math.round((width - wordmark.info.width) / 2), top: top + mark.info.height + gap }
    ]).png().toBuffer();
  fs.writeFileSync(path.join(__dirname, 'applied-ai-maker.png'), png);
  // AdvSplash uses an uncompressed, bottom-up 24-bit BMP. No desktop session required.
  const pixels = await sharp(png).removeAlpha().raw().toBuffer();
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bmp = Buffer.alloc(54 + stride * height);
  bmp.write('BM');
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 3;
      const to = 54 + (height - y - 1) * stride + x * 3;
      bmp[to] = pixels[from + 2];
      bmp[to + 1] = pixels[from + 1];
      bmp[to + 2] = pixels[from];
    }
  }
  fs.writeFileSync(path.join(__dirname, 'applied-ai-maker.bmp'), bmp);
  console.log('Rendered Applied AI maker artwork (640 x 400 PNG and BMP).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
