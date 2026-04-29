#!/usr/bin/env node
/**
 * Compute perceptual hashes for reference scam screenshots and upsert into image_hash_blacklist.
 *
 * Usage (from repo root):
 *   node scripts/seed-scam-image-phash.js
 *   node scripts/seed-scam-image-phash.js --dir tools/mrbeast
 *
 * Requires: migration 20260701120000_scam_image_blacklist applied; MySQL from .env.
 */
const fs = require('fs');
const path = require('path');
const imghash = require('imghash');
const db = require('../database/db');
const { PHASH_BITS, bustScamBlacklistCache } = require('../libs/scamImageScan');

const APP_ROOT = path.join(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  let dir = path.join(APP_ROOT, 'tools', 'mrbeast');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      const raw = args[i + 1];
      dir = path.isAbsolute(raw) ? raw : path.join(APP_ROOT, raw);
      i++;
    }
  }
  return { dir };
}

async function main() {
  const { dir } = parseArgs();
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => path.join(dir, f));
  if (!files.length) {
    console.error(`No PNG/JPEG/WebP files in ${dir}`);
    process.exit(1);
  }

  for (const file of files) {
    const buf = fs.readFileSync(file);
    const phash = await imghash.hash(buf, PHASH_BITS);
    const description = path.basename(file);
    await db.insertImageHashBlacklist({
      phash,
      description,
      added_by: null,
    });
    console.log(`${description} -> ${phash}`);
  }

  bustScamBlacklistCache();
  await db.end?.();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
