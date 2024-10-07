const BaseEvent = require('../../utils/structures/BaseEvent');
const StateManager = require('../../utils/StateManager');
const path = require('path');

module.exports = class GuildCreateEvent extends BaseEvent {
    constructor() {
        super('guildCreate');
    }

    async run(client, guild) {
        const stateManager = new StateManager();
        const filename = path.basename(__filename);

        try {
            await stateManager.initPool();

            // Insert guild into the Guilds table
            await stateManager.query(
                `INSERT INTO Guilds (guildId, ownerId) VALUES(?, ?)`,
                [guild.id, guild.ownerId]
            );

            // Insert the new guild into GuildConfigurable with default values
            await stateManager.query(
                `INSERT INTO GuildConfigurable (guildId) VALUES (?)`,
                [guild.id]
            );

            // Fetch the command prefix for the newly created guild
            const result = await stateManager.query(
                `SELECT cmdPrefix FROM GuildConfigurable WHERE guildId = ?`,
                [guild.id]
            );

            if (result.length > 0 && result[0].cmdPrefix) {
                const prefix = result[0].cmdPrefix;
                client.guildCommandPrefixes.set(guild.id, prefix);
                console.log(`Guild ${guild.id} added with prefix ${prefix}`);
            } else {
                console.warn(`No prefix found for guild ${guild.id}, using default.`);
            }

        } catch (err) {
            console.error(`Error adding guild ${guild.id} to the database:`, err);
        } finally {
            await stateManager.closePool(filename);
        }
    }
}
