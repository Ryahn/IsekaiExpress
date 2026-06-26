function configuredGuildId(client) {
  return client.config?.discord?.guildId;
}

function isConfiguredGuild(client, guildId) {
  const expectedGuildId = configuredGuildId(client);
  return !expectedGuildId || guildId === expectedGuildId;
}

function logUnexpectedGuildOnce(client, guildId, source) {
  if (!guildId || isConfiguredGuild(client, guildId)) {
    return;
  }

  if (!client.unexpectedGuildsLogged) {
    client.unexpectedGuildsLogged = new Set();
  }

  const key = `${source}:${guildId}`;
  if (client.unexpectedGuildsLogged.has(key)) {
    return;
  }

  client.unexpectedGuildsLogged.add(key);
  client.logger.warn(
    `[SINGLE-GUILD] Ignoring ${source} from guild ${guildId}; configured guild is ${configuredGuildId(client)}.`,
  );
}

module.exports = {
  configuredGuildId,
  isConfiguredGuild,
  logUnexpectedGuildOnce,
};
