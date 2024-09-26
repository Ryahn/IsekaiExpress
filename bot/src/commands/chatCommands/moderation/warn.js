const BaseCommand = require('../../../utils/structures/BaseCommand');
const StateManager = require('../../../utils/StateManager');
const { getConnection } = require('../../../../database/db');
const { generateUniqueId } = require('../../../utils/functions');
const moment = require('moment');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config({ path: '../../../../../.env' });
const { MessageEmbed, } = require('discord.js');

module.exports = class Warn extends BaseCommand {
    constructor() {
        super('warn', 'moderation', ['warnuser', 'wuser']);
    }

    async run(client, message) {
        // Define the prefix or fetch it from your configuration
        const prefix = process.env.PREFIX; // Replace this with the actual prefix you're using

        if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
			return message.channel.send('The warning system is not enabled.');
		}

        if (message.member.permissions.has("BAN_MEMBERS")) {
            // Split message content to extract command, userId, and reason
            const [cmdName, userId, ...reasonParts] = message.content.slice(prefix.length).split(/\s+/);
            const reason = reasonParts.join(' ') || 'No reason provided'; // Join the rest of the arguments as reason

            if (userId) {
                try {
					let targetId;

                    // Check if the userId is a mention or plain ID
                    const mentionRegex = /^<@!?(\d+)>$/;
                    if (mentionRegex.test(userId)) {
                        // Extract the actual ID from the mention
                        targetId = userId.match(mentionRegex)[1];
                    } else {
                        // Treat it as a plain user ID
                        targetId = userId;
                    }

					if (targetId === message.author.id) {
						return message.channel.send('You cannot warn yourself.');
					}

                    const connection = await getConnection();
                    const stateManager = new StateManager(connection);
                    const warningId = generateUniqueId(); // Generate unique warning ID
                    const staff = message.author;
                    
                    // Create a REST instance and fetch the user from Discord API
                    const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);
                    const member = await rest.get(Routes.user(targetId));

                    // Insert warning data into the database
                    await stateManager.query(
                        `INSERT INTO warnings (warn_id, warn_user_id, warn_user, warn_by_user, warn_by_id, warn_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [warningId, targetId, member.username, staff.username, staff.id, reason, moment().unix(), moment().unix()]
                    );

                    let embed = new MessageEmbed()
                        .setColor('RED')
                        .setTitle('User Warned')
                        .addFields([
                            { name: 'Warning ID', value: warningId, inline: false },
                            { name: 'User', value: `<@${targetId}>`, inline: true },
                            { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
                            { name: 'Reason', value: reason, inline: false }])
                        .setTimestamp();

                    let modEmbed = new MessageEmbed()
                        .setColor('RED')
                        .setTitle('New Warning Issued')
                        .addFields([
                            { name: 'User', value: `<@${targetId}>`, inline: true },
                            { name: 'Moderator', value: `<@${staff.id}>`, inline: true },
                            { name: 'Reason', value: reason, inline: false }])
                        .setTimestamp();

                    // Inform the channel that the user has been warned
                    message.channel.send({ embeds: [embed] });
                    const modChannel = message.guild.channels.cache.find(ch => ch.name === 'moderator-chat');
                    if (modChannel) {
                        modChannel.send({ embeds: [modEmbed] });
                    } else {
                        console.error('Moderator chat channel not found!');
                    }

                } catch (err) {
                    console.error(err);
                    message.channel.send(`An error occurred while trying to warn user <@${userId}>.`);
                }
            } else {
                message.channel.send('Please provide a valid user ID or mention along with a reason for the warning.');
            }
        } else {
            message.channel.send('You do not have permission to warn users.');
        }
    }
}
