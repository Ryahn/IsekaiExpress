import { MessageFlags } from 'discord.js';
import { farmManager } from '../../../utils/farmManager.js';

export async function farmEnableCommand(interaction, action) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const enabled = action === 'enable';
    await farmManager.setFarmingEnabled(userId, guildId, enabled);

    const prefix = await farmManager.getServerPrefix(guildId);
    const message = enabled
        ? `Personal farming enabled! Use \`${prefix}help\` for commands. (Server minigame must be on: \`/farm server on\`.)`
        : 'Personal farming disabled. (Admins: use `/farm server off` to stop the minigame for everyone.)';

    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
    });
}
