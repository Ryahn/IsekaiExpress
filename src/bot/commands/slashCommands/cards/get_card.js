const { SlashCommandBuilder } = require('@discordjs/builders');
const { Permissions, MessageEmbed } = require('discord.js');
const path = require('path');
const crypto = require('crypto');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('get_card')
        .setDescription('Get a card by ID')
        .addStringOption(option =>
            option.setName('uuid')
                .setDescription('The ID of the card')
                .setRequired(true)),

    async execute(client, interaction) {

        const hash = crypto.createHash('md5').update(module.exports.data.name).digest('hex');
		const allowedChannel = await client.db.getAllowedChannel(hash);
		const guild = client.guilds.cache.get(interaction.guild.id);
		const member = await guild.members.fetch(interaction.user.id);
		const roles = member.roles.cache.map(role => role.id);

		if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
			if (!roles.some(role => client.allowed.includes(role))) {
				return interaction.reply({ 
					content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
					ephemeral: true 
				});
			}
		}

        // try {
            const uuid = interaction.options.getString('uuid');

			if (!uuid) {
				return interaction.reply({ content: 'Invalid card ID.', ephemeral: true });
			}

			const card = await client.db.query('card_data').where('uuid', uuid).first();

			if (!card) {
				return interaction.reply({ content: 'Card not found.', ephemeral: true });
			}

			const stars = '⭐️'.repeat(card.stars);
			const type = card.image_url.split('/')[4];

			const embed = new MessageEmbed()
				.setTitle(card.name)
				.setDescription(card.description || 'No description')
				.addFields(
					{ name: 'UUID', value: card.uuid || 'N/A', inline: false },
					{ name: 'Stars', value: stars || 'N/A', inline: false },
					{ name: 'Level', value: String(card.level) || 'N/A', inline: true },
					{ name: 'Power', value: String(card.power) || 'N/A', inline: true },
					{ name: 'Class', value: card.class || 'N/A', inline: true },
					{ name: 'Rarity', value: card.rarity || 'N/A', inline: true },
					{ name: 'Type', value: type || 'N/A', inline: true }
				)
				.setImage(card.image_url || null);

			await interaction.reply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error:', error);
        //     await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        // }
    }
};
