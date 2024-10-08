const BaseEvent = require('../../utils/structures/BaseEvent');

module.exports = class GuildDeleteEvent extends BaseEvent {
    constructor() {
        super('guildDelete');
    }

    async run(client, guild) {
        try {
            await client.db.deleteGuild(guild.id);
            await client.db.deleteGuildConfigurable(guild.id);

            client.logger.success(`Guild ${guild.id} removed from database.`);
        } catch (err) {
            client.logger.error(`Error removing guild ${guild.id} from the database:`, err);
        }
    }
}
