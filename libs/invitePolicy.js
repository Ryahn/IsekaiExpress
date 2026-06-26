const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { hasGuildAdminOrStaffRole, hasGuildAdminOrModRole } = require('../src/bot/utils/guildPrivileges');
const { withModLogRolePing } = require('./modLogNotify');

const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite\/|discord\.gg\/|dsc\.gg\/)([a-zA-Z0-9-]+)/gi;

const DEDUPE_MS = 5 * 60 * 1000;
const MAX_INVITES_PER_MESSAGE = 10;
const INVITE_RESOLUTION_CACHE_MS = 5 * 60 * 1000;
const inviteDedupe = new Map();
const inviteResolutionCache = new Map();

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
    out.add(m[1].toLowerCase());
    if (out.size >= MAX_INVITES_PER_MESSAGE) break;
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
  const normalizedCode = String(code || '').toLowerCase();
  const cached = inviteResolutionCache.get(normalizedCode);
  if (cached && Date.now() - cached.cachedAt < INVITE_RESOLUTION_CACHE_MS) {
    return { ...cached.resolved };
  }

  const failed = (unresolvable) => ({
    ok: false,
    guildId: null,
    guildName: null,
    channelId: null,
    channelName: null,
    unresolvable,
  });
  let resolved;
  try {
    const inv = await client.fetchInvite(normalizedCode);
    resolved = {
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
      resolved = failed('unknown_invite');
    } else if (apiCode != null) {
      resolved = failed(`api_${apiCode}`);
    } else {
      resolved = failed('error');
    }
  }
  inviteResolutionCache.set(normalizedCode, { cachedAt: Date.now(), resolved });
  return { ...resolved };
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

async function loadInvitePolicyMatches(db, homeGuildId, resolvedList) {
  const codes = [...new Set(resolvedList.map(({ code }) => code.toLowerCase()))];
  const guildIds = [...new Set(
    resolvedList
      .map(({ resolved }) => resolved.guildId)
      .filter(Boolean),
  )];

  const [
    blacklistedCodes,
    blacklistedGuilds,
    whitelistedCodes,
    whitelistedGuilds,
  ] = await Promise.all([
    codes.length
      ? db('blacklisted_invites').select('code').whereIn('code', codes)
      : [],
    guildIds.length
      ? db('blacklisted_guilds').select('guild_id').whereIn('guild_id', guildIds)
      : [],
    codes.length
      ? db('whitelisted_invites')
        .select('code')
        .where({ home_guild_id: homeGuildId })
        .whereIn('code', codes)
      : [],
    guildIds.length
      ? db('whitelisted_guilds')
        .select('target_guild_id')
        .where({ home_guild_id: homeGuildId })
        .whereIn('target_guild_id', guildIds)
      : [],
  ]);

  return {
    blacklistedCodes: new Set(blacklistedCodes.map((row) => String(row.code).toLowerCase())),
    blacklistedGuilds: new Set(blacklistedGuilds.map((row) => String(row.guild_id))),
    whitelistedCodes: new Set(whitelistedCodes.map((row) => String(row.code).toLowerCase())),
    whitelistedGuilds: new Set(whitelistedGuilds.map((row) => String(row.target_guild_id))),
  };
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

async function enforceBlacklist(client, message, matchedOn, staffRoleId, modRoleId) {
  const guild = message.guild;
  const cfg = await client.db.getGuildConfigurable(guild.id);
  const logChannelId = cfg?.modLogId;
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  const isStaff = hasGuildAdminOrStaffRole(member, staffRoleId);
  const isMod = hasGuildAdminOrModRole(member, staffRoleId, modRoleId);

  const embed = buildEvidenceEmbed(message, matchedOn);

  if (isStaff || isMod) {
    if (logChannelId) {
      const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (ch && ch.isTextBased()) {
        await ch.send(
          withModLogRolePing(cfg, {
            content: 'Staff/mod posted blacklisted invite — no ban applied.',
            embeds: [embed],
          }),
        );
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
        await ch
          .send(withModLogRolePing(cfg, { content: `Ban failed: ${e.message}`, embeds: [embed] }))
          .catch(() => {});
      }
    }
    return;
  }

  if (logChannelId) {
    const ch = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
    if (ch && ch.isTextBased()) {
      await ch.send(withModLogRolePing(cfg, { embeds: [embed] })).catch(() => {});
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
      withModLogRolePing(cfg, {
        content: `[Invite audit] ${message.author.tag} in <#${message.channelId}> — code \`${code}\`${extra}`,
      }),
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
async function processMemberMessageInvites(client, message, staffRoleId, modRoleId) {
  const codes = extractInviteCodes(message.content);
  if (!codes.length) return;

  const homeId = message.guild.id;
  const db = client.db.query;

  let member;
  try {
    member =
      message.member ||
      message.guild.members.cache.get(message.author.id) ||
      await message.guild.members.fetch(message.author.id);
  } catch {
    return;
  }

  if (hasGuildAdminOrStaffRole(member, staffRoleId) || hasGuildAdminOrModRole(member, staffRoleId, modRoleId)) {
    for (const code of codes) {
      const resolved = await resolveInvite(client, code);
      await auditStaffInvite(client, message, code, resolved);
    }
    return;
  }

  const resolvedList = await Promise.all(
    codes.map(async (code) => ({ code, resolved: await resolveInvite(client, code) })),
  );
  const policy = await loadInvitePolicyMatches(db, homeId, resolvedList);

  for (const { code, resolved } of resolvedList) {
    if (policy.blacklistedCodes.has(code)) {
      await enforceBlacklist(client, message, `code:${code}`, staffRoleId, modRoleId);
      return;
    }
    if (resolved.guildId && policy.blacklistedGuilds.has(resolved.guildId)) {
      await enforceBlacklist(client, message, `guild:${resolved.guildId}`, staffRoleId, modRoleId);
      return;
    }
  }

  let needsQueue = false;
  for (const { code, resolved } of resolvedList) {
    if (policy.whitelistedCodes.has(code)) continue;
    if (resolved.guildId && policy.whitelistedGuilds.has(resolved.guildId)) continue;
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
    if (policy.whitelistedCodes.has(code)) continue;
    if (resolved.guildId && policy.whitelistedGuilds.has(resolved.guildId)) continue;

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
