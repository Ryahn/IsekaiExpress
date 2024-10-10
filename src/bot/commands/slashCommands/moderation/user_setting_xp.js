const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');

module.exports = {
    
    data: new SlashCommandBuilder()
	.setName('user_settings_xp')
	.setDescription("Change users xp settings")
	.addStringOption(option => 
		option.setName('option')
			.setDescription('Choose a setting to change')
			.addChoices(
				{ name: 'Add XP', value: 'add_xp' },
				{ name: 'Remove XP', value: 'remove_xp' },
				{ name: 'Set XP', value: 'set_xp' },
				{ name: 'Set Level', value: 'set_level' }
			)
	)
	.addChannelOption(option => 
		option.setName('user')
			.setDescription('Choose a user to change')
	)
	.addChannelOption(option => 
		option.setName('amount')
			.setDescription('Choose a amount to change')
	),

    async execute(client, interaction) {
        const { getRandomColor } = client.utils;
		const option = interaction.options.getString('option');
		const user = interaction.options.getMember('user');
		const amount = interaction.options.getInteger('amount');

        try {
            await interaction.deferReply();
			let optionName = '';
            
            switch (option) {
                case 'add_xp':
					optionName = 'Add XP';
                    await addXP(user, amount);
                    break;
                case 'remove_xp':
					optionName = 'Remove XP';
                    await removeXP(user, amount);
                    break;
                case 'set_xp':
					optionName = 'Set XP';
                    await setXP(user, amount);
                    break;
                case 'set_level':
					optionName = 'Set Level';
                    await setLevel(user, amount);
                    break;
            }

			await interaction.editReply(`${user} has been updated`);

			async function addXP(user, amount) {
				const xp = await client.db.query('user_xp').select('xp').where('user_id', user.id);
				await client.db.query('user_xp').update({ xp: xp + amount }).where('user_id', user.id);
			}

			async function removeXP(user, amount) {
				const xp = await client.db.query('user_xp').select('xp').where('user_id', user.id);
				await client.db.query('user_xp').update({ xp: xp - amount }).where('user_id', user.id);
			}

			async function setXP(user, amount) {
				await client.db.query('user_xp').update({ xp: amount }).where('user_id', user.id);
			}

			async function setLevel(user, amount) {
				await client.db.query('user_xp').update({ level: amount }).where('user_id', user.id);
			}

            const embed = new MessageEmbed()
                .setDescription(`${user} has been updated`)
                .setColor(`#${getRandomColor()}`)
				.addFields(
					{ name: 'Option', value: optionName },
					{ name: 'Amount', value: amount },
				);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in wink command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};