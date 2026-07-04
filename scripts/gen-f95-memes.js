const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const memeDir = path.join(repoRoot, 'F95 Memes');
const outFile = path.join(repoRoot, 'src', 'bot', 'utils', 'f95Memes.js');

const files = fs
  .readdirSync(memeDir)
  .filter((name) => fs.statSync(path.join(memeDir, name)).isFile())
  .sort((a, b) => a.localeCompare(b));

const source = `/** F95 meme filenames served from https://overlord.lordainz.xyz/f/f95/ */
const MEME_BASE_URL = 'https://overlord.lordainz.xyz/f/f95/';

const MEME_FILES = ${JSON.stringify(files, null, 2)};

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

function memeUrl(filename) {
  return \`\${MEME_BASE_URL}\${encodeURIComponent(filename)}\`;
}

function pickRandomMeme() {
  const index = Math.floor(Math.random() * MEME_FILES.length);
  return MEME_FILES[index];
}

function isVideoMeme(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return false;
  return VIDEO_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

module.exports = {
  MEME_BASE_URL,
  MEME_FILES,
  memeUrl,
  pickRandomMeme,
  isVideoMeme,
};
`;

fs.writeFileSync(outFile, source);
console.log(`Wrote ${files.length} meme filenames to ${path.relative(repoRoot, outFile)}`);
