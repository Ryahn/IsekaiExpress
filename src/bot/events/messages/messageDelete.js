const BaseEvent = require('../../utils/structures/BaseEvent');
const axios = require('axios');
const FormData = require('form-data');
const { MessageEmbed } = require('discord.js');

const IGNORED_ROLES = ['309358485923954689', '358471651341631493'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/jfif', 'image/jpg', 'video/mp4', 'video/webm'];

module.exports = class MessageDeleteEvent extends BaseEvent {
    constructor() {
        super('messageDelete');
    }

    async run(client, message) {
        if (!client.config.imageArchive.enabled) return;
        if (!this.shouldProcessMessage(message)) return;

        const attachments = message.attachments.filter(attachment => IMAGE_TYPES.includes(attachment.contentType));
        if (attachments.size === 0) return;

        const logChannel = message.guild.channels.cache.find(channel => channel.name === 'mod-logs');
        if (!logChannel) return;

        for (const attachment of attachments.values()) {
            await this.processAttachment(attachment, message, logChannel);
        }
    }

    shouldProcessMessage(message) {
        return message.guild && 
               !message.author.bot && 
               !message.member.roles.cache.hasAny(...IGNORED_ROLES);
    }

    async processAttachment(attachment, message, logChannel) {
        try {
            const uploadedImageUrl = await this.uploadImage(attachment);
            const embed = this.createEmbed(message, attachment, uploadedImageUrl);
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error processing attachment:', error);
        }
    }

    async uploadImage(attachment) {
        const imageBuffer = await axios.get(attachment.url, { responseType: 'arraybuffer' });
        const form = new FormData();
        form.append('image', Buffer.from(imageBuffer.data), attachment.name);

        const response = await axios.post('https://upload.zonies.xyz/upload.php', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${config.imageArchive.uploadToken}`
            }
        });

        return response.data.url;
    }

    createEmbed(message, attachment, uploadedImageUrl) {
        return new MessageEmbed()
            .setTitle('Image Deleted')
            .addFields(
                { name: 'Message Author', value: message.author?.tag || 'Unknown Author', inline: true },
                { name: 'Channel', value: message.channel?.name || 'Unknown Channel', inline: true },
                { name: 'Image URL', value: attachment.url || 'No URL', inline: false }
            )
            .setImage(uploadedImageUrl)
            .setColor('RED');
    }
};
