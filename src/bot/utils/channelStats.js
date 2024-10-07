const db = require('../../../database/db');

async function updateChannelStats(channelId, channelName) {

    try {
        const currentDate = new Date().toISOString().split('T')[0];

        const [existingEntry] = await db.getChannelStats(channelId, currentDate);

        if (existingEntry) {
            await db.updateChannelStats(channelId, currentDate);
        } else {
            await db.createChannelStats(channelId, channelName, currentDate);
        }
    } catch (error) {
        console.error('Error updating channel stats:', error);
    } finally {
        await db.end();
    }
}

module.exports = { updateChannelStats };
