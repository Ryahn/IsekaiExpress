const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
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
                flags: MessageFlags.Ephemeral 
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
            const accentColor = "#5865F2";

            const userRank = await client.db.getUserRank(user.id);
			const progressPercentage = Math.min(100, Math.max(0, (xp / requiredXP) * 100));

            await client.rateLimitHandler.executeWithRateLimit('image-generation', async () => {
                const rank = new canvacord.Rank()
                    .setAvatar(avatar)
                    .setCurrentXP(Number(xp), accentColor)
                    .setRequiredXP(Number(requiredXP), accentColor)
                    .setStatus("offline", false, 7)
                    .renderEmojis(true)
                    .setProgressBar(accentColor, "COLOR", true)
                    .setProgressBarTrack('#000000', "COLOR")
                    .setRankColor(accentColor, "COLOR")
                    .setLevelColor(accentColor, "COLOR")
                    .setUsername(user.username, accentColor)
                    .setRank(Number(userRank), "Rank", true)
                    .setLevel(Number(level), "Level", true)
                    .setDiscriminator(user.discriminator, accentColor);

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
                    .setColor(accentColor)
                    .setImage("attachment://RankCard.png");
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            });

        } catch (error) {
            client.logger.error('Error executing the level command:', error);
            try {
                await interaction.editReply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral });
            } catch {
                await interaction.followUp({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },
};