const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require('axios');
const cooldowns = new Map();

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription("Search for a youtube video.")
		.addStringOption(option => option.setName('query').setDescription('The query to search for').setRequired(true)),

    async execute(client, interaction) {

		try {
			await interaction.deferReply();

			const cooldownTime = 2 * 1000;

			if (cooldowns.has(interaction.user.id)) {
				const expirationTime = cooldowns.get(interaction.user.id) + cooldownTime;

				if (Date.now() < expirationTime) {
					const timeLeft = (expirationTime - Date.now()) / 1000;
					return interaction.followUp(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
				}
			}

			const query = interaction.options.getString('query');

			const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
				params: {
					part: 'snippet',
					q: query,
					key: client.config.youtubeApiKey,
					maxResults: 1,
					type: 'video',
				},
			});
		
			const video = response.data.items[0];
			const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;

			cooldowns.set(interaction.user.id, Date.now());

			await interaction.followUp(videoUrl);
        } catch (error) {
            client.logger.error('Error executing the youtube command:', error);
            if (!interaction.replied) {
                await interaction.followUp('Something went wrong.');
            }
        }
    },
};

