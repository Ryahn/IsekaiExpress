const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { fetchRandom } = require('nekos-best.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('bite')
        .setDescription("bite someone :p")
        .addUserOption(option => option.setName('target').setDescription('The user you want to bite')),

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

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'bite');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

        try {
            await interaction.deferReply();
            let targetUser = interaction.options.getUser('target');

            // Use rate limiting for the API call
            const img = await client.rateLimitHandler.executeWithRateLimit('nekos-best-api', async () => {
                const response = await fetchRandom('bite');
                return response.results[0].url;
            });

            let people = [
                'a random person',
                'OEJ',
                'M4zy',
                'Astolfokyun1',
                'Ryahn',
                'Sam',
                'a furry',
                'a 12 foot dildo',
                'a dakimakura',
                'a waifu',
                'a husbando'
            ];
            let random = Math.floor(Math.random() * people.length);

            // If target user is provided, mention them, otherwise use the random extra
            let biteTarget = targetUser ? `${targetUser}` : people[random];

            const embed = new MessageEmbed()
                .setDescription(`${interaction.user} bites ${biteTarget}`)
                .setColor(`#${getRandomColor()}`)
                .setImage(img);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in bite command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};
