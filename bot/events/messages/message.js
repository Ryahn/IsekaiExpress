const BaseEvent = require('../../utils/structures/BaseEvent');
const StateManager = require('../../utils/StateManager');
const path = require('path');
const crypto = require('crypto');

module.exports = class MessageEvent extends BaseEvent {
    constructor() {
        super('messageCreate');
        this.stateManager = new StateManager();
    }

    async run(client, message) {
        if (message.author.bot || !message.guild) return;

        const prefix = client.guildCommandPrefixes.get(message.guild.id) || 'o!';
        if (!message.content.startsWith(prefix)) return;

        const [cmdName, ...cmdArgs] = message.content.slice(prefix.length).trim().split(/\s+/);
        const filename = `${path.basename(__filename)} - ${prefix}${cmdName}`;

        try {
            await this.stateManager.initPool();
            const commandNameHash = crypto.createHash('md5').update(cmdName.toLowerCase()).digest('hex');

            const customCommand = await this.handleCustomCommand(commandNameHash, message);
            if (customCommand) return;

            await this.handleRegularCommand(client, message, cmdName, cmdArgs);
        } catch (err) {
            console.error('Error processing command:', err);
            message.channel.send('There was an error executing that command.');
        } finally {
            await this.stateManager.closePool(filename);
        }
    }

    async handleCustomCommand(commandNameHash, message) {
        const [rows] = await this.stateManager.query(
            'SELECT content, `usage` FROM commands WHERE hash = ?',
            [commandNameHash]
        );

        if (rows && rows.length > 0) {
            const { content, usage } = rows[0];
            const parsedContent = this.parseCommandContent(content, message);
            await message.channel.send(parsedContent);
            await this.stateManager.query(
                'UPDATE commands SET `usage` = ? WHERE hash = ?',
                [usage + 1, commandNameHash]
            );
            return true;
        }
        return false;
    }

    async handleRegularCommand(client, message, cmdName, cmdArgs) {
        const command = client.commands.get(cmdName.toLowerCase()) || 
                        client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(cmdName.toLowerCase()));

        if (command) {
            try {
                await command.run(client, message, cmdArgs);
            } catch (err) {
                console.error(`Error executing command ${cmdName}:`, err);
                message.channel.send('There was an error executing that command.');
            }
        } else {
            message.channel.send('Command not found.');
        }
    }

    parseCommandContent(content, message) {
        return content
            .replace(/\{random:(.*?)\}/g, (_, options) => {
                const optionList = options.split(/[,~]/);
                return optionList[Math.floor(Math.random() * optionList.length)].trim();
            })
            .replace('{mention}', `<@${message.author.id}>`);
    }
}
