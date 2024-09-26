const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const StateManager = require('../../utils/StateManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channel_stats')
        .setDescription('Show channel statistics')
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date to search (YYYY-MM-DD)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('month')
                .setDescription('Month to search (1-12)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(12))
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('Year to search')
                .setRequired(false)),

    async execute(interaction) {
        const stateManager = new StateManager();

		try {
			await stateManager.initPool();
		} catch (error) {
			console.error('Error initializing database connection pool:', error);
			await interaction.reply('An error occurred while initializing the database connection.');
			return;
		}

        try {
            const date = interaction.options.getString('date');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year');

            let result;
            let embed = new MessageEmbed().setColor('#0099ff');

            if (date) {
                result = await getStatsByDate(stateManager, date);
                if (result.length === 0) {
                    embed.setDescription(`No data found for ${date}`);
                } else {
                    embed.setTitle(`Channel Stats for ${date}`)
                        .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
                }
            } else if (month && year) {
                result = await getStatsByMonthYear(stateManager, month, year);
                if (result.length === 0) {
                    embed.setDescription(`No data found for ${month}/${year}`);
                } else {
                    embed.setTitle(`Channel Stats for ${month}/${year}`)
                        .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
                }
            } else {
                result = await getTopChannels(stateManager);
                embed.setTitle('Top 5 Channels')
                    .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in channel_stats command:', error);
            await interaction.reply('An error occurred while fetching channel stats.');
        } finally {
            await stateManager.closePool('channel_stats.js');
        }
    },
};

async function getStatsByDate(stateManager, date) {
    return stateManager.query(
        'SELECT channel_name, total FROM channel_stats WHERE month_day = ? ORDER BY total DESC LIMIT 5',
        [date]
    );
}

async function getStatsByMonthYear(stateManager, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    return stateManager.query(
        'SELECT channel_name, SUM(total) as total FROM channel_stats WHERE month_day BETWEEN ? AND ? GROUP BY channel_id ORDER BY total DESC LIMIT 5',
        [startDate, endDate]
    );
}

async function getTopChannels(stateManager) {
    return stateManager.query(
        'SELECT channel_name, SUM(total) as total FROM channel_stats GROUP BY channel_id ORDER BY total DESC LIMIT 5'
    );
}
