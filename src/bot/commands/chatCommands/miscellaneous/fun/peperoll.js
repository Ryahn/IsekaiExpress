const BaseCommand = require("../../../../utils/structures/BaseCommand");

module.exports = class Peperoll extends BaseCommand {
    constructor() {
        super('peperoll', 'fun', ['proll']);
    }

    async run(client, message) {
        const randomNum = Math.floor(Math.random() * (1000000000 - 1 + 1)) + 1;
        await message.channel.send(`<@${message.author.id}>, you rolled a **${randomNum}**!`);
    }
}
