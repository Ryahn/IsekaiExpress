const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription("Change the settings for your server")
		.addStringOption(option => 
            option.setName('option')
                .setDescription('Choose a setting to change')
                .addChoices(
                    { name: 'Enable XP System', value: 'xp_system' },
                    { name: 'Enable Warning System', value: 'warning_system' },
                    { name: 'Enable Image Archive', value: 'image_archive' },
                    { name: 'Enable Level Up Message', value: 'level_up_message' }
                )
        )
		.addChannelOption(option => 
            option.setName('level_up_channel')
                .setDescription('Choose a channel to send the level up message')
                .setRequired(false)
        )
		.addChannelOption(option => 
            option.setName('warning_channel')
                .setDescription('Choose a channel to send the warning message')
                .setRequired(false)
        ),


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

        try {
            await interaction.deferReply();
			const option = interaction.options.getString('option');

			if (!option) {
				await interaction.editReply('Please choose an option to change.');
				return;
			}

			switch (option) {
				case 'xp_system':
					await toggleXPSystem(interaction);
					break;
				case 'warning_system':
					await toggleWarningSystem(interaction);
					break;
				case 'image_archive':
					await toggleImageArchive(interaction);
					break;
				case 'level_up_message':
					await toggleLevelUpMessage(interaction);
					break;
				default:
					await interaction.editReply('Invalid option selected.');
			}

			async function toggleXPSystem(interaction) {
				const guildId = interaction.guild.id;
				const guildConfig = await client.db.getGuildConfigurable(guildId);

				const xpEnabled = guildConfig.xp_enabled;
				const newXpEnabled = !xpEnabled;

				await client.db.query('GuildConfigurable').where({guildId: guildId}).update({ xp_enabled: newXpEnabled });

				await interaction.editReply(`XP system has been ${newXpEnabled ? 'enabled' : 'disabled'}.`);
			}

			async function toggleWarningSystem(interaction) {
				const guildId = interaction.guild.id;
				const guildConfig = await client.db.getGuildConfigurable(guildId);
				const warningChannel = interaction.options.getChannel('warning_channel');

				if (!warningChannel) {
					await interaction.editReply('Please choose a channel to send the warning message.');
					return;
				}

				const warningEnabled = guildConfig.warning_enabled;
				const newWarningEnabled = !warningEnabled;

				await client.db.query('GuildConfigurable').where({guildId: guildId}).update({ warning_enabled: newWarningEnabled, modLogId: warningChannel?.id });

				await interaction.editReply(`Warning system has been ${newWarningEnabled ? 'enabled' : 'disabled'}.`);
			}

			async function toggleImageArchive(interaction) {
				const guildId = interaction.guild.id;
				const guildConfig = await client.db.getGuildConfigurable(guildId);

				const imageArchiveEnabled = guildConfig.image_archive_enabled;
				const newImageArchiveEnabled = !imageArchiveEnabled;

				await client.db.query('GuildConfigurable').where({guildId: guildId}).update({ image_archive_enabled: newImageArchiveEnabled });

				await interaction.editReply(`Image archive has been ${newImageArchiveEnabled ? 'enabled' : 'disabled'}.`);
			}

			async function toggleLevelUpMessage(interaction) {
				const guildId = interaction.guild.id;
				const guildConfig = await client.db.getGuildConfigurable(guildId);
				const levelUpChannel = interaction.options.getChannel('level_up_channel');

				if (!levelUpChannel) {
					await interaction.editReply('Please choose a channel to send the level up message.');
					return;
				}

				const levelUpEnabled = guildConfig.level_up_enabled;
				const newLevelUpEnabled = !levelUpEnabled;	

				await client.db.query('GuildConfigurable').where({guildId: guildId}).update({ level_up_enabled: newLevelUpEnabled, level_up_channel: levelUpChannel?.id });

				await interaction.editReply(`Level up message has been ${newLevelUpEnabled ? 'enabled' : 'disabled'}.`);
			}

        } catch (error) {
            client.logger.error('Error executing the settings command:', error);
            await interaction.editReply('Something went wrong.');
        }
    },
};