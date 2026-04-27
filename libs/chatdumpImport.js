const cheerio = require('cheerio');
const { parseInviteCodeFromUserInput } = require('./invitePolicy');

const PHISH_INV = /:phishinvite:\s*(?:\*\*)?\s*Invite\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;
const PHISH_ID = /:phishid:\s*(?:\*\*)?\s*Server ID\s*(?:\*\*)?\s*:\s*(\d{10,20})\s*$/i;
const PHISH_RE = /:phishreason:\s*(?:\*\*)?\s*Reason\s*(?:\*\*)?\s*:\s*(.+?)\s*$/i;
const DOMAIN_ADDED = /^\s*:domain_added:\s+(\S+)\s*$/i;
const SOURCE_LINE = /^\s*Source:\s*(.+)\s*$/i;

/**
 * @param {string} str
 * @returns {{ kind: 'json', data: object } | { kind: 'html', html: string }}
 */
function loadExportFileText(str) {
  const t = String(str).replace(/^\uFEFF/, '').trim();
  const first = t[0];
  if (first === '{' || first === '[') {
    try {
      return { kind: 'json', data: JSON.parse(t) };
    } catch {
      /* fall through to HTML */
    }
  }
  return { kind: 'html', html: t };
}

/**
 * @param {object} exportObject
 * @returns {string}
 */
function collectTextBlobs(exportObject) {
  const parts = [];
  const messages = exportObject && Array.isArray(exportObject.messages) ? exportObject.messages : [];
  for (const msg of messages) {
    if (msg.content) parts.push(String(msg.content));
    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    for (const emb of embeds) {
      if (emb.title) parts.push(String(emb.title));
      if (emb.description) parts.push(String(emb.description));
      if (Array.isArray(emb.fields)) {
        for (const f of emb.fields) {
          if (f && f.name) parts.push(String(f.name));
          if (f && f.value) parts.push(String(f.value));
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * @param {string} html
 * @returns {string} plain text for regex parsers
 */
function extractTextFromChannelHtml(html) {
  const $ = cheerio.load(String(html), { decodeEntities: true });
  $('script, style').remove();
  const parts = [];

  $('.chatlog__message').each((_, el) => {
    const $m = $(el);
    $m.find('.chatlog__embed')
      .find('.chatlog__embed-title, .chatlog__embed-description, .chatlog__embed-field-name, .chatlog__embed-field-value')
      .each((_, n) => {
        const t = $(n).text();
        if (t) parts.push(t);
      });
    $m.find(
      '.chatlog__message-content, .markup, .chatlog__markdown-preserve, .chatlog__markdown',
    ).each((_, n) => {
      const t = $(n).text();
      if (t) parts.push(t);
    });
  });

  if (parts.length) {
    return parts.join('\n');
  }
  const body = $('body');
  if (body.length) return body.text();
  return $.root().text() || String(html).replace(/<[^>]+>/g, ' ');
}

/**
 * @param {string} text
 * @returns {Array<{ code: string | null, guildId: string | null, reason: string | null }>}
 */
function parsePhishLineGroups(text) {
  const lines = String(text).split('\n');
  const groups = [];
  let g = { code: null, guildId: null, reason: null };
  for (const line of lines) {
    const mInv = line.match(PHISH_INV);
    if (mInv) {
      if (g.code || g.guildId || g.reason) {
        groups.push(g);
      }
      g = { code: mInv[1].trim(), guildId: null, reason: null };
      continue;
    }
    const mId = line.match(PHISH_ID);
    if (mId) {
      g.guildId = mId[1].trim();
      continue;
    }
    const mRe = line.match(PHISH_RE);
    if (mRe) {
      g.reason = mRe[1].trim();
      continue;
    }
  }
  if (g.code || g.guildId || g.reason) {
    groups.push(g);
  }
  return groups;
}

/**
 * @param {string} text
 * @returns {Array<{ host: string, source: string | null }>}
 */
function parseDomainAddedMessages(text) {
  const lines = String(text).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DOMAIN_ADDED);
    if (!m) continue;
    let source = null;
    const next = lines[i + 1] || '';
    const s = next.match(SOURCE_LINE);
    if (s) source = s[1].trim();
    out.push({ host: normalizeHost(m[1]), source });
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeHost(raw) {
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  let h = s.split('/')[0].split('?')[0];
  h = h.replace(/:\d+$/, '');
  if (h.startsWith('www.')) h = h.slice(4);
  return h.replace(/\.$/, '');
}

/**
 * @param {string} name
 * @param {string} filenameHint
 * @returns {'phish' | 'domains' | 'auto'}
 */
function resolveModeFromHints(mode, name, filenameHint) {
  if (mode === 'phish' || mode === 'domains') return mode;
  const blob = `${name || ''} ${filenameHint || ''}`.toLowerCase();
  if (blob.includes('anti-scam') || blob.includes('antiscam')) return 'domains';
  if (blob.includes('phish')) return 'phish';
  return 'phish';
}

/**
 * @param {object} knex
 * @param {Array} groups from parsePhishLineGroups
 * @param {string | null} addedBy
 * @param {boolean} dryRun
 */
async function applyPhishChatdumpGroups(knex, groups, { addedBy = null, dryRun = false } = {}) {
  let inviteUpserts = 0;
  let guildUpserts = 0;
  for (const row of groups) {
    const reason = row.reason || null;
    const guildId = row.guildId || null;
    if (row.code) {
      const code = parseInviteCodeFromUserInput(row.code);
      if (code) {
        if (dryRun) {
          inviteUpserts++;
        } else {
          await knex.raw(
            `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
             VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
            [code, guildId, reason, addedBy],
          );
          inviteUpserts++;
        }
      }
    }
    if (guildId) {
      if (dryRun) {
        guildUpserts++;
      } else {
        await knex.raw(
          `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
          [guildId, null, reason, addedBy],
        );
        guildUpserts++;
      }
    }
  }
  return { inviteUpserts, guildUpserts };
}

/**
 * @param {object} knex
 * @param {Array<{ host: string, source: string | null }>} rows
 * @param {string | null} addedBy
 * @param {boolean} dryRun
 */
async function applyDomainRows(knex, rows, { addedBy = null, dryRun = false } = {}) {
  let n = 0;
  for (const { host, source } of rows) {
    if (!host) continue;
    if (dryRun) {
      n++;
      continue;
    }
    await knex.raw(
      `INSERT INTO blacklisted_link_domains (host, source, added_by)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE source = VALUES(source), added_by = VALUES(added_by)`,
      [host, source, addedBy],
    );
    n++;
  }
  return n;
}

/**
 * @param {object} knex
 * @param {ReturnType<loadExportFileText>} load
 * @param {object} opts
 * @param {'phish' | 'domains' | 'auto'} opts.mode
 * @param {string} [opts.filenameHint]
 * @param {string | null} [opts.addedBy]
 * @param {boolean} [opts.dryRun]
 */
async function importFromLoad(knex, load, opts) {
  const { mode: modeIn = 'auto', filenameHint = '', addedBy = null, dryRun = false } = opts;
  let text = '';
  let channelName = '';
  if (load.kind === 'json') {
    text = collectTextBlobs(load.data);
    channelName = (load.data && load.data.channel && load.data.channel.name) || '';
  } else {
    text = extractTextFromChannelHtml(load.html);
  }
  const mode = resolveModeFromHints(modeIn, channelName, filenameHint);
  if (mode === 'domains') {
    const doms = parseDomainAddedMessages(text);
    const domainRows = await applyDomainRows(knex, doms, { addedBy, dryRun });
    return { mode, textBytes: text.length, domainRows, inviteUpserts: 0, guildUpserts: 0, phishGroups: 0 };
  }
  const groups = parsePhishLineGroups(text);
  const applied = await applyPhishChatdumpGroups(knex, groups, { addedBy, dryRun });
  return {
    mode,
    textBytes: text.length,
    phishGroups: groups.length,
    ...applied,
    domainRows: 0,
  };
}

module.exports = {
  loadExportFileText,
  collectTextBlobs,
  extractTextFromChannelHtml,
  parsePhishLineGroups,
  parseDomainAddedMessages,
  normalizeHost,
  resolveModeFromHints,
  importFromLoad,
  applyPhishChatdumpGroups,
  applyDomainRows,
};
