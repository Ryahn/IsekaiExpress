async function getCachedAllowedChannel(client, commandHash) {
    const cacheKey = `allowedChannel-${commandHash}`;
    
    if (client.cache.allowedChannels.has(cacheKey)) {
        return client.cache.allowedChannels.get(cacheKey);
    }
    
    const allowedChannel = await client.db.getAllowedChannel(commandHash);
    client.cache.allowedChannels.set(cacheKey, allowedChannel);
    
    // Set cache to expire after 5 minutes
    setTimeout(() => {
        client.cache.allowedChannels.delete(cacheKey);
    }, 5 * 60 * 1000);
    
    return allowedChannel;
}

module.exports = { getCachedAllowedChannel };