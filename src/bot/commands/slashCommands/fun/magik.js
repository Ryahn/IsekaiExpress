const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('magik')
        .setDescription('create magik')
        .addUserOption(option => option.setName('target').setDescription('user to magik').setRequired(false)),

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
        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'magik');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }
        try {
            await interaction.deferReply();
            let target = interaction.options.getUser('target') || interaction.user;
            const avatar = target.displayAvatarURL({ size: 512, format: 'jpg', dynamic: false });
            const response = await client.rateLimitHandler.executeWithRateLimit('nekobot-api', async () => {
                return await fetch(`https://nekobot.xyz/api/imagegen?type=magik&image=${avatar}`);
            });
            const data = await response.json();

            const embed = new MessageEmbed() // or MessageEmbed based on your version
                .setTitle('Magik')
                .setColor(`#${getRandomColor()}`)
                .setImage(data.message);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing the magik command:', error);
            if (!interaction.replied) {
                await interaction.editReply('Something went wrong.');
            }
        }
    },
};
