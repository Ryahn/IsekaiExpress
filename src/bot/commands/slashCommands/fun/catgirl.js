const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const axios = require('axios');
const path = require('path');
const config = require('../../../../../config');

const FLUXPOINT_NEKO_GIF_URL = 'https://api.fluxpoint.dev/nsfw/gif/neko';

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('catgirl')
        .setDescription('catgirl'),

    async execute(client, interaction) {
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'catgirl');
        if (cooldownTime) {
            return interaction.editReply({
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (!config.fluxpointApiKey) {
            return interaction.editReply({
                content: 'This command needs `FLUXPOINT_API_KEY` in the environment.',
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const response = await client.rateLimitHandler.executeWithRateLimit('fluxpoint-nsfw-gif', async () => {
                return await axios.get(FLUXPOINT_NEKO_GIF_URL, {
                    headers: { Authorization: config.fluxpointApiKey },
                    timeout: 10000,
                    responseType: 'text',
                    transformResponse: [(d) => d],
                    validateStatus: () => true,
                });
            });

            if (response.status < 200 || response.status >= 300) {
                const snippet = String(response.data || '').slice(0, 200);
                throw new Error(`Fluxpoint API ${response.status} ${response.statusText}: ${snippet}`);
            }

            const raw = String(response.data || '');
            let data;
            try {
                data = JSON.parse(raw);
            } catch {
                throw new Error(`Fluxpoint API returned non-JSON (length ${raw.length})`);
            }

            if (typeof data?.file !== 'string' || !data.file) {
                throw new Error('Fluxpoint API response missing file URL');
            }

            await interaction.editReply({ content: data.file });
        } catch (error) {
            client.logger.error('Error executing the catgirl command:', error);
            await interaction.editReply({
                content: 'Could not load the image (the external API may be down or changed).',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
