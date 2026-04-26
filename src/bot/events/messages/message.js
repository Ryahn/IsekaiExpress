const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const crypto = require('crypto');
const { updateChannelStats } = require('../../utils/channelStats');
const { xpSystem } = require('../../../../libs/xpSystem');
const { afkSystem } = require('../../../../libs/afkSystem');
const { getCachedAllowedChannel } = require('../../utils/cache');
const { checkMessageGlobalCommandLock } = require('../../middleware/globalCommandLock');
const { checkCommandCooldown, setCooldown } = require('../../middleware/commandMiddleware');
const { executeWithRateLimit } = require('../../middleware/apiMiddleware');
const { handleFarmMessage } = require('./farmMessage');
const { processMemberMessageInvites } = require('../../../../libs/invitePolicy');
const { processImageReview } = require('../../../../libs/imageReview');

function parseCommandContent(content, message) {
    const randomPattern = /\{random:(.*?)\}/g;
    content = content.replace(randomPattern, (match, options) => {
        const optionList = options.split(/[,~]/);
        const randomIndex = Math.floor(Math.random() * optionList.length);
        return optionList[randomIndex].trim();
    });

    content = content.replace('{mention}', `<@${message.author.id}>`);

    return content;
}

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;

        try {
            await xpSystem(client, message);
            await afkSystem(client, message);

            try {
                await client.db.incrementGuildUserMessageCount(message.guild.id, message.author.id);
            } catch (e) {
                client.logger.error('incrementGuildUserMessageCount:', e);
            }

            const staffRoleId = client.config.roles.staff;
            try {
                await processMemberMessageInvites(client, message, staffRoleId);
            } catch (e) {
                client.logger.error('invitePolicy:', e);
            }
            try {
                await processImageReview(client, message, staffRoleId);
            } catch (e) {
                client.logger.error('imageReview:', e);
            }

            /************************************
             * PREFIX + CUSTOM / BUILT-IN COMMANDS
             ************************************/

            let prefix = client.guildCommandPrefixes.get(message.guild.id) || client.config.discord.prefix || 'o!';
            const usedPrefix = message.content.slice(0, prefix.length);

            if (client.config.channelStats.enabled) {
                const channelId = message.channelId;
                try {
                    await updateChannelStats(channelId, message.channel.name);
                } catch (error) {
                    client.logger.error('Error updating channel stats:', error);
                }
            }

            const farmHandled = await handleFarmMessage(message);
            if (farmHandled) {
                return;
            }

            if (usedPrefix === prefix) {
                const [cmdName, ...cmdArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
                if (!cmdName) return;

                const globalLock = await checkMessageGlobalCommandLock(client, message);
                if (!globalLock.allowed) {
                    return message.reply(globalLock.message);
                }

                const cmdLower = cmdName.toLowerCase();
                const commandNameHash = crypto.createHash('md5').update(cmdLower).digest('hex');

                if (client.builtinChatCommandKeys.has(cmdLower)) {
                    const command = client.commands.get(cmdLower) ||
                        client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(cmdLower));

                    if (!command) {
                        return message.channel.send('Command not found.');
                    }

                    try {
                        const cooldownCheck = checkCommandCooldown(client, message.author.id, command.name);

                        if (cooldownCheck.onCooldown) {
                            return message.reply(`You are on cooldown! Please wait ${cooldownCheck.remainingTime.toFixed(1)} more seconds.`);
                        }

                        const allowedChannel = await getCachedAllowedChannel(client, commandNameHash);

                        if (allowedChannel && allowedChannel.channel_id && allowedChannel.channel_id !== 'all') {
                            if (message.channel.id !== allowedChannel.channel_id) {
                                return message.reply(
                                    `This command can only be used in: <#${allowedChannel.channel_id}>`
                                );
                            }
                        }

                        await executeWithRateLimit(client, 'discord-api', async () => {
                            await command.run(client, message, cmdArgs);
                        });

                        setCooldown(client, message.author.id, command.name);
                    } catch (err) {
                        client.logger.error(`Error executing command ${cmdName}:`, err);
                        message.channel.send('There was an error executing that command.');
                    }
                    return;
                }

                try {
                    const customContent = client.customCommandsByHash.get(commandNameHash);
                    if (customContent !== undefined) {
                        const text = parseCommandContent(customContent, message);
                        await message.channel.send(text);
                        await client.db.incrementCustomCommandUsage(commandNameHash);
                        return;
                    }
                    message.channel.send('Command not found.');
                } catch (err) {
                    client.logger.error('Error running custom command:', err);
                    message.channel.send('There was an error executing that command.');
                }
            }
        } catch (error) {
            client.logger.error('Error in message event:', error);
        }
    }
};
