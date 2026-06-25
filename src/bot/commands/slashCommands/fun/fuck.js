const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const path = require('path');
const config = require('../../../../../config');

/** Fluxpoint `GET /nsfw/gif/{imageType}` — one category picked at random per request. */
const NSFW_GIF_IMAGE_TYPES = ['anal', 'bdsm', 'cum', 'futa', 'hentai', 'neko', 'pussy'];

function channelIsNsfw(channel) {
    if (!channel) return false;
    if (channel.isThread()) {
        return channel.parent?.nsfw === true;
    }
    return channel.nsfw === true;
}

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('fuck')
        .setDescription('bang someone really hard')
        .addUserOption(option => option.setName('target').setDescription('the person you want to bang').setRequired(true)),

    async execute(client, interaction) {

        

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'fuck');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {

            const user = interaction.options.getUser('target');

            let channel = interaction.channel;
            if (!channel && interaction.channelId) {
                channel = await client.channels.fetch(interaction.channelId).catch(() => null);
            }

            if (channelIsNsfw(channel)) {
                if (!config.fluxpointApiKey) {
                    return interaction.editReply({
                        content: 'This command needs `FLUXPOINT_API_KEY` in the environment.',
                        flags: MessageFlags.Ephemeral,
                    });
                }

                const imageType =
                    NSFW_GIF_IMAGE_TYPES[Math.floor(Math.random() * NSFW_GIF_IMAGE_TYPES.length)];
                const apiUrl = `https://api.fluxpoint.dev/nsfw/gif/${imageType}`;

                const response = await client.rateLimitHandler.executeWithRateLimit('fluxpoint-nsfw-gif', async () => {
                    return await axios.get(apiUrl, {
                        headers: { Authorization: config.fluxpointApiKey },
                        timeout: 10000,
                        responseType: 'text',
                        transformResponse: [(d) => d], // keep raw body; we JSON.parse manually below
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

                const embed = new EmbedBuilder()
                    .setDescription(`${interaction.user} bangs the shit out of ${user}`)
                    .setColor(`#${getRandomColor()}`)
                    .setImage(data.file);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('This command can only be used in NSFW channels!');
            }
        } catch (error) {
            client.logger.error('Error executing the fuck command:', error);
            const payload = {
                content: 'Could not load the image (the external API may be down or changed).',
                flags: MessageFlags.Ephemeral,
            };
            try {
                await interaction.editReply(payload);
            } catch {
                await interaction.followUp(payload).catch(() => {});
            }
        }
    },
};