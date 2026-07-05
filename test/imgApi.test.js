const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeImageUrl } = require('../src/bot/utils/imgApi');

const PUBLIC = 'https://imgapi.zonies.xyz';

test('normalizeImageUrl rewrites localhost paths to the public host', () => {
  assert.equal(
    normalizeImageUrl('http://localhost:3000/i/nsfw/neko/gif/neko_011.gif', PUBLIC),
    'https://imgapi.zonies.xyz/i/nsfw/neko/gif/neko_011.gif',
  );
});

test('normalizeImageUrl rewrites 127.0.0.1 paths to the public host', () => {
  assert.equal(
    normalizeImageUrl('http://127.0.0.1:3000/i/sfw/hug/hug_001.gif', PUBLIC),
    'https://imgapi.zonies.xyz/i/sfw/hug/hug_001.gif',
  );
});

test('normalizeImageUrl resolves root-relative paths', () => {
  assert.equal(
    normalizeImageUrl('/i/sfw/bite/bite_001.gif', PUBLIC),
    'https://imgapi.zonies.xyz/i/sfw/bite/bite_001.gif',
  );
});

test('normalizeImageUrl leaves already-public URLs unchanged', () => {
  const url = 'https://imgapi.zonies.xyz/i/nsfw/neko/gif/neko_011.gif';
  assert.equal(normalizeImageUrl(url, PUBLIC), url);
});
