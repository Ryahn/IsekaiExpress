const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageAttachment, MessageEmbed } = require('discord.js');
const canvacord = require("canvacord");
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription("Check your level")
		.addUserOption(option => option.setName('target').setDescription('The user you want to check the level of').setRequired(false)),

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

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'level');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

        try {
            await interaction.deferReply();
            const user = interaction.options.getUser('target') || interaction.user;
            const avatar = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024` 
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

            // Use rate limiting for database operations
            const userData = await client.rateLimitHandler.executeWithRateLimit('db-operations', async () => {
                return await client.db.getUserXP(user.id);
            });
            
            let { xp, level, message_count } = userData;
            let requiredXP = client.utils.calculateXPForNextLevel(level);

			const member = interaction.guild.members.cache.get(interaction.user.id);
            let status = "offline";
            let color = "#b1b1b1";

			if (member && member.presence) {
				status = member.presence.status;
                if (status === "dnd") { color = "#ff0048"; }
                else if (status === "online") { color = "#00fa81"; }
                else if (status === "idle") { color = "#ffbe00"; }
                else if (status === "streaming") { color = "#a85fc5"; }
            }

            const userRank = await client.db.getUserRank(user.id);
			const progressPercentage = Math.min(100, Math.max(0, (xp / requiredXP) * 100));

            // Use rate limiting for image generation
            await client.rateLimitHandler.executeWithRateLimit('image-generation', async () => {
                const rank = new canvacord.Rank()
                    .setAvatar(avatar)
                    .setCurrentXP(Number(xp), color)
                    .setRequiredXP(Number(requiredXP), color)
                    .setStatus(status, false, 7)
                    .renderEmojis(true)
                    .setProgressBar(color, "COLOR", true)
                    .setProgressBarTrack('#000000', "COLOR")
                    .setRankColor(color, "COLOR")
                    .setLevelColor(color, "COLOR")
                    .setUsername(user.username, color)
                    .setRank(Number(userRank), "Rank", true)
                    .setLevel(Number(level), "Level", true)
                    .setDiscriminator(user.discriminator, color);
                
                rank.build()
                    .then(async data => {
                    const attachment = new MessageAttachment(data, "RankCard.png");
                    const embed = new MessageEmbed()
                        .setTitle(`Ranking of:  ${user.username}`)
                        .addFields({
                            name: 'XP',
                            value: `${xp} / ${requiredXP}`,
                            inline: true
                        },
                        {
                            name: 'Progress',
                            value: `${Number(progressPercentage).toFixed(2)}%`,
                            inline: true
                        })
                        .setColor(color)
                        .setImage("attachment://RankCard.png")
                    await interaction.editReply({ embeds: [embed], files: [attachment] });
                    return;
                });
            });

        } catch (error) {
            client.logger.error('Error executing the level command:', error);
            if (!interaction.replied) {
                await interaction.followUp('Something went wrong.');
            }
        }
    },
};