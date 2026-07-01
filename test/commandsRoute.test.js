const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/commands');
const config = require('../config');

function routeHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route should exist`);
  return layer.route.stack[0].handle;
}

function fakeReq({ body = {}, params = {}, staff = true } = {}) {
  return {
    body,
    params,
    session: {
      csrf: 'token',
      user: { id: '123456789012345678', username: 'staff' },
      roles: staff ? [config.roles.staff] : [],
    },
  };
}

function fakeRes() {
  return {
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
}

function patchDb(patches) {
  const originals = {};
  for (const [key, value] of Object.entries(patches)) {
    originals[key] = db[key];
    db[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) {
      db[key] = value;
    }
  };
}

test.after(async () => {
  try {
    await db.end();
  } catch (_) {
    /* ignore */
  }
});

test('web command add edit and delete route through repository methods', async () => {
  const calls = [];
  const restore = patchDb({
    createCustomCommand: async (input) => {
      calls.push(['create', input]);
      return { ok: true, command: { id: 1, name: input.name } };
    },
    updateCustomCommand: async (input) => {
      calls.push(['update', input]);
      return { ok: true, command: { id: input.identifier, name: input.name } };
    },
    deleteCustomCommand: async (identifier) => {
      calls.push(['delete', identifier]);
      return { ok: true, command: { id: identifier, name: 'hello' } };
    },
  });

  try {
    const addRes = fakeRes();
    await routeHandler('/add', 'post')(fakeReq({ body: { _csrf: 'token', name: 'hello', content: 'hi' } }), addRes, assert.ifError);
    assert.equal(addRes.statusCode, 201);

    const editRes = fakeRes();
    await routeHandler('/edit/:id', 'post')(fakeReq({
      params: { id: '1' },
      body: { _csrf: 'token', name: 'hello2', content: 'hi again' },
    }), editRes, assert.ifError);
    assert.equal(editRes.statusCode, 200);

    const deleteRes = fakeRes();
    await routeHandler('/delete/:id', 'post')(fakeReq({ params: { id: '1'}, body: { _csrf: 'token' } }), deleteRes, assert.ifError);
    assert.equal(deleteRes.statusCode, 200);

    assert.deepEqual(calls.map((call) => call[0]), ['create', 'update', 'delete']);
    assert.equal(calls[0][1].name, 'hello');
    assert.equal(calls[1][1].identifier, '1');
    assert.equal(calls[2][1], '1');
  } finally {
    restore();
  }
});

test('web command routes return clean errors from repository failures', async () => {
  const restore = patchDb({
    createCustomCommand: async () => ({ ok: false, reason: 'duplicate', message: 'Duplicate command' }),
    updateCustomCommand: async () => ({ ok: false, reason: 'not_found', message: 'Custom command not found.' }),
    deleteCustomCommand: async () => ({ ok: false, reason: 'not_found', message: 'Custom command not found.' }),
  });

  try {
    const addRes = fakeRes();
    await routeHandler('/add', 'post')(fakeReq({ body: { _csrf: 'token', name: 'hello', content: 'hi' } }), addRes, assert.ifError);
    assert.equal(addRes.statusCode, 400);
    assert.equal(addRes.body.message, 'Duplicate command');

    const editRes = fakeRes();
    await routeHandler('/edit/:id', 'post')(fakeReq({
      params: { id: '9' },
      body: { _csrf: 'token', name: 'hello', content: 'hi' },
    }), editRes, assert.ifError);
    assert.equal(editRes.statusCode, 404);

    const deleteRes = fakeRes();
    await routeHandler('/delete/:id', 'post')(fakeReq({ params: { id: '9' }, body: { _csrf: 'token' } }), deleteRes, assert.ifError);
    assert.equal(deleteRes.statusCode, 404);
  } finally {
    restore();
  }
});
