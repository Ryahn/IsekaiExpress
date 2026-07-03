const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole, hasGuildAdminOrModRole } = require('../src/bot/utils/guildPrivileges');
const { normalizeBlacklistedLinkHost } = require('./blacklistedLinkHostNormalize');
const { withModLogRolePing } = require('./modLogNotify');
const { recordModerationAction } = require('./moderationActionLog');

const URL_RE = /https?:\/\/[^\s<>"'`)]+/gi;
const DEDUPE_MS = 5 * 60 * 1000;
const HOST_CACHE_MS = 5 * 60 * 1000;

const hostCache = { t: 0, hosts: [] };
const linkDedupe = new Map();

function pruneDedupe(now) {
  for (const [key, ts] of linkDedupe) {
    if (now - ts > DEDUPE_MS) linkDedupe.delete(key);
  }
}

function shouldSkipLinkDedupe(homeId, authorId, matchKey) {
  const k = `${homeId}:${authorId}:${matchKey}`;
  const now = Date.now();
  pruneDedupe(now);
  const prev = linkDedupe.get(k);
  if (prev && now - prev < DEDUPE_MS) return true;
  linkDedupe.set(k, now);
  return false;
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function extractHttpUrls(content) {
  if (!content) return [];
  const s = String(content);
  const out = new Set();
  const re = new RegExp(URL_RE.source, 'gi');
  let m;
  while ((m = re.exec(s)) !== null) {
    let u = m[0].replace(/[),.!?;]+$/g, '');
    out.add(u);
  }
  return [...out];
}

/**
 * @param {string} hostname
 * @param {string[]} hosts
 * @returns {string | null} matched list entry
 */
function hostMatchesBlacklistedDomain(hostname, hosts) {
  const h = normalizeBlacklistedLinkHost(hostname);
  if (!h) return null;
  for (const d of hosts) {
    if (!d) continue;
    const dn = normalizeBlacklistedLinkHost(d);
    if (!dn) continue;
    if (h === dn || h.endsWith(`.${dn}`)) return dn;
  }
  return null;
}

/**
 * @param {import('knex').Knex} db
 * @returns {Promise<string[]>}
 */
async function getBlacklistedLinkHostsList(db) {
  const now = Date.now();
  if (now - hostCache.t < HOST_CACHE_MS && hostCache.hosts.length) {
    return hostCache.hosts;
  }
  const rows = await db('blacklisted_link_domains').select('host');
  const hosts = [...new Set(rows.map((r) => normalizeBlacklistedLinkHost(r.host)).filter(Boolean))];
  hostCache.t = now;
  hostCache.hosts = hosts;
  return hosts;
}

function buildLinkEvidenceEmbed(message, matchedOn) {
  return new EmbedBuilder()
    .setTitle('Blacklisted link enforcement')
    .setColor(0xff0000)
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Matched', value: String(matchedOn).slice(0, 1000) },
      { name: 'Content', value: (message.content || '*(none)*').slice(0, 1000) },
    )
    .setTimestamp();
}

async function recordDomainModerationHistory(client, message, matchedOn, action, logMessageId = null) {
  if (typeof client.db.createModerationReviewHistory !== 'function') return;
  await client.db.createModerationReviewHistory({
    guildId: message.guild.id,
    eventType: 'domain_enforcement',
    subjectType: 'domain',
    subjectId: String(matchedOn || '').slice(0, 128),
    authorId: message.author.id,
    channelId: message.channelId,
    sourceMessageId: message.id,
    queueMessageId: logMessageId,
    status: 'handled',
    action,
    handledBy: 'bot',
    handledAt: new Date(),
    summary: `Blacklisted domain/link ${action.replace(/_/g, ' ')}`,
    metadata: {
      matchedOn,
      userTag: message.author.tag || null,
      content: (message.content || '').slice(0, 500),
    },
  });
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 * @param {string} staffRoleId
 */
async function enforceScamLink(client, message, matchedOn, staffRoleId, modRoleId) {
  const guild = message.guild;
  if (!guild) return;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);
  const isMod = hasGuildAdminOrModRole(member, staffRoleId, modRoleId);

  const embed = buildLinkEvidenceEmbed(message, matchedOn);

  if (isStaff || isMod) {
    let logMessageId = null;
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        const sent = await ch.send(
          withModLogRolePing(cfg, {
            content: 'Staff/mod posted a blacklisted link — no ban applied.',
            embeds: [embed],
          }),
        ).catch(() => null);
        logMessageId = sent?.id || null;
      }
    }
    await recordDomainModerationHistory(client, message, matchedOn, 'staff_log', logMessageId);
    return;
  }

  try {
    await guild.members.ban(message.author.id, {
      deleteMessageSeconds: 3600,
      reason: `Blacklisted link: ${matchedOn}`,
    });
    await recordModerationAction(client, {
      guild,
      actionType: 'ban',
      targetUserId: message.author.id,
      targetUser: message.author,
      targetMember: member,
      moderatorUserId: client.user?.id,
      channelId: message.channelId,
      message,
      reason: `Blacklisted link: ${matchedOn}`,
      source: 'bot_auto',
      metadata: { matchedOn },
    });
  } catch (e) {
    client.logger.error('scamLinkPolicy enforce ban failed', e);
    let logMessageId = null;
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        const sent = await ch.send({ content: `Ban failed: ${e.message}`, embeds: [embed] }).catch(() => null);
        logMessageId = sent?.id || null;
      }
    }
    await recordDomainModerationHistory(client, message, matchedOn, 'ban_failed', logMessageId);
    return;
  }

  let logMessageId = null;
  if (logChannelId) {
    const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
    if (ch && ch.isTextBased()) {
      const sent = await ch.send(withModLogRolePing(cfg, { embeds: [embed] })).catch(() => null);
      logMessageId = sent?.id || null;
    }
  }
  await recordDomainModerationHistory(client, message, matchedOn, 'banned', logMessageId);
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message<boolean>} message
 * @param {string} staffRoleId
 */
async function processMemberMessageScamLinks(client, message, staffRoleId, modRoleId) {
  const urls = extractHttpUrls(message.content);
  if (!urls.length) return;

  const db = client.db.query;
  const hosts = await getBlacklistedLinkHostsList(db);

  for (const url of urls) {
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      /* ignore */
    }
    if (!hostname) continue;
    const matched = hostMatchesBlacklistedDomain(hostname, hosts);
    if (!matched) continue;

    if (shouldSkipLinkDedupe(message.guild.id, message.author.id, `link:${matched}`)) return;

    await enforceScamLink(client, message, `url blocked (${matched})`, staffRoleId, modRoleId);
    return;
  }
}

/**
 * @param {import('knex').Knex} db
 * @param {string} hostname
 * @param {string[]} [list]
 * @returns {Promise<string | null>}
 */
async function isBlacklistedLinkDomain(db, hostname, list) {
  const hosts = list || (await getBlacklistedLinkHostsList(db));
  return hostMatchesBlacklistedDomain(hostname, hosts);
}

module.exports = {
  extractHttpUrls,
  hostMatchesBlacklistedDomain,
  getBlacklistedLinkHostsList,
  processMemberMessageScamLinks,
  isBlacklistedLinkDomain,
};
