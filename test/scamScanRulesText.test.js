const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_SCAM_SCAN_RULE_LINE_LENGTH,
  MAX_SCAM_SCAN_RULES,
  exportScamScanRulesTextRows,
  parseScamScanRulesText,
  testScamScanRulesAgainstTextRows,
} = require('../libs/scamScanRulesText');

test('parser ignores blank lines and comments', () => {
  const parsed = parseScamScanRulesText('\n# ignored\n\nporewin\n');

  assert.equal(parsed.ok, true);
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0].pattern, 'porewin');
});

test('parser accepts bare keywords and keyword prefix', () => {
  const parsed = parseScamScanRulesText('porewin\nkeyword: withdrawal success');

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rules.map((r) => r.pattern), ['porewin', 'withdrawal success']);
});

test('parser accepts domain prefix and normalizes domains', () => {
  const parsed = parseScamScanRulesText('domain:Sub.Example.COM.');

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rules[0], {
    type: 'domain',
    pattern: 'sub.example.com',
    normalized_pattern: 'sub.example.com',
  });
});

test('parser rejects invalid domain rules', () => {
  for (const line of [
    'domain:',
    'domain:https://example.com',
    'domain:example.com/path',
    'domain:bad domain.com',
    'domain:localhost',
    'https://example.com',
  ]) {
    const parsed = parseScamScanRulesText(line);
    assert.equal(parsed.ok, false, `${line} should be rejected`);
  }
});

test('parser rejects regex prefix for now', () => {
  const parsed = parseScamScanRulesText('regex:/porewin/i');

  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /Regex rules are not enabled yet/);
});

test('parser deduplicates case-insensitively', () => {
  const parsed = parseScamScanRulesText('PoreWin\nkeyword:porewin');

  assert.equal(parsed.ok, true);
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0].normalized_pattern, 'porewin');
});

test('parser rejects overlong lines', () => {
  const parsed = parseScamScanRulesText('x'.repeat(MAX_SCAM_SCAN_RULE_LINE_LENGTH + 1));

  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /exceeds/);
});

test('parser rejects too many active rules', () => {
  const text = Array.from({ length: MAX_SCAM_SCAN_RULES + 1 }, (_, i) => `rule-${i}`).join('\n');
  const parsed = parseScamScanRulesText(text);

  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /At most/);
});

test('test matcher uses normalized and aggressive keyword matching', () => {
  const rows = [
    { id: 1, type: 'keyword', pattern: 'porewin', normalized_pattern: 'porewin', severity: 'review', enabled: true },
  ];

  const result = testScamScanRulesAgainstTextRows('p o r e w i n promo', rows);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].pattern, 'porewin');
});

test('export formats domain rules with domain prefix', () => {
  const text = exportScamScanRulesTextRows([
    { type: 'keyword', pattern: 'withdrawal success', enabled: true },
    { type: 'domain', pattern: 'Example.COM.', enabled: true },
  ]);

  assert.equal(text, 'withdrawal success\ndomain:example.com');
});
