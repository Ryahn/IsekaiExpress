const { MessageAttachment } = require("discord.js");
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const moment = require('moment');
const crypto = require('crypto');
const { SlashCommandBuilder } = require('@discordjs/builders');
const path = require('path');

// Cooldowns for users
const cooldowns = new Map();

// Constants
const COOLDOWN_TIME = 2000; // 2 seconds cooldown
const SEX_OPTIONS = ['Male', 'Female', 'Binary', 'Souleater'];
const LIMIT_OPTIONS = ['One time only', 'Unlimited', 'Siblings only', 'UwU', 'Souleater'];
const BASE_IMAGE_PATH = path.resolve(__dirname, '../../media/images/lolilicense.png');

// Helper functions
const generateRandomHex = (length) => crypto.randomBytes(length).toString('hex').toUpperCase();
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
const generateRandomDate = (yearsAgo) => moment().subtract(Math.floor(Math.random() * (yearsAgo - 18 + 1) + 18), 'years').format('MMM/DD/YYYY');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lolilicense')
        .setDescription('Get a qualified loli license'),
    enable: true,

    async execute(client, interaction) {
        await interaction.deferReply();

        if (!this.checkCooldown(interaction)) return;

        try {
            const licenseImage = await this.generateLicense(interaction.user);
            const attachment = new MessageAttachment(licenseImage, this.generateFilename(interaction.user.id));
            return interaction.editReply({ files: [attachment] });
        } catch (error) {
            console.error('Error creating license:', error);
            return interaction.editReply('An error occurred while generating your license.');
        }
    },

    checkCooldown(interaction) {
        const { id } = interaction.user;
        const now = Date.now();
        const cooldownExpiration = cooldowns.get(id);

        if (cooldownExpiration && now < cooldownExpiration) {
            const timeLeft = (cooldownExpiration - now) / 1000;
            interaction.reply(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
            return false;
        }

        cooldowns.set(id, now + COOLDOWN_TIME);
        return true;
    },

    async generateLicense(user) {
        const canvas = createCanvas(853, 512);
        const context = canvas.getContext('2d');
        context.font = '20pt "Arial"';

        const baseImage = await loadImage(BASE_IMAGE_PATH);
        const avatarImage = await loadImage(this.getAvatarUrl(user));

        context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
        context.drawImage(avatarImage, 654, 46, 152, 218);

        const licenseData = this.generateLicenseData();
        this.drawLicenseText(context, user.username, licenseData);

        return canvas.encode('png');
    },

    getAvatarUrl(user) {
        return user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';
    },

    generateLicenseData() {
        return {
            agentNum: `${generateRandomHex(4)}-${generateRandomHex(8)}`,
            birthDate: generateRandomDate(40),
            expiryDate: moment().add(20, 'years').format('MMM/DD/YYYY'),
            sex: getRandomElement(SEX_OPTIONS),
            limit: getRandomElement(LIMIT_OPTIONS),
        };
    },

    drawLicenseText(context, username, data) {
        context.fillStyle = '#000000';
        const textPositions = {
            username: [192, 155],
            agentNum: [192, 222],
            sex: [417, 152],
            birthDate: [417, 222],
            limit: [417, 291],
            expiryDate: [319, 415],
        };

        Object.entries(textPositions).forEach(([key, [x, y]]) => {
            context.fillText(key === 'username' ? username : data[key], x, y);
        });
    },

    generateFilename(userId) {
        const randomSuffix = crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12);
        return `lolilicense_${userId}_${randomSuffix}.png`;
    },
};
