const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const { isConfiguredGuild } = require('../../utils/singleGuildGuard');

module.exports = class GuildCreateEvent extends BaseEvent {
    constructor() {
        super('guildCreate');
    }

    async run(client, guild) {
        try {
            if (!isConfiguredGuild(client, guild.id)) {
                client.logger.warn(`[SINGLE-GUILD] Leaving unexpected guild ${guild.id}; configured guild is ${client.config.discord.guildId}.`);
                await guild.leave();
                return;
            }

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
