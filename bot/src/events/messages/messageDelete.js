const BaseEvent = require('../../utils/structures/BaseEvent');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config({ path: '../../.env' });
const { MessageEmbed } = require('discord.js');

module.exports = class MessageDeleteEvent extends BaseEvent {
    constructor() {
        super('messageDelete');
    }

    async run(client, message) {
        // Ignore deleted messages that are not from a guild or from bots
        if (!message.guild || message.author.bot) return;

		if (message.member.roles.cache.has('309358485923954689') || message.member.roles.cache.has('358471651341631493')) {
            return;
        }

        // Check if the message contains any attachments (images, files, etc.)
        if (message.attachments.size > 0) {
            const logChannel = message.guild.channels.cache.find(channel => channel.name === 'mod-logs'); // Update this to your actual log channel name or ID
            if (!logChannel) return;

            // Iterate over the attachments
            message.attachments.forEach(async (attachment) => {
                // Only log image deletions (e.g., jpg, png, gif)
                const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/jfif', 'image/jpg', 'video/mp4', 'video/webm'];
                if (imageTypes.includes(attachment.contentType)) {
                    try {
                        // Download the image from Discord
                        const imageBuffer = await axios.get(attachment.url, { responseType: 'arraybuffer' });

                        // Create FormData to send to the remote PHP API
                        const form = new FormData();
                        form.append('image', Buffer.from(imageBuffer.data), attachment.name); // Adjust field name if necessary

                        // Send the image to the remote PHP API with a token in the header
                        const response = await axios.post('https://upload.zonies.xyz/upload.php', form, {
                            headers: {
                                ...form.getHeaders(),
                                'Authorization': `Bearer ${process.env.UPLOAD_TOKEN}` // Add token for authentication
                            }
                        });

                        // Get the URL of the uploaded image from the response
                        const uploadedImageUrl = response.data.url;

                        // Ensure values are not null or empty
                        const authorTag = message.author?.tag || 'Unknown Author';
                        const channelName = message.channel?.name || 'Unknown Channel';
                        const imageUrl = attachment.url || 'No URL';

                        const embed = new MessageEmbed()
                            .setTitle('Image Deleted')
                            .addFields(
                                { name: 'Message Author', value: authorTag, inline: true },
                                { name: 'Channel', value: channelName, inline: true },
                                { name: 'Image URL', value: imageUrl, inline: false }
                            )
                            .setImage(uploadedImageUrl)
                            .setColor('RED');

                        logChannel.send({
                            embeds: [embed]
                        });

                    } catch (error) {
                        console.error('Error uploading the image to the remote server:', error);
                    }
                }
            });
        }
    }
};
