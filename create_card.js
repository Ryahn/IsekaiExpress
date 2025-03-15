const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const { v5: uuidv5 } = require('uuid');
const NAMESPACE = uuidv5.URL;
const path = require('path');
const db = require('./database/db');
const config = require('./.config');
const { timestamp } = require('./libs/utils');

GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Mukta_Malar_NAME.woff2', 'CharacterNameFont');
GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Libre_Franklin_TYPE.woff2', 'ClassFont');
GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Character_Power_LEVEL_POWER.ttf', 'LevelPowerFont');

let baseImagePath = './src/bot/tcg/base_card.png';

function makeCardFileName(name, rarity) {
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    return `${safeName}_${rarity}.png`;
}

function generateUUID(characterName, rarity, discordId) {
    const inputString = `${characterName}-${rarity}-${discordId}`;
    return uuidv5(inputString, NAMESPACE);
}

async function generateCard(characterName, rarity, className, level, power, avatar, type, discordId) {
    const uuid = generateUUID(characterName, rarity, discordId);
    let canvas = createCanvas(768, 1073);
    let ctx = canvas.getContext('2d');

    let baseImage = await loadImage(baseImagePath);
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

    // Load the profile image
    let profileImage = await loadImage(avatar);
    ctx.drawImage(profileImage, 60, 160, 645, 700);

    ctx.lineWidth = 5; // Set the border width
    ctx.strokeStyle = '#FFD700'; // Set the border color (gold)
    ctx.strokeRect(60, 160, 645, 700); // Draw the border

    // Add character name
    ctx.font = 'bold 50px Mukta Malar ExtraBold';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(characterName, canvas.width / 2, 975);

    // Add rarity
    ctx.font = 'bold 50px Mukta Malar ExtraBold';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(rarity, canvas.width / 2 + 280, 1020);

    // Add className
    ctx.font = '25px Libre Franklin Thin';
    ctx.fillText(className, canvas.width / 2, 1020);

    // Add level
    ctx.font = 'bold 80px Onepiecetcg_power';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(String(level), 70, 95);

    // Add power
    if (power > 9999) {
        ctx.font = 'bold 53px Onepiecetcg_power';
    } else {
        ctx.font = 'bold 60px Onepiecetcg_power';
    }
    ctx.fillStyle = '#000000';
    ctx.fillText(String(power), canvas.width - 178, 70);

    // Add stars
    let star = await loadImage('./src/bot/tcg/star.png');
    let starWidth = 18;
    let starHeight = 18;

    switch(rarity) {
        case 'UR':
            starCount = 11;
            break;
        case 'SUR':
            starCount = 10;
            break;
        case 'SSR':
            starCount = 9;
            break;
        case 'SR':
            starCount = 8;
            break;
        case 'L':
            starCount = 7;
            break;
        case 'M':
            starCount = 6;
            break;
        case 'U':
            starCount = 5;
            break;
        case 'R':
            starCount = 4;
            break;
        case 'UC':
            starCount = 3;
            break;
        case 'C':
            starCount = 2;
            break;
        case 'N':
            starCount = 1;
            break;
    }

    if (starCount > 10) {
        starWidth = 18;
        starHeight = 18;
    } else if (starCount > 5) {
        starWidth = 22;
        starHeight = 22;
    } else {
        starWidth = 35;
        starHeight = 35;
    }

    let startX = (canvas.width - (starWidth * starCount)) / 2; // Center the stars horizontally
    for (let i = 0; i < starCount; i++) {
        const x = startX + (i * starWidth); // Position stars in a row
        ctx.drawImage(star, x, 900, starWidth, starHeight); // Adjust the y-position as needed
    }

    let fileName = makeCardFileName(characterName, rarity);
    let outputDir = path.join(__dirname, `./src/bot/media/cards/${type}`);
    if (!fs.existsSync(outputDir)) {
      logger.info(`Creating output directory: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let outputPath = path.join(outputDir, fileName);

    // Convert the canvas to a buffer
    let buffer = canvas.toBuffer('image/png');

    fs.writeFileSync(outputPath, buffer);

    let card = {
        discord_id: discordId,
        uuid: uuid,
        stars: starCount,
        name: characterName,
        rarity: rarity,
        class: className,
        level: level,
        power: power,
        image_url: `${config.cardUrl}/${type}/${fileName}`,
        created_at: timestamp(),
        updated_at: timestamp(),
    }

    await db.createCard(card);

    // Clear memory-intensive objects manually
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    baseImage = null;
    ctx = null;
    canvas = null;
    profileImage = null;
    star = null;
    buffer = null;

    if (global.gc) {
        global.gc({ type: 'major' });
    }

    return {
        fileName,
        outputPath,
        file_id: uuid,
    };
}

module.exports = {
    generateCard,
};
