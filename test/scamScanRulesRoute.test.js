const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/scam-scan-rules');
const config = require('../config');

function routeHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route should exist`);
  return layer.route.stack[0].handle;
}

function fakeReq({ staff = true, mod = false, csrf = 'token', body = {} } = {}) {
  const roles = staff
    ? [config.roles.staff]
    : mod
      ? [config.roles.mod]
      : ['user-role'];
  return {
    body,
    session: {
      csrf: 'token',
      roles,
      user: { id: 'user-1', username: 'Staff', avatar: null },
    },
  };
}

function fakeRes() {
  const calls = [];
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      calls.push({ type: 'status', code });
      return this;
    },
    json(payload) {
      calls.push({ type: 'json', payload, statusCode: this.statusCode });
      return this;
    },
    render(view, model) {
      calls.push({ type: 'render', view, model, statusCode: this.statusCode });
      return this;
    },
    _calls: calls,
  };
}

function patchDb(overrides) {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = db[key];
    db[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) {
      db[key] = value;
    }
  };
}

test('scam scan rules route denies users without mod or staff access', async () => {
  const restore = patchDb({
    parseScamScanRulesText: () => ({ ok: true, errors: [], rules: [] }),
  });
  try {
    const getRes = fakeRes();
    await routeHandler('/', 'get')(fakeReq({ staff: false }), getRes, assert.ifError);
    assert.equal(getRes.statusCode, 403);

    const postRes = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      staff: false,
      body: { _csrf: 'token', rules: 'porewin' },
    }), postRes, assert.ifError);
    assert.equal(postRes.statusCode, 403);
  } finally {
    restore();
  }
});

test('mod can GET scam scan rules but cannot save', async () => {
  const restore = patchDb({
    exportScamScanRulesText: async () => 'porewin',
    parseScamScanRulesText: () => ({ ok: true, errors: [], rules: [{ type: 'keyword', pattern: 'porewin' }] }),
  });
  try {
    const getRes = fakeRes();
    await routeHandler('/', 'get')(fakeReq({ staff: false, mod: true }), getRes, assert.ifError);
    const render = getRes._calls.find((call) => call.type === 'render');
    assert.equal(render.view, 'scamScanRules');

    const postRes = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      staff: false,
      mod: true,
      body: { _csrf: 'token', rules: 'porewin' },
    }), postRes, assert.ifError);
    assert.equal(postRes.statusCode, 403);
  } finally {
    restore();
  }
});

test('staff can GET scam scan rules page', async () => {
  const restore = patchDb({
    exportScamScanRulesText: async () => 'porewin',
    parseScamScanRulesText: () => ({ ok: true, errors: [], rules: [{ type: 'keyword', pattern: 'porewin' }] }),
  });
  try {
    const res = fakeRes();
    await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
    const render = res._calls.find((call) => call.type === 'render');
    assert.equal(render.view, 'scamScanRules');
    assert.equal(render.model.rulesText, 'porewin');
  } finally {
    restore();
  }
});

test('save and preview require CSRF', async () => {
  const restore = patchDb({
    parseScamScanRulesText: () => ({ ok: true, errors: [], rules: [] }),
  });
  try {
    for (const path of ['/save', '/test']) {
      const res = fakeRes();
      await routeHandler(path, 'post')(fakeReq({
        body: { _csrf: 'bad', rules: 'porewin', test_text: 'sample' },
      }), res, assert.ifError);
      assert.equal(res.statusCode, 403);
      assert.equal(res._calls.some((call) => call.type === 'render'), true);
    }
  } finally {
    restore();
  }
});

test('save rejects regex and accepts domain rules', async () => {
  let saved = null;
  const restore = patchDb({
    exportScamScanRulesText: async () => saved || '',
    parseScamScanRulesText: (text) => {
      const { parseScamScanRulesText } = require('../libs/scamScanRulesText');
      return parseScamScanRulesText(text);
    },
    replaceScamScanKeywordRulesFromText: async ({ text }) => {
      const { parseScamScanRulesText } = require('../libs/scamScanRulesText');
      const parsed = parseScamScanRulesText(text);
      if (!parsed.ok) return parsed;
      saved = text;
      return parsed;
    },
  });
  try {
    const badRes = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      body: { _csrf: 'token', rules: 'regex:/bad/i' },
    }), badRes, assert.ifError);
    assert.equal(badRes.statusCode, 400);
    assert.match(badRes._calls.find((call) => call.type === 'render').model.errors[0], /Regex rules are not enabled/);

    const goodRes = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      body: { _csrf: 'token', rules: 'domain:example.com' },
    }), goodRes, assert.ifError);
    assert.equal(goodRes.statusCode, 200);
    assert.equal(saved, 'domain:example.com');
  } finally {
    restore();
  }
});

test('preview does not persist sample text', async () => {
  let persisted = false;
  let previewed = '';
  const restore = patchDb({
    exportScamScanRulesText: async () => 'domain:example.com',
    parseScamScanRulesText: () => ({ ok: true, errors: [], rules: [{ type: 'domain', pattern: 'example.com' }] }),
    replaceScamScanKeywordRulesFromText: async () => {
      persisted = true;
    },
    testScamScanRulesAgainstText: async (text) => {
      previewed = text;
      return { matches: [] };
    },
  });
  try {
    const res = fakeRes();
    await routeHandler('/test', 'post')(fakeReq({
      body: { _csrf: 'token', test_text: 'private OCR sample' },
    }), res, assert.ifError);
    assert.equal(persisted, false);
    assert.equal(previewed, 'private OCR sample');
    assert.equal(res._calls.find((call) => call.type === 'render').model.testText, 'private OCR sample');
  } finally {
    restore();
  }
});
