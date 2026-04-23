const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
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
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
    
		const query = interaction.options.getString('query');

		const api = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${query}&api_key=${client.config.femboy.apiKey}&user_id=${client.config.femboy.userId}`;

		const response = await client.rateLimitHandler.executeWithRateLimit('gelbooru-api', async () => {
			return await fetch(api);
		});
		if (!response.ok) return interaction.reply({ content: 'No results found', ephemeral: true });

		const data = await response.json();
		if (!data.post || data.post.length <= 0) return interaction.reply({ content: 'No results found', ephemeral: true });

		const index = Math.floor(Math.random() * data.post.length);
		
		const post = data.post[index];
		const sourceUrl = post.source.startsWith('http://') || post.source.startsWith('https://') 
		? post.source 
		: `https://${post.source}`;

		const embed = new EmbedBuilder()
			.setTitle('Femboy')
			.setDescription(`${interaction.user} wants ${query}`)
			.addFields({ name: 'Tags', value: `${post.tags}`, inline: false })
			.addFields({ name: 'Source', value: `[Click here](${sourceUrl})`, inline: false })
			.setColor(`#${getRandomColor()}`)

		await interaction.reply({ embeds: [embed] });
		await interaction.followUp(`|| ${post.file_url} ||`);

    },
};