const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
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
                ephemeral: true 
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
                        ephemeral: true,
                    });
                }

                const imageType =
                    NSFW_GIF_IMAGE_TYPES[Math.floor(Math.random() * NSFW_GIF_IMAGE_TYPES.length)];
                const apiUrl = `https://api.fluxpoint.dev/nsfw/gif/${imageType}`;

                const response = await client.rateLimitHandler.executeWithRateLimit('fluxpoint-nsfw-gif', async () => {
                    return await fetch(apiUrl, {
                        headers: { Authorization: config.fluxpointApiKey },
                    });
                });
                if (!response.ok) {
                    const snippet = (await response.text()).slice(0, 200);
                    throw new Error(`Fluxpoint API ${response.status} ${response.statusText}: ${snippet}`);
                }
                const raw = await response.text();
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
            const errText =
                error instanceof Error
                    ? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
                    : String(error);
            client.logger.error(`Error executing the fuck command: ${errText}`);
            const payload = {
                content: 'Could not load the image (the external API may be down or changed).',
                ephemeral: true,
            };
            try {
                await interaction.editReply(payload);
            } catch {
                await interaction.followUp(payload).catch(() => {});
            }
        }
    },
};