const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const crypto = require('crypto');
const { updateChannelStats } = require('../../utils/channelStats');
const { MessageEmbed } = require('discord.js');
const { xpSystem } = require('../../../../libs/xpSystem');
const { afkSystem } = require('../../../../libs/afkSystem');
const { getCachedAllowedChannel } = require('../../utils/cache');
const { checkCommandCooldown, setCooldown } = require('../../middleware/commandMiddleware');
const { executeWithRateLimit } = require('../../middleware/apiMiddleware');

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;
        
        try {
            await xpSystem(client, message);
            await afkSystem(client, message);

            /************************************
             * CUSTOM COMMANDS
             ************************************/

            let prefix = client.guildCommandPrefixes.get(message.guild.id) || 'o!';
            const usedPrefix = message.content.slice(0, prefix.length);

            if (client.config.channelStats.enabled) {
                const channelId = message.channelId;
                try {
                    await updateChannelStats(channelId, message.channel.name);
                } catch (error) {
                    client.logger.error('Error updating channel stats:', error);
                }
            }

            if (usedPrefix === prefix) {
                const [cmdName, ...cmdArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
                let filename = path.basename(__filename);
                filename = `${filename} - ${usedPrefix}${cmdName}`;

                try {
                    const commandNameHash = crypto.createHash('md5').update(cmdName.toLowerCase()).digest('hex');
                    const [customCmd] = await client.db.getCommand(commandNameHash);

                    if (typeof customCmd !== 'undefined' && customCmd) {
                        let commandContent = customCmd.content;
                        const newUsageCount = customCmd.usage + 1;

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

                        commandContent = parseCommandContent(commandContent, message);

                        message.channel.send(commandContent);

                        await client.db.updateCommandUsage(commandNameHash, newUsageCount);

                        return;
                    }
                    /************************************
                     * END CUSTOM COMMANDS
                     ************************************/

                    const command = client.commands.get(cmdName.toLowerCase()) || 
                                    client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(cmdName.toLowerCase()));

                    if (command) {
                        try {
                            // Check cooldown
                            const cooldownCheck = checkCommandCooldown(client, message.author.id, command.name);
                            
                            if (cooldownCheck.onCooldown) {
                                return message.reply(`You are on cooldown! Please wait ${cooldownCheck.remainingTime.toFixed(1)} more seconds.`);
                            }
                            
                            // Check if command is restricted to specific channels
                            const commandNameHash = crypto.createHash('md5').update(cmdName.toLowerCase()).digest('hex');
                            const allowedChannel = await getCachedAllowedChannel(client, commandNameHash);
                            
                            if (allowedChannel && allowedChannel.length > 0) {
                                // Command is restricted to specific channels
                                const channelIds = allowedChannel.map(ch => ch.channel_id);
                                
                                if (!channelIds.includes(message.channel.id)) {
                                    // Command used in a non-allowed channel
                                    const allowedChannelMentions = channelIds
                                        .map(id => `<#${id}>`)
                                        .join(', ');
                                    
                                    return message.reply(`This command can only be used in: ${allowedChannelMentions}`);
                                }
                            }
                            
                            // Execute command with rate limiting for API calls
                            await executeWithRateLimit(client, 'discord-api', async () => {
                                await command.run(client, message, cmdArgs);
                            });
                            
                            // Set cooldown after successful execution
                            setCooldown(client, message.author.id, command.name);
                        } catch (err) {
                            client.logger.error(`Error executing command ${cmdName}:`, err);
                            message.channel.send('There was an error executing that command.');
                        }
                    } else {
                        message.channel.send('Command not found.');
                    }

                } catch (err) {
                    client.logger.error('Error querying custom commands:', err);
                    message.channel.send('There was an error executing that command.');
                }
            }
        } catch (error) {
            client.logger.error('Error in message event:', error);
        }
    }
};
