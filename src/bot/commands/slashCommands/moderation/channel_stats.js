const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

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

    async execute(client,interaction) { 

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

        await interaction.deferReply(); 
        const db = client.db;

        try {
            const dateInput = interaction.options.getString('date');
            const month = interaction.options.getInteger('month');
            const year = interaction.options.getInteger('year');

            let result;
            let embed = new MessageEmbed().setColor('#0099ff');

			if (!dateInput && !month && !year) {
				embed.setDescription('No date, month, or year provided. Please provide one of these to search for channel statistics.');
				await interaction.editReply({ embeds: [embed] });
				return;
			}

            if (dateInput) {
                const standardizedDate = standardizeDate(dateInput);
                if (!standardizedDate) {
                    embed.setDescription('Invalid date format. Please use YYYY-MM-DD, DD-MM-YYYY, or similar formats.');
                } else {
                    result = await getStatsByDate(client.db.query, standardizedDate);
                    if (result.length === 0) {
                        embed.setDescription(`No data found for ${standardizedDate}`);
                    } else {
                        embed.setTitle(`Channel Stats for ${standardizedDate}`)
                            .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
                    }
                }
            } else if (month && year) {
                result = await getStatsByMonthYear(client.db.query, month, year);
                if (result.length === 0) {
                    embed.setDescription(`No data found for ${month}/${year}`);
                } else {
                    embed.setTitle(`Channel Stats for ${month}/${year}`)
                        .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
                }
            } else {
                result = await getTopChannels(client.db.query);
                embed.setTitle('Top 5 Channels')
                    .addFields(result.map(r => ({ name: r.channel_name, value: `Total: ${r.total}` })));
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            client.logger.error('Error in channel_stats command:', error);
            await interaction.editReply('An error occurred while fetching channel stats.');
        }
    },
};

function standardizeDate(dateInput) {
    const formats = [
        'YYYY-MM-DD', 'DD-MM-YYYY', 'D-M-YYYY', 'D-MM-YYYY', 'DD-M-YYYY',
        'YY-MM-DD', 'DD-MM-YY', 'D-M-YY', 'D-MM-YY', 'DD-M-YY',
        'YYYY-M-D', 'YY-M-D', 'YYYY-MM-D', 'YY-MM-D',
        'DD-MMM-YYYY', 'DD-MMM-YY', 'D-MMM-YYYY', 'D-MMM-YY',
        'M-D-YYYY', 'MM-DD-YYYY', 'M-D-YY', 'MM-DD-YY' 
    ];

    let processedInput = dateInput.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/, (match, p1, p2, p3) => {
        p1 = p1.padStart(2, '0');
        p2 = p2.padStart(2, '0');
        if (p3.length === 2) {
            p3 = '20' + p3;
        }
        return `${p1}-${p2}-${p3}`;
    });

    const parsedDate = moment(processedInput, formats, true);
    
    if (parsedDate.isValid()) {
        // Check if the year is reasonable (e.g., between 1900 and 2100)
        if (parsedDate.year() < 1900 || parsedDate.year() > 2100) {
            return null;
        }
        return parsedDate.format('YYYY-MM-DD');
    }
    
    return null;
}

async function getStatsByDate(db, date) {
    return await db('channel_stats').select('channel_name', 'total').where({month_day: date}).orderBy('total', 'desc').limit(5);
}

async function getStatsByMonthYear(db, month, year) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;
    return await db('channel_stats')
        .select('channel_name')
        .sum('total as total')
        .whereBetween('month_day', [startDate, endDate])
        .groupBy('channel_id')
        .orderBy('total', 'desc')
        .limit(5);
}

async function getTopChannels(db) {
    return await db('channel_stats')
        .select('channel_name')
        .sum('total as total')
        .groupBy('channel_name')
        .orderBy('total', 'desc')
        .limit(5);
}
