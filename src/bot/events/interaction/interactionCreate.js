const BaseEvent = require('../../utils/structures/BaseEvent');
const { checkCommandCooldown, setCooldown } = require('../../middleware/commandMiddleware');
const { executeWithRateLimit } = require('../../middleware/apiMiddleware');

module.exports = class InteractionEvent extends BaseEvent {
    constructor() {
        super('interactionCreate');
    }
    
    async run(client, interaction) {
        if (!interaction.isCommand()) return;

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        try {
            // Check cooldown
            const cooldownCheck = checkCommandCooldown(client, interaction.user.id, interaction.commandName);
            
            if (cooldownCheck.onCooldown) {
                return interaction.reply({
                    content: `You are on cooldown! Please wait ${cooldownCheck.remainingTime.toFixed(1)} more seconds.`,
                    ephemeral: true
                });
            }
            
            // Execute command with rate limiting for API calls
            await executeWithRateLimit(client, 'discord-api', async () => {
                await command.execute(client, interaction);
            });
            
            // Set cooldown after successful execution
            setCooldown(client, interaction.user.id, interaction.commandName);
        } catch (err) {
            client.logger.error(err);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: `An error occurred while executing this command.`,
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: `An error occurred while executing this command.`
                });
            }
        }
    }
};