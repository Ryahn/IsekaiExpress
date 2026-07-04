const test = require('node:test');
const assert = require('node:assert/strict');

const { MEME_FILES, memeUrl, isVideoMeme } = require('../src/bot/utils/f95Memes');

test('MEME_FILES is a non-empty array of filenames', () => {
  assert.ok(Array.isArray(MEME_FILES));
  assert.ok(MEME_FILES.length > 0);
  assert.ok(MEME_FILES.every((name) => typeof name === 'string' && name.length > 0));
});

test('memeUrl builds encoded URLs under the f95 path', () => {
  assert.equal(
    memeUrl('Because I can.gif'),
    'https://overlord.lordainz.xyz/f/f95/Because%20I%20can.gif',
  );
  assert.equal(
    memeUrl("Postin'Cringe.jpg"),
    "https://overlord.lordainz.xyz/f/f95/Postin'Cringe.jpg",
  );
});

test('isVideoMeme detects video extensions only', () => {
  assert.equal(isVideoMeme('1PunchMan.mp4'), true);
  assert.equal(isVideoMeme('THEHug.webm'), true);
  assert.equal(isVideoMeme('PepeHug.webp'), false);
  assert.equal(isVideoMeme('noextension'), false);
});
