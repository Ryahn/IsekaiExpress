const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { EmbedBuilder, userMention } = require('discord.js');

const images = {
    '0%-10%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif',
    '11%-20%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif',
    '21%-30%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif',
    '31%-40%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif',
    '41%-50%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_30_48_zZMJWleA.gif',
    '51%-60%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_22_59_TVOGkchQ.gif',
    '61%-70%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_22_59_TVOGkchQ.gif',
    '71%-80%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_22_59_TVOGkchQ.gif',
    '81%-90%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_19_11_bK60rTWi.gif',
    '91%-100%': 'https://overlord.lordainz.xyz/f/2026_Jul_03-15_19_11_bK60rTWi.gif',
};

const RANGE_KEYS = Object.keys(images);

function getRangeKey(percent) {
    const index = Math.min(RANGE_KEYS.length - 1, Math.ceil(percent / 10) - 1);
    return RANGE_KEYS[index];
}

function getImageForPercent(percent) {
    return images[getRangeKey(percent)];
}

function getDescription(percent, targetUserId) {
    const mention = userMention(targetUserId);
    if (percent >= 81) {
        return `${mention} your thiccness is ${percent}% and you are a certified thicc.`;
    }
    if (percent >= 51) {
        return `${mention} your thiccness is ${percent}% and you are mostly thicc.`;
    }
    return `${mention} your thiccness is ${percent}% and you are thicc but not certified.`;
}

module.exports = class Thiccdar extends BaseCommand {
    constructor() {
        super('thiccdar', 'fun', ['thiccd', 'tcdar']);
    }

    async run(client, message) {
        const member = message.mentions.members.first() || message.member;
        const targetUser = member.user;

        const percent = Math.floor(Math.random() * 100) + 1;
        const image = getImageForPercent(percent);
        const description = getDescription(percent, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Thiccness Detected')
            .setImage(image)
            .setTimestamp();

        await message.channel.send({
            content: description,
            embeds: [embed],
            allowedMentions: { users: [targetUser.id] },
        });
    }
}
