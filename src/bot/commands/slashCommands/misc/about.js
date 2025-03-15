const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const path = require('path');
const crypto = require('crypto');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('about')
        .setDescription("about this bot"),

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

        const { getRandomColor } = client.utils;

        try {
            await interaction.deferReply();
            const embed = new MessageEmbed()
                .setTitle('About this bot')
                .setColor(`#${getRandomColor()}`)
                .addFields([{ name: 'Bot Name', value: 'IsekaiExpress', inline: true },
                    { name: 'Bot Version', value: '1.1.5', inline: true },
				{ name: 'Bot Author', value: '<@72884988374167552>', inline: true },
				{ name: 'Bot Support', value: 'Contact <@72884988374167552>', inline: true }
                ])
                .setFooter({ text: 'IsekaiExpress', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error executing the about command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};