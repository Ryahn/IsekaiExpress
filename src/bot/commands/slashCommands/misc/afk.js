const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription("Set your AFK status")
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message to send when someone pings you')
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

        const message = interaction.options.getString('message');
        const { timestamp } = client.utils;

        try {
            await interaction.deferReply();
            await client.db.createAfkUser(interaction.user.id, interaction.guild.id, message, timestamp());

            const embed = new MessageEmbed()
                .setColor('#00FF00')
                .setTitle('AFK Status Set')
                .setDescription(`You are now AFK: ${message}`);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error setting AFK status:', error);
            await interaction.editReply('An error occurred while setting your AFK status.');
        }
    },
};