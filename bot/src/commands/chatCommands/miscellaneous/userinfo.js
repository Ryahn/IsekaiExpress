const {Client, Intents, MessageEmbed, Formatters} = require('discord.js');
const BaseCommand = require("../../../utils/structures/BaseCommand");
const moment = require('moment');
const { getRandomColor } = require('../../../utils/functions');

module.exports = class help extends BaseCommand {
    constructor() {
        super('userinfo', 'moderation', ['info', 'whois']);
    }

    async run(client, message) {
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

        const flags = user.flags.toArray();

        const sEmbed = new MessageEmbed()
            .setColor(`#${getRandomColor()}`)
            .setTitle(`${userinfo.title} ${user.username}`)
            .setThumbnail(user.avatarURL())
            .addField(userinfo.username, user.username, true)
            .addField(userinfo.discriminator, `#${user.discriminator}`, true)
            .addField(userinfo.server, `<t:${moment(member.joinedAt).unix()}>`, true)
            .addField(userinfo.role, `${member.roles.highest}`, true)
            .addField(userinfo.admin, member.permissions.has("ADMINISTRATOR") ? '✅' : '❌', true)
            .addField(userinfo.bot, user.bot ? '✅' : '❌', true)
            .addField(userinfo.created, `<t:${moment(user.createdAt).unix()}>` , true)
            .setFooter({ text:`${userinfo.requested} ${message.author.username}`, iconURL: message.author.displayAvatarURL({dynamic: true})})
            .setTimestamp();
        message.channel.send({embeds: [sEmbed]});
    }
}