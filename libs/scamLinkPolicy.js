const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

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
  const h = String(hostname).toLowerCase();
  for (const d of hosts) {
    if (!d) continue;
    if (h === d || h.endsWith(`.${d}`)) return d;
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
  const hosts = rows.map((r) => r.host);
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

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 * @param {string} staffRoleId
 */
async function enforceScamLink(client, message, matchedOn, staffRoleId) {
  const guild = message.guild;
  if (!guild) return;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);

  const embed = buildLinkEvidenceEmbed(message, matchedOn);

  if (isStaff) {
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch.send({
          content: 'Staff posted a blacklisted link — no ban applied.',
          embeds: [embed],
        });
      }
    }
    return;
  }

  try {
    await guild.members.ban(message.author.id, {
      deleteMessageSeconds: 3600,
      reason: `Blacklisted link: ${matchedOn}`,
    });
  } catch (e) {
    client.logger.error('scamLinkPolicy enforce ban failed', e);
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch.send({ content: `Ban failed: ${e.message}`, embeds: [embed] }).catch(() => {});
      }
    }
    return;
  }

  if (logChannelId) {
    const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
    if (ch && ch.isTextBased()) {
      await ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message<boolean>} message
 * @param {string} staffRoleId
 */
async function processMemberMessageScamLinks(client, message, staffRoleId) {
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

    await enforceScamLink(client, message, `url blocked (${matched})`, staffRoleId);
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
