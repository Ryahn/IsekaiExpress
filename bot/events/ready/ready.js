const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require("path");
const fs = require("node:fs").promises;
const { Collection } = require("discord.js");
require('dotenv').config();
const StateManager = require('../../utils/StateManager');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);

module.exports = class ReadyEvent extends BaseEvent {
    constructor() {
        super('ready');
        this.stateManager = new StateManager();
    }

    async run(client) {
        console.log(`${client.user.tag} has logged in.`);

        // Initialize collections
        ['langs', 'guildSubReddits', 'guildCommandPrefixes', 'guildWelcomes', 'slashCommands'].forEach(collection => {
            client[collection] = new Collection();
        });

        await this.loadSlashCommands(client);
        await this.syncGuildsWithDatabase(client);
        await this.loadGuildConfigurations(client);

        client.user.setActivity(`zonies cry`, { type: 'LISTENING' });
        console.log('Collection refreshed, no errors occurred while starting the program! SUCCESS!');
    }

    async loadSlashCommands(client) {
        const slashCommands = path.join(__dirname, '../../commands/slashCommands');
        const commandFiles = await fs.readdir(slashCommands);
        const commands = [];
        const commandInfo = [];

        for (const file of commandFiles.filter(file => file.endsWith('.js'))) {
            const command = require(`${slashCommands}/${file}`);
            commands.push(command.data.toJSON());
            commandInfo.push({
                name: command.data.name,
                description: command.data.description,
            });
            client.slashCommands.set(command.data.name, command);
        }

        await fs.writeFile('slashCommands.json', JSON.stringify(commandInfo, null, 2));

        try {
            await rest.put(
                Routes.applicationGuildCommands(process.env.APPLICATION_ID, process.env.DISCORD_GUILD_ID),
                { body: commands },
            );
        } catch (err) {
            console.error("Error registering slash commands:", err);
        }
    }

    async syncGuildsWithDatabase(client) {
        const guildIds = client.guilds.cache.map(g => g.id);

        try {
            const result = await this.stateManager.query(`SELECT guildId FROM GuildConfigurable`);
            const dbGuildIds = result.map(row => row.guildId);

            for (const guildId of guildIds) {
                if (!dbGuildIds.includes(guildId)) {
                    await this.stateManager.query(
                        `INSERT INTO Guilds (guildId, ownerId) VALUES (?, ?)`,
                        [guildId, client.guilds.resolve(guildId).ownerId]
                    );
                    await this.stateManager.query(
                        `INSERT INTO GuildConfigurable (guildId) VALUES (?)`,
                        [guildId]
                    );
                    console.log(`Guild ${guildId} added to Guilds and GuildConfigurable.`);
                }
            }
        } catch (err) {
            console.error("Error syncing guilds with database:", err);
        } finally {
            this.stateManager.closePool(path.basename(__filename));
        }
    }

    async loadGuildConfigurations(client) {
        const guildIds = client.guilds.cache.map(g => g.id);

        try {
            for (const guildId of guildIds) {
                const result = await this.stateManager.query(
                    `SELECT cmdPrefix, subReddit, guildWelcome, guildLanguage FROM GuildConfigurable WHERE guildId = ?`,
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
            console.error("Error fetching guild configurations:", err);
        } finally {
            this.stateManager.closePool(path.basename(__filename));
        }
    }
}
