const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const uuid = uuidv4();

GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Mukta_Malar_NAME.woff2', 'CharacterNameFont');
GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Libre_Franklin_TYPE.woff2', 'ClassFont');
GlobalFonts.registerFromPath('./src/bot/tcg/fonts/Character_Power_LEVEL_POWER.ttf', 'LevelPowerFont');

const baseImagePath = './src/bot/tcg/base_card.png';
const id = uuid.split('-')[0];

function makeCardFileName(name, rarity, id) {
  	return `${name.replace(/\s+/g, '_')}_${rarity}_${id}.png`;
}

async function generateCard(characterName, rarity, className, level = '1', power = '0', starCount = 1, avatar, type) {
	console.log(GlobalFonts.families)
  const canvas = createCanvas(768, 1073);
  const ctx = canvas.getContext('2d');

  const baseImage = await loadImage(baseImagePath);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  // Load the profile image
  const profileImage = await loadImage(avatar);

  // Draw the profile image at the specified position with the calculated size
  ctx.drawImage(profileImage, 60, 160, 645, 700);

  ctx.lineWidth = 5; // Set the border width
  ctx.strokeStyle = '#FFD700'; // Set the border color (gold)
  ctx.strokeRect(60, 160, 645, 700); // Draw the border

  // Add character name
  ctx.font = 'bold 50px Mukta Malar ExtraBold';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(characterName, canvas.width / 2, 975);
  // End of character name

  // Add rarity
  ctx.font = 'bold 50px Mukta Malar ExtraBold';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(rarity, canvas.width / 2 + 280, 1020);
  // End of rarity

  // Add className
  ctx.font = '25px Libre Franklin Thin';
  ctx.fillText(className, canvas.width / 2, 1020);
  // End of className

  // Add level
  ctx.font = 'bold 80px Onepiecetcg_power';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(level, 70, 95);
  // End of level

  // Add power
  if (power > 9999) {
    ctx.font = 'bold 53px Onepiecetcg_power';
  } else {
    ctx.font = 'bold 60px Onepiecetcg_power';
  }

  ctx.fillStyle = '#000000';
  ctx.fillText(power, canvas.width - 178, 70);
  // End of power

  // Add stars
  const star = await loadImage('./src/bot/tcg/star.png');
  let starWidth = 18;
  let starHeight = 18;

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

  const startX = (canvas.width - (starWidth * starCount)) / 2; // Center the stars horizontally

  for (let i = 0; i < starCount; i++) {
    const x = startX + (i * starWidth); // Position stars in a row
    ctx.drawImage(star, x, 900, starWidth, starHeight); // Adjust the y-position as needed
  }
  // End of stars
  const buffer = canvas.toBuffer('image/png');
  const fileName = makeCardFileName(characterName, rarity, id);
  const outputDir = path.join(__dirname, `./src/bot/media/cards/${type}`);
  fs.existsSync(outputDir) || fs.mkdirSync(outputDir);

  const outputPath = path.join(outputDir, fileName);

  fs.writeFileSync(outputPath, buffer);

  console.log(`Card generated and saved as ${outputPath}`);
}

// generateCard('Adventurer', 'SSR', 'Warrior', '10', '9999', 11);

module.exports = {
  generateCard,
};
