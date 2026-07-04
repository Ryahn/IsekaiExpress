const STARBOARD_SETTING_DEFINITIONS = Object.freeze({
  starboard_enabled: { type: 'boolean', default: false },
  starboard_channel_id: { type: 'string', default: null, nullable: true },
  starboard_emoji: { type: 'string', default: null, nullable: true },
  starboard_threshold: { type: 'integer', default: 3, min: 1, max: 50 },
});

const THRESHOLD_MIN = 1;
const THRESHOLD_MAX = 50;

function defaultStarboardSettings() {
  return {
    enabled: false,
    channelId: null,
    emoji: null,
    threshold: 3,
    allowedRoleIds: [],
    adminRoleIds: [],
  };
}

function parseJsonArray(value, fallback = []) {
  if (value == null || value === '') return [...fallback];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [...fallback];
  } catch {
    return [...fallback];
  }
}

function serializeRoleIds(roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds.map(String).filter(Boolean) : [];
  return JSON.stringify([...new Set(ids)]);
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return { ok: true, value: true };
  if (value === 0 || value === '0' || value === 'false' || value === 'off' || value === '') {
    return { ok: true, value: false };
  }
  return { ok: false, error: 'enabled must be true or false.' };
}

function coerceThreshold(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(n)) return { ok: false, error: `threshold must be an integer between ${THRESHOLD_MIN} and ${THRESHOLD_MAX}.` };
  if (n < THRESHOLD_MIN || n > THRESHOLD_MAX) {
    return { ok: false, error: `threshold must be between ${THRESHOLD_MIN} and ${THRESHOLD_MAX}.` };
  }
  return { ok: true, value: n };
}

function coerceChannelId(value) {
  const id = value == null ? '' : String(value).trim();
  if (!id) return { ok: true, value: null };
  if (!/^\d{17,20}$/.test(id)) return { ok: false, error: 'channel must be a valid channel ID.' };
  return { ok: true, value: id };
}

/**
 * Normalize emoji input from slash command or web panel.
 * Stores custom emojis as name:id, unicode as-is.
 */
function normalizeEmojiInput(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return { ok: false, error: 'emoji is required.' };

  const mentionMatch = trimmed.match(/^<a?:(\w+):(\d+)>$/);
  if (mentionMatch) return { ok: true, value: `${mentionMatch[1]}:${mentionMatch[2]}` };

  const colonMatch = trimmed.match(/^(\w+):(\d{17,20})$/);
  if (colonMatch) return { ok: true, value: `${colonMatch[1]}:${colonMatch[2]}` };

  if (trimmed.length > 64) return { ok: false, error: 'emoji is too long.' };
  return { ok: true, value: trimmed };
}

function parseStoredEmoji(stored) {
  if (!stored) return { name: null, id: null, raw: null };
  const colonMatch = String(stored).match(/^(\w+):(\d{17,20})$/);
  if (colonMatch) {
    return { name: colonMatch[1], id: colonMatch[2], raw: stored };
  }
  return { name: String(stored), id: null, raw: String(stored) };
}

function formatEmojiForDisplay(stored) {
  const parsed = parseStoredEmoji(stored);
  if (parsed.id) return `<:${parsed.name}:${parsed.id}>`;
  return parsed.raw || '—';
}

function reactionEmojiMatches(reactionEmoji, storedEmoji) {
  if (!reactionEmoji || !storedEmoji) return false;
  const parsed = parseStoredEmoji(storedEmoji);
  if (parsed.id) {
    return String(reactionEmoji.id || '') === parsed.id;
  }
  return (
    String(reactionEmoji.name || '') === parsed.name ||
    reactionEmoji.toString?.() === parsed.raw
  );
}

function hydrateStarboardSettings(row = {}) {
  const settings = defaultStarboardSettings();
  if (!row || typeof row !== 'object') return settings;

  settings.enabled = Boolean(row.starboard_enabled);
  settings.channelId = row.starboard_channel_id ? String(row.starboard_channel_id) : null;
  settings.emoji = row.starboard_emoji ? String(row.starboard_emoji) : null;
  settings.threshold = coerceThreshold(row.starboard_threshold ?? 3).ok
    ? coerceThreshold(row.starboard_threshold ?? 3).value
    : 3;
  settings.allowedRoleIds = parseJsonArray(row.starboard_allowed_role_ids, []);
  settings.adminRoleIds = parseJsonArray(row.starboard_admin_role_ids, []);

  return settings;
}

function parseStarboardSettingsInput(input = {}, options = {}) {
  const checkboxInput = Boolean(options.checkboxInput);
  const settings = defaultStarboardSettings();
  const errors = [];

  if (input.enabled != null || input.starboard_enabled != null) {
    const raw = input.enabled != null ? input.enabled : input.starboard_enabled;
    const parsed = checkboxInput
      ? { ok: true, value: raw === 'on' || raw === true || raw === 'true' || raw === '1' }
      : coerceBoolean(raw);
    if (parsed.ok) settings.enabled = parsed.value;
    else errors.push(parsed.error);
  }

  if (input.channelId != null || input.starboard_channel_id != null) {
    const raw = input.channelId != null ? input.channelId : input.starboard_channel_id;
    const parsed = coerceChannelId(raw);
    if (parsed.ok) settings.channelId = parsed.value;
    else errors.push(parsed.error);
  }

  if (input.emoji != null || input.starboard_emoji != null) {
    const raw = input.emoji != null ? input.emoji : input.starboard_emoji;
    if (String(raw).trim() === '') {
      settings.emoji = null;
    } else {
      const parsed = normalizeEmojiInput(raw);
      if (parsed.ok) settings.emoji = parsed.value;
      else errors.push(parsed.error);
    }
  }

  if (input.threshold != null || input.starboard_threshold != null) {
    const raw = input.threshold != null ? input.threshold : input.starboard_threshold;
    const parsed = coerceThreshold(raw);
    if (parsed.ok) settings.threshold = parsed.value;
    else errors.push(parsed.error);
  }

  if (input.allowedRoleIds != null || input.starboard_allowed_role_ids != null) {
    const raw = input.allowedRoleIds != null ? input.allowedRoleIds : input.starboard_allowed_role_ids;
    if (Array.isArray(raw)) {
      settings.allowedRoleIds = raw.map(String).filter(Boolean);
    } else if (typeof raw === 'string') {
      settings.allowedRoleIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  if (input.adminRoleIds != null || input.starboard_admin_role_ids != null) {
    const raw = input.adminRoleIds != null ? input.adminRoleIds : input.starboard_admin_role_ids;
    if (Array.isArray(raw)) {
      settings.adminRoleIds = raw.map(String).filter(Boolean);
    } else if (typeof raw === 'string') {
      settings.adminRoleIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  return { ok: errors.length === 0, errors, settings };
}

function parseMessageReference(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return { ok: false, error: 'A message ID or link is required.' };

  const linkMatch = trimmed.match(/discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (linkMatch) {
    return {
      ok: true,
      guildId: linkMatch[1],
      channelId: linkMatch[2],
      messageId: linkMatch[3],
    };
  }

  if (/^\d{17,20}$/.test(trimmed)) {
    return { ok: true, messageId: trimmed };
  }

  return { ok: false, error: 'Provide a valid message ID or Discord message link.' };
}

function validateEnableSettings(settings) {
  const errors = [];
  if (!settings.channelId) errors.push('A starboard channel must be configured.');
  if (!settings.emoji) errors.push('A starboard emoji must be configured.');
  return errors;
}

function getStarboardSettingDefinitions() {
  return STARBOARD_SETTING_DEFINITIONS;
}

module.exports = {
  STARBOARD_SETTING_DEFINITIONS,
  THRESHOLD_MIN,
  THRESHOLD_MAX,
  defaultStarboardSettings,
  parseJsonArray,
  serializeRoleIds,
  normalizeEmojiInput,
  parseStoredEmoji,
  formatEmojiForDisplay,
  reactionEmojiMatches,
  hydrateStarboardSettings,
  parseStarboardSettingsInput,
  validateEnableSettings,
  getStarboardSettingDefinitions,
  parseMessageReference,
};
