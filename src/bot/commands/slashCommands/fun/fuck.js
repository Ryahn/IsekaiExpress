const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('fuck')
        .setDescription('bang someone really hard')
        .addUserOption(option => option.setName('target').setDescription('the person you want to bang').setRequired(true)),

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

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'fuck');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        
        const { getRandomColor } = client.utils;
        try {
            await interaction.deferReply();
            const user = interaction.options.getUser('target');


            if (interaction.channel.nsfw) {
                const response = await client.rateLimitHandler.executeWithRateLimit('eckigerluca-api', async () => {
                    return await fetch('https://eckigerluca.com/api/fuck');
                });
                const data = await response.json();

                const embed = new MessageEmbed()
                    .setDescription(`${interaction.user} bangs the shit out of ${user}`)
                    .setColor(`#${getRandomColor()}`)
                    .setImage(data.image);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply('This command can only be used in NSFW channels!');
            }
        } catch (error) {
            client.logger.error('Error executing the fuck command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};