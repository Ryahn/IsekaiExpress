const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("Help")
        .addStringOption(option => option.setName('command').setDescription('The command to get help for').setRequired(false)),

    async execute(client, interaction) {
        const command = interaction.options.getString('command');

        if (command === 'import_rank') {
            let message = "**Import Rank Usage:**\n" +
                          "`/import_rank <url>` - Import your rank from an image URL.\n" +
                          "**Note:** Run ?level to get the rank from ZoneMaster.\nThen right click the message and select \"Copy Link\"\nThen run this command with the link as the argument.";
            await interaction.reply(message);
        } else {
            await interaction.reply("You can access my dashboard at https://bot.zonies.xyz");
        }

    },
};