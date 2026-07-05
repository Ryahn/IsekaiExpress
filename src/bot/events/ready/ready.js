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
const { createNonOverlappingJob } = require('../../utils/nonOverlappingJob');
const { warmOcrWorker } = require('../../../../libs/scamImageScan');

const MODERATION_SLASH_CHANNEL_ID = '370603031361749004';

/**
 * Load and build one slash command module.
 *  - Throws on a genuine failure (require failure, data() throw, or toJSON() throw) so the caller
 *    can log + skip just that one file without aborting the whole ready handler.
 *  - Returns null for a non-command module (no usable `data` export, e.g. a shared helper file in
 *    the commands tree) so the caller can skip it silently, as before.
 * @returns {Promise<{ command: any, commandData: any, json: object } | null>}
 */
async function buildSlashCommand(client, file) {
    const command = require(file);
    const commandData = typeof command.data === 'function' ? await command.data(client) : command.data;
    if (!commandData || typeof commandData.toJSON !== 'function') {
        return null;
    }
    const json = commandData.toJSON();
    return { command, commandData, json };
}

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
                    if (file === 'handlers') {
                        continue;
                    }
                    commandFiles = commandFiles.concat(getCommandFiles(filePath));
                } else if (file.endsWith('.js')) {
                    commandFiles.push(filePath);
                }
            }

            return commandFiles;
        }

        let commandFiles = [];
        let discoveryFailed = false;
        try {
            commandFiles = getCommandFiles(slashCommands);
        } catch (err) {
            discoveryFailed = true;
            client.logger.error(`Slash command discovery failed (${slashCommands}): ${err?.message ?? String(err)}`);
        }

        try {
            await client.db.query
                .table('command_settings')
                .whereIn('name', OBSOLETE_MODERATION_COMMAND_NAMES)
                .delete();
        } catch (e) {
            client.logger.error('command_settings obsolete cleanup:', e);
        }

        const runStaleInviteCleanup = createNonOverlappingJob('stale invite cleanup', client.logger, async () => {
            try {
                await client.db.expireStalePendingInvites(7);
            } catch (e) {
                client.logger.error('expireStalePendingInvites:', e);
            }
        });
        await runStaleInviteCleanup();

        if (client.pendingInvitesCleanupInterval) clearInterval(client.pendingInvitesCleanupInterval);
        client.pendingInvitesCleanupInterval = setInterval(runStaleInviteCleanup, 24 * 60 * 60 * 1000);

        let loadedCount = 0;
        let failedCount = 0;
        for (const file of commandFiles) {
            let built;
            try {
                built = await buildSlashCommand(client, file);
            } catch (err) {
                // Isolate a bad command file: log filename + reason, skip it, keep loading the rest.
                failedCount += 1;
                client.logger.error(`Skipping slash command file ${path.basename(file)}: ${err?.message ?? String(err)}`);
                continue;
            }

            // Non-command module (no `data` export) — silently skip, as the original code did.
            if (!built) continue;

            const { command, commandData, json } = built;
            commands.push(json);
            commandInfo.push({
                name: commandData.name,
                description: commandData.description,
            });
            client.slashCommands.set(commandData.name, command);
            loadedCount += 1;

            // command_settings seeding is best-effort and must not drop a valid command from
            // registration if the DB write fails.
            try {
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
            } catch (err) {
                client.logger.error(`command_settings seeding failed for ${commandData.name}: ${err?.message ?? String(err)}`);
            }
        }

        // Write the command manifest once, after the loop, with only successfully-built commands.
        try {
            fs.writeFileSync('slashCommands.json', JSON.stringify(commandInfo, null, 2));
        } catch (err) {
            client.logger.error(`Failed to write slashCommands.json: ${err?.message ?? String(err)}`);
        }

        if (failedCount > 0) {
            client.logger.warn(`Slash command load: ${loadedCount} loaded, ${failedCount} failed/skipped.`);
        }

        for (const logicalKey of MOD_COMMAND_LOGICAL_KEYS) {
            // Best-effort, per-key: a DB failure on one key must not abort startup or block
            // slash registration. createCommandSettings is onConflict-ignore (rarely throws).
            try {
                const modHash = crypto.createHash('md5').update(logicalKey).digest('hex');
                const displayName = logicalKey.replace(/:/g, ' ');
                await client.db.createCommandSettings(
                    displayName,
                    modHash,
                    'moderation',
                    MODERATION_SLASH_CHANNEL_ID,
                );
            } catch (err) {
                client.logger.error(`mod command_settings seeding failed for ${logicalKey}: ${err?.message ?? String(err)}`);
            }
        }

        // Never register an EMPTY command list — a PUT with [] wipes all existing guild slash
        // commands. If discovery failed (or nothing built), skip registration and keep the
        // currently-registered commands in place.
        if (discoveryFailed || commands.length === 0) {
            client.logger.error(
                `Skipping slash command registration (${discoveryFailed ? 'command discovery failed' : 'no commands built'}) ` +
                'to avoid wiping existing guild slash commands with an empty list. Bot will continue.',
            );
        } else {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(client.config.discord.applicationId, client.config.discord.guildId),
                    { body: commands },
                );
                client.logger.info(`Registered ${commands.length} guild slash commands.`);
            } catch (err) {
                // Do NOT abort the rest of ready setup (guild config, prefixes, custom command cache,
                // intervals) if registration fails. Log code + message only — never the token/headers.
                // e.g. DiscordAPIError[10002] Unknown Application => APPLICATION_ID/token mismatch.
                client.logger.error(
                    `Slash command registration failed (code ${err?.code ?? 'n/a'}): ${err?.message ?? String(err)}. ` +
                    'Bot will continue; slash commands may be stale until resolved.',
                );
            }
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

        warmOcrWorker(client).catch((e) => {
            client.logger.warn(`scamImageScan OCR warmup failed: ${e?.message ?? String(e)}`);
        });

        if (client.config.imgApi?.apiKey) {
            const { getCachedTypes } = require('../../utils/imgApi');
            getCachedTypes('furry', client.config.imgApi.apiKey).catch((e) => {
                client.logger.warn(`Image API furry types warmup failed: ${e?.message ?? String(e)}`);
            });
        }

        client.user.setActivity('zonies cry', { type: ActivityType.Listening });
        client.logger.info(`${client.user.tag} has logged in. Using prefix: ${client.guildCommandPrefixes.get(client.config.discord.guildId)}`);
        client.logger.info('Collection refreshed, no errors occurred while starting the program! SUCCESS!');
    }
}

// Exposed for focused unit testing of command-file loading isolation.
module.exports.buildSlashCommand = buildSlashCommand;
