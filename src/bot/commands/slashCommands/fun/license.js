const { MessageEmbed, MessageAttachment } = require("discord.js");
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const moment = require('moment');
const crypto = require('crypto');
const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

// Cooldowns for users
const cooldowns = new Map();

module.exports = {
    category: path.basename(__dirname),
    
    data: new SlashCommandBuilder()
        .setName('lolilicense')
        .setDescription('Get a qualified loli license'),
    

    async execute(client, interaction) {

        const hash = crypto.createHash('md5').update(module.exports.data.name).digest('hex');
		const allowedChannel = await client.db.getAllowedChannel(hash);
		const guild = client.guilds.cache.get(interaction.guild.id);
		const member = await guild.members.fetch(interaction.user.id);
		const roles = member.roles.cache.map(role => role.id);

		if (allowedChannel && (allowedChannel.channel_id === 'all' || allowedChannel.channel_id !== interaction.channel.id)) {
			if (!roles.some(role => client.allowed.includes(role))) {
				return interaction.reply({ 
					content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
					ephemeral: true 
				});
			}
		}
        
        await interaction.deferReply();

        const user = interaction.user;

        const cooldownTime = client.cooldownManager.isOnCooldown(interaction.user.id, 'lolilicense');
        if (cooldownTime) {
            return interaction.reply({ 
                content: `You're on cooldown! Please wait ${cooldownTime.toFixed(1)} more seconds.`, 
                ephemeral: true 
            });
        }

        // Default avatar if user has none
        const avatar = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        // Canvas setup
        const canvas = createCanvas(853, 512);
        const context = canvas.getContext('2d');
        context.font = '20pt "Arial"';

        // Agent details and random data generation
        const agentNum = [2, 8].map(n => crypto.randomBytes(n / 2).toString("hex")).join("-").toUpperCase();
        const birthDate = moment().subtract(Math.floor(Math.random() * (40 - 18 + 1) + 18), 'years').format('MMM/DD/YYYY');
        const expiryDate = moment().add(20, 'years').format('MMM/DD/YYYY');

        const sexOptions = ['Male', 'Female', 'Binary', 'Souleater'];
        const limitOptions = ['One time only', 'Unlimited', 'Siblings only', 'UwU', 'Souleater'];

        const sex = sexOptions[Math.floor(Math.random() * sexOptions.length)];
        const limit = limitOptions[Math.floor(Math.random() * limitOptions.length)];

        // Positions for drawing text and images
        const dem = {
            agent_name: { x: 192, y: 155 },
            agent_num: { x: 192, y: 222, num: agentNum },
            sex: { x: 417, y: 152 },
            birth: { x: 417, y: 222, date: birthDate },
            limit: { x: 417, y: 291, text: limit },
            expires: { x: 319, y: 415, date: expiryDate },
            avatar: { x: 654, y: 46, width: 152, height: 218, path: avatar },
            // base: 'https://overlord.lordainz.xyz/f/2024_Sep_19-23_13_42_50ySZTtQ.png',
			base: path.resolve(__dirname, '../../media/images/lolilicense.png'),
        };

        try {
            // Load base image and avatar
            const baseImage = await loadImage(dem.base);
            const avatarImage = await loadImage(dem.avatar.path);

            // Draw images and text onto the canvas
            context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
            context.drawImage(avatarImage, dem.avatar.x, dem.avatar.y, dem.avatar.width, dem.avatar.height);

            context.fillStyle = '#000000'; // Text color
            context.fillText(user.username, dem.agent_name.x, dem.agent_name.y);
            context.fillText(dem.agent_num.num, dem.agent_num.x, dem.agent_num.y);
            context.fillText(sex, dem.sex.x, dem.sex.y);
            context.fillText(dem.limit.text, dem.limit.x, dem.limit.y);
            context.fillText(dem.birth.date, dem.birth.x, dem.birth.y);
            context.fillText(dem.expires.date, dem.expires.x, dem.expires.y);

            // Prepare the image for sending
			const filename = `lolilicense_${user.id}_${crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12)}.png`;
            const attachment = new MessageAttachment(await canvas.encode('png'), filename);

            return interaction.editReply({ files: [attachment] });
        } catch (error) {
            console.error('Error creating license:', error);
            return interaction.editReply('An error occurred while generating your license.');
        }
    },
};