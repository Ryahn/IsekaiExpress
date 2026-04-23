import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { farmManager } from '../../../utils/farmManager.js';

/**
 * Turn the farm minigame on or off for the entire guild (admin only).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {boolean} enabled
 */
export async function farmServerMinigameCommand(interaction, enabled) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
            content: 'Only administrators can enable or disable the farm minigame for the server.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const guildId = interaction.guildId;
    await farmManager.setGuildMinigameEnabled(guildId, enabled);

    const prefix = await farmManager.getServerPrefix(guildId);
    const message = enabled
        ? `Farm minigame is **on** for this server. Players can use \`${prefix}help\` (personal \`/farm disable\` still opts out).`
        : 'Farm minigame is **off** for this server. Prefix farm commands are disabled for everyone.';

    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
    });
}
