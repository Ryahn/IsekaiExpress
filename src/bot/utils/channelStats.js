const db = require('../../../database/db');

async function updateChannelStats(channelId, channelName) {

    try {
        const currentDate = new Date().toISOString().split('T')[0];
        await db.incrementChannelStats(channelId, channelName, currentDate);
    } catch (error) {
        console.error('Error updating channel stats:', error);
    }
}

module.exports = { updateChannelStats };
