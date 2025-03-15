const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const moment = require('moment');
const crypto = require('crypto');
const path = require('path');

module.exports = {
    category: path.basename(__dirname),

    data: new SlashCommandBuilder()
        .setName('bans')
        .setDescription('Lists the bans')
		.addIntegerOption(option => 
            option.setName('page')
                .setDescription('The page number of bans')
                .setRequired(false)),

    async execute(client, interaction) {
        if (!interaction.member.permissions.has("BAN_MEMBERS")) {
            return interaction.reply({ content: 'You do not have permission to list bans.', ephemeral: true });
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

        await interaction.deferReply();

        const pageRequested = interaction.options.getInteger('page') ?? 1;

        try {

            const [totalBansResult, bans] = await Promise.all([
                client.db.query.table('bans').count('* as total_bans'),
                getBans(client.db.query, pageRequested)
            ]);

            const totalBans = totalBansResult[0].total_bans;
            const itemsPerPage = 5;
            const totalPages = Math.ceil(totalBans / itemsPerPage);
            const currentPage = Math.min(Math.max(pageRequested - 1, 0), totalPages - 1);

            const embed = createBansEmbed(totalBans, bans, currentPage, totalPages);
            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error('Error in warnings command:', err);
            await interaction.editReply('An error occurred while processing your request.');
        }
    }
};

async function getBans(db, page) {
    const itemsPerPage = 5;
    const offset = (page - 1) * itemsPerPage;
    return db('bans')
        .select('ban_id', 'discord_id', 'username', 'reason', 'banned_by_id', 'banned_by_user', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(itemsPerPage)
        .offset(offset);
}

function createBansEmbed(totalBans, bans, currentPage, totalPages) {
    const fields = bans.map(ban => ({
        name: `Ban ID: ${ban.ban_id}`,
        value: `Moderator: <@${ban.banned_by_id}>\nReason: ${ban.reason}\nDate: ${moment.unix(ban.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
        inline: false
    }));

    return new MessageEmbed()
        .setColor('RED')
        .setTitle('User Bans')
        .setDescription(`**${totalBans}** bans.`)
        .addFields(fields)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
        .setTimestamp();
}
