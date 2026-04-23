const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const canvacord = require("canvacord");
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription("Check your level")
		.addUserOption(option => option.setName('target').setDescription('The user you want to check the level of').setRequired(false)),

    async execute(client, interaction) {
		

		const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'level');
        if (cooldownTime) {
            return interaction.editReply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

        try {

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

			const member = interaction.guild?.members.cache.get(user.id);
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

                const data = await rank.build();
                const attachment = new AttachmentBuilder(data, { name: 'RankCard.png' });
                const embed = new EmbedBuilder()
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
                    .setImage("attachment://RankCard.png");
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            });

        } catch (error) {
            client.logger.error('Error executing the level command:', error);
            try {
                await interaction.editReply({ content: 'Something went wrong.', ephemeral: true });
            } catch {
                await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
            }
        }
    },
};