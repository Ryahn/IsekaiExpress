const test = require('node:test');
const assert = require('node:assert/strict');

const { getChatCommands } = require('../libs/chatCommandCatalog');
const router = require('../src/web/routes/commands');

test('getChatCommands loads built-in prefix commands', () => {
  const commands = getChatCommands();

  assert.ok(commands.length > 0);
  assert.ok(commands.every((cmd) => typeof cmd.name === 'string' && cmd.name.length > 0));
  assert.ok(commands.some((cmd) => cmd.name === 'cat'));
  assert.ok(commands.some((cmd) => cmd.name === 'randmeme'));
  assert.ok(commands.some((cmd) => cmd.name === 'ping'));
  assert.ok(!commands.some((cmd) => cmd.name === 'help'), 'farm handlers should not appear');
});

test('getChatCommands includes aliases and categories', () => {
  const randmeme = getChatCommands().find((cmd) => cmd.name === 'randmeme');

  assert.ok(randmeme);
  assert.equal(randmeme.category, 'fun');
  assert.deepEqual(randmeme.aliases, ['meme', 'f95meme']);
});

test('chat commands list route returns catalog JSON', async () => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === '/chat/list' && entry.route.methods.get,
  );
  assert.ok(layer, 'GET /chat/list route should exist');

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await layer.route.stack[0].handle({}, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.commands));
  assert.ok(res.body.commands.some((cmd) => cmd.name === 'cat'));
  assert.equal(typeof res.body.prefix, 'string');
});
