const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const moment = require('moment');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const CANVAS_WIDTH = 944;
const CANVAS_HEIGHT = 600;
const LICENSE_FONT = 'FurryLicenseFont';
const BASE_IMAGE = path.join(__dirname, '../media/images/furry_license.png');

const SEX_OPTIONS = ['Male', 'Female'];
const SPECIES_OPTIONS = [
  'Dog', 'Cat', 'Lycon', 'Dragon', 'Fox', 'Wolf', 'Rabbit', 'Horse', 'Deer', 'Bear',
  'Raccoon', 'Otter', 'Kangaroo', 'Mouse', 'Squirrel', 'Skunk', 'Goat', 'Sheep', 'Panda',
  'Koala', 'Penguin', 'Dolphin', 'Shark', 'Orca', 'Bird', 'Eagle', 'Owl', 'Parrot', 'Raven',
  'Crow', 'Hawk', 'Falcon', 'Phoenix', 'Griffin', 'Unicorn', 'Pegasus', 'Kirin', 'Hydra',
  'Cerberus', 'Chimera', 'Gryphon', 'Sphinx', 'Manticore', 'Minotaur', 'Centaur', 'Satyr',
  'Harpy', 'Mermaid', 'Siren', 'Naga', 'Lamia', 'Orc', 'Goblin', 'Troll', 'Kobold', 'Lizard',
  'Serpent', 'Wyvern', 'Drake',
];

/** Edit these coordinates when tuning layout (see scripts/test-furry-license.js). */
const DEFAULT_POSITIONS = {
  agentName: { x: 317, y: 225 },
  agentNum: { x: 117, y: 570 },
  sex: { x: 317, y: 345 },
  species: { x: 317, y: 435 },
  expires: { x: 575, y: 225 },
  avatar: { x: 45, y: 155, width: 240, height: 300 },
};

let fontRegistered = false;

function registerLicenseFont() {
  if (fontRegistered) return LICENSE_FONT;

  const candidates = [
    path.join(__dirname, '../media/fonts/DejaVuSans.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\Arial.ttf',
  ];

  for (const fontPath of candidates) {
    if (fs.existsSync(fontPath)) {
      GlobalFonts.registerFromPath(fontPath, LICENSE_FONT);
      fontRegistered = true;
      return LICENSE_FONT;
    }
  }

  fontRegistered = true;
  return 'sans-serif';
}

function discordAvatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=1024`;
  }
  const defaultIndex = Number(BigInt(user.id) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

function displayName(user) {
  return user.global_name || user.globalName || user.displayName || user.username;
}

function randomLicenseFields() {
  const agentNum = [2, 4, 12]
    .map((n) => crypto.randomBytes(n / 2).toString('hex'))
    .join('-')
    .toUpperCase();

  return {
    agentNum,
    sex: SEX_OPTIONS[Math.floor(Math.random() * SEX_OPTIONS.length)],
    species: SPECIES_OPTIONS[Math.floor(Math.random() * SPECIES_OPTIONS.length)],
    issuedDate: moment().format('MMM/DD/YYYY'),
  };
}

function drawOutlinedText(context, text, x, y) {
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function drawPositionGrid(context) {
  context.save();
  context.strokeStyle = 'rgba(255, 0, 0, 0.35)';
  context.fillStyle = 'rgba(255, 0, 0, 0.35)';
  context.lineWidth = 1;
  context.font = '12pt sans-serif';

  for (let x = 0; x <= CANVAS_WIDTH; x += 50) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, CANVAS_HEIGHT);
    context.stroke();
    context.fillText(String(x), x + 2, 12);
  }

  for (let y = 0; y <= CANVAS_HEIGHT; y += 50) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(CANVAS_WIDTH, y);
    context.stroke();
    context.fillText(String(y), 2, y + 12);
  }

  context.restore();
}

/**
 * @param {object} opts
 * @param {{ id: string, username: string, avatar?: string|null, global_name?: string|null, globalName?: string|null, displayName?: string }} opts.user
 * @param {typeof DEFAULT_POSITIONS} [opts.positions]
 * @param {boolean} [opts.drawGrid=false]
 * @param {{ agentNum?: string, sex?: string, species?: string, issuedDate?: string }} [opts.fields]
 */
async function renderFurryLicense({ user, positions = DEFAULT_POSITIONS, drawGrid = false, fields }) {
  const fontFamily = registerLicenseFont();
  const licenseFields = { ...randomLicenseFields(), ...fields };
  const name = displayName(user);
  const avatarUrl = discordAvatarUrl(user);

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext('2d');

  const [baseImage, avatarImage] = await Promise.all([
    loadImage(BASE_IMAGE),
    loadImage(avatarUrl),
  ]);

  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  context.drawImage(
    avatarImage,
    positions.avatar.x,
    positions.avatar.y,
    positions.avatar.width,
    positions.avatar.height,
  );

  if (drawGrid) {
    drawPositionGrid(context);
  }

  context.fillStyle = 'white';
  context.strokeStyle = 'black';
  context.lineWidth = 6;
  context.font = `20pt "${fontFamily}"`;

  drawOutlinedText(context, name, positions.agentName.x, positions.agentName.y);
  drawOutlinedText(context, licenseFields.sex, positions.sex.x, positions.sex.y);
  drawOutlinedText(context, licenseFields.species, positions.species.x, positions.species.y);
  drawOutlinedText(context, licenseFields.issuedDate, positions.expires.x, positions.expires.y);

  context.font = `28pt "${fontFamily}"`;
  drawOutlinedText(context, licenseFields.agentNum, positions.agentNum.x, positions.agentNum.y);

  return canvas.encode('png');
}

module.exports = {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_POSITIONS,
  BASE_IMAGE,
  registerLicenseFont,
  discordAvatarUrl,
  displayName,
  randomLicenseFields,
  renderFurryLicense,
};
