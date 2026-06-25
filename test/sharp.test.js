// Validates the sharp API surface the bot actually uses (scamImageScan pipeline + import_rank
// extract), against generated buffers — no external APIs. Guards the 0.30 -> 0.33 upgrade.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

function makePng(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } } })
    .png()
    .toBuffer();
}

test('sharp loads with a libvips version', () => {
  assert.ok(sharp.versions && sharp.versions.vips, 'sharp.versions.vips should be set');
});

test('scamImageScan-style pipeline: metadata + rotate/greyscale/resize/png/toBuffer', async () => {
  const input = await makePng(120, 80);
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  assert.equal(meta.width, 120);
  assert.equal(meta.height, 80);

  const out = await sharp(input, { failOn: 'none' })
    .rotate()
    .greyscale()
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  assert.ok(Buffer.isBuffer(out) && out.length > 0, 'processed PNG buffer should be non-empty');
});

test('import_rank-style: extract + toFile', async () => {
  const input = await makePng(200, 200);
  const tmp = path.join(os.tmpdir(), `f95bot_sharp_test_${process.pid}.png`);
  try {
    await sharp(input).extract({ left: 10, top: 10, width: 50, height: 50 }).toFile(tmp);
    assert.ok(fs.existsSync(tmp) && fs.statSync(tmp).size > 0, 'cropped file should exist and be non-empty');
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

test('corrupt input rejects (callers wrap in try/catch)', async () => {
  await assert.rejects(() => sharp(Buffer.from('definitely not an image'), { failOn: 'none' }).metadata());
});
