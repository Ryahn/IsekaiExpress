const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { MessageEmbed } = require('discord.js');
const axios = require('axios');
const crypto = require('crypto');


module.exports = class YouTube extends BaseCommand {
    constructor() {
        super('youtube', 'fun', ['yt']);
    }

    async run(client, message, args) {
        // Check for allowed channel
        const hash = crypto.createHash('md5').update(this.name).digest('hex');
        const allowedChannel = await client.db.getAllowedChannel(hash);
        const guild = client.guilds.cache.get(message.guild.id);
        const member = await guild.members.fetch(message.author.id);
        const roles = member.roles.cache.map(role => role.id);

        if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== message.channel.id)) {
            if (!roles.some(role => client.allowed.includes(role))) {
                return message.reply(`This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`);
            }
        }

        // Check cooldown
        const cooldownTime = client.cooldownManager.isOnCooldown(message.author.id, 'youtube');
        if (cooldownTime) {
            return message.reply(`You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`);
        }

        // Get query from arguments
        const query = args.join(' ');
        if (!query) {
            return message.reply('Please provide a search query.');
        }

        try {
            const loadingMsg = await message.channel.send('Searching YouTube...');

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
                await loadingMsg.delete().catch(() => {});
                return message.reply('No videos found matching your query.');
            }

            // Get the most relevant video (first result)
            const video = response.data.items[0];
            const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;
            const videoTitle = video.snippet.title;

            await loadingMsg.delete().catch(() => {});
            return message.channel.send(`**${videoTitle}**\n${videoUrl}`);
        } catch (error) {
            client.logger.error('Error executing the youtube command:', error);
            return message.reply('Something went wrong while searching YouTube.');
        }
    }
}
