const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');
const { resolveInvite, parseInviteCodeFromUserInput } = require('../../../../../../libs/invitePolicy');

async function assertStaff(interaction, client) {
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    await interaction.editReply({ content: 'You need the staff role or Administrator.', ephemeral: true });
    return false;
  }
  return true;
}

const SNOWFLAKE_RE = /^\d{17,20}$/;

async function resolveGuildNameFromId(client, guildId) {
  const cached = client.guilds.cache.get(guildId);
  if (cached?.name) return cached.name;
  try {
    const fetched = await client.guilds.fetch(guildId);
    return fetched?.name || null;
  } catch {
    return null;
  }
}

async function blacklistAddGuildExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const inviteStr = interaction.options.getString('invite');
  const guildIdInput = (interaction.options.getString('guild_id') || '').trim();
  const explicitName = (interaction.options.getString('name') || '').trim() || null;
  const reason = interaction.options.getString('reason') || null;

  if (!inviteStr && !guildIdInput) {
    return interaction.editReply({
      content: 'Provide either `invite` (URL/code) or `guild_id` (snowflake).',
      ephemeral: true,
    });
  }

  if (guildIdInput) {
    if (!SNOWFLAKE_RE.test(guildIdInput)) {
      return interaction.editReply({
        content: `\`${guildIdInput}\` is not a valid Discord guild id (expected a 17-20 digit snowflake).`,
        ephemeral: true,
      });
    }
    const resolvedName = explicitName || (await resolveGuildNameFromId(client, guildIdInput));
    await client.db.sql(
      `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
      [guildIdInput, resolvedName, reason, interaction.user.id],
    );
    return interaction.editReply(
      `Blacklisted guild **${resolvedName || guildIdInput}** (\`${guildIdInput}\`)${
        resolvedName ? '' : ' — name unknown (bot is not in the guild and no `name` was provided).'
      }`,
    );
  }

  const code = parseInviteCodeFromUserInput(inviteStr);
  if (!code) {
    return interaction.editReply({
      content: 'Could not parse an invite code from that input. Paste a discord.gg / discord.com/invite / discordapp.com link, the code alone, or use `guild_id` instead.',
      ephemeral: true,
    });
  }
  const resolved = await resolveInvite(client, code);
  if (!resolved.guildId) {
    const isGone =
      resolved.unresolvable === 'unknown_invite' ||
      String(resolved.unresolvable || '').startsWith('api_');
    const body = isGone
      ? 'Discord does not recognize this invite anymore (usually **expired**, **revoked**, or **max uses**). Pass `guild_id` directly if you know it, or use `/mod blacklist add-invite` to block just the code.'
      : 'Could not resolve this invite. Pass `guild_id` directly, or use `/mod blacklist add-invite` to block by code only.';
    return interaction.editReply({ content: body, ephemeral: true });
  }
  await client.db.sql(
    `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
    [resolved.guildId, explicitName || resolved.guildName, reason, interaction.user.id],
  );
  await interaction.editReply(
    `Blacklisted guild **${explicitName || resolved.guildName || resolved.guildId}** (\`${resolved.guildId}\`).`,
  );
}

async function blacklistAddInviteExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const raw = interaction.options.getString('code', true);
  const code = parseInviteCodeFromUserInput(raw);
  if (!code) {
    return interaction.editReply({
      content: 'Could not parse an invite code from that input. Paste a discord.gg / discord.com/invite / discordapp.com link or the code alone.',
      ephemeral: true,
    });
  }
  const reason = interaction.options.getString('reason') || null;
  const resolved = await resolveInvite(client, code);
  await client.db.sql(
    `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
    [code, resolved.guildId, reason, interaction.user.id],
  );
  if (resolved.guildId) {
    await client.db.sql(
      `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
      [resolved.guildId, resolved.guildName, reason, interaction.user.id],
    );
  }
  const resolveNote = resolved.guildId
    ? ` Resolved guild **${resolved.guildName || resolved.guildId}** (\`${resolved.guildId}\`) — also added to guild blacklist.`
    : resolved.unresolvable === 'unknown_invite'
      ? ' Discord reports this invite as unknown (often expired/revoked) — **the code is still blacklisted**; no guild row until a working invite for that server exists.'
      : ' Discord could not resolve a guild for this code — **the code is still blacklisted**.';
  await interaction.editReply(`Blacklisted invite code \`${code}\`.${resolveNote}`);
}

async function blacklistRemoveExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const value = interaction.options.getString('value', true).trim();
  const n = await client.db.query('blacklisted_invites').where({ code: value.toLowerCase() }).delete();
  if (n) {
    return interaction.editReply(`Removed blacklisted invite code \`${value}\`.`);
  }
  const n2 = await client.db.query('blacklisted_guilds').where({ guild_id: value }).delete();
  if (n2) {
    return interaction.editReply(`Removed blacklisted guild \`${value}\`.`);
  }
  await interaction.editReply({ content: 'No matching blacklist row (try exact code or guild id).', ephemeral: true });
}

async function blacklistListExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const guilds = await client.db.query('blacklisted_guilds').select('*').limit(15);
  const invites = await client.db.query('blacklisted_invites').select('*').limit(15);
  const embed = new EmbedBuilder()
    .setTitle('Blacklist (first 15 each)')
    .setColor(0xe74c3c)
    .addFields(
      {
        name: 'Guilds',
        value: guilds.length ? guilds.map((g) => `\`${g.guild_id}\` ${g.guild_name || ''}`).join('\n') : '—',
      },
      {
        name: 'Invites',
        value: invites.length ? invites.map((i) => `\`${i.code}\``).join('\n') : '—',
      },
    );
  await interaction.editReply({ embeds: [embed] });
}

async function blacklistCheckExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const inviteStr = interaction.options.getString('invite', true);
  const code = parseInviteCodeFromUserInput(inviteStr);
  if (!code) {
    return interaction.editReply({
      content: 'Could not parse an invite code from that input.',
      ephemeral: true,
    });
  }
  const resolved = await resolveInvite(client, code);
  const hitCode = await client.db.query('blacklisted_invites').where({ code: code.toLowerCase() }).first();
  let hitGuild = null;
  if (resolved.guildId) {
    hitGuild = await client.db.query('blacklisted_guilds').where({ guild_id: resolved.guildId }).first();
  }
  const resolvedLine = resolved.guildId
    ? `${resolved.guildName} (\`${resolved.guildId}\`)`
    : resolved.unresolvable === 'unknown_invite'
      ? 'no (Discord: unknown invite — often expired/revoked)'
      : 'no';
  await interaction.editReply({
    content: `Code \`${code}\`: ${hitCode ? '**BLACKLISTED (code)**' : 'not on code blacklist'} | Guild: ${
      hitGuild ? '**BLACKLISTED (guild)**' : 'not on guild blacklist'
    } | Resolved: ${resolvedLine}`,
    ephemeral: true,
  });
}

module.exports = {
  blacklistAddGuildExecute,
  blacklistAddInviteExecute,
  blacklistRemoveExecute,
  blacklistListExecute,
  blacklistCheckExecute,
};
