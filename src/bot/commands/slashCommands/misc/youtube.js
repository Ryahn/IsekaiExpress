const { SlashCommandBuilder } = require('@discordjs/builders');
const axios = require('axios');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription("Search for a youtube video.")
		.addStringOption(option => option.setName('query').setDescription('The query to search for').setRequired(true)),

    async execute(client, interaction) {
		

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'youtube');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

		try {
			await interaction.deferReply();

			const query = interaction.options.getString('query');

			// Use rate limiting for the YouTube API call
			const response = await client.rateLimitHandler.executeWithRateLimit('youtube-api', async () => {
				return await axios.get('https://www.googleapis.com/youtube/v3/search', {
					params: {
						part: 'snippet',
						q: query,
						key: client.config.youtubeApiKey,
						maxResults: 5, // Fetch more results to find the best match
						type: 'video',
						relevanceLanguage: 'en', // Prioritize English results
						safeSearch: 'moderate', // Add safe search filtering
						order: 'relevance', // Sort by relevance to query
					},
				});
			});
		
			// If no results found
			if (!response.data.items || response.data.items.length === 0) {
				return await interaction.followUp('No videos found matching your query.');
			}

			// Get the most relevant video (first result)
			const video = response.data.items[0];
			const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;
			const videoTitle = video.snippet.title;

			await interaction.followUp(`**${videoTitle}**\n${videoUrl}`);
        } catch (error) {
            client.logger.error('Error executing the youtube command:', error);
            if (!interaction.replied) {
                await interaction.followUp('Something went wrong.');
            }
        }
    },
};

