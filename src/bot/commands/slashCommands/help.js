const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    enable: true,
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("Help"),

    async execute(client, interaction) {

        await interaction.reply("You can access my dashboard at https://bot.zonies.xyz");

    },
};