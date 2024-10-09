const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const crypto = require('crypto');
const { updateChannelStats } = require('../../utils/channelStats');
const { MessageEmbed } = require('discord.js');

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;

        /************************************
         * XP SYSTEM
         ************************************/
        function isWeekend(weekendDays) {
            const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
            return weekendDays.split(',').includes(today);
        }
        
        try {
            const user = await client.db.getUserXP(message.author.id);
            const settings = await client.db.getXPSettings();
            user.message_count++;

            if (user.message_count >= settings.messages_per_xp) {
                user.message_count = 0;
                let xpGain = Math.floor(Math.random() * (settings.max_xp_per_gain - settings.min_xp_per_gain + 1)) + settings.min_xp_per_gain;

                if (settings.double_xp_enabled || isWeekend(settings.weekend_days)) {
                    xpGain *= settings.weekend_multiplier;
                }

                user.xp += xpGain;

                // Check for level up
                const newLevel = client.utils.calculateLevel(user.xp);
                if (newLevel > user.level) {
                    user.level = newLevel;
                    // this.sendLevelUpMessage(message.channel, message.author, newLevel);
                }

                await client.db.updateUserXPAndLevel(message.author.id, user.xp, user.level, user.message_count);
                client.logger.info(`${message.author.username} gained ${xpGain} XP and is now level ${user.level}`);
            } else {
                await client.db.updateUserMessageCount(message.author.id, user.message_count);
            }
        } catch (error) {
            client.logger.error('Error in XP system:', error);
        }
        /************************************
         * END XP SYSTEM
         ************************************/

        try {
            /************************************
             * AFK SYSTEM
             ************************************/
            const [afkUser] = await client.db.getAfkUser(message.author.id, message.guild.id);

            if (afkUser) {
                await client.db.deleteAfkUser(message.author.id, message.guild.id);
                const embed = new MessageEmbed()
                    .setColor('#00FF00')
                    .setDescription(`Welcome back, ${message.author}! Your AFK status has been removed.`);
                await message.reply({ embeds: [embed] });
            }

            const mentionedUsers = message.mentions.users;
            if (mentionedUsers.size > 0) {
                for (const [userId, user] of mentionedUsers) {
                    const [afkMentioned] = await client.db.getAfkUser(userId, message.guild.id);
                    if (afkMentioned) {
                        const embed = new MessageEmbed()
                            .setColor('#FFA500')
                            .setDescription(`${user} is currently AFK: ${afkMentioned.message}`);
                        await message.reply({ embeds: [embed] });
                    }
                }
            }
            /************************************
             * ENDAFK SYSTEM
             ************************************/

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

                    const [rows] = await client.db.getCommand(commandNameHash);

                    if (typeof rows !== 'undefined' && rows) {
                        let commandContent = rows.content;
                        const newUsageCount = rows.usage + 1;

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
                            await command.run(client, message, cmdArgs);
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

    sendLevelUpMessage(channel, user, newLevel) {
        const embed = new MessageEmbed()
            .setTitle('Level Up!')
            .setDescription(`Congratulations ${user.username}! You've reached level ${newLevel}!`)
            .setColor('#00FF00')
            .setThumbnail(user.displayAvatarURL());
        
        channel.send({ embeds: [embed] });
    }

}
