const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
	
    data: new SlashCommandBuilder()
	.setName('xp_settings')
	.setDescription("Change xp settings")
	.addStringOption(option => 
		option.setName('messages_per_xp')
			.setDescription('Messages Per XP')
	)
	.addStringOption(option => 
		option.setName('xp_multiplier')
			.setDescription('XP Multiplier')
	)
	.addStringOption(option => 
		option.setName('min_xp_per_message')
			.setDescription('Min XP Per Message')
	)
	.addStringOption(option => 
		option.setName('max_xp_per_message')
			.setDescription('Max XP Per Message')
	)
	.addStringOption(option => 
		option.setName('double_xp_days')
			.setDescription('Select days for double XP (comma-separated for multiple)')
			.setChoices(
				{ name: 'Monday, Tuesday', value: 'mon,tue' },
				{ name: 'Monday, Tuesday, Wednesday', value: 'mon,tue,wed' },
				{ name: 'Monday, Tuesday, Wednesday, Thursday', value: 'mon,tue,wed,thu' },
				{ name: 'Monday, Tuesday, Wednesday, Thursday, Friday', value: 'mon,tue,wed,thu,fri' },
				{ name: 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday', value: 'mon,tue,wed,thu,fri,sat' },
				{ name: 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday', value: 'mon,tue,wed,thu,fri,sat,sun' },

				{ name: 'Tuesday, Wednesday', value: 'tue,wed' },
				{ name: 'Tuesday, Wednesday, Thursday', value: 'tue,wed,thu' },
				{ name: 'Tuesday, Wednesday, Thursday, Friday', value: 'tue,wed,thu,fri' },
				{ name: 'Tuesday, Wednesday, Thursday, Friday, Saturday', value: 'tue,wed,thu,fri,sat' },
				{ name: 'Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday', value: 'tue,wed,thu,fri,sat,sun' },

				{ name: 'Wednesday, Thursday', value: 'wed,thu' },
				{ name: 'Wednesday, Thursday, Friday', value: 'wed,thu,fri' },
				{ name: 'Wednesday, Thursday, Friday, Saturday', value: 'wed,thu,fri,sat' },
				{ name: 'Wednesday, Thursday, Friday, Saturday, Sunday', value: 'wed,thu,fri,sat,sun' },

				{ name: 'Thursday, Friday', value: 'thu,fri' },
				{ name: 'Thursday, Friday, Saturday', value: 'thu,fri,sat' },
				{ name: 'Thursday, Friday, Saturday, Sunday', value: 'thu,fri,sat,sun' },

				{ name: 'Friday, Saturday', value: 'fri,sat' },
				{ name: 'Friday, Saturday, Sunday', value: 'fri,sat,sun' },

				{ name: 'Saturday', value: 'sat' },
				{ name: 'Saturday, Sunday', value: 'sat,sun' },

				{ name: 'Sunday', value: 'sun' },
			)
	),

    async execute(client, interaction) {
		if (!interaction.member.permissions.has("ADMINISTRATOR")) {
            return interaction.reply({ content: 'You do not have permission to change XP settings.', ephemeral: true });
        }

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

        await interaction.deferReply();

        const xpSettings = await client.db.query('xp_settings').first();
        const data = {
            messages_per_xp: Number(xpSettings.messages_per_xp),
            weekend_multiplier: Number(xpSettings.weekend_multiplier),
            min_xp_per_gain: Number(xpSettings.min_xp_per_gain),
            max_xp_per_gain: Number(xpSettings.max_xp_per_gain),
            weekend_days: String(xpSettings.weekend_days),
        };

        if (interaction.options.getString('messages_per_xp')) {
            let messagePerXpValue = interaction.options.getString('messages_per_xp');
			data.messages_per_xp = Number(messagePerXpValue);
        }

        if (interaction.options.getString('xp_multiplier')) {
            let xpMultiplierValue = interaction.options.getString('xp_multiplier');
			data.weekend_multiplier = Number(xpMultiplierValue);
        }

        if (interaction.options.getString('min_xp_per_message')) {
            let minXpPerMessageValue = interaction.options.getString('min_xp_per_message');
			data.min_xp_per_gain = Number(minXpPerMessageValue);
        }

        if (interaction.options.getString('max_xp_per_message')) {
            let maxXpPerMessageValue = interaction.options.getString('max_xp_per_message');
			data.max_xp_per_gain = Number(maxXpPerMessageValue);
        }

        if (interaction.options.getString('double_xp_days')) {
            let doubleXpDaysValue = interaction.options.getString('double_xp_days');	
            let days = doubleXpDaysValue.split(',').map(day => day.toLowerCase()).join(',');
            data.weekend_days = String(days);
        }


        await client.db.query('xp_settings').update(data).where('id', 1);
        const fields = [
			{ name: 'Messages Per XP', value: String(data.messages_per_xp) || 'Not set' },
			{ name: 'XP Multiplier', value: String(data.weekend_multiplier) || 'Not set' }, 
			{ name: 'Min XP Per Message', value: String(data.min_xp_per_gain) || 'Not set' }, 
			{ name: 'Max XP Per Message', value: String(data.max_xp_per_gain) || 'Not set' },
			{ name: 'Double XP Days', value: String(data.weekend_days) || 'Not set' },
		];

        const embed = new MessageEmbed()
            .setDescription(`XP settings have been updated`)
            .setColor(`#${getRandomColor()}`)
            .addFields(...fields);

        await interaction.followUp({ embeds: [embed] });
    },
};