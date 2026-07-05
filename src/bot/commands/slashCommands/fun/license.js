const { AttachmentBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');
const { renderLicense } = require('../../../utils/furryLicense');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('lolilicense')
        .setDescription('Get a qualified loli license'),

    async execute(client, interaction) {
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'lolilicense');
        if (cooldownTime) {
            return interaction.editReply({
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const png = await renderLicense({ templateId: 'loli', user: interaction.user });
            const filename = `lolilicense_${interaction.user.id}_${crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12)}.png`;
            const attachment = new AttachmentBuilder(png, { name: filename });

            return interaction.editReply({ files: [attachment] });
        } catch (error) {
            client.logger?.error?.('Error creating loli license:', error) ?? console.error('Error creating license:', error);
            return interaction.editReply('An error occurred while generating your license.');
        }
    },
};
