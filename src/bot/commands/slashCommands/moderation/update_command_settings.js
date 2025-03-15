const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
const path = require('path');

let choices = []; // Store choices globally
let batches = []; // Store batches globally

// Fetch command choices from the database
const getChoices = async (client) => {
    const fetchedChoices = await client.db.getCommandSettings();
    return fetchedChoices.map(choice => ({ name: choice.name, value: choice.hash }));
}

// Helper function to chunk the array, limiting the chunk size to 25
const chunkArray = (array, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Function to fetch and chunk the choices before command registration
const fetchAndChunkChoices = async (client) => {
    choices = await getChoices(client); // Fetch choices
    batches = chunkArray(choices, 25);  // Limit chunk size to 25 (Discord API limit)
}

// Function to build the command with dynamic choices, splitting them into multiple options
const buildCommand = () => {
    const command = new SlashCommandBuilder()
        .setName('update_command_settings')
        .setDescription('Updates the channel for a command.')
		.addChannelOption((option) => {
			option.setName('channel')
				.setDescription('The channel to set for the command.')
				.setRequired(true);
			return option;
		});

    // Dynamically add options based on how many batches we have
    batches.forEach((batch, index) => {
        command.addStringOption((option) => {
            option.setName(`commands_${index + 1}`)  // Create unique option names: command1, command2, etc.
                .setDescription(`Select a command from batch ${index + 1}`)
                .setRequired(false)
                .addChoices(...batch); // Add the batch of choices
            return option;
        });
    });

    return command;
}

// Export the command module
module.exports = {
    category: path.basename(__dirname),

    // The `data` property now returns the command built dynamically
    data: async (client) => {
        if (!choices.length) {
            await fetchAndChunkChoices(client); // Fetch choices if not already fetched
        }
        return buildCommand(); // Return the built command with choices
    },

    async execute(client, interaction) {
        try {
            // Ensure choices are fetched before executing the command
            if (!choices.length) {
                await fetchAndChunkChoices(client); // Fetch if choices weren't loaded
            }

            const selectedCommand = interaction.options.getString('commands_1') || 
                                    interaction.options.getString('commands_2') ||
                                    interaction.options.getString('commands_3');

			if (!selectedCommand) {
				return interaction.reply({ content: 'No command selected. Please select a command to set the channel for.', ephemeral: true });
			}

			const channel = interaction.options.getChannel('channel');

            const allowedChannel = await client.db.getAllowedChannel(selectedCommand);
            const guild = client.guilds.cache.get(interaction.guild.id);
            const member = await guild.members.fetch(interaction.user.id);
            const roles = member.roles.cache.map(role => role.id);

            if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
                if (!roles.some(role => client.allowed.includes(role))) {
                    return interaction.reply({ 
                        content: `This command is not allowed in this channel. Please use it in <#${allowedChannel.channel_id}>`, 
                        ephemeral: true 
                    });
                }
            }

            await interaction.deferReply();

            if (!interaction.member.permissions.has("ADMINISTRATOR")) {
                return interaction.followUp('You do not have permission to use this command.');
            }

			await client.db.updateCommandSettings(selectedCommand, channel.id);
			const {name} = await client.db.getCommandSettingsByHash(selectedCommand);

			return interaction.followUp(`The channel for **${name}** has been set to <#${channel.id}>`);
        } catch (error) {
            client.logger.error(error);
            interaction.followUp('An error occurred while trying to set the command settings.');
        }
    }
};

// This function should be called during bot startup to initialize choices
const initializeCommands = async (client) => {
    await fetchAndChunkChoices(client);
};

module.exports.initializeCommands = initializeCommands; // Export the initialization function
