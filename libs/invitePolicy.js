const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../src/bot/utils/guildPrivileges');

const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite\/|discord\.gg\/|dsc\.gg\/)([a-zA-Z0-9-]+)/gi;

const DEDUPE_MS = 5 * 60 * 1000;
const inviteDedupe = new Map();

function pruneDedupe(now) {
  for (const [key, ts] of inviteDedupe) {
    if (now - ts > DEDUPE_MS) inviteDedupe.delete(key);
  }
}

function shouldSkipDedupe(homeId, authorId, code) {
  const k = `${homeId}:${authorId}:${code.toLowerCase()}`;
  const now = Date.now();
  pruneDedupe(now);
  const prev = inviteDedupe.get(k);
  if (prev && now - prev < DEDUPE_MS) return true;
  inviteDedupe.set(k, now);
  return false;
}

function extractInviteCodes(content) {
  if (!content) return [];
  const out = new Set();
  let m;
  const re = new RegExp(INVITE_REGEX.source, 'gi');
  while ((m = re.exec(content)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

/**
 * Single invite code from user paste (full URL, discordapp.com, discord.gg, or raw code).
 * Lowercased for storage / API.
 */
function parseInviteCodeFromUserInput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const fromRegex = extractInviteCodes(trimmed);
  if (fromRegex.length) {
    return fromRegex[0].toLowerCase();
  }
  const lower = trimmed.toLowerCase();
  const last = lower.split('/').filter(Boolean).pop() || lower;
  return last.split('?')[0].split('#')[0].replace(/[^a-z0-9-]/g, '') || '';
}

function inviteQueueChannelId(configRow) {
  return configRow.invite_queue_channel_id || configRow.modLogId || null;
}

/** Discord REST: 10006 = Unknown Invite (expired, revoked, invalid code, etc.) */
const DISCORD_UNKNOWN_INVITE = 10006;

async function resolveInvite(client, code) {
  const failed = (unresolvable) => ({
    ok: false,
    guildId: null,
    guildName: null,
    channelId: null,
    channelName: null,
    unresolvable,
  });
  try {
    const inv = await client.fetchInvite(code);
    return {
      ok: true,
      guildId: inv.guild?.id || null,
      guildName: inv.guild?.name || null,
      channelId: inv.channel?.id || null,
      channelName: inv.channel?.name || null,
      unresolvable: null,
    };
  } catch (e) {
    const apiCode = e.code ?? e.rawError?.code;
    if (apiCode === DISCORD_UNKNOWN_INVITE) {
      return failed('unknown_invite');
    }
    if (apiCode != null) {
      return failed(`api_${apiCode}`);
    }
    return failed('error');
  }
}

async function isBlacklistedCode(db, code) {
  const row = await db('blacklisted_invites').where({ code: code.toLowerCase() }).first();
  return Boolean(row);
}

async function isBlacklistedGuild(db, guildId) {
  if (!guildId) return false;
  const row = await db('blacklisted_guilds').where({ guild_id: guildId }).first();
  return Boolean(row);
}

async function isWhitelistedCode(db, homeGuildId, code) {
  const row = await db('whitelisted_invites')
    .where({ home_guild_id: homeGuildId, code: code.toLowerCase() })
    .first();
  return Boolean(row);
}

async function isWhitelistedGuild(db, homeGuildId, targetGuildId) {
  if (!targetGuildId) return false;
  const row = await db('whitelisted_guilds')
    .where({ home_guild_id: homeGuildId, target_guild_id: targetGuildId })
    .first();
  return Boolean(row);
}

function buildEvidenceEmbed(message, matchedOn) {
  return new EmbedBuilder()
    .setTitle('Blacklisted invite enforcement')
    .setColor(0xff0000)
    .addFields(
      { name: 'User', value: `${message.author.tag} (${message.author.id})` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Matched', value: String(matchedOn).slice(0, 1000) },
      { name: 'Content', value: (message.content || '*(none)*').slice(0, 1000) },
    )
    .setTimestamp();
}

async function enforceBlacklist(client, message, matchedOn, staffRoleId) {
  const guild = message.guild;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);

  const embed = buildEvidenceEmbed(message, matchedOn);

  if (isStaff) {
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch.send({
          content: 'Staff posted blacklisted invite — no ban applied.',
          embeds: [embed],
        });
      }
    }
    return;
  }

  try {
    await guild.members.ban(message.author.id, {
      deleteMessageSeconds: 3600,
      reason: `Blacklisted invite: ${matchedOn}`,
    });
  } catch (e) {
    client.logger.error('invitePolicy enforce ban failed', e);
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

async function auditStaffInvite(client, message, code, resolved) {
  const cfg = await client.db.getGuildConfigurable(message.guild.id);
  const logChannelId = cfg?.modLogId;
  if (!logChannelId) return;
  const ch =
    message.guild.channels.cache.get(logChannelId) ||
    (await message.guild.channels.fetch(logChannelId).catch(() => null));
  if (!ch || !ch.isTextBased()) return;
  const extra = resolved.ok ? ` → ${resolved.guildName || '?'} (${resolved.guildId || '?'})` : ' (resolve failed)';
  await ch
    .send(
      `[Invite audit] ${message.author.tag} in <#${message.channelId}> — code \`${code}\`${extra}`,
    )
    .catch(() => {});
}

function buildQueueEmbed({
  pendingId,
  code,
  resolved,
  message,
  contentPreview,
}) {
  const resolvedBool = resolved.ok;
  const embed = new EmbedBuilder()
    .setTitle('Invite pending staff review')
    .setColor(0xffa500)
    .addFields(
      { name: 'Pending id', value: String(pendingId) },
      { name: 'Code', value: code },
      {
        name: 'Resolved',
        value: resolvedBool ? 'Yes (guild id/name from API)' : 'No (expired/invalid or API error)',
        inline: true,
      },
      {
        name: 'Target guild',
        value: resolved.guildId ? `${resolved.guildName || '?'} (\`${resolved.guildId}\`)` : '—',
      },
      { name: 'Author', value: `${message.author.tag} (\`${message.author.id}\`)` },
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Snippet', value: (contentPreview || '*(none)*').slice(0, 900) },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`invq:approve:${pendingId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`invq:blacklist:${pendingId}`)
      .setLabel('Blacklist')
      .setStyle(ButtonStyle.Danger),
  );
  return { embed, row };
}

/**
 * Process invites on a member message. May delete message and queue.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message<boolean>} message
 * @param {string} staffRoleId
 */
async function processMemberMessageInvites(client, message, staffRoleId) {
  const codes = extractInviteCodes(message.content);
  if (!codes.length) return;

  const homeId = message.guild.id;
  const db = client.db.query;

  let member;
  try {
    member = await message.guild.members.fetch(message.author.id);
  } catch {
    return;
  }

  if (hasGuildAdminOrStaffRole(member, staffRoleId)) {
    for (const code of codes) {
      const resolved = await resolveInvite(client, code);
      await auditStaffInvite(client, message, code, resolved);
    }
    return;
  }

  const resolvedList = [];
  for (const code of codes) {
    const resolved = await resolveInvite(client, code);
    resolvedList.push({ code, resolved });
  }

  for (const { code, resolved } of resolvedList) {
    if (await isBlacklistedCode(db, code)) {
      await enforceBlacklist(client, message, `code:${code}`, staffRoleId);
      return;
    }
    if (resolved.guildId && (await isBlacklistedGuild(db, resolved.guildId))) {
      await enforceBlacklist(client, message, `guild:${resolved.guildId}`, staffRoleId);
      return;
    }
  }

  let needsQueue = false;
  for (const { code, resolved } of resolvedList) {
    if (await isWhitelistedCode(db, homeId, code)) continue;
    if (resolved.guildId && (await isWhitelistedGuild(db, homeId, resolved.guildId))) continue;
    needsQueue = true;
    break;
  }
  if (!needsQueue) return;

  try {
    await message.delete().catch(() => {});
  } catch (_) {
    /* ignore */
  }

  const notice = await message.channel
    .send(
      `${message.author}, your invite link has been held for staff review. You'll be notified here when it's approved.`,
    )
    .catch(() => null);
  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), 10_000);
  }

  const cfg = await client.db.getGuildConfigurable(homeId);
  const qChId = inviteQueueChannelId(cfg);
  if (!qChId) {
    client.logger.warn('invitePolicy: no invite queue / modLog channel configured');
    return;
  }

  const queueCh =
    message.guild.channels.cache.get(qChId) || (await message.guild.channels.fetch(qChId).catch(() => null));
  if (!queueCh || !queueCh.isTextBased()) return;

  for (const { code, resolved } of resolvedList) {
    if (await isWhitelistedCode(db, homeId, code)) continue;
    if (resolved.guildId && (await isWhitelistedGuild(db, homeId, resolved.guildId))) continue;

    if (shouldSkipDedupe(homeId, message.author.id, code)) continue;

    const pendingId = await client.db.insertPendingInvite({
      home_guild_id: homeId,
      author_id: message.author.id,
      channel_id: message.channelId,
      invite_code: code.toLowerCase(),
      resolved_guild_id: resolved.guildId,
      resolved_guild_name: resolved.guildName,
      status: 'pending',
    });

    const { embed, row } = buildQueueEmbed({
      pendingId,
      code,
      resolved,
      message,
      contentPreview: message.content,
    });

    const qMsg = await queueCh.send({ embeds: [embed], components: [row] }).catch((e) => {
      client.logger.error('invitePolicy queue send failed', e);
      return null;
    });
    if (qMsg) {
      await client.db.updatePendingInviteQueueMessage(pendingId, qMsg.id);
    }
  }
}

module.exports = {
  extractInviteCodes,
  parseInviteCodeFromUserInput,
  processMemberMessageInvites,
  enforceBlacklist,
  resolveInvite,
  inviteQueueChannelId,
  INVITE_REGEX,
};
