const BaseEvent = require('../../utils/structures/BaseEvent');
const StateManager = require('../../utils/StateManager');
const path = require('path');
const crypto = require('crypto');

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;

        // Retrieve the prefix from the collection or use a default prefix if not found
        let prefix = client.guildCommandPrefixes.get(message.guild.id) || 'o!'; // Default to '!' if no prefix found

        const usedPrefix = message.content.slice(0, prefix.length);

        // Check if the message starts with the correct prefix
        if (usedPrefix === prefix) {
            const [cmdName, ...cmdArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
            const stateManager = new StateManager();
            let filename = path.basename(__filename);
            filename = `${filename} - ${usedPrefix}${cmdName}`;


            try {
                // Hash the command name using MD5
                const commandNameHash = crypto.createHash('md5').update(cmdName.toLowerCase()).digest('hex');
                try {
                    await stateManager.initPool(); // Ensure the pool is initialized
                } catch (error) {
                    console.error('Error initializing database connection pool:', error);
                     await stateManager.closePool(filename);
                    await interaction.editReply('An error occurred while initializing the database connection.');
                    return;
                }

                // Query to check if the command exists in the custom commands database
                const [rows] = await stateManager.query(
                    'SELECT hash, content, `usage` FROM commands WHERE hash = ?',
                    [commandNameHash]);

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
                    await stateManager.query(
                        'UPDATE commands SET `usage` = ? WHERE hash = ?',
                        [newUsageCount, commandNameHash]
                    );

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
                        console.error(`Error executing command ${cmdName}:`, err);
                         await stateManager.closePool(filename);
                        message.channel.send('There was an error executing that command.');
                    } finally {
                        await stateManager.closePool()
                    }
                } else {
                     await stateManager.closePool(filename);
                    message.channel.send('Command not found.');
                }

            } catch (err) {
                console.error('Error querying custom commands:', err);
                message.channel.send('There was an error executing that command.');
            } finally {
                 await stateManager.closePool(filename);
            }
        }
    }
}
