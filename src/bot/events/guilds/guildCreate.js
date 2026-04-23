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

            const result = await client.db.getGuildConfigurable(guild.id);

            if (result && result.cmdPrefix) {
                client.guildCommandPrefixes.set(guild.id, result.cmdPrefix);
                client.logger.success(`Guild ${guild.id} added with prefix ${result.cmdPrefix}`);
            } else {
                client.logger.warn(`No prefix found for guild ${guild.id}, using default.`);
            }

            client.guildGlobalLock.set(guild.id, { locked: false, channelIds: [] });

        } catch (err) {
            client.logger.error(`Error adding guild ${guild.id} to the database:`, err);
        }
    }
}
