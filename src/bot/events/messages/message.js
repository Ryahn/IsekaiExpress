const BaseEvent = require('../../utils/structures/BaseEvent');
const path = require('path');
const db = require('../../../database/db');
const crypto = require('crypto');
const { updateChannelStats } = require('../../utils/channelStats');
const { MessageEmbed } = require('discord.js');
const logger = require('silly-logger');

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;

        try {
            const [afkUser] = await db.getAfkUser(message.author.id, message.guild.id);

            if (afkUser) {
                await db.deleteAfkUser(message.author.id, message.guild.id);
                const embed = new MessageEmbed()
                    .setColor('#00FF00')
                    .setDescription(`Welcome back, ${message.author}! Your AFK status has been removed.`);
                await message.reply({ embeds: [embed] });
            }

            // Check for mentions of AFK users
            const mentionedUsers = message.mentions.users;
            if (mentionedUsers.size > 0) {
                for (const [userId, user] of mentionedUsers) {
                    const [afkMentioned] = await db.getAfkUser(userId, message.guild.id);
                    if (afkMentioned) {
                        const embed = new MessageEmbed()
                            .setColor('#FFA500')
                            .setDescription(`${user} is currently AFK: ${afkMentioned.message}`);
                        await message.reply({ embeds: [embed] });
                    }
                }
            }

            // Retrieve the prefix from the collection or use a default prefix if not found
            let prefix = client.guildCommandPrefixes.get(message.guild.id) || 'o!'; // Default to '!' if no prefix found

            const usedPrefix = message.content.slice(0, prefix.length);

            const channelId = message.channelId;
            try {
                await updateChannelStats(channelId, message.channel.name);
            } catch (error) {
                logger.error('Error updating channel stats:', error);
            }

            // Check if the message starts with the correct prefix
            if (usedPrefix === prefix) {
                const [cmdName, ...cmdArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
                let filename = path.basename(__filename);
                filename = `${filename} - ${usedPrefix}${cmdName}`;


                try {
                    // Hash the command name using MD5
                    const commandNameHash = crypto.createHash('md5').update(cmdName.toLowerCase()).digest('hex');
                    try {
                    } catch (error) {
                        logger.error('Error initializing database connection pool:', error);
                        await db.end();
                        await interaction.editReply('An error occurred while initializing the database connection.');
                        return;
                    }

                    // Query to check if the command exists in the custom commands database
                    const [rows] = await db.getCommand(commandNameHash);

                    if (typeof rows !== 'undefined' && rows) {
                        // Custom command found, send its content and update usage
                        let commandContent = rows.content;
                        const newUsageCount = rows.usage + 1;

                        function parseCommandContent(content, message) {
                            // Handle random options
                            const randomPattern = /\{random:(.*?)\}/g;
                            content = content.replace(randomPattern, (match, options) => {
                                const optionList = options.split(/[,~]/); // Split by comma or tilde
                                const randomIndex = Math.floor(Math.random() * optionList.length);
                                return optionList[randomIndex].trim();
                            });
                
                            // Handle user mentions
                            content = content.replace('{mention}', `<@${message.author.id}>`);
                
                            return content;
                        }

                        commandContent = parseCommandContent(commandContent, message);

                        // Send the command content to the channel
                        message.channel.send(commandContent);

                        // Update the usage count
                        await db.updateCommandUsage(commandNameHash, newUsageCount);

                        return; // Exit here as the custom command has been executed
                    }

                    // If no custom command is found, proceed to check regular commands
                    const command = client.commands.get(cmdName.toLowerCase()) || 
                                    client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(cmdName.toLowerCase()));

                    if (command) {
                        try {
                            // Execute the regular command
                            await command.run(client, message, cmdArgs);
                        } catch (err) {
                            logger.error(`Error executing command ${cmdName}:`, err);
                            await db.end();
                            message.channel.send('There was an error executing that command.');
                        } finally {
                            await db.end()
                        }
                    } else {
                        await db.end();
                        message.channel.send('Command not found.');
                    }

                } catch (err) {
                    logger.error('Error querying custom commands:', err);
                    message.channel.send('There was an error executing that command.');
                } finally {
                    await db.end();
                }
            }
        } catch (error) {
            logger.error('Error in message event:', error);
        } finally {
            await db.end();
        }
    }
}
