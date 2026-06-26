const test = require('node:test');
const assert = require('node:assert/strict');

const {
  defaultScamScanSettings,
  hydrateScamScanSettingsRows,
  parseScamScanSettingsInput,
  serializeScamScanSettingValue,
} = require('../libs/scamScanSettings');

test('scam scan settings defaults are returned when no rows exist', () => {
  const parsed = hydrateScamScanSettingsRows([]);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.settings, defaultScamScanSettings());
});

test('scam scan settings valid values save and reload through serialized rows', () => {
  const parsed = parseScamScanSettingsInput({
    scam_scan_enabled: false,
    scam_scan_ocr_enabled: true,
    scam_scan_total_timeout_ms: 30000,
    scam_scan_max_scan_concurrency: 3,
  });
  assert.equal(parsed.ok, true);

  const rows = Object.entries(parsed.settings).map(([key, value]) => ({
    key,
    value: serializeScamScanSettingValue(value),
  }));
  const hydrated = hydrateScamScanSettingsRows(rows);

  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.settings.scam_scan_enabled, false);
  assert.equal(hydrated.settings.scam_scan_total_timeout_ms, 30000);
  assert.equal(hydrated.settings.scam_scan_max_scan_concurrency, 3);
});

test('scam scan settings invalid booleans and integers are rejected', () => {
  const parsed = parseScamScanSettingsInput({
    scam_scan_enabled: 'maybe',
    scam_scan_total_timeout_ms: '12.5',
  });

  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join('\n'), /must be true or false/);
  assert.match(parsed.errors.join('\n'), /must be an integer/);
});

test('scam scan settings min and max bounds are enforced', () => {
  const low = parseScamScanSettingsInput({ scam_scan_total_timeout_ms: 4999 });
  const high = parseScamScanSettingsInput({ scam_scan_max_ocr_concurrency: 4 });

  assert.equal(low.ok, false);
  assert.match(low.errors[0], /between 5000 and 120000/);
  assert.equal(high.ok, false);
  assert.match(high.errors[0], /between 1 and 3/);
});

test('scam scan settings checkbox input treats missing booleans as false', () => {
  const parsed = parseScamScanSettingsInput({
    scam_scan_enabled: 'on',
    scam_scan_total_timeout_ms: '25000',
  }, { checkboxInput: true });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.settings.scam_scan_enabled, true);
  assert.equal(parsed.settings.scam_scan_ocr_enabled, false);
});
