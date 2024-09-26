const BaseEvent = require('../../utils/structures/BaseEvent');
const StateManager = require('../../utils/StateManager');
const path = require('path');

module.exports = class GuildDeleteEvent extends BaseEvent {
    constructor() {
        super('guildDelete');
    }

    async run(client, guild) {
        const stateManager = new StateManager();
        const filename = path.basename(__filename);
        try {
            await stateManager.initPool();
            // Delete from Guilds table
            await stateManager.query(
                `DELETE FROM Guilds WHERE guildId = ?`, [guild.id]
            );

            // Delete from GuildConfigurable table
            await stateManager.query(
                `DELETE FROM GuildConfigurable WHERE guildId = ?`, [guild.id]
            );

            console.log(`Guild ${guild.id} removed from database.`);
        } catch (err) {
            console.error(`Error removing guild ${guild.id} from the database:`, err);
        } finally {
            await stateManager.closePool(filename);
        }
    }
}
