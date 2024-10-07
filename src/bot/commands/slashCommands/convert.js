const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('convert')
        .setDescription("Convert between different units")
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of conversion')
                .setRequired(true)
                .addChoices(
                    { name: 'US to Metric', value: 'us_to_metric' },
                    { name: 'Metric to US', value: 'metric_to_us' },
                    { name: 'Currency', value: 'currency' },
                    { name: 'Time', value: 'time' }
                ))
        .addNumberOption(option =>
            option.setName('value')
                .setDescription('Value to convert')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('Unit to convert from')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('Unit to convert to')
                .setRequired(true)),

    async execute(client, interaction) {
        const type = interaction.options.getString('type');
        const value = interaction.options.getNumber('value');
        const from = interaction.options.getString('from');
        const to = interaction.options.getString('to');

        let result;
        let explanation;

        switch (type) {
            case 'us_to_metric':
                result = convertUSToMetric(value, from, to);
                break;
            case 'metric_to_us':
                result = convertMetricToUS(value, from, to);
                break;
            case 'currency':
                result = await convertCurrency(value, from, to);
                break;
            case 'time':
                result = convertTime(value, from, to);
                break;
            default:
                result = null;
        }

        if (result === null) {
            await interaction.reply('Invalid conversion type or units.');
            return;
        }

        const embed = new MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Conversion Result')
            .addFields(
                { name: 'From', value: `${value} ${from}`, inline: true },
                { name: 'To', value: `${result.toFixed(2)} ${to}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};

function convertUSToMetric(value, from, to) {
    // Implement US to Metric conversion logic here
    // Return the converted value or null if invalid
}

function convertMetricToUS(value, from, to) {
    // Implement Metric to US conversion logic here
    // Return the converted value or null if invalid
}

async function convertCurrency(value, from, to) {
    // Implement currency conversion logic here
    // You may need to use an external API for up-to-date exchange rates
    // Return the converted value or null if invalid
}

function convertTime(value, from, to) {
    // Implement time conversion logic here
    // Return the converted value or null if invalid
}