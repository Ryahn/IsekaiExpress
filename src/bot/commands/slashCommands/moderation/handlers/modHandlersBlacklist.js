const { EmbedBuilder } = require('discord.js');
const { hasGuildAdminOrStaffRole } = require('../../../../utils/guildPrivileges');
const { resolveInvite } = require('../../../../../../libs/invitePolicy');

async function assertStaff(interaction, client) {
  if (!hasGuildAdminOrStaffRole(interaction.member, client.config.roles.staff)) {
    await interaction.editReply({ content: 'You need the staff role or Administrator.', ephemeral: true });
    return false;
  }
  return true;
}

async function blacklistAddGuildExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const inviteStr = interaction.options.getString('invite', true);
  const reason = interaction.options.getString('reason') || null;
  const codes = inviteStr.match(/(?:discord\.(?:gg|com\/invite)\/|dsc\.gg\/)([a-zA-Z0-9-]+)/i);
  const code = codes ? codes[1] : inviteStr.trim().split('/').pop();
  const resolved = await resolveInvite(client, code);
  if (!resolved.guildId) {
    return interaction.editReply({
      content: 'Could not resolve invite to a guild id. Add by code with `/mod blacklist add-invite` instead.',
      ephemeral: true,
    });
  }
  await client.db.sql(
    `INSERT INTO blacklisted_guilds (guild_id, guild_name, reason, added_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE guild_name = VALUES(guild_name), reason = VALUES(reason), added_by = VALUES(added_by)`,
    [resolved.guildId, resolved.guildName, reason, interaction.user.id],
  );
  await interaction.editReply(`Blacklisted guild **${resolved.guildName || resolved.guildId}** (\`${resolved.guildId}\`).`);
}

async function blacklistAddInviteExecute(client, interaction) {
  if (!(await assertStaff(interaction, client))) return;
  const code = interaction.options.getString('code', true).toLowerCase().trim();
  const reason = interaction.options.getString('reason') || null;
  const resolved = await resolveInvite(client, code);
  await client.db.sql(
    `INSERT INTO blacklisted_invites (code, resolved_guild_id, reason, added_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE resolved_guild_id = VALUES(resolved_guild_id), reason = VALUES(reason), added_by = VALUES(added_by)`,
    [code, resolved.guildId, reason, interaction.user.id],
  );
  await interaction.editReply(`Blacklisted invite code \`${code}\`.`);
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
  const codes = inviteStr.match(/(?:discord\.(?:gg|com\/invite)\/|dsc\.gg\/)([a-zA-Z0-9-]+)/i);
  const code = codes ? codes[1] : inviteStr.trim().split('/').pop();
  const resolved = await resolveInvite(client, code);
  const hitCode = await client.db.query('blacklisted_invites').where({ code: code.toLowerCase() }).first();
  let hitGuild = null;
  if (resolved.guildId) {
    hitGuild = await client.db.query('blacklisted_guilds').where({ guild_id: resolved.guildId }).first();
  }
  await interaction.editReply({
    content: `Code \`${code}\`: ${hitCode ? '**BLACKLISTED (code)**' : 'not on code blacklist'} | Guild: ${
      hitGuild ? '**BLACKLISTED (guild)**' : 'not on guild blacklist'
    } | Resolved: ${resolved.ok ? `${resolved.guildName} (\`${resolved.guildId}\`)` : 'no'}`,
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
