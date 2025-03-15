const { SlashCommandBuilder } = require('@discordjs/builders');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription("Help")
        .addStringOption(option => option.setName('command').setDescription('The command to get help for').setRequired(false)),

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