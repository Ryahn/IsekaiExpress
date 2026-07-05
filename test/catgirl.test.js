const test = require('node:test');
const assert = require('node:assert/strict');

const catgirl = require('../src/bot/commands/slashCommands/fun/catgirl.js');

test('catgirl slash builder exposes optional image flag', () => {
    const json = catgirl.data.toJSON();
    assert.equal(json.name, 'catgirl');
    assert.equal(json.options?.length, 1);
    assert.equal(json.options[0].name, 'image');
    assert.equal(json.options[0].type, 5);
});

test('catgirl execute uses img API nsfw neko types', () => {
    const src = catgirl.execute.toString();
    assert.match(src, /neko\/gif/);
    assert.match(src, /neko\/img/);
    assert.match(src, /fetchImageForInteraction/);
    assert.doesNotMatch(src, /gelbooru/i, 'catgirl should not use Gelbooru');
    assert.doesNotMatch(src, /fluxpoint/i, 'catgirl should not use Fluxpoint');
});
