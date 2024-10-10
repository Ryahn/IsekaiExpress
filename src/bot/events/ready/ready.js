const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require("path");
const fs = require("node:fs");
const { Collection } = require("discord.js");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

module.exports = class ReadyEvent extends BaseEvent {
    constructor() {
        super('ready');
    }

    async run(client) {
        const rest = new REST({ version: '9' }).setToken(client.config.discord.botToken);

        client.langs = new Collection();
        client.guildSubReddits = new Collection();
        client.guildCommandPrefixes = new Collection();
        client.guildWelcomes = new Collection();
        client.slashCommands = new Collection();

        const commands = [];
        const commandInfo = [];
        const slashCommands = path.join(__dirname, '../../commands/slashCommands');

        function getCommandFiles(dir) {
            const files = fs.readdirSync(dir);
            let commandFiles = [];

            for (const file of files) {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    commandFiles = commandFiles.concat(getCommandFiles(filePath));
                } else if (file.endsWith('.js')) {
                    commandFiles.push(filePath);
                }
            }

            return commandFiles;
        }

        const commandFiles = getCommandFiles(slashCommands);

        for (const file of commandFiles) {
            const command = require(file);
            commands.push(command.data.toJSON());
            commandInfo.push({
                name: command.data.name,
                description: command.data.description,
            });
            client.slashCommands.set(command.data.name, command);
            fs.writeFileSync('slashCommands.json', JSON.stringify(commandInfo, null, 2));
        }

        try {
            await rest.put(
                Routes.applicationGuildCommands(client.config.discord.applicationId, client.config.discord.guildId),
                { body: commands },
            );

        } catch (err) {
            client.logger.error(err)
        }

        const guildIds = client.guilds.cache.map(g => g.id);
        let dbGuildIds = [];

        try {
            const result = await client.db.query.table('GuildConfigurable').select('guildId');
            dbGuildIds = result.map(row => row.guildId);
        } catch (err) {
            client.logger.error("Error fetching guild IDs from the database:", err);
        }

        for (const guildId of guildIds) {
            try {
                if (!dbGuildIds.includes(guildId)) {
                    await client.db.createGuild(guildId, client.guilds.resolve(guildId).ownerId);
                    await client.db.createGuildConfigurable(guildId);
                    client.logger.info(`Guild ${guildId} added to Guilds and GuildConfigurable.`);
                }
            } catch (err) {
                client.logger.error(`Error inserting guild ${guildId}:`, err);
            }
        }

        try {
            for (const guildId of guildIds) {
                const result = await client.db.getGuildConfigurable(guildId);
                
                if (result) {
                    const { cmdPrefix, subReddit, guildWelcome, guildLanguage } = result;                    
                    client.guildSubReddits.set(guildId, subReddit);
                    client.langs.set(guildId, guildLanguage);
                    client.guildCommandPrefixes.set(guildId, cmdPrefix);
                    client.guildWelcomes.set(guildId, guildWelcome);
                }
            }
        } catch (err) {
            client.logger.error("Error fetching guild configuration:", err);
        }

        client.user.setActivity(`zonies cry`, { type: 'LISTENING' });
        client.logger.info(`${client.user.tag} has logged in. Using prefix: ${client.guildCommandPrefixes.get(client.config.discord.guildId)}`);
        client.logger.info('Collection refreshed, no errors occurred while starting the program! SUCCESS!');
    }
}
