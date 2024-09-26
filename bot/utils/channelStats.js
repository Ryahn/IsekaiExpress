const StateManager = require('./StateManager');

async function updateChannelStats(channelId) {
    const stateManager = new StateManager();
    const filename = 'channelStats.js';

    try {
        await stateManager.initPool();

        // Get current date in YYYY-MM-DD format
        const currentDate = new Date().toISOString().split('T')[0];

        // Check if an entry for this channel and date already exists
        const [existingEntry] = await stateManager.query(
            'SELECT * FROM channel_stats WHERE channel_id = ? AND month_day = ?',
            [channelId, currentDate]
        );

        if (existingEntry.length > 0) {
            // If entry exists, increment the total
            await stateManager.query(
                'UPDATE channel_stats SET total = total + 1 WHERE channel_id = ? AND month_day = ?',
                [channelId, currentDate]
            );
        } else {
            // If no entry exists, create a new one
            await stateManager.query(
                'INSERT INTO channel_stats (channel_id, month_day, total) VALUES (?, ?, 1)',
                [channelId, currentDate]
            );
        }
    } catch (error) {
        console.error('Error updating channel stats:', error);
    } finally {
        await stateManager.closePool(filename);
    }
}

module.exports = { updateChannelStats };
