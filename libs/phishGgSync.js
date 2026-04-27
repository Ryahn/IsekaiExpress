const axios = require('axios');
const { parseInviteCodeFromUserInput } = require('./invitePolicy');

const PHISH_GG_SERVERS_URL = 'https://api.phish.gg/servers/all';
const DEFAULT_TIMEOUT_MS = 120_000;

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
    if (!row || !row.serverID) continue;
    const sid = String(row.serverID).trim();
    const reason = row.reason != null ? String(row.reason) : null;
    if (dryRun) {
      guildRows++;
      if (row.invite) inviteRows++;
      continue;
    }
    await knex.raw(
      `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
      [sid, null, reason, addedBy],
    );
    guildRows++;
    if (row.invite) {
      const code = parseInviteCodeFromUserInput(String(row.invite));
      if (code) {
        await knex.raw(
          `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
          [code, sid, reason, addedBy],
        );
        inviteRows++;
      }
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
};
