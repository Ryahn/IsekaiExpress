const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchRandomImage, MIME_PRESETS } = require('../src/bot/utils/theCatApi');
const CatCommand = require('../src/bot/commands/chatCommands/miscellaneous/fun/cat');

test('MIME_PRESETS exposes gif and static types', () => {
  assert.equal(MIME_PRESETS.gif, 'gif');
  assert.equal(MIME_PRESETS.static, 'jpg,png');
});

test('fetchRandomImage returns a cat image from the live API', async () => {
  const image = await fetchRandomImage({ mimeTypes: 'gif' });
  assert.ok(image.url, 'image should include a url');
  assert.match(image.url, /\.gif$/i, 'gif request should return a gif url');
});

test('cat command is registered with expected name and aliases', () => {
  const cmd = new CatCommand();
  assert.equal(cmd.name, 'cat');
  assert.deepEqual(cmd.aliases, ['kitty', 'meow']);
});
