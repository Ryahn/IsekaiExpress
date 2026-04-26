const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require("path");
const fs = require("node:fs");
const { Collection, ActivityType } = require("discord.js");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const crypto = require('crypto');
const { parseWhitelistJson } = require('../../middleware/globalCommandLock');
const {
    MOD_COMMAND_LOGICAL_KEYS,
    OBSOLETE_MODERATION_COMMAND_NAMES,
} = require('../../../../libs/modSlashKey');

const MODERATION_SLASH_CHANNEL_ID = '370603031361749004';

module.exports = class ReadyEvent extends BaseEvent {
    constructor() {
        super('clientReady');
    }

    async run(client) {
        const rest = new REST({ version: '10' }).setToken(client.config.discord.botToken);

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

        try {
            await client.db.query
                .table('command_settings')
                .whereIn('name', OBSOLETE_MODERATION_COMMAND_NAMES)
                .delete();
        } catch (e) {
            client.logger.error('command_settings obsolete cleanup:', e);
        }

        try {
            await client.db.expireStalePendingInvites(7);
        } catch (e) {
            client.logger.error('expireStalePendingInvites:', e);
        }

        if (client.pendingInvitesCleanupInterval) clearInterval(client.pendingInvitesCleanupInterval);
        client.pendingInvitesCleanupInterval = setInterval(async () => {
            try {
                await client.db.expireStalePendingInvites(7);
            } catch (err) {
                client.logger.error('expireStalePendingInvites interval:', err);
            }
        }, 24 * 60 * 60 * 1000);

        for (const file of commandFiles) {
            const command = require(file);
            const commandData = typeof command.data === 'function' ? await command.data(client) : command.data;

            commands.push(commandData.toJSON());
            commandInfo.push({
                name: commandData.name,
                description: commandData.description,
            });
            client.slashCommands.set(commandData.name, command);
            const hash = crypto.createHash('md5').update(commandData.name).digest('hex');

            if (commandData.name === 'mod') {
                /* Per-subcommand rows seeded after this loop (MOD_COMMAND_LOGICAL_KEYS). */
            } else if (command.category === 'moderation') {
                await client.db.createCommandSettings(commandData.name, hash, command.category, MODERATION_SLASH_CHANNEL_ID);
            } else if (commandData.name === 'level' || commandData.name === 'import_rank') {
                await client.db.createCommandSettings(commandData.name, hash, command.category);
            } else {
                await client.db.createCommandSettings(commandData.name, hash, command.category, 'all');
            }
            fs.writeFileSync('slashCommands.json', JSON.stringify(commandInfo, null, 2));
        }

        for (const logicalKey of MOD_COMMAND_LOGICAL_KEYS) {
            const modHash = crypto.createHash('md5').update(logicalKey).digest('hex');
            const displayName = logicalKey.replace(/:/g, ' ');
            await client.db.createCommandSettings(
                displayName,
                modHash,
                'moderation',
                MODERATION_SLASH_CHANNEL_ID,
            );
        }

        // try {
            await rest.put(
                Routes.applicationGuildCommands(client.config.discord.applicationId, client.config.discord.guildId),
                { body: commands },
            );

        // } catch (err) {
        //     client.logger.error(err)
        // }

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
            if (guildIds.length) {
                const rows = await client.db.query
                    .table('GuildConfigurable')
                    .select('*')
                    .whereIn('guildId', guildIds);
                for (const result of rows) {
                    if (!result) continue;
                    const guildId = result.guildId;
                    const { cmdPrefix, subReddit, guildWelcome, guildLanguage } = result;
                    client.guildSubReddits.set(guildId, subReddit);
                    client.langs.set(guildId, guildLanguage);
                    client.guildCommandPrefixes.set(guildId, cmdPrefix);
                    client.guildWelcomes.set(guildId, guildWelcome);
                    client.guildGlobalLock.set(guildId, {
                        locked: Boolean(result.global_commands_locked),
                        channelIds: parseWhitelistJson(result.global_commands_whitelist_channel_ids)
                    });
                }
            }
        } catch (err) {
            client.logger.error("Error fetching guild configuration:", err);
        }

        try {
            await client.db.refreshCustomCommandsCache(client);
            client.logger.info(
                `Custom commands cache loaded (${client.customCommandsByHash.size} entries, revision ${client.customCommandsRevision})`
            );
        } catch (err) {
            client.logger.error('Error loading custom commands cache:', err);
        }

        if (client.customCommandsPollInterval) clearInterval(client.customCommandsPollInterval);
        if (client.customCommandsSafetyInterval) clearInterval(client.customCommandsSafetyInterval);

        const pollMs = client.config.customCommands?.pollMs ?? 5000;
        client.customCommandsPollInterval = setInterval(async () => {
            try {
                const rev = await client.db.getCustomCommandsRevision();
                if (rev > client.customCommandsRevision) {
                    await client.db.refreshCustomCommandsCache(client);
                    client.logger.info(`Custom commands cache reloaded (revision ${client.customCommandsRevision})`);
                }
            } catch (e) {
                client.logger.error('Custom commands revision poll failed:', e);
            }
        }, pollMs);

        const safetyMs = client.config.customCommands?.safetyRefreshMs ?? 0;
        if (safetyMs > 0) {
            client.customCommandsSafetyInterval = setInterval(async () => {
                try {
                    await client.db.refreshCustomCommandsCache(client);
                } catch (e) {
                    client.logger.error('Custom commands safety refresh failed:', e);
                }
            }, safetyMs);
        }

        client.user.setActivity('zonies cry', { type: ActivityType.Listening });
        client.logger.info(`${client.user.tag} has logged in. Using prefix: ${client.guildCommandPrefixes.get(client.config.discord.guildId)}`);
        client.logger.info('Collection refreshed, no errors occurred while starting the program! SUCCESS!');
    }
}
