const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require("../../../utils/structures/BaseCommand");
const moment = require('moment');

module.exports = class help extends BaseCommand {
    constructor() {
        super('userinfo', 'moderation', ['info', 'whois']);
    }

    async run(client, message) {
        const { getRandomColor } = client.utils;
        const lang = client.langs.get(message.guild.id);
        const { userinfo } = require(`../../../utils/langs/${lang}.json`)
        let member = message.mentions.members.first() || message.member,
            user = member.user;
        let color;

        try {
            color = member.roles.color.hexColor;
        } catch(err) {
            color = "WHITE";
        }

        const sEmbed = new EmbedBuilder()
            .setColor(`#${getRandomColor()}`)
            .setTitle(`${userinfo.title} ${user.username}`)
            .setThumbnail(user.displayAvatarURL({ size: 1024 }))
            .addFields(
                { name: userinfo.username, value: user.username, inline: true },
                { name: userinfo.discriminator, value: `#${user.discriminator}`, inline: true },
                { name: userinfo.server, value: `<t:${moment(member.joinedAt).unix()}>`, inline: true },
                { name: userinfo.role, value: `${member.roles.highest}`, inline: true },
                { name: userinfo.admin, value: member.permissions.has(PermissionFlagsBits.Administrator) ? '✅' : '❌', inline: true },
                { name: userinfo.bot, value: user.bot ? '✅' : '❌', inline: true },
                { name: userinfo.created, value: `<t:${moment(user.createdAt).unix()}>`, inline: true }
            )
            .setFooter({ text:`${userinfo.requested} ${message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 128 })})
            .setTimestamp();
        message.channel.send({ embeds: [sEmbed] });
    }
};
