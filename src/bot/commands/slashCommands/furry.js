const { MessageAttachment } = require("discord.js");
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const moment = require('moment');
const crypto = require('crypto');
const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

// Cooldowns for users
const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('furry_license')
        .setDescription('Get a qualified furry license'),
    enable: true,

    async execute(client, interaction) {
        await interaction.deferReply();

        const cooldownTime = 2000; // 2 seconds cooldown
        const user = interaction.user;

        // Check if user is on cooldown
        if (cooldowns.has(user.id)) {
            const expirationTime = cooldowns.get(user.id) + cooldownTime;
            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return interaction.reply(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
            }
        }

        // Set new cooldown
        cooldowns.set(user.id, Date.now());

        // Default avatar if user has none
        const avatar = user.avatar 
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';

        // Canvas setup
		const canvas = createCanvas(944, 600);
        const context = canvas.getContext('2d');
        context.font = '20pt "Arial"';

        // Agent details and random data generation
		const agentNum = [2, 4, 12].map(n => crypto.randomBytes(n / 2).toString("hex")).join("-").toUpperCase();
        const expiryDate = moment().format('MMM/DD/YYYY');
		const sexOptions = ['Male', 'Female'];
		const speciesOtions = ['Dog', 'Cat', 'Lycon', 'Dragon', 'Fox', 'Wolf', 'Rabbit', 'Horse', 'Deer', 'Bear', 'Raccoon', 'Otter', 'Kangaroo', 'Mouse', 'Squirrel', 'Skunk', 'Goat', 'Sheep', 'Panda', 'Koala', 'Penguin', 'Dolphin', 'Shark', 'Orca', 'Bird', 'Eagle', 'Owl', 'Parrot', 'Raven', 'Crow', 'Hawk', 'Falcon', 'Phoenix', 'Griffin', 'Unicorn', 'Pegasus', 'Kirin', 'Hydra', 'Cerberus', 'Chimera', 'Gryphon', 'Sphinx', 'Manticore', 'Minotaur', 'Centaur', 'Satyr', 'Harpy', 'Mermaid', 'Siren', 'Naga', 'Lamia', 'Orc', 'Goblin', 'Troll', 'Kobold', 'Lizard', 'Serpent', 'Wyvern', 'Drake'];
		const sex = sexOptions[Math.floor(Math.random() * sexOptions.length)];
		const species = speciesOtions[Math.floor(Math.random() * speciesOtions.length)];

        // Positions for drawing text and images
        const dem = {
			agent_name: { x: 317, y: 225 },
			agent_num: { x: 117, y: 570, num: agentNum },
			sex: { x: 317, y: 345, text: sex },
			species: { x: 317, y: 435, text: species },
			expires: { x: 575, y: 225, date: expiryDate },
			avatar: { x: 45, y: 155, width: 240, height: 300, path: avatar },
			base: path.resolve(__dirname, '../../media/images/furry_license.png'),
		};

        try {
            // Load base image and avatar
            const baseImage = await loadImage(dem.base);
            const avatarImage = await loadImage(dem.avatar.path);

            // Draw images and text onto the canvas
            context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
            context.drawImage(avatarImage, dem.avatar.x, dem.avatar.y, dem.avatar.width, dem.avatar.height);

            context.fillStyle = 'white'; // Text color
			context.strokeStyle = 'black'; // Text outline color
			context.lineWidth = 6; // Text outline width
			context.strokeText(user.username, dem.agent_name.x, dem.agent_name.y);
			context.fillText(user.username, dem.agent_name.x, dem.agent_name.y);
			context.strokeText(sex, dem.sex.x, dem.sex.y);
			context.fillText(sex, dem.sex.x, dem.sex.y);
			context.strokeText(dem.species.text, dem.species.x, dem.species.y);
			context.fillText(dem.species.text, dem.species.x, dem.species.y);
			context.strokeText(dem.expires.date, dem.expires.x, dem.expires.y);
			context.fillText(dem.expires.date, dem.expires.x, dem.expires.y);

			context.font = '28pt "Arial"';
			context.strokeText(dem.agent_num.num, dem.agent_num.x, dem.agent_num.y);
			context.fillText(dem.agent_num.num, dem.agent_num.x, dem.agent_num.y);

            // Prepare the image for sending
			const filename = `furrylicense_${user.id}_${crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12)}.png`;
            const attachment = new MessageAttachment(await canvas.encode('png'), filename);

            return interaction.editReply({ files: [attachment] });
        } catch (error) {
            console.error('Error creating license:', error);
            return interaction.editReply('An error occurred while generating your license.');
        }
    },
};
