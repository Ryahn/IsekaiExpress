const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const { v5: uuidv5 } = require('uuid');
const NAMESPACE = uuidv5.URL;
const path = require('path');
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
  cardLayoutForRarityCatalog,
  rarityPathSlugFromKey,
  BASE_STATS_L1,
  POWER_SCORE_L1,
  drawGlowingTextCentered,
  drawClassPillText,
  drawCornerIconScaled,
  drawSubtleCardGradient,
} = require('./src/bot/tcg/cardLayout.js');
const {
  normalizeElementKey,
  resolveElementIconPath,
} = require('./src/bot/tcg/elements.js');

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

function generateUUID(characterName, rarityNorm, discordId, elementKey) {
  return uuidv5(`${characterName}|${rarityNorm}|${discordId}|${elementKey}`, NAMESPACE);
}

/**
 * @param {string} characterName
 * @param {string} rawRarity - batch key, may be legacy
 * @param {string} className
 * @param {string} avatar - URL
 * @param {string} _typeLegacy - kept for API compatibility; unused
 * @param {string|number} discordId
 * @param {string} elementKey - canonical element id (tools/card_elements/{key}.png)
 * @param {string|null} [elementIconPath] - optional absolute path to element PNG
 * @param {{ skipDb?: boolean }} [options]
 */
async function generateCard(
  characterName,
  rawRarity,
  className,
  avatar,
  _typeLegacy,
  discordId,
  elementKey,
  elementIconPath = null,
  options = {},
) {
  const norm = normalizeRarityKey(rawRarity);
  const rSpec = RARITY[norm] || RARITY.C;
  const safeUser = safePathSegmentFromName(characterName);
  const raritySlug = rarityPathSlugFromKey(norm);

  const resolvedElementKey = normalizeElementKey(elementKey);
  if (!resolvedElementKey) {
    throw new Error(`generateCard: elementKey is required (got ${elementKey})`);
  }

  let iconPath = elementIconPath && fs.existsSync(elementIconPath) ? elementIconPath : null;
  if (!iconPath) {
    iconPath = resolveElementIconPath(repoRoot, resolvedElementKey);
  }
  if (!iconPath || !fs.existsSync(iconPath)) {
    throw new Error(`generateCard: no element icon for ${resolvedElementKey}`);
  }

  const baseStats = BASE_STATS_L1[norm] ?? BASE_STATS_L1.C;
  const basePower = POWER_SCORE_L1[norm] ?? POWER_SCORE_L1.C;

  const uuid = generateUUID(characterName, norm, discordId, resolvedElementKey);

  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');

  const basePath = resolveBaseCardPath(repoRoot, norm);
  const baseImage = await loadImage(basePath);
  ctx.drawImage(baseImage, 0, 0, CARD.width, CARD.height);

  const layout = cardLayoutForRarityCatalog(norm);

  const profileImage = await loadImage(avatar);
  const p = layout.portrait;
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.drawImage(profileImage, p.x, p.y, p.w, p.h);
  ctx.restore();

  const icon = await loadImage(iconPath);
  drawCornerIconScaled(ctx, icon, layout.elementIcon);

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

  const fileName = `${resolvedElementKey}.png`;
  const outputDir = path.join(repoRoot, 'src', 'bot', 'media', 'cards', safeUser, raritySlug);
  if (!fs.existsSync(outputDir)) {
    logger.info(`Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, fileName);

  const baseCardUrl = (config.cardUrl || config.url || '').replace(/\/$/, '');
  const image_url = `${baseCardUrl}/${encodeURIComponent(safeUser)}/${encodeURIComponent(raritySlug)}/${encodeURIComponent(fileName)}`;

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  let member_id = null;
  // if (!options.skipDb) {
  //   try {
  //     const dbmod = require('./database/db');
  //     const userRow = await dbmod.query('users').where({ discord_id: String(discordId) }).first();
  //     if (userRow) member_id = userRow.id;
  //   } catch (e) {
  //     logger.warn(`member_id lookup skipped: ${e.message}`);
  //   }
  // }

  const card = {
    discord_id: discordId,
    uuid,
    stars: rSpec.starCount,
    name: characterName,
    rarity: norm,
    class: className,
    level: null,
    power: null,
    element: resolvedElementKey,
    ability_key: null,
    base_atk: baseStats.atk,
    base_def: baseStats.def,
    base_spd: baseStats.spd,
    base_hp: baseStats.hp,
    base_power: basePower,
    image_url,
    created_at: timestamp(),
    updated_at: timestamp(),
  };
  if (member_id != null) {
    card.member_id = member_id;
  }

  // if (!options.skipDb) {
  //   try {
  //     const dbmod = require('./database/db');
  //     await dbmod.createCard(card);
  //   } catch (e) {
  //     logger.warn(`DB upsert failed: ${e.message}`);
  //   }
  // }

  if (global.gc) {
    global.gc({ type: 'major' });
  }

  return {
    fileName,
    outputPath,
    file_id: uuid,
    card,
  };
}

module.exports = {
  generateCard,
};
