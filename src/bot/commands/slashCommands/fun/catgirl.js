const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('catgirl')
        .setDescription('catgirl')
        .addStringOption((option) => option
            .setName('tags')
            .setDescription('Optional Gelbooru tags (defaults to catgirl)')
            .setRequired(false)),

    async execute(client, interaction) {
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'catgirl');
        if (cooldownTime) {
            return interaction.editReply({
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const query = interaction.options.getString('tags') || 'catgirl';

        const api = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(query)}&api_key=${client.config.femboy.apiKey}&user_id=${client.config.femboy.userId}`;

        const response = await client.rateLimitHandler.executeWithRateLimit('gelbooru-api', async () => {
            return await axios.get(api, { timeout: 10000, validateStatus: () => true });
        });
        if (response.status < 200 || response.status >= 300) {
            return interaction.editReply({ content: 'No results found', flags: MessageFlags.Ephemeral });
        }

        const data = response.data;
        if (!data.post || data.post.length <= 0) {
            return interaction.editReply({ content: 'No results found', flags: MessageFlags.Ephemeral });
        }

        const post = data.post[Math.floor(Math.random() * data.post.length)];

        const embed = new EmbedBuilder()
            .setColor(0xf5a623)
            .setTitle('Catgirl')
            .setImage(post.file_url);

        await interaction.editReply({ embeds: [embed] });
    },
};
