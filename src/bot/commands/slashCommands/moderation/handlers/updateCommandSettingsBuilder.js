const { MessageFlags } = require('discord.js');
const { PermissionFlagsBits } = require('discord.js');
const { denyEphemeral } = require('../../../../utils/permissionGuards');

function escapeLikeSegment(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} query
 * @returns {Promise<{ name: string, value: string }[]>}
 */
async function getCommandAutocompleteChoices(client, query) {
  const raw = String(query || '').trim().slice(0, 80);
  const db = client.db.query;
  let rows;
  if (!raw) {
    rows = await db('command_settings').select('name', 'hash').orderBy('name', 'asc').limit(25);
  } else {
    const safe = escapeLikeSegment(raw);
    const pattern = `%${safe}%`;
    rows = await db('command_settings')
      .select('name', 'hash')
      .where(function esc() {
        this.where('name', 'like', pattern).orWhere('hash', 'like', pattern);
      })
      .orderBy('name', 'asc')
      .limit(25);
  }
  return rows.map((r) => ({
    name: String(r.name).slice(0, 100),
    value: String(r.hash),
  }));
}

/**
 * @param {import('@discordjs/builders').SlashCommandSubcommandBuilder} sub
 */
function augmentUpdateCommandSubcommand(sub) {
  sub.addStringOption((option) => {
    option
      .setName('command')
      .setDescription('Start typing to search commands')
      .setRequired(true)
      .setAutocomplete(true);
    return option;
  });
}

async function updateCommandSettingsExecute(client, interaction) {
  try {
    const selectedCommand = interaction.options.getString('command', true);

    const channel = interaction.options.getChannel('channel', true);

    // KEPT Administrator-only: command_settings is a global (non guild-scoped) table; a change
    // here affects the command's allowed channel for every guild the bot serves.
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return denyEphemeral(interaction, 'You do not have permission to use this command (Administrator only).');
    }

    await client.db.updateCommandSettings(selectedCommand, channel.id);
    const row = await client.db.getCommandSettingsByHash(selectedCommand);
    if (!row) {
      return interaction.followUp({
        content: 'Updated channel, but could not reload command settings row.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.followUp(`The channel for **${row.name}** has been set to <#${channel.id}>`);
  } catch (error) {
    client.logger.error(error);
    return interaction.followUp('An error occurred while trying to set the command settings.');
  }
}

/**
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
async function handleModUpdateCommandSettingsAutocomplete(client, interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.type !== 3) {
    await interaction.respond([]);
    return;
  }
  try {
    const choices = await getCommandAutocompleteChoices(client, focused.value);
    await interaction.respond(choices);
  } catch (e) {
    client.logger.error('command_settings autocomplete failed:', e);
    await interaction.respond([]).catch(() => {});
  }
}

module.exports = {
  getCommandAutocompleteChoices,
  augmentUpdateCommandSubcommand,
  updateCommandSettingsExecute,
  handleModUpdateCommandSettingsAutocomplete,
};
