const path = require('path');
const fs = require('fs').promises;
const BaseCommand = require('./structures/BaseCommand');
const BaseEvent = require('./structures/BaseEvent');

async function registerFiles(client, dir = '', isCommand = true) {
    const filePath = path.join(__dirname, dir);
    const files = await fs.readdir(filePath);
    for (const file of files) {
        const fullPath = path.join(filePath, file);
        const stat = await fs.lstat(fullPath);
        if (stat.isDirectory()) {
            await registerFiles(client, path.join(dir, file), isCommand);
        } else if (file.endsWith('.js')) {
            const Module = require(fullPath);
            const BaseClass = isCommand ? BaseCommand : BaseEvent;
            if (Module.prototype instanceof BaseClass) {
                const instance = new Module();
                if (isCommand) {
                    client.commands.set(instance.name, instance);
                } else {
                    client.on(instance.name, instance.run.bind(instance, client));
                }
            }
        }
    }
}

const registerCommands = (client, dir = '') => registerFiles(client, dir, true);
const registerEvents = (client, dir = '') => registerFiles(client, dir, false);

module.exports = { registerCommands, registerEvents };