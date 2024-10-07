const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const db = require('../../../database/db');
const logger = require('silly-logger');
module.exports = class GuildDeleteEvent extends BaseEvent {
    constructor() {
        super('guildDelete');
    }

    async run(client, guild) {
        try {
            await db.deleteGuild(guild.id);
            await db.deleteGuildConfigurable(guild.id);

            logger.success(`Guild ${guild.id} removed from database.`);
        } catch (err) {
            logger.error(`Error removing guild ${guild.id} from the database:`, err);
        } finally {
            await db.end();
        }
    }
}
