const BaseCommand = require('../../../utils/structures/BaseCommand');
const StateManager = require('../../../utils/StateManager');
const { getConnection } = require('../../../../database/db');
const moment = require('moment');
const { MessageEmbed } = require('discord.js');
require('dotenv').config({ path: '../../../../../.env' });

module.exports = class Warn extends BaseCommand {
    constructor() {
        super('warnings', 'moderation', ['warns', 'listwarns']);
    }

    async run(client, message) {
        const prefix = process.env.PREFIX;

		if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
			return message.channel.send('The warning system is not enabled.');
		}

        if (message.member.permissions.has("BAN_MEMBERS")) {
            const [cmdName, userId, pageArg] = message.content.slice(prefix.length).split(/\s+/);
            const pageRequested = pageArg ? parseInt(pageArg, 10) - 1 : 0; // Default to page 0 (first page)

            if (userId) {
                try {
					let targetId;
                    const mentionRegex = /^<@!?(\d+)>$/;
                    if (mentionRegex.test(userId)) {
                        targetId = userId.match(mentionRegex)[1];
                    } else {
                        targetId = userId;
                    }

					if (targetId === message.author.id) {
						return message.channel.send('You cannot warn yourself.');
					}

                    const connection = await getConnection();
                    const stateManager = new StateManager(connection);

                    // Query to get total warnings
                    const totalWarningsResult = await stateManager.query(
                        `SELECT COUNT(*) AS total_warnings FROM warnings WHERE warn_user_id = ?`,
                        [targetId]
                    );
                    const totalWarnings = totalWarningsResult[0].total_warnings;

                    // Handle pagination variables
                    const itemsPerPage = 5; // Number of warnings per page
                    const totalPages = Math.ceil(totalWarnings / itemsPerPage);
                    let currentPage = Math.min(Math.max(pageRequested, 0), totalPages - 1); // Clamp current page

                    // Query to get warnings for the requested page (limit and offset are directly embedded)
                    const warnings = await stateManager.query(
                        `SELECT warn_id, warn_by_user, warn_by_id, warn_reason, created_at 
                         FROM warnings 
                         WHERE warn_user_id = ? 
                         ORDER BY created_at DESC 
                         LIMIT ${itemsPerPage} OFFSET ${currentPage * itemsPerPage}`,
                        [targetId] // Only the targetId is passed as a parameter
                    );

                    let fields = [];
                    warnings.forEach(warning => {
                        fields.push({
                            name: `Warning ID: ${warning.warn_id}`,
                            value: `Moderator: <@${warning.warn_by_id}>\nReason: ${warning.warn_reason}\nDate: ${moment.unix(warning.created_at).format('MMMM Do YYYY, h:mm:ss a')}`,
                            inline: false
                        });
                    });

                    const embed = new MessageEmbed()
                        .setColor('RED')
                        .setTitle('User Warnings')
                        .setDescription(`<@${targetId}> has a total of **${totalWarnings}** warnings.`)
                        .addFields(fields)
                        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` })
                        .setTimestamp();

                    message.channel.send({ embeds: [embed] });

                } catch (err) {
                    console.error(err);
                    message.channel.send(`An error occurred while trying to list warnings for user <@${userId}>.`);
                }
            } else {
                message.channel.send('Please provide a valid user ID or mention.');
            }
        } else {
            message.channel.send('You do not have permission to list warnings for users.');
        }
    }
};
