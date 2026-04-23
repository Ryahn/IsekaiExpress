const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const { v5: uuidv5 } = require('uuid');
const NAMESPACE = uuidv5.URL;
const path = require('path');
// const db = require('./database/db');
const config = require('./config');
const { timestamp } = require('./libs/utils');
const logger = require('silly-logger');
const {
  CARD,
  RARITY,
  normalizeRarityKey,
  resolveBaseCardPath,
  safePathSegmentFromName,
  readableTextOuterGlowColor,
  cardLayoutForRarity,
  drawGlowingTextCentered,
  drawClassPillText,
  drawSubtleCardGradient,
} = require('./src/bot/tcg/cardLayout.js');

const repoRoot = __dirname;
const ORBITRON_WOFF2 = path.join(repoRoot, 'tools', 'fonts', 'Orbitron-Bold.woff2');
const FONT_family = 'Orbitron';
try {
  if (fs.existsSync(ORBITRON_WOFF2)) {
    GlobalFonts.registerFromPath(ORBITRON_WOFF2, FONT_family);
  } else {
    logger.warn('Orbitron not found at tools/fonts/Orbitron-Bold.woff2; using system sans');
  }
} catch (e) {
  logger.warn(`Font register failed: ${e.message}`);
}

function font(sizePx, weight = 'bold') {
  if (fs.existsSync(ORBITRON_WOFF2)) {
    return `${weight} ${sizePx}px ${FONT_family}`;
  }
  return `${weight} ${sizePx}px ui-sans-serif, system-ui, sans-serif`;
}

function makeCardFileName(name, rawRarity) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  return `${safeName}_${String(rawRarity).toUpperCase()}.png`;
}

function generateUUID(characterName, rarity, discordId) {
  return uuidv5(`${characterName}-${rarity}-${discordId}`, NAMESPACE);
}

/**
 * @param {string} characterName
 * @param {string} rawRarity - batch key, may be legacy
 * @param {string} className
 * @param {number} level
 * @param {number} power
 * @param {string} avatar - URL
 * @param {string} _typeLegacy - kept for API compatibility; unused for paths
 * @param {string|number} discordId
 * @param {string} [elementIconPath] - optional absolute path to element PNG
 */
async function generateCard(
  characterName,
  rawRarity,
  className,
  level,
  power,
  avatar,
  _typeLegacy,
  discordId,
  elementIconPath = null,
) {
  const norm = normalizeRarityKey(rawRarity);
  const rSpec = RARITY[norm] || RARITY.C;
  const uuid = generateUUID(characterName, rawRarity, discordId);
  const safeUser = safePathSegmentFromName(characterName);

  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');

  const basePath = resolveBaseCardPath(repoRoot, norm);
  const baseImage = await loadImage(basePath);
  ctx.drawImage(baseImage, 0, 0, CARD.width, CARD.height);

  const layout = cardLayoutForRarity(norm);

  const profileImage = await loadImage(avatar);
  const p = layout.portrait;
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.drawImage(profileImage, p.x, p.y, p.w, p.h);
  ctx.restore();

  if (elementIconPath && fs.existsSync(elementIconPath)) {
    const el = CARD.elementIcon;
    const size = el.r * 2;
    const icon = await loadImage(elementIconPath);
    ctx.drawImage(icon, el.cx - el.r, el.cy - el.r, size, size);
  }

  const l = layout.level;
  const levelStr = String(level);
  const levelFont = font(l.fontSize);
  drawGlowingTextCentered(ctx, levelStr, l.cx, l.cy, {
    font: levelFont,
    fillColor: rSpec.accentColor,
    outerColor: rSpec.accentColor,
  });

  const po = layout.power;
  const powerStr = String(power);
  let powerFont = font(po.fontSize);
  ctx.font = powerFont;
  if (ctx.measureText(powerStr).width > po.w - 20) {
    powerFont = font(44);
  }
  drawGlowingTextCentered(ctx, powerStr, po.cx, po.cy, {
    font: powerFont,
    fillColor: rSpec.accentColor,
    outerColor: rSpec.accentColor,
  });

  const n = layout.name;
  const cp = layout.classPill;
  const nameOuter = readableTextOuterGlowColor(rSpec.rarityColor);
  const nameUpper = String(characterName).toUpperCase();
  drawGlowingTextCentered(ctx, nameUpper, n.cx, n.cy, {
    font: font(n.fontSize),
    fillColor: '#FFFFFF',
    outerColor: nameOuter,
    maxWidth: n.maxWidth,
    minFontSize: 28,
  });

  const classOuter = readableTextOuterGlowColor(rSpec.rarityColor);
  drawClassPillText(ctx, className, cp, {
    font: font(cp.fontSize, 'normal'),
    fillColor: '#AAAAAA',
    outerColor: classOuter,
    letterSpacing: 4,
  });

  drawSubtleCardGradient(ctx);

  const fileName = makeCardFileName(characterName, rawRarity);
  const outputDir = path.join(repoRoot, 'src', 'bot', 'media', 'cards', safeUser);
  if (!fs.existsSync(outputDir)) {
    logger.info(`Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, fileName);

  const baseCardUrl = (config.cardUrl || config.url || '').replace(/\/$/, '');
  const image_url = `${baseCardUrl}/${encodeURIComponent(safeUser)}/${fileName}`;

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  const card = {
    discord_id: discordId,
    uuid,
    stars: rSpec.starCount,
    name: characterName,
    rarity: norm,
    class: className,
    level,
    power,
    image_url,
    created_at: timestamp(),
    updated_at: timestamp(),
  };

  // await db.createCard(card);

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
