const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require("path");
const fs = require("node:fs");
const { Collection } = require("discord.js");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const db = require('../../../database/db');
const config = require('../../../../.config');
const rest = new REST({ version: '9' }).setToken(config.discord.botToken);
const logger = require('silly-logger');

module.exports = class ReadyEvent extends BaseEvent {
    constructor() {
        super('ready');
    }

    async run(client) {
        logger.info(`${client.user.tag} has logged in.`);

        client.langs = new Collection();
        client.guildSubReddits = new Collection();
        client.guildCommandPrefixes = new Collection();
        client.guildWelcomes = new Collection();
        client.slashCommands = new Collection();

        const commands = [];
        const commandInfo = [];
        const slashCommands = path.join(__dirname, '../../commands/slashCommands');
        const commandFiles = fs.readdirSync(slashCommands).filter(file => file.endsWith('.js'));


                for (const file of commandFiles) {
                    const command = require(`${slashCommands}/${file}`);
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
                        Routes.applicationGuildCommands(process.env.APPLICATION_ID, process.env.DISCORD_GUILD_ID),
                        { body: commands },
                    );

                } catch (err) {
                    logger.error(err)
                }

        // Start of checking if all Guild-Ids are in the database
        const guildIds = client.guilds.cache.map(g => g.id);
        let dbGuildIds = [];

        try {
            const result = await db.query(`SELECT guildId FROM GuildConfigurable`);
            dbGuildIds = result.map(row => row.guildId);
        } catch (err) {
            await db.end();
            logger.error("Error fetching guild IDs from the database:", err);
        }

        // Insert missing guild IDs into the Guilds and GuildConfigurable tables
        for (const guildId of guildIds) {
            try {
                if (!dbGuildIds.includes(guildId)) {
                    await db.query(
                        `INSERT INTO Guilds (guildId, ownerId) VALUES (?, ?)`,
                        [guildId, client.guilds.resolve(guildId).ownerId]
                    );
                    await db.query(
                        `INSERT INTO GuildConfigurable (guildId) VALUES (?)`,
                        [guildId]
                    );
                    console.log(`Guild ${guildId} added to Guilds and GuildConfigurable.`);
                }
            } catch (err) {
                await db.end();
                logger.error(`Error inserting guild ${guildId}:`, err);
            }
        }

        // Start of getting all data out of the database
        try {
            for (const guildId of guildIds) {
                const result = await db.query(
                    `SELECT cmdPrefix, subReddit, guildWelcome, guildVolume, guildLanguage FROM GuildConfigurable WHERE guildId = ?`,
                    [guildId]
                );
                
                if (result.length > 0) {
                    const { cmdPrefix, subReddit, guildWelcome, guildLanguage } = result[0];
                    
                    client.guildSubReddits.set(guildId, subReddit);
                    client.langs.set(guildId, guildLanguage);
                    client.guildCommandPrefixes.set(guildId, cmdPrefix);
                    client.guildWelcomes.set(guildId, guildWelcome);
                }
            }
        } catch (err) {
            await db.end();
            logger.error("Error fetching guild configuration:", err);
        } finally {
            db.end();
        }
        // End of section

        client.user.setActivity(`zonies cry`, { type: 'LISTENING' });
        logger.info('Collection refreshed, no errors occurred while starting the program! SUCCESS!');
    }
}
