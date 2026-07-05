const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { EmbedBuilder, userMention } = require('discord.js');

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('gaydar', 'fun', ['gay', 'gdar']);
    }

    async run(client, message) {
        const member = message.mentions.members.first() || message.member;
        const targetUser = member.user;

        let percent = Math.floor(Math.random() * 100) + 1;
        let image = '';
        let description = '';
        if (percent >= 80) {
            image = 'https://overlord.lordainz.xyz/f/astolfo.gif';
            description = `${userMention(targetUser.id)} your gayness is ${percent}% and you are a certified trap.`;
        } else {
            image = 'https://overlord.lordainz.xyz/f/gaydar.jpg';
            description = `${userMention(targetUser.id)} has been scanned by the gaydar and is ${percent}% gay.`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Gayness Detected')
            .setImage(image)
            .setTimestamp();

        await message.channel.send({
            content: description,
            embeds: [embed],
            allowedMentions: { users: [targetUser.id] },
        });
    }
}
