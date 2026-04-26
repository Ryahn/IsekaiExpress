const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const { v5: uuidv5 } = require('uuid');
const NAMESPACE = uuidv5.URL;
const path = require('path');
const config = require('./config');
const { timestamp } = require('./libs/utils');
const logger = require('./libs/logger');
const {
  CARD,
  RARITY,
  sanitizeRarityAbbrev,
  resolveBaseCardPath,
  safePathSegmentFromName,
  readableTextOuterGlowColor,
  cardLayoutForRarityCatalog,
  rarityPathSlugFromKey,
  BASE_STATS_L1,
  POWER_SCORE_L1,
  drawGlowingTextCentered,
  drawGlowingTextWrappedInBox,
  drawCornerIconScaled,
  drawRarityStarRow,
  drawSubtleCardGradient,
} = require('./src/bot/tcg/cardLayout.js');
const { rarityStarCount } = require('./seeds/rarity');
const {
  normalizeElementKey,
  resolveElementIconPath,
} = require('./src/bot/tcg/elements.js');
const { pickRandomHomeRegionForElement } = require('./libs/tcgPveConfig');

const repoRoot = __dirname;
const BarlowCondensed = path.join(repoRoot, 'tools', 'fonts', 'BarlowCondensed-Regular.ttf');
const FONT_family = 'BarlowCondensed';
try {
  if (fs.existsSync(BarlowCondensed)) {
    GlobalFonts.registerFromPath(BarlowCondensed, FONT_family);
  } else {
    logger.warn('BarlowCondensed not found at tools/fonts/BarlowCondensed-Regular.ttf; using system sans');
  }
} catch (e) {
  logger.warn(`Font register failed: ${e.message}`);
}

function font(sizePx, weight = 'bold') {
  if (fs.existsSync(BarlowCondensed)) {
    return `${weight} ${sizePx}px ${FONT_family}`;
  }
  return `${weight} ${sizePx}px ui-sans-serif, system-ui, sans-serif`;
}

function generateUUID(characterName, rarityAbbrev, discordId, elementKey) {
  return uuidv5(`${characterName}|${rarityAbbrev}|${discordId}|${elementKey}`, NAMESPACE);
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
  const abbrev = sanitizeRarityAbbrev(rawRarity, 'C');
  const rSpec = RARITY[abbrev] || RARITY.C;
  const safeUser = safePathSegmentFromName(characterName);
  const raritySlug = rarityPathSlugFromKey(abbrev);

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

  const baseStats = BASE_STATS_L1[abbrev] ?? BASE_STATS_L1.C;
  const basePower = POWER_SCORE_L1[abbrev] ?? POWER_SCORE_L1.C;

  const uuid = generateUUID(characterName, abbrev, discordId, resolvedElementKey);

  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');

  const basePath = resolveBaseCardPath(repoRoot, rawRarity);
  const baseImage = await loadImage(basePath);
  ctx.drawImage(baseImage, 0, 0, CARD.width, CARD.height);

  const layout = cardLayoutForRarityCatalog(abbrev);

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
  const desc = layout.description;
  const displayStarCount = rarityStarCount(rawRarity) ?? rSpec.starCount;
  const starPath = path.join(repoRoot, 'tools', 'star.png');
  if (displayStarCount > 0) {
    if (fs.existsSync(starPath)) {
      const starImage = await loadImage(starPath);
      const rs = CARD.rarityStarRow;
      const starRowCy = n.cy - rs.offsetAboveNameCenter;
      drawRarityStarRow(ctx, starImage, {
        cx: n.cx,
        cy: starRowCy,
        count: displayStarCount,
        size: rs.size,
        gap: rs.gap,
      });
    } else {
      logger.warn('Rarity stars skipped: missing tools/star.png');
    }
  }

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
  drawGlowingTextWrappedInBox(ctx, className, desc, {
    fontForSize: (px) => font(px, 'normal'),
    fillColor: '#AAAAAA',
    outerColor: classOuter,
    minFontSize: 20,
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

  const mode = config.tcg && config.tcg.catalogRegionMode;
  let tcgRegion = null;
  if (mode && mode.type === 'random') {
    tcgRegion = pickRandomHomeRegionForElement(resolvedElementKey);
  } else if (mode && mode.type === 'fixed') {
    tcgRegion = mode.region;
  }
  /** Catalog L1; instance progression lives on `user_cards.level`. */
  const levelValue = '1';
  const powerValue = String(basePower);
  /**
   * Mythic templates are tagged for Boss Pack pool (`tcgPacks` uses `is_boss_card`); other tiers 0.
   */
  const isBossCard = abbrev === 'M' ? 1 : 0;

  const card = {
    discord_id: discordId,
    uuid,
    stars: displayStarCount,
    name: characterName,
    rarity: abbrev,
    class: className,
    level: levelValue,
    power: powerValue,
    element: resolvedElementKey,
    ability_key: null,
    base_atk: baseStats.atk,
    base_def: baseStats.def,
    base_spd: baseStats.spd,
    base_hp: baseStats.hp,
    base_power: basePower,
    tcg_region: tcgRegion,
    is_boss_card: isBossCard,
    image_url,
    created_at: timestamp(),
    updated_at: timestamp(),
  };

  if (!options.skipDb) {
    try {
      const dbmod = require('./database/db');
      await dbmod.createCard(card);
    } catch (e) {
      logger.warn(`DB upsert failed: ${e.message}`);
    }
  }

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
