const { MessageFlags } = require('discord.js');
const crypto = require('crypto');
const { modSlashLogicalKey } = require('../../../libs/modSlashKey');

/**
 * Per-command `command_settings` channel check (moved from individual slash files).
 * @param {{ undeferredReply?: boolean }} [options] When true and the interaction was not deferred, uses `reply` instead of `editReply` (needed for `/attention mod|staff` modals).
 * @returns {Promise<boolean>} true if execution should continue; false if an ephemeral reply was sent.
 */
async function assertSlashCommandChannel(client, interaction, options = {}) {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return true;

  const useReply = Boolean(
    options.undeferredReply && !interaction.deferred && !interaction.replied,
  );

  const respond = async (payload) => {
    if (useReply) {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.editReply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  };

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
      await respond({
        content: 'Could not load this server. Please try again in a moment.',
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
      await respond({
        content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`,
      });
      return false;
    }
  }
  return true;
}

module.exports = { assertSlashCommandChannel };
