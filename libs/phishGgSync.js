const axios = require('axios');
const { parseInviteCodeFromUserInput } = require('./invitePolicy');

const PHISH_GG_SERVERS_URL = 'https://api.phish.gg/servers/all';
const DEFAULT_TIMEOUT_MS = 120_000;

const MAX_GUILD_ID_LEN = 20;

/**
 * API sometimes returns a bare snowflake, sometimes a discord.gg/… URL. DB column is varchar(20).
 * @param {string} s
 * @returns {string | null}
 */
function extractSnowflakeFromServerIdField(s) {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim();
  if (/^\d{1,20}$/.test(t) && t.length <= MAX_GUILD_ID_LEN) {
    return t;
  }
  const matches = t.match(/\d{10,20}/g);
  if (!matches || !matches.length) return null;
  const last = matches[matches.length - 1];
  return last.length <= MAX_GUILD_ID_LEN ? last : null;
}

/**
 * @returns {Promise<Array<{ serverID: string, reason: string, invite?: string, key?: string }>>}
 */
async function fetchPhishGgServersAll() {
  const { data, status, statusText } = await axios.get(PHISH_GG_SERVERS_URL, {
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { Accept: 'application/json', 'User-Agent': 'f95bot/1.0 (phish sync)' },
    validateStatus: () => true,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`phish.gg API ${status} ${statusText || ''}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('phish.gg API: expected JSON array');
  }
  return data;
}

/**
 * @param {import('knex').Knex} knex
 * @param {string | null} [addedBy]
 * @param {boolean} [dryRun]
 * @returns {Promise<{ guildRows: number, inviteRows: number }>}
 */
async function applyPhishApiRows(knex, rows, { addedBy = null, dryRun = false } = {}) {
  let guildRows = 0;
  let inviteRows = 0;
  for (const row of rows) {
    if (!row || row.serverID == null) continue;
    const reason = row.reason != null ? String(row.reason) : null;
    const raw = String(row.serverID).trim();
    const guildId = extractSnowflakeFromServerIdField(raw);

    let code = '';
    if (row.invite != null && String(row.invite).trim()) {
      code = parseInviteCodeFromUserInput(String(row.invite).trim());
    } else if (!/^\d{1,20}$/.test(raw.trim()) || /discord\.(gg|com)|https?:\/\//i.test(raw)) {
      code = parseInviteCodeFromUserInput(raw);
    }

    if (dryRun) {
      if (guildId) guildRows++;
      if (code) inviteRows++;
      continue;
    }

    if (guildId) {
      await knex.raw(
        `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
        [guildId, null, reason, addedBy],
      );
      guildRows++;
    }
    if (code) {
      const resolved = guildId || null;
      await knex.raw(
        `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
        [code, resolved, reason, addedBy],
      );
      inviteRows++;
    }
  }
  return { guildRows, inviteRows };
}

/**
 * Fetch + apply phish.gg server list to DB.
 * @param {import('knex').Knex} knex
 * @param {object} [opts]
 * @param {string | null} [opts.addedBy]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ guildRows: number, inviteRows: number, apiCount: number }>}
 */
async function syncPhishGgServers(knex, { addedBy = null, dryRun = false } = {}) {
  const data = await fetchPhishGgServersAll();
  const { guildRows, inviteRows } = await applyPhishApiRows(knex, data, { addedBy, dryRun });
  return { guildRows, inviteRows, apiCount: data.length };
}

module.exports = {
  PHISH_GG_SERVERS_URL,
  fetchPhishGgServersAll,
  applyPhishApiRows,
  syncPhishGgServers,
  extractSnowflakeFromServerIdField,
};
