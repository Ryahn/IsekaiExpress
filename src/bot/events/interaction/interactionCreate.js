const BaseEvent = require('../../utils/structures/BaseEvent');
const { checkCommandCooldown, setCooldown } = require('../../middleware/commandMiddleware');
const { executeWithRateLimit } = require('../../middleware/apiMiddleware');
const { checkInteractionGlobalCommandLock } = require('../../middleware/globalCommandLock');
const { assertSlashCommandChannel } = require('../../middleware/slashCommandChannel');
const { modSlashLogicalKey } = require('../../../../libs/modSlashKey');
const { handleModerationButton } = require('../../../../libs/moderationButtons');
const { handleModUpdateCommandSettingsAutocomplete } = require('../../commands/slashCommands/moderation/handlers/updateCommandSettingsBuilder');

module.exports = class InteractionEvent extends BaseEvent {
    constructor() {
        super('interactionCreate');
    }
    
    async run(client, interaction) {
        if (interaction.isAutocomplete()) {
            try {
                if (interaction.commandName === 'mod') {
                    const g = interaction.options.getSubcommandGroup(false);
                    const sub = interaction.options.getSubcommand(false);
                    if (g === 'server' && sub === 'update_command_settings') {
                        const focused = interaction.options.getFocused(true);
                        if (focused.name === 'command') {
                            await handleModUpdateCommandSettingsAutocomplete(client, interaction);
                            return;
                        }
                    }
                }
                await interaction.respond([]);
            } catch (e) {
                client.logger.error('Autocomplete error:', e);
                await interaction.respond([]).catch(() => {});
            }
            return;
        }

        if (interaction.isButton()) {
            try {
                const handled = await handleModerationButton(client, interaction);
                if (handled) return;
            } catch (e) {
                client.logger.error('Button interaction error:', e);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        const cooldownKey =
            interaction.commandName === 'mod' ? modSlashLogicalKey(interaction) : interaction.commandName;

        try {
            // Acknowledge within 3s before DB/member fetches, rate-limited execute, or slow handlers.
            await interaction.deferReply();
        } catch (ackErr) {
            client.logger.error('Failed to acknowledge slash interaction:', ackErr);
            return;
        }

        try {
            const globalLock = await checkInteractionGlobalCommandLock(client, interaction);
            if (!globalLock.allowed) {
                return interaction.editReply({ content: globalLock.message, ephemeral: true });
            }
            if (!(await assertSlashCommandChannel(client, interaction))) {
                return;
            }

            // Check cooldown
            const cooldownCheck = checkCommandCooldown(client, interaction.user.id, cooldownKey);
            
            if (cooldownCheck.onCooldown) {
                return interaction.editReply({
                    content: `You are on cooldown! Please wait ${cooldownCheck.remainingTime.toFixed(1)} more seconds.`,
                    ephemeral: true
                });
            }
            
            // Execute command with rate limiting for API calls
            await executeWithRateLimit(client, 'discord-api', async () => {
                await command.execute(client, interaction);
            });
            
            // Set cooldown after successful execution
            setCooldown(client, interaction.user.id, cooldownKey);
        } catch (err) {
            const errText =
                err instanceof Error
                    ? `${err.message}${err.stack ? `\n${err.stack}` : ''}`
                    : String(err);
            client.logger.error(`Slash command error: ${errText}`);
            const payload = { content: 'An error occurred while executing this command.', ephemeral: true };
            try {
                await interaction.editReply(payload);
            } catch {
                await interaction.followUp(payload).catch(() => {});
            }
        }
    }
};