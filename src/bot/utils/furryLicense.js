const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const moment = require('moment');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const LICENSE_FONT = 'FurryLicenseFont';
const MEDIA_IMAGES = path.join(__dirname, '../media/images');

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

const LOLI_SEX_OPTIONS = ['Male', 'Female', 'Binary', 'Souleater'];
const LOLI_LIMIT_OPTIONS = ['One time only', 'Unlimited', 'Siblings only', 'UwU', 'Souleater'];

/** Edit these coordinates when tuning layout (see scripts/test-furry-license.js). */
const DEFAULT_POSITIONS = {
  agentName: { x: 317, y: 225 },
  agentNum: { x: 117, y: 570 },
  sex: { x: 317, y: 345 },
  species: { x: 317, y: 435 },
  expires: { x: 575, y: 225 },
  avatar: { x: 45, y: 155, width: 240, height: 300 },
};

const LOLI_DEFAULT_POSITIONS = {
  agentName: { x: 192, y: 155 },
  agentNum: { x: 192, y: 222 },
  sex: { x: 417, y: 152 },
  birth: { x: 417, y: 222 },
  limit: { x: 417, y: 291 },
  expires: { x: 319, y: 415 },
  avatar: { x: 654, y: 46, width: 152, height: 218 },
};

function randomFurryFields() {
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

function randomLoliFields() {
  const agentNum = [2, 8]
    .map((n) => crypto.randomBytes(n / 2).toString('hex'))
    .join('-')
    .toUpperCase();

  return {
    agentNum,
    sex: LOLI_SEX_OPTIONS[Math.floor(Math.random() * LOLI_SEX_OPTIONS.length)],
    birth: moment().subtract(Math.floor(Math.random() * (40 - 18 + 1) + 18), 'years').format('MMM/DD/YYYY'),
    limit: LOLI_LIMIT_OPTIONS[Math.floor(Math.random() * LOLI_LIMIT_OPTIONS.length)],
    expires: moment().add(20, 'years').format('MMM/DD/YYYY'),
  };
}

const LICENSE_TEMPLATES = {
  furry: {
    width: 944,
    height: 600,
    baseImage: path.join(MEDIA_IMAGES, 'furry_license.png'),
    positions: DEFAULT_POSITIONS,
    textStyle: 'outlined',
    nameField: 'displayName',
    bodyFontSize: 20,
    agentNumFontSize: 28,
    randomFields: randomFurryFields,
    drawFields(context, positions, fields, fontFamily, drawText) {
      context.font = `${this.bodyFontSize}pt "${fontFamily}"`;
      drawText(context, fields.agentName, positions.agentName.x, positions.agentName.y);
      drawText(context, fields.sex, positions.sex.x, positions.sex.y);
      drawText(context, fields.species, positions.species.x, positions.species.y);
      drawText(context, fields.issuedDate, positions.expires.x, positions.expires.y);
      context.font = `${this.agentNumFontSize}pt "${fontFamily}"`;
      drawText(context, fields.agentNum, positions.agentNum.x, positions.agentNum.y);
    },
    prepareFields(user, fields, positions) {
      const licenseFields = { ...this.randomFields(), ...fields };
      return {
        ...licenseFields,
        agentName: displayName(user),
      };
    },
  },
  loli: {
    width: 853,
    height: 512,
    baseImage: path.join(MEDIA_IMAGES, 'lolilicense.png'),
    positions: LOLI_DEFAULT_POSITIONS,
    textStyle: 'plain',
    nameField: 'username',
    bodyFontSize: 20,
    randomFields: randomLoliFields,
    drawFields(context, positions, fields, fontFamily, drawText) {
      context.font = `${this.bodyFontSize}pt "${fontFamily}"`;
      drawText(context, fields.agentName, positions.agentName.x, positions.agentName.y);
      drawText(context, fields.agentNum, positions.agentNum.x, positions.agentNum.y);
      drawText(context, fields.sex, positions.sex.x, positions.sex.y);
      drawText(context, fields.limit, positions.limit.x, positions.limit.y);
      drawText(context, fields.birth, positions.birth.x, positions.birth.y);
      drawText(context, fields.expires, positions.expires.x, positions.expires.y);
    },
    prepareFields(user, fields) {
      const licenseFields = { ...this.randomFields(), ...fields };
      return {
        ...licenseFields,
        agentName: user.username,
      };
    },
  },
};

const CANVAS_WIDTH = LICENSE_TEMPLATES.furry.width;
const CANVAS_HEIGHT = LICENSE_TEMPLATES.furry.height;
const BASE_IMAGE = LICENSE_TEMPLATES.furry.baseImage;

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
  return randomFurryFields();
}

function drawOutlinedText(context, text, x, y) {
  context.strokeText(text, x, y);
  context.fillText(text, x, y);
}

function drawPlainText(context, text, x, y) {
  context.fillText(text, x, y);
}

function drawPositionGrid(context, width, height) {
  context.save();
  context.strokeStyle = 'rgba(255, 0, 0, 0.35)';
  context.fillStyle = 'rgba(255, 0, 0, 0.35)';
  context.lineWidth = 1;
  context.font = '12pt sans-serif';

  for (let x = 0; x <= width; x += 50) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillText(String(x), x + 2, 12);
  }

  for (let y = 0; y <= height; y += 50) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.fillText(String(y), 2, y + 12);
  }

  context.restore();
}

/**
 * @param {object} opts
 * @param {'furry'|'loli'} opts.templateId
 * @param {{ id: string, username: string, avatar?: string|null, global_name?: string|null, globalName?: string|null, displayName?: string }} opts.user
 * @param {object} [opts.positions]
 * @param {boolean} [opts.drawGrid=false]
 * @param {object} [opts.fields]
 */
async function renderLicense({ templateId, user, positions, drawGrid = false, fields }) {
  const template = LICENSE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown license template: ${templateId}`);
  }

  const fontFamily = registerLicenseFont();
  const resolvedPositions = positions || template.positions;
  const licenseFields = template.prepareFields(user, fields || {}, resolvedPositions);
  const avatarUrl = discordAvatarUrl(user);

  const canvas = createCanvas(template.width, template.height);
  const context = canvas.getContext('2d');

  const [baseImage, avatarImage] = await Promise.all([
    loadImage(template.baseImage),
    loadImage(avatarUrl),
  ]);

  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  context.drawImage(
    avatarImage,
    resolvedPositions.avatar.x,
    resolvedPositions.avatar.y,
    resolvedPositions.avatar.width,
    resolvedPositions.avatar.height,
  );

  if (drawGrid) {
    drawPositionGrid(context, template.width, template.height);
  }

  if (template.textStyle === 'outlined') {
    context.fillStyle = 'white';
    context.strokeStyle = 'black';
    context.lineWidth = 6;
    template.drawFields(context, resolvedPositions, licenseFields, fontFamily, drawOutlinedText);
  } else {
    context.fillStyle = '#000000';
    template.drawFields(context, resolvedPositions, licenseFields, fontFamily, drawPlainText);
  }

  return canvas.encode('png');
}

/**
 * @param {object} opts
 * @param {{ id: string, username: string, avatar?: string|null, global_name?: string|null, globalName?: string|null, displayName?: string }} opts.user
 * @param {typeof DEFAULT_POSITIONS} [opts.positions]
 * @param {boolean} [opts.drawGrid=false]
 * @param {{ agentNum?: string, sex?: string, species?: string, issuedDate?: string }} [opts.fields]
 */
async function renderFurryLicense({ user, positions = DEFAULT_POSITIONS, drawGrid = false, fields }) {
  return renderLicense({ templateId: 'furry', user, positions, drawGrid, fields });
}

module.exports = {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_POSITIONS,
  LOLI_DEFAULT_POSITIONS,
  LICENSE_TEMPLATES,
  BASE_IMAGE,
  registerLicenseFont,
  discordAvatarUrl,
  displayName,
  randomLicenseFields,
  renderLicense,
  renderFurryLicense,
};
