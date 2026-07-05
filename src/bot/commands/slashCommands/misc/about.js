const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const { getSystemHealth } = require('../../../../../libs/systemHealth');
const { hasGuildAdminOrStaffRole } = require('../../../utils/guildPrivileges');

function healthStatusLabel(ok) {
    return ok ? 'OK' : 'Issue';
}

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription("about this bot"),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;

        try {
            const embed = new EmbedBuilder()
                .setTitle('About this bot')
                .setColor(`#${getRandomColor()}`)
                .addFields([
                    { name: 'Bot Name', value: 'IsekaiExpress', inline: true },
                    { name: 'Bot Version', value: '1.1.5', inline: true },
                    { name: 'Bot Author', value: '<@72884988374167552>', inline: true },
                    { name: 'Bot Support', value: 'Contact <@72884988374167552>', inline: true },
                ])
                .setFooter({ text: 'IsekaiExpress', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            const staffRoleId = client.config?.roles?.staff;
            if (hasGuildAdminOrStaffRole(interaction.member, staffRoleId)) {
                const health = await getSystemHealth();
                const phishLine = health.phishGg.enabled
                    ? `${health.phishGg.lastSyncStatus || 'unknown'} (${health.phishGg.lastSyncRelative})`
                    : 'Disabled';

                embed.addFields([
                    {
                        name: 'System · Img API',
                        value: health.imgApi.configured ? 'Configured' : 'Not configured',
                        inline: true,
                    },
                    {
                        name: 'System · Starboard archive',
                        value: health.starboardArchive.enabled
                            ? `${health.starboardArchive.entryCount} entries, ${health.starboardArchive.totalBytesLabel}`
                            : 'Disabled',
                        inline: true,
                    },
                    {
                        name: 'System · phish.gg sync',
                        value: phishLine,
                        inline: true,
                    },
                    {
                        name: 'System · MySQL',
                        value: healthStatusLabel(health.mysql.ok),
                        inline: true,
                    },
                ]);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the about command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};
