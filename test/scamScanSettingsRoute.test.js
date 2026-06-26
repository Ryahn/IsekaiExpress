const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/scam-scan-settings');
const config = require('../config');
const { defaultScamScanSettings, SCAM_SCAN_SETTING_DEFINITIONS } = require('../libs/scamScanSettings');

function routeHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route should exist`);
  return layer.route.stack[0].handle;
}

function fakeReq({ staff = true, body = {} } = {}) {
  return {
    body,
    session: {
      csrf: 'token',
      roles: staff ? [config.roles.staff] : ['user-role'],
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

function validBody(overrides = {}) {
  return {
    _csrf: 'token',
    scam_scan_enabled: 'on',
    scam_scan_ocr_enabled: 'on',
    scam_scan_phash_enabled: 'on',
    scam_scan_manual_review_on_failure: 'on',
    scam_scan_total_timeout_ms: '25000',
    scam_scan_download_timeout_ms: '10000',
    scam_scan_ocr_timeout_ms: '15000',
    scam_scan_phash_timeout_ms: '5000',
    scam_scan_max_image_bytes: '26214400',
    scam_scan_max_image_pixels: '25000000',
    scam_scan_ocr_max_edge: '1600',
    scam_scan_max_scan_concurrency: '2',
    scam_scan_max_ocr_concurrency: '1',
    ...overrides,
  };
}

test('scam scan settings route denies non-staff GET and POST', async () => {
  const restore = patchDb({
    getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,
    getScamScanSettings: async () => defaultScamScanSettings(),
    parseScamScanSettingsInput: require('../libs/scamScanSettings').parseScamScanSettingsInput,
  });
  try {
    const getRes = fakeRes();
    await routeHandler('/', 'get')(fakeReq({ staff: false }), getRes, assert.ifError);
    assert.equal(getRes.statusCode, 403);

    const postRes = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({ staff: false, body: validBody() }), postRes, assert.ifError);
    assert.equal(postRes.statusCode, 403);
  } finally {
    restore();
  }
});

test('staff can GET scam scan settings page', async () => {
  const restore = patchDb({
    getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,
    getScamScanSettings: async () => defaultScamScanSettings(),
  });
  try {
    const res = fakeRes();
    await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
    const render = res._calls.find((call) => call.type === 'render');
    assert.equal(render.view, 'scamScanSettings');
    assert.equal(render.model.settings.scam_scan_enabled, true);
  } finally {
    restore();
  }
});

test('scam scan settings save requires CSRF', async () => {
  const restore = patchDb({
    getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,
    getScamScanSettings: async () => defaultScamScanSettings(),
    parseScamScanSettingsInput: require('../libs/scamScanSettings').parseScamScanSettingsInput,
  });
  try {
    const res = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({ body: validBody({ _csrf: 'bad' }) }), res, assert.ifError);
    assert.equal(res.statusCode, 403);
    assert.equal(res._calls.some((call) => call.type === 'render'), true);
  } finally {
    restore();
  }
});

test('scam scan settings invalid values render validation errors', async () => {
  const restore = patchDb({
    getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,
    getScamScanSettings: async () => defaultScamScanSettings(),
    parseScamScanSettingsInput: require('../libs/scamScanSettings').parseScamScanSettingsInput,
  });
  try {
    const res = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      body: validBody({ scam_scan_total_timeout_ms: '1000' }),
    }), res, assert.ifError);
    assert.equal(res.statusCode, 400);
    assert.match(res._calls.find((call) => call.type === 'render').model.errors[0], /between 5000 and 120000/);
  } finally {
    restore();
  }
});

test('scam scan settings valid save persists settings', async () => {
  let saved = null;
  const restore = patchDb({
    getScamScanSettingDefinitions: () => SCAM_SCAN_SETTING_DEFINITIONS,
    getScamScanSettings: async () => saved || defaultScamScanSettings(),
    parseScamScanSettingsInput: require('../libs/scamScanSettings').parseScamScanSettingsInput,
    replaceScamScanSettings: async ({ settings }) => {
      saved = settings;
      return { ok: true, errors: [], settings };
    },
  });
  try {
    const res = fakeRes();
    await routeHandler('/save', 'post')(fakeReq({
      body: validBody({ scam_scan_total_timeout_ms: '30000', scam_scan_enabled: undefined }),
    }), res, assert.ifError);
    assert.equal(res.statusCode, 200);
    assert.equal(saved.scam_scan_total_timeout_ms, 30000);
    assert.equal(saved.scam_scan_enabled, false);
    assert.equal(res._calls.find((call) => call.type === 'render').model.success, 'Saved scam scan settings.');
  } finally {
    restore();
  }
});
