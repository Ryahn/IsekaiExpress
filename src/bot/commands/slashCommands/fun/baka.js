const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('baka')
        .setDescription("stupid"),

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
        
        // Check if user is on cooldown
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'baka');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            
            // Use rate limiting for the API call
            const img = await client.rateLimitHandler.executeWithRateLimit('nekos-best-api', async () => {
                const response = await fetchRandom('baka');
                return response.results[0].url;
            });

            const embed = new MessageEmbed()
                .setTitle('stupid!')
                .setDescription(`${interaction.user} went tsundere`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
            
            // Set cooldown after successful execution
            client.cooldownManager.setCooldown(interaction.user.id, 'baka');
        } catch (error) {
            client.logger.error('Error executing the baka command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};