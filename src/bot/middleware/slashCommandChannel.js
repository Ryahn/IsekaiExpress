const crypto = require('crypto');
const { modSlashLogicalKey } = require('../../../libs/modSlashKey');

/**
 * Per-command `command_settings` channel check (moved from individual slash files).
 * @returns {Promise<boolean>} true if execution should continue; false if an ephemeral reply was sent.
 */
async function assertSlashCommandChannel(client, interaction) {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return true;

  const logical =
    interaction.commandName === 'mod' ? modSlashLogicalKey(interaction) : interaction.commandName;
  const hash = crypto.createHash('md5').update(logical).digest('hex');
  const allowedChannel = await client.db.getAllowedChannel(hash);
  if (!allowedChannel) return true;

  let guild = client.guilds.cache.get(interaction.guildId);
  if (!guild) {
    try {
      guild = await client.guilds.fetch(interaction.guildId);
    } catch {
      await interaction.editReply({
        content: 'Could not load this server. Please try again in a moment.',
        ephemeral: true
      });
      return false;
    }
  }
  const member = await guild.members.fetch(interaction.user.id);
  const roles = member.roles.cache.map((role) => role.id);
  if (
    allowedChannel.channel_id === 'all' ||
    allowedChannel.channel_id !== interaction.channelId
  ) {
    if (!roles.some((role) => client.allowed?.includes(role))) {
      await interaction.editReply({
        content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`,
        ephemeral: true
      });
      return false;
    }
  }
  return true;
}

module.exports = { assertSlashCommandChannel };
