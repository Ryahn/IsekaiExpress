const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');

module.exports = {
    
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

        const { getRandomColor } = client.utils;

        // try {
            await interaction.deferReply();
			let optionName = '';
			let setValue = '';

			if (interaction.options.getString('messages_per_xp')) {
				let messagePerXpValue = interaction.options.getString('messages_per_xp');
				optionName = 'Messages Per XP';
				setValue = messagePerXpValue;
				await setMessagesPerXP(messagePerXpValue);
			}

			if (interaction.options.getString('xp_multiplier')) {
				let xpMultiplierValue = interaction.options.getString('xp_multiplier');
				optionName = 'XP Multiplier';
				setValue = xpMultiplierValue;
				await setXPMultiplier(xpMultiplierValue);
			}

			if (interaction.options.getString('min_xp_per_message')) {
				let minXpPerMessageValue = interaction.options.getString('min_xp_per_message');
				optionName = 'Min XP Per Message';
				setValue = minXpPerMessageValue;
				await setMinXPPerMessage(minXpPerMessageValue);
			}

			if (interaction.options.getString('max_xp_per_message')) {
				let maxXpPerMessageValue = interaction.options.getString('max_xp_per_message');
				optionName = 'Max XP Per Message';
				setValue = maxXpPerMessageValue;
				await setMaxXPPerMessage(maxXpPerMessageValue);
			}

			if (interaction.options.getString('double_xp_days')) {
				let doubleXpDaysValue = interaction.options.getString('double_xp_days');	
				optionName = 'Double XP Days';
				setValue = doubleXpDaysValue;
				await setDoubleXPDays(doubleXpDaysValue);
			}
			

			await interaction.editReply(`${optionName} has been updated`);

			async function setMessagesPerXP(value) {
				await client.db.query('xp_settings').update({ messages_per_xp: value }).where('id', 1);
			}

			async function setXPMultiplier(value) {
				await client.db.query('xp_settings').update({ weekend_multiplier: value }).where('id', 1);
			}

			async function setMinXPPerMessage(value) {
				await client.db.query('xp_settings').update({ min_xp_per_gain: value }).where('id', 1);
			}

			async function setMaxXPPerMessage(value) {
				await client.db.query('xp_settings').update({ max_xp_per_gain: value }).where('id', 1);
			}

			async function setDoubleXPDays(value) {
				let days = value.split(',').map(day => day.toLowerCase()).join(',');
				await client.db.query('xp_settings').update({ weekend_days: days }).where('id', 1);
			}

            const embed = new MessageEmbed()
                .setDescription(`${optionName} has been updated`)
                .setColor(`#${getRandomColor()}`)
				.addFields(
					{ name: 'Option', value: optionName },
					{ name: 'Value', value: setValue },
				);

            await interaction.editReply({ embeds: [embed] });
        // } catch (error) {
        //     client.logger.error('Error in xp_settings command:', error);
        //     await interaction.editReply('An error occurred while processing your request.');
        // }
    },
};