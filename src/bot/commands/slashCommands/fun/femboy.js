const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('femboy')
        .setDescription("femboy")
		.addStringOption(option => option.setName('tags').setDescription('The tags to search for on Gelbooru').setRequired(true)),

    async execute(client, interaction) {

		
		
		const { getRandomColor } = client.utils;

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'femboy');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    
		const query = interaction.options.getString('tags');

		const api = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(query)}&api_key=${client.config.femboy.apiKey}&user_id=${client.config.femboy.userId}`;

		const response = await client.rateLimitHandler.executeWithRateLimit('gelbooru-api', async () => {
			return await axios.get(api, { timeout: 10000, validateStatus: () => true });
		});
		if (response.status < 200 || response.status >= 300) return interaction.editReply({ content: 'No results found', flags: MessageFlags.Ephemeral });

		const data = response.data;
		if (!data.post || data.post.length <= 0) return interaction.editReply({ content: 'No results found', flags: MessageFlags.Ephemeral });

		const index = Math.floor(Math.random() * data.post.length);
		
		const post = data.post[index];
		const sourceUrl = post.source.startsWith('http://') || post.source.startsWith('https://') 
		? post.source 
		: `https://${post.source}`;

		const embed = new EmbedBuilder()
			.setTitle('Femboy')
			.addFields({ name: 'Tags', value: `${post.tags}`, inline: false })
			.addFields({ name: 'Source', value: `[Click here](${sourceUrl})`, inline: false })
			.setColor(`#${getRandomColor()}`)

		await interaction.editReply({
			content: `${interaction.user} wants ${query}`,
			embeds: [embed],
			allowedMentions: { users: [] },
		});
		await interaction.followUp(`|| ${post.file_url} ||`);

    },
};