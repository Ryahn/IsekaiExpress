const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const db = require('../../../database/db');
const logger = require('silly-logger');

module.exports = class GuildCreateEvent extends BaseEvent {
    constructor() {
        super('guildCreate');
    }

    async run(client, guild) {
        try {
            await db.createGuild(guild.id, guild.ownerId);

            await db.createGuildConfigurable(guild.id);

            const result = await db.getGuildConfigurable(guild.id);

            if (result.length > 0 && result[0].cmdPrefix) {
                const prefix = result[0].cmdPrefix;
                client.guildCommandPrefixes.set(guild.id, prefix);
                logger.success(`Guild ${guild.id} added with prefix ${prefix}`);
            } else {
                logger.warn(`No prefix found for guild ${guild.id}, using default.`);
            }

        } catch (err) {
            logger.error(`Error adding guild ${guild.id} to the database:`, err);
        } finally {
            await db.end();
        }
    }
}
