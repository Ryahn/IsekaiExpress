const SCAM_SCAN_SETTING_DEFINITIONS = Object.freeze({
  scam_scan_enabled: { type: 'boolean', default: true },
  scam_scan_ocr_enabled: { type: 'boolean', default: true },
  scam_scan_phash_enabled: { type: 'boolean', default: true },
  scam_scan_manual_review_on_failure: { type: 'boolean', default: true },
  scam_scan_total_timeout_ms: { type: 'integer', default: 25000, min: 5000, max: 120000 },
  scam_scan_download_timeout_ms: { type: 'integer', default: 10000, min: 2000, max: 60000 },
  scam_scan_ocr_timeout_ms: { type: 'integer', default: 15000, min: 5000, max: 90000 },
  scam_scan_phash_timeout_ms: { type: 'integer', default: 5000, min: 1000, max: 30000 },
  scam_scan_max_image_bytes: { type: 'integer', default: 26214400, min: 1048576, max: 52428800 },
  scam_scan_max_image_pixels: { type: 'integer', default: 25000000, min: 1000000, max: 100000000 },
  scam_scan_ocr_max_edge: { type: 'integer', default: 1600, min: 800, max: 3000 },
  scam_scan_max_scan_concurrency: { type: 'integer', default: 2, min: 1, max: 5 },
  scam_scan_max_ocr_concurrency: { type: 'integer', default: 1, min: 1, max: 3 },
});

const SCAM_SCAN_SETTINGS_CACHE_MS = 30 * 1000;

function defaultScamScanSettings() {
  return Object.fromEntries(
    Object.entries(SCAM_SCAN_SETTING_DEFINITIONS).map(([key, def]) => [key, def.default]),
  );
}

function coerceBoolean(value, key) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return { ok: true, value: true };
  if (value === 0 || value === '0' || value === 'false' || value === 'off' || value === '') {
    return { ok: true, value: false };
  }
  return { ok: false, error: `${key} must be true or false.` };
}

function coerceInteger(value, key, def) {
  const n = typeof value === 'number' ? value : Number(String(value || '').trim());
  if (!Number.isInteger(n)) return { ok: false, error: `${key} must be an integer.` };
  if (n < def.min || n > def.max) {
    return { ok: false, error: `${key} must be between ${def.min} and ${def.max}.` };
  }
  return { ok: true, value: n };
}

function coerceScamScanSetting(key, value) {
  const def = SCAM_SCAN_SETTING_DEFINITIONS[key];
  if (!def) return { ok: false, error: `Unknown setting: ${key}` };
  return def.type === 'boolean'
    ? coerceBoolean(value, key)
    : coerceInteger(value, key, def);
}

function parseScamScanSettingsInput(input = {}, options = {}) {
  const checkboxInput = Boolean(options.checkboxInput);
  const settings = defaultScamScanSettings();
  const errors = [];

  for (const [key, def] of Object.entries(SCAM_SCAN_SETTING_DEFINITIONS)) {
    if (def.type === 'boolean' && checkboxInput) {
      settings[key] = input[key] === 'on' || input[key] === true || input[key] === 'true' || input[key] === '1';
      continue;
    }
    if (input[key] == null) continue;
    const parsed = coerceScamScanSetting(key, input[key]);
    if (parsed.ok) settings[key] = parsed.value;
    else errors.push(parsed.error);
  }

  return { ok: errors.length === 0, errors, settings };
}

function hydrateScamScanSettingsRows(rows = {}) {
  const settings = defaultScamScanSettings();
  const errors = [];
  const entries = Array.isArray(rows)
    ? rows.map((row) => [row.key, row.value])
    : Object.entries(rows);

  for (const [key, value] of entries) {
    if (!SCAM_SCAN_SETTING_DEFINITIONS[key]) continue;
    const parsed = coerceScamScanSetting(key, value);
    if (parsed.ok) settings[key] = parsed.value;
    else errors.push(parsed.error);
  }

  return { ok: errors.length === 0, errors, settings };
}

function serializeScamScanSettingValue(value) {
  return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
}

module.exports = {
  SCAM_SCAN_SETTING_DEFINITIONS,
  SCAM_SCAN_SETTINGS_CACHE_MS,
  defaultScamScanSettings,
  parseScamScanSettingsInput,
  hydrateScamScanSettingsRows,
  serializeScamScanSettingValue,
};
