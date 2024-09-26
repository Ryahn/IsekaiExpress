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
        super('delwarn', 'moderation', ['deletewarn', 'dwarn']);
    }

    async run(client, message) {
        // Define the prefix or fetch it from your configuration
        const prefix = process.env.PREFIX; // Replace this with the actual prefix you're using

		if (process.env.WARNING_SYSTEM_ENABLED !== 'true') {
			return message.channel.send('The warning system is not enabled.');
		}

        if (message.member.permissions.has("BAN_MEMBERS")) {
            // Split message content to extract command, userId, and reason
            const [cmdName, warnId] = message.content.slice(prefix.length).split(/\s+/);

            if (warnId && warnId.length === 12) {
                try {

                    const connection = await getConnection();
                    const stateManager = new StateManager(connection);

                    // Insert warning data into the database
                    await stateManager.query(
                        `DELETE FROM warnings WHERE warn_id = ?`,
                        [warnId]
                    );

                    message.channel.send(`Warning with ID \`${warnId}\` has been deleted.`);

                } catch (err) {
                    console.error(err);
                    message.channel.send(`An error occurred while trying to delete warning ${warnId}.`);
                }
            } else {
                message.channel.send('Please provide a valid warning ID.');
            }
        } else {
            message.channel.send('You do not have permission to delete warnings.');
        }
    }
}
