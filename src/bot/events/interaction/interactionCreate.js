const { MessageFlags } = require('discord.js');
const BaseEvent = require('../../utils/structures/BaseEvent');
const { checkCommandCooldown, setCooldown } = require('../../middleware/commandMiddleware');
const { executeWithRateLimit } = require('../../middleware/apiMiddleware');
const { checkInteractionGlobalCommandLock } = require('../../middleware/globalCommandLock');
const { assertSlashCommandChannel } = require('../../middleware/slashCommandChannel');
const { modSlashLogicalKey } = require('../../../../libs/modSlashKey');
const { handleModerationButton } = require('../../../../libs/moderationButtons');
const { handleAttentionButton } = require('../../../../libs/attentionButtons');
const { handleAttentionModalSubmit, handleAttentionTypeSelect } = require('../../../../libs/attentionFlow');
const { handleModUpdateCommandSettingsAutocomplete } = require('../../commands/slashCommands/moderation/handlers/updateCommandSettingsBuilder');
const { handleCustomCommandModalSubmit } = require('../../commands/slashCommands/moderation/custom_command');
const { isConfiguredGuild, logUnexpectedGuildOnce } = require('../../utils/singleGuildGuard');

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {string} content
 */
async function replyOrEditEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (e) {
    try {
      await interaction.followUp(payload);
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = class InteractionEvent extends BaseEvent {
  constructor() {
    super('interactionCreate');
  }

  async run(client, interaction) {
    if (!isConfiguredGuild(client, interaction.guildId)) {
      logUnexpectedGuildOnce(client, interaction.guildId, 'interactionCreate');
      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => {});
        return;
      }
      if (interaction.isRepliable()) {
        await replyOrEditEphemeral(interaction, 'This bot is only configured for its primary server.');
      }
      return;
    }

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

    if (interaction.isModalSubmit()) {
      if (interaction.customId?.startsWith('custom_command:')) {
        try {
          if (await handleCustomCommandModalSubmit(client, interaction)) return;
        } catch (e) {
          client.logger.error('Custom command modal submit error:', e);
          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                content: 'An error occurred while saving the custom command.',
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await interaction.reply({
                content: 'An error occurred while saving the custom command.',
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch (_) {
            /* ignore */
          }
        }
        return;
      }

      if (interaction.customId?.startsWith('attention:form:')) {
        try {
          await handleAttentionModalSubmit(client, interaction);
        } catch (e) {
          client.logger.error('Attention modal submit error:', e);
          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                content: 'An error occurred while submitting.',
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await interaction.reply({
                content: 'An error occurred while submitting.',
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch (_) {
            /* ignore */
          }
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        if (await handleAttentionTypeSelect(client, interaction)) return;
      } catch (e) {
        client.logger.error('Attention select menu error:', e);
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        if (await handleAttentionButton(client, interaction)) return;
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

    const attentionSub =
      interaction.commandName === 'attention' ? interaction.options.getSubcommand(false) : null;
    const skipDefer =
      (interaction.commandName === 'attention' && (attentionSub === 'mod' || attentionSub === 'staff')) ||
      interaction.commandName === 'custom_command';

    const cooldownKey =
      interaction.commandName === 'mod'
        ? modSlashLogicalKey(interaction)
        : interaction.commandName === 'attention' &&
            attentionSub &&
            ['mod', 'staff', 'config', 'archive', 'prune'].includes(attentionSub)
          ? `attention:${attentionSub}`
          : interaction.commandName;

    if (!skipDefer) {
      try {
        await interaction.deferReply();
      } catch (ackErr) {
        client.logger.error('Failed to acknowledge slash interaction:', ackErr);
        return;
      }
    }

    try {
      const globalLock = await checkInteractionGlobalCommandLock(client, interaction);
      if (!globalLock.allowed) {
        return replyOrEditEphemeral(interaction, globalLock.message);
      }
      if (!(await assertSlashCommandChannel(client, interaction, { undeferredReply: skipDefer }))) {
        return;
      }

      const cooldownCheck = checkCommandCooldown(client, interaction.user.id, cooldownKey);

      if (cooldownCheck.onCooldown) {
        return replyOrEditEphemeral(
          interaction,
          `You are on cooldown! Please wait ${cooldownCheck.remainingTime.toFixed(1)} more seconds.`,
        );
      }

      await executeWithRateLimit(client, 'discord-api', async () => {
        await command.execute(client, interaction);
      });

      setCooldown(client, interaction.user.id, cooldownKey);
    } catch (err) {
      const errText =
        err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack}` : ''}` : String(err);
      client.logger.error(`Slash command error: ${errText}`);
      await replyOrEditEphemeral(interaction, 'An error occurred while executing this command.');
    }
  }
};
