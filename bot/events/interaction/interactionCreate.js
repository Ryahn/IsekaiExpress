const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');

module.exports = class InteractionEvent extends BaseEvent {
    constructor() {
        super('interactionCreate');
    }

    async run(client, interaction) {
        if (!interaction.isCommand()) return;

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        // Check if the interaction is still valid
        if (!interaction.isRepliable()) {
            console.log('Interaction is no longer valid. Skipping response.');
            return;
        }

        try {
            await command.execute(client, interaction);
        } catch (error) {
            console.error('Error executing command:', error);

            // Determine the appropriate reply method
            const replyMethod = interaction.deferred || interaction.replied ? 'followUp' : 'reply';

            try {
                await interaction[replyMethod]({
                    content: 'An error occurred while executing this command.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    }
}