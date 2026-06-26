const MAX_SCAM_SCAN_RULES = 500;
const MAX_SCAM_SCAN_RULE_LINE_LENGTH = 200;

function normalizeScamScanText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAggressiveScamScanText(text) {
  return normalizeScamScanText(text).replace(/[^a-z0-9]+/g, '');
}

function normalizeDomainRule(domain) {
  return normalizeScamScanText(domain).replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '');
}

function validateDomainRule(domain, lineNumber) {
  const normalized = normalizeDomainRule(domain);
  if (!normalized) {
    return { error: `Line ${lineNumber}: domain cannot be empty.` };
  }
  if (/^https?:\/\//i.test(normalized)) {
    return { error: `Line ${lineNumber}: domain rules should not include http:// or https://.` };
  }
  if (/\s/.test(normalized) || /[/?#]/.test(normalized)) {
    return { error: `Line ${lineNumber}: domain rules cannot include spaces, paths, query strings, or fragments.` };
  }
  if (!/^[a-z0-9.-]+$/.test(normalized) || !normalized.includes('.')) {
    return { error: `Line ${lineNumber}: domain must look like example.com or sub.example.com.` };
  }
  return { normalized };
}

function parseRuleLine(line, lineNumber) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (raw.length > MAX_SCAM_SCAN_RULE_LINE_LENGTH) {
    return { error: `Line ${lineNumber}: rule exceeds ${MAX_SCAM_SCAN_RULE_LINE_LENGTH} characters.` };
  }

  const prefixMatch = raw.match(/^([a-z]+):(.*)$/i);
  let keyword = raw;
  let type = 'keyword';
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    if (prefix !== 'keyword' && prefix !== 'domain') {
      return { error: `Line ${lineNumber}: unsupported rule prefix "${prefix}:". Regex rules are not enabled yet.` };
    }
    keyword = prefixMatch[2].trim();
    if (!keyword) {
      return { error: `Line ${lineNumber}: ${prefix} cannot be empty.` };
    }
    type = prefix;
  }

  if (type === 'domain') {
    const validated = validateDomainRule(keyword, lineNumber);
    if (validated.error) return validated;
    return {
      rule: {
        type: 'domain',
        pattern: validated.normalized,
        normalized_pattern: validated.normalized,
      },
    };
  }

  const normalized = normalizeScamScanText(keyword);
  if (!normalized) {
    return { error: `Line ${lineNumber}: keyword cannot be empty.` };
  }
  return {
    rule: {
      type,
      pattern: keyword,
      normalized_pattern: normalized,
    },
  };
}

function parseScamScanRulesText(text) {
  const value = String(text || '');
  if (value.length > (MAX_SCAM_SCAN_RULE_LINE_LENGTH + 2) * MAX_SCAM_SCAN_RULES * 2) {
    return { ok: false, errors: ['Rule submission is too large.'], rules: [] };
  }

  const errors = [];
  const rules = [];
  const seen = new Set();
  const lines = value.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseRuleLine(lines[i], i + 1);
    if (!parsed) continue;
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    const key = parsed.rule.normalized_pattern;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(parsed.rule);
    if (rules.length > MAX_SCAM_SCAN_RULES) {
      errors.push(`At most ${MAX_SCAM_SCAN_RULES} active keyword rules are allowed.`);
      break;
    }
  }

  return { ok: errors.length === 0, errors, rules };
}

function keywordRuleMatchesText(rule, normalizedText, aggressiveText) {
  const normalizedPattern = normalizeScamScanText(rule.normalized_pattern || rule.pattern);
  if (!normalizedPattern) return false;
  if (normalizedText.includes(normalizedPattern)) return true;

  const aggressivePattern = normalizeAggressiveScamScanText(normalizedPattern);
  if (aggressivePattern.length < 4) return false;
  return aggressiveText.includes(aggressivePattern);
}

function exportScamScanRulesTextRows(rows) {
  return (rows || [])
    .filter((row) => row && row.enabled !== false && row.enabled !== 0)
    .filter((row) => (row.type || row.pattern_type || 'keyword') === 'keyword' || (row.type || row.pattern_type) === 'domain')
    .map((row) => {
      const type = row.type || row.pattern_type || 'keyword';
      return type === 'domain' ? `domain:${normalizeDomainRule(row.pattern)}` : String(row.pattern || '');
    })
    .filter(Boolean)
    .join('\n');
}

function testScamScanRulesAgainstTextRows(text, rows) {
  const normalizedText = normalizeScamScanText(text);
  const aggressiveText = normalizeAggressiveScamScanText(text);
  const matches = [];
  for (const row of rows || []) {
    if (!row || row.enabled === false || row.enabled === 0) continue;
    const type = row.type || row.pattern_type || 'keyword';
    if (type !== 'keyword' && type !== 'domain') continue;
    if (keywordRuleMatchesText(row, normalizedText, aggressiveText)) {
      const severity = row.severity || (row.pattern_type ? 'auto' : 'review');
      matches.push({
        id: row.id ?? null,
        type,
        pattern: row.pattern,
        severity,
      });
    }
  }
  return {
    normalizedText,
    matches,
  };
}

module.exports = {
  MAX_SCAM_SCAN_RULES,
  MAX_SCAM_SCAN_RULE_LINE_LENGTH,
  normalizeScamScanText,
  normalizeAggressiveScamScanText,
  normalizeDomainRule,
  parseScamScanRulesText,
  keywordRuleMatchesText,
  exportScamScanRulesTextRows,
  testScamScanRulesAgainstTextRows,
};
