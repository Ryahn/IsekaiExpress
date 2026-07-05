const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeImageUrl, filterAutocompleteTypes } = require('../src/bot/utils/imgApi');

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

const FURRY_TYPES = [
  '69', 'anal', 'bang', 'bday', 'belly_rub', 'bisexual', 'blep', 'bonk', 'boob', 'boobwank',
  'boop', 'booty', 'chastity', 'christmas', 'cry', 'cuddle', 'cumflation', 'cuntboy', 'cuntboy_bang',
  'dick', 'dick_wank', 'dickmilk', 'dickorgy', 'dp', 'fbound', 'fcreampie', 'femboypresentation',
  'finger', 'fpresentation', 'frot', 'fseduce', 'fsolo', 'ftease', 'futabang', 'gay', 'gay_bang',
  'gif', 'handjob', 'herm_bang', 'hold', 'hug', 'impregnated', 'jockstraps', 'kiss', 'lesbian',
  'lesbian_bang', 'lick', 'maws', 'mbound', 'mcreampie', 'mpresentation', 'mseduce', 'msolo', 'mtease',
  'mur', 'nboop', 'nbrony', 'nbulge', 'ncomics', 'ncuddle', 'ndeer', 'nfelkins', 'nfemboy', 'nfox',
  'nfuta', 'ngroup', 'nhold', 'nhug', 'nhusky', 'nkiss', 'nleopard', 'nlick', 'npanther', 'npat',
  'npokemon', 'nprotogen', 'nscalies', 'nsfwselfies', 'nsolo', 'nspank', 'ntrap', 'pat', 'pawjob',
  'pawlick', 'paws', 'pegging_bang', 'petplay', 'pregnant', 'proposal', 'pussy', 'pussy_eating',
  'ride', 'rimjob', 'selfsuck', 'sfwsergal', 'straight_bang', 'suck', 'tentacles', 'toys',
  'trickortreat', 'yiff',
];

test('normalizeImageUrl leaves already-public URLs unchanged', () => {
  const url = 'https://imgapi.zonies.xyz/i/nsfw/neko/gif/neko_011.gif';
  assert.equal(normalizeImageUrl(url, PUBLIC), url);
});

test('filterAutocompleteTypes returns nothing until the user types', () => {
  assert.deepEqual(filterAutocompleteTypes(FURRY_TYPES, ''), []);
});

test('filterAutocompleteTypes finds types beyond the first 25 alphabetically', () => {
  const choices = filterAutocompleteTypes(FURRY_TYPES, 'yiff');
  assert.deepEqual(choices, [{ name: 'yiff', value: 'yiff' }]);
});

test('filterAutocompleteTypes prefers prefix matches and caps at 25', () => {
  const choices = filterAutocompleteTypes(FURRY_TYPES, 'n');
  assert.ok(choices.length <= 25);
  assert.ok(choices.some((c) => c.value === 'nhug'));
  assert.equal(choices[0].value, 'nboop');
});
