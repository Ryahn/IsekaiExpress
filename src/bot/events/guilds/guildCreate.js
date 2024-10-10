const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');

module.exports = class GuildCreateEvent extends BaseEvent {
    constructor() {
        super('guildCreate');
    }

    async run(client, guild) {
        try {
            await client.db.createGuild(guild.id, guild.ownerId);

            await client.db.createGuildConfigurable(guild.id);

            const result = await db.getGuildConfigurable(guild.id);

            if (result.length > 0 && result.cmdPrefix) {
                const prefix = result.cmdPrefix;
                client.guildCommandPrefixes.set(guild.id, prefix);
                client.logger.success(`Guild ${guild.id} added with prefix ${prefix}`);
            } else {
                client.logger.warn(`No prefix found for guild ${guild.id}, using default.`);
            }

        } catch (err) {
            client.logger.error(`Error adding guild ${guild.id} to the database:`, err);
        }
    }
}
