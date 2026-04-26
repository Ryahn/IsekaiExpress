let choices = [];
let batches = [];

async function getChoices(client) {
  const fetchedChoices = await client.db.query('command_settings').select('name', 'hash').orderBy('name', 'asc');
  return fetchedChoices.map((choice) => ({ name: choice.name, value: choice.hash }));
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchAndChunkChoices(client) {
  choices = await getChoices(client);
  batches = chunkArray(choices, 25);
}

/**
 * @param {import('@discordjs/builders').SlashCommandSubcommandBuilder} sub
 */
function augmentUpdateCommandSubcommand(sub) {
  batches.forEach((batch, index) => {
    sub.addStringOption((option) => {
      option
        .setName(`commands_${index + 1}`)
        .setDescription(`Select a command from batch ${index + 1}`)
        .setRequired(false)
        .addChoices(...batch);
      return option;
    });
  });
}

async function updateCommandSettingsExecute(client, interaction) {
  try {
    if (!choices.length) {
      await fetchAndChunkChoices(client);
    }

    const selectedCommand =
      interaction.options.getString('commands_1') ||
      interaction.options.getString('commands_2') ||
      interaction.options.getString('commands_3');

    if (!selectedCommand) {
      return interaction.editReply({
        content: 'No command selected. Please select a command to set the channel for.',
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel');

    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      return interaction.followUp('You do not have permission to use this command.');
    }

    await client.db.updateCommandSettings(selectedCommand, channel.id);
    const row = await client.db.getCommandSettingsByHash(selectedCommand);
    if (!row) {
      return interaction.followUp({
        content: 'Updated channel, but could not reload command settings row.',
        ephemeral: true,
      });
    }

    return interaction.followUp(`The channel for **${row.name}** has been set to <#${channel.id}>`);
  } catch (error) {
    client.logger.error(error);
    return interaction.followUp('An error occurred while trying to set the command settings.');
  }
}

module.exports = {
  fetchAndChunkChoices,
  augmentUpdateCommandSubcommand,
  updateCommandSettingsExecute,
};
