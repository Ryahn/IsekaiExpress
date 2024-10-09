const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');

// URL of the image
const imageUrl = 'https://cdn.discordapp.com/attachments/351435045921357824/1293361862733332512/level_card.png?ex=67071899&is=6705c719&hm=f3a8674f97c5ab81b864422b99696b4710dc7e01d9dc9dcec35bfdaf6c74f6c5';

let xpValue = null;
let usernameValue = null;

async function downloadImage(url, outputPath) {
  const response = await axios({
    url,
    responseType: 'stream',
  });
  return new Promise((resolve, reject) => {
    response.data.pipe(fs.createWriteStream(outputPath))
      .on('finish', () => resolve())
      .on('error', (e) => reject(e));
  });
}

async function cropImage(inputPath, outputPath, x, y, width, height) {
  // Crop the image to the specific area defined by x, y, width, height
  await sharp(inputPath)
    .extract({ left: x, top: y, width: width, height: height })
    .toFile(outputPath);
}

function formatXPStringToNumber(xpString) {
  let number = parseFloat(xpString); // Extract the numeric part
  if (xpString.toLowerCase().includes('k')) {
    number *= 1000; // Multiply by 1000 for 'k'
  }
  return number;
}

function cleanText(text) {
  // Remove unwanted characters like £, #, and other non-alphanumeric symbols
  return text.replace(/[^\w\s]/gi, '').trim();
}

async function extractXPAndUsername() {
  const imagePath = './level_card.png';
  const croppedImagePath = './cropped_level_card.png';
  
  // Step 1: Download the image
  await downloadImage(imageUrl, imagePath);

  // Step 2: Crop the image to the specified area
  const x = 296;  // X-coordinate (starting point on the horizontal axis)
  const y = 63;  // Y-coordinate (starting point on the vertical axis)
  const width = 440;  // Width of the cropped area
  const height = 126;  // Height of the cropped area
  await cropImage(imagePath, croppedImagePath, x, y, width, height);

  // Step 3: Extract XP from the full image
  const xpText = await Tesseract.recognize(
    imagePath,
    'eng',  // Language option
    {
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK // Use single block of text to improve accuracy
    }
  ).then(({ data: { text } }) => text);
  
  const xpMatch = xpText.match(/\d+\.?\d*k/);  // Regular expression to match XP value (e.g., 16.0k)
  xpValue = xpMatch ? formatXPStringToNumber(xpMatch[0]) : null;

  // Step 4: Extract username from the cropped image
  const usernameText = await Tesseract.recognize(
    croppedImagePath,
    'eng',  // Language option
  ).then(({ data: { text } }) => text);
  
  const lines = usernameText.split('\n').map(line => cleanText(line)).filter(Boolean);
  usernameValue = lines.length > 0 ? lines[0] : 'Username not found';

  // Cleanup: Delete the downloaded image and cropped image after processing
  fs.unlinkSync(imagePath);
  fs.unlinkSync(croppedImagePath);
  
  // Return the values
  return { xpValue, usernameValue };
}

// Run the function and log the result after OCR is complete
extractXPAndUsername().then(({ xpValue, usernameValue }) => {
  console.log(`Extracted XP: ${xpValue}`);
  console.log(`Extracted Username: ${usernameValue}`);
});
