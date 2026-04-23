import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { farmEnableCommand } from './enable.js';
import { farmPrefixCommand } from './prefix.js';
import { farmServerMinigameCommand } from './serverMinigame.js';

export const data = new SlashCommandBuilder()
    .setName('farm')
    .setDescription('Farming minigame settings')
    .addSubcommandGroup(group =>
        group
            .setName('server')
            .setDescription('Server-wide minigame on/off (administrators)')
            .addSubcommand(sub =>
                sub
                    .setName('on')
                    .setDescription('Enable the farm minigame for this server')
            )
            .addSubcommand(sub =>
                sub
                    .setName('off')
                    .setDescription('Disable the farm minigame for this server')
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('enable')
            .setDescription('Enable farming mode for yourself (personal)')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('disable')
            .setDescription('Disable farming mode for yourself (personal)')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('prefix')
            .setDescription('Change farm command prefix (default: h)')
            .addStringOption(option =>
                option
                    .setName('prefix')
                    .setDescription('New prefix (1-3 characters, no spaces)')
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(3)
            )
    );

export async function execute(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    if (subcommandGroup === 'server') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'on') await farmServerMinigameCommand(interaction, true);
        else if (sub === 'off') await farmServerMinigameCommand(interaction, false);
        else {
            await interaction.reply({
                content: 'Unknown farm server subcommand.',
                flags: MessageFlags.Ephemeral
            });
        }
        return;
    }
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case 'enable':
            await farmEnableCommand(interaction, 'enable');
            break;
        case 'disable':
            await farmEnableCommand(interaction, 'disable');
            break;
        case 'prefix':
            await farmPrefixCommand(interaction);
            break;
        default:
            await interaction.reply({
                content: 'Unknown farm subcommand.',
                flags: MessageFlags.Ephemeral
            });
    }
}
