const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractUrls,
  normalizeUrl,
  classifyUrl,
  parseDiscordAttachmentUrl,
  discordAttachmentNeedsRefresh,
  findDiscordAttachment,
  resolveJsonPath,
  replaceUrlsInContent,
  scanCommands,
  buildFlaggedExport,
  isRehostConfigured,
  getRehostConfig,
} = require('../libs/imageRehost');

const skipHosts = ['overlord.lordainz.xyz'];

test('extractUrls finds URLs inside random blocks and weighted options', () => {
  const content = '{random~https://cdn.discordapp.com/a.png~70|https://media.giphy.com/b.gif~https://overlord.lordainz.xyz/f/x.png}';
  const urls = extractUrls(content);
  assert.deepEqual(urls, [
    'https://cdn.discordapp.com/a.png',
    'https://media.giphy.com/b.gif',
    'https://overlord.lordainz.xyz/f/x.png',
  ]);
});

test('normalizeUrl trims trailing punctuation from copied Discord links', () => {
  assert.equal(
    normalizeUrl('https://cdn.discordapp.com/x.png?ex=1&hm=abc&'),
    'https://cdn.discordapp.com/x.png?ex=1&hm=abc',
  );
});

test('classifyUrl marks hosted, indirect, and candidate URLs', () => {
  assert.equal(classifyUrl('https://overlord.lordainz.xyz/f/test.png', skipHosts).status, 'skip_hosted');
  assert.equal(classifyUrl('https://www.youtube.com/watch?v=abc', skipHosts).status, 'flag_indirect');
  assert.equal(classifyUrl('https://tenor.com/view/foo-gif-123', skipHosts).status, 'flag_indirect');
  assert.equal(classifyUrl('https://cdn.discordapp.com/attachments/1/2/image.png', skipHosts).status, 'candidate');
  assert.equal(classifyUrl('https://c.tenor.com/abc.gif', skipHosts).status, 'candidate');
  assert.equal(classifyUrl('https://imgur.com/gallery/abc', skipHosts).status, 'flag_indirect');
  assert.equal(classifyUrl('https://i.imgur.com/abc.png', skipHosts).status, 'candidate');
});

test('parseDiscordAttachmentUrl extracts channel, message, and filename', () => {
  const url = 'https://cdn.discordapp.com/attachments/309355248575578113/1116689655006494771/pngwing.com.png';
  assert.deepEqual(parseDiscordAttachmentUrl(url), {
    channelId: '309355248575578113',
    messageId: '1116689655006494771',
    filename: 'pngwing.com.png',
  });
  assert.equal(parseDiscordAttachmentUrl('https://example.com/a.png'), null);
});

test('discordAttachmentNeedsRefresh detects unsigned Discord CDN URLs', () => {
  assert.equal(
    discordAttachmentNeedsRefresh('https://cdn.discordapp.com/attachments/1/2/a.png'),
    true,
  );
  assert.equal(
    discordAttachmentNeedsRefresh('https://cdn.discordapp.com/attachments/1/2/a.png?ex=1&hm=abc'),
    false,
  );
});

test('findDiscordAttachment matches attachment filename', () => {
  const attachments = [
    { filename: 'pngwing.com.png', url: 'https://cdn.discordapp.com/attachments/1/2/pngwing.com.png?ex=1' },
    { filename: 'other.png', url: 'https://cdn.discordapp.com/attachments/1/2/other.png' },
  ];
  const match = findDiscordAttachment(attachments, 'pngwing.com.png');
  assert.equal(match.url.includes('pngwing.com.png'), true);
});

test('resolveJsonPath reads nested upload response paths', () => {
  const payload = { file: { url: 'https://overlord.lordainz.xyz/f/new.png' } };
  assert.equal(resolveJsonPath(payload, 'file.url'), 'https://overlord.lordainz.xyz/f/new.png');
  assert.equal(resolveJsonPath(payload, 'file.missing'), null);
});

test('replaceUrlsInContent preserves random syntax while swapping URLs', () => {
  const content = '{random~https://cdn.discordapp.com/old.png~https://cdn.discordapp.com/old2.gif}';
  const next = replaceUrlsInContent(content, {
    'https://cdn.discordapp.com/old.png': 'https://overlord.lordainz.xyz/f/a.png',
    'https://cdn.discordapp.com/old2.gif': 'https://overlord.lordainz.xyz/f/b.gif',
  });
  assert.equal(
    next,
    '{random~https://overlord.lordainz.xyz/f/a.png~https://overlord.lordainz.xyz/f/b.gif}',
  );
});

test('scanCommands summarizes candidates, flagged, and skipped URLs', async () => {
  const commands = [
    {
      id: 1,
      name: 'bacon',
      content: '{random~https://www.youtube.com/watch?v=abc~https://cdn.discordapp.com/a.png~https://overlord.lordainz.xyz/f/x.png}',
    },
  ];
  const result = await scanCommands(commands, { skipHosts });
  assert.equal(result.commands.length, 1);
  assert.equal(result.summary.flagged, 1);
  assert.equal(result.summary.candidates, 1);
  assert.equal(result.summary.skipped, 1);
});

test('buildFlaggedExport wraps items with timestamp', () => {
  const payload = buildFlaggedExport([
    { commandId: 1, commandName: 'test', url: 'https://tenor.com/view/x', reason: 'indirect_host' },
  ]);
  assert.ok(payload.generatedAt);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].reason, 'indirect_host');
});

test('isRehostConfigured requires enabled flag and upload key', () => {
  const cfg = getRehostConfig({
    enabled: true,
    uploadUrl: 'https://example.com/upload',
    uploadKey: 'secret',
  });
  assert.equal(isRehostConfigured(cfg), true);
  assert.equal(isRehostConfigured(getRehostConfig({ enabled: false, uploadKey: 'secret' })), false);
  assert.equal(isRehostConfigured(getRehostConfig({ enabled: true, uploadKey: '' })), false);
});
