const fs = require('fs');
const path = require('path');
const { rarityBaseCardFileStem } = require('../../../seeds/rarity');

const CARD = {
  width: 1024,
  height: 1536,
  // tools/base_card template: frame pixels (Barlow / PixArts layout)
  portrait: { x: 176, y: 252, w: 669, h: 623 },
  // Not drawn on catalog PNGs; reserved for possible overlays / docs
  level: {
    cx: 120, cy: 110, r: 65, fontSize: 64, align: 'center', baseline: 'middle',
  },
  power: {
    cx: 845, cy: 105, w: 250, h: 100, fontSize: 56, align: 'center', baseline: 'middle',
  },
  // Title row (top-left 174,938 — 671×81); star row is centered on (name.cx, name.cy − offset)
  name: {
    cx: 509, cy: 978, fontSize: 56, maxWidth: 671, align: 'center', baseline: 'middle',
  },
  rarityStarRow: {
    offsetAboveNameCenter: 20,
    size: 15,
    gap: 4,
  },
  // Class / flavor: description panel (top-left 137,1099 — 747×229)
  description: {
    x: 137, y: 1099, w: 747, h: 229, cx: 510, cy: 1213,
    fontSize: 32, lineHeight: 40, maxWidth: 700,
  },
  // Element gem (top-left 456,1372 — 110×110)
  elementIcon: { cx: 511, cy: 1427, r: 55 },
  abilityIcon: { cx: 830, cy: 1215, r: 70 },
};

/**
 * Per-rarity layout nudges from CARD defaults. All keys optional per tier.
 * - Top-level **number** — same nudge (px) for `name` and `class` only; portrait/level/power unchanged.
 * - **object**:
 *   - `name` / `class` — vertical shift for title and description (class) text (px), or one number for both (legacy).
 *   - `level` / `power` / `element` / `ability` — number = Δcy, or `{ cx, cy }` for left/right and up/down (px).
 *   - `portrait` — avatar clip: `{ x, y, w, h }` as **deltas** from CARD.portrait.
 */
const RARITY_LAYOUT_OFFSET = {
  C: 0,
  UC: 0,
  R: 0,
  EP: 0,
  L: 0,
  M: 0,
};

function expandNameClassOffset(entry) {
  if (entry == null) return { name: 0, class: 0 };
  if (typeof entry === 'number' && !Number.isNaN(entry)) {
    return { name: entry, class: entry };
  }
  if (typeof entry === 'object') {
    const n = entry.name;
    const c = entry.class;
    if (typeof n === 'number' && c === undefined) {
      return { name: n, class: n };
    }
    if (typeof c === 'number' && n === undefined) {
      return { name: c, class: c };
    }
    return {
      name: typeof n === 'number' ? n : 0,
      class: typeof c === 'number' ? c : 0,
    };
  }
  return { name: 0, class: 0 };
}

function nudgeLevelPower(raw) {
  if (raw == null) return { cx: 0, cy: 0 };
  if (typeof raw === 'number' && !Number.isNaN(raw)) return { cx: 0, cy: raw };
  return {
    cx: typeof raw.cx === 'number' ? raw.cx : 0,
    cy: typeof raw.cy === 'number' ? raw.cy : 0,
  };
}

function nudgePortrait(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  return {
    x: typeof raw.x === 'number' ? raw.x : 0,
    y: typeof raw.y === 'number' ? raw.y : 0,
    w: typeof raw.w === 'number' ? raw.w : 0,
    h: typeof raw.h === 'number' ? raw.h : 0,
  };
}

/**
 * @returns {{ name: number, class: number, level: {cx,cy}, power: {cx,cy}, element: {cx,cy}, ability: {cx,cy}, portrait: {x,y,w,h} }}
 */
function expandRarityLayoutEntry(entry) {
  const out = {
    name: 0, class: 0,
    level: { cx: 0, cy: 0 },
    power: { cx: 0, cy: 0 },
    element: { cx: 0, cy: 0 },
    ability: { cx: 0, cy: 0 },
    portrait: { x: 0, y: 0, w: 0, h: 0 },
  };
  if (entry == null) return out;
  if (typeof entry === 'number' && !Number.isNaN(entry)) {
    const nc = expandNameClassOffset(entry);
    out.name = nc.name;
    out.class = nc.class;
    return out;
  }
  if (typeof entry === 'object') {
    const nc = expandNameClassOffset({
      name: entry.name,
      class: entry.class,
    });
    out.name = nc.name;
    out.class = nc.class;
    out.level = nudgeLevelPower(entry.level);
    out.power = nudgeLevelPower(entry.power);
    out.element = nudgeLevelPower(entry.element);
    out.ability = nudgeLevelPower(entry.ability);
    out.portrait = nudgePortrait(entry.portrait);
  }
  return out;
}

/**
 * Merged layout for one tier: portrait, level, power, name, description, element/ability — includes CARD + offsets.
 */
function cardLayoutForRarity(norm) {
  const o = expandRarityLayoutEntry(RARITY_LAYOUT_OFFSET[norm]);
  return {
    portrait: {
      x: CARD.portrait.x + o.portrait.x,
      y: CARD.portrait.y + o.portrait.y,
      w: CARD.portrait.w + o.portrait.w,
      h: CARD.portrait.h + o.portrait.h,
    },
    level: {
      ...CARD.level,
      cx: CARD.level.cx + o.level.cx,
      cy: CARD.level.cy + o.level.cy,
    },
    power: {
      ...CARD.power,
      cx: CARD.power.cx + o.power.cx,
      cy: CARD.power.cy + o.power.cy,
    },
    name: { ...CARD.name, cy: CARD.name.cy + o.name },
    description: { ...CARD.description, cy: CARD.description.cy + o.class },
    elementIcon: {
      ...CARD.elementIcon,
      cx: CARD.elementIcon.cx + o.element.cx,
      cy: CARD.elementIcon.cy + o.element.cy,
    },
    abilityIcon: {
      ...CARD.abilityIcon,
      cx: CARD.abilityIcon.cx + o.ability.cx,
      cy: CARD.abilityIcon.cy + o.ability.cy,
    },
  };
}

function nameAndClassLayout(norm) {
  const L = cardLayoutForRarity(norm);
  return { name: L.name, description: L.description };
}

/**
 * Luminance-based outer glow: bright rarities (e.g. white/gold) need a dark halo or text vanishes
 * on light frames; same coords look fine on Common but fail on M/L/EP.
 */
function readableTextOuterGlowColor(hex) {
  const h = String(hex || '#888888').replace('#', '');
  if (h.length !== 6) return '#0f1018';
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum > 0.55) return '#0d0e14';
  if (lum > 0.4) return '#0f1520';
  return String(hex);
}

const RARITY = {
  C: { tag: 'C', starCount: 1, accentColor: '#00EFFF', starColor: '#A0A0A0', rarityColor: '#A0A0A0' },
  UC: { tag: 'UC', starCount: 2, accentColor: '#00CED1', starColor: '#00CED1', rarityColor: '#00CED1' },
  R: { tag: 'R', starCount: 3, accentColor: '#4169E1', starColor: '#4169E1', rarityColor: '#4169E1' },
  EP: { tag: 'EP', starCount: 4, accentColor: '#8B00FF', starColor: '#8B00FF', rarityColor: '#8B00FF' },
  L: { tag: 'L', starCount: 5, accentColor: '#FFD700', starColor: '#FFD700', rarityColor: '#FFD700' },
  M: { tag: 'M', starCount: 6, accentColor: '#E8E8E8', starColor: '#F5F5F5', rarityColor: '#FFFFFF' },
};

const legacyToCardSystemRarity = {
  N: 'C', C: 'C', UC: 'UC', R: 'R', EP: 'EP', L: 'L', M: 'M',
  U: 'L', SR: 'R', SSR: 'EP', SUR: 'L', UR: 'M',
};

function normalizeRarityKey(raw) {
  const k = String(raw || 'C').toUpperCase();
  if (RARITY[k]) return k;
  if (legacyToCardSystemRarity[k]) return legacyToCardSystemRarity[k];
  return 'C';
}

/** URL/path folder segment per tier (e.g. `common`, `mythic`). DB `rarity` stays `C`…`M`. */
const RARITY_PATH_SLUG = {
  C: 'common',
  UC: 'uncommon',
  R: 'rare',
  EP: 'epic',
  L: 'legendary',
  M: 'mythic',
};

function rarityPathSlugFromKey(rarityKey) {
  const k = normalizeRarityKey(rarityKey);
  return RARITY_PATH_SLUG[k] || RARITY_PATH_SLUG.C;
}

/**
 * Linear per-level bonus: L1 = ×1, L2 = ×1.15, L3 = ×1.3, … L5 = ×1.6
 * @param {number} [level=1]
 * @returns {number}
 */
function statLevelMultiplier(level = 1) {
  const lv = Math.min(5, Math.max(1, Number(level) || 1));
  return 1 + 0.15 * (lv - 1);
}

/** Level-1 power scores from [CardSystem.md] — per tier, before level bonus */
const POWER_SCORE_L1 = {
  C: 627, UC: 816, R: 1058, EP: 1372, L: 1776, M: 2312,
};

/** ATK / DEF / SPD / HP at level 1 — [CardSystem.md] base stats */
const BASE_STATS_L1 = {
  C: { atk: 100, def: 80, spd: 70, hp: 200 },
  UC: { atk: 130, def: 105, spd: 90, hp: 260 },
  R: { atk: 170, def: 135, spd: 115, hp: 340 },
  EP: { atk: 220, def: 175, spd: 150, hp: 440 },
  L: { atk: 285, def: 225, spd: 190, hp: 570 },
  M: { atk: 370, def: 295, spd: 250, hp: 740 },
};


/**
 * @param {string} rarityKey - batch key (C…M or legacy)
 * @param {number} [level=1] - card level 1–5, +15% of base stats per level step (linear)
 * @returns {number}
 */
function powerScoreAtLevel(rarityKey, level = 1) {
  const k = normalizeRarityKey(rarityKey);
  const base = POWER_SCORE_L1[k] ?? POWER_SCORE_L1.C;
  const mult = statLevelMultiplier(level);
  return Math.round(base * mult);
}
/**
 * @param {string} rarityKey
 * @param {number} [level=1]
 * @returns {{ atk: number, def: number, spd: number, hp: number }}
 */
function combatStatsAtLevel(rarityKey, level = 1) {
  const k = normalizeRarityKey(rarityKey);
  const base = BASE_STATS_L1[k] ?? BASE_STATS_L1.C;
  const mult = statLevelMultiplier(level);
  return {
    atk: Math.round(base.atk * mult),
    def: Math.round(base.def * mult),
    spd: Math.round(base.spd * mult),
    hp: Math.round(base.hp * mult),
  };
}

/**
 * Layout for static catalog PNGs: frame, portrait, element, name, class, overlay only.
 * Per [CardSystem.md], level, power, abilities, and traits are **not** baked into art — they
 * live in `card_data` / `user_cards` and are shown in Discord embeds.
 */
function cardLayoutForRarityCatalog(norm) {
  return cardLayoutForRarity(norm);
}


/** Game-tier keys not in `rarity` seed but used in batch; file stem = seed name for Super Super Rare */
const AUX_RARITY_BASE_STEM = {
  EP: 'super_super_rare',
};

const legacyPngByNorm = {
  C: ['C.png', 'COMMON.png', 'c.png'],
  UC: ['UC.png', 'UNCOMMON.png', 'uc.png'],
  R: ['R.png', 'RARE.png', 'r.png'],
  EP: ['EP.png', 'EPIC.png', 'ep.png'],
  L: ['L.png', 'LEGENDARY.png', 'l.png'],
  M: ['M.png', 'MYTHIC.png', 'm.png', 'MYTHIC.PNG'],
};

/**
 * Picks a base card PNG. Prefer `tools/base_card/<name_slug>.png` where `name_slug` is the
 * DB `rarity.name` (Unicode word chars + spaces) lowercased with spaces → `_` — see `seeds/rarity.js`.
 * @param {string} [rawRarityKey] - batch rarity (abbreviation, e.g. UR, C, N, SSR) before normalize
 */
function resolveBaseCardPath(repoRoot, rawRarityKey) {
  const baseDir = path.join(repoRoot, 'tools', 'base_card');
  const a = String(rawRarityKey || 'C').toUpperCase();
  const norm = normalizeRarityKey(a);

  const tryStem = (stem) => {
    if (!stem) return null;
    for (const ext of ['png', 'PNG']) {
      const p = path.join(baseDir, `${stem}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  const stems = [];
  const fromSeed = rarityBaseCardFileStem(a);
  if (fromSeed) stems.push(fromSeed);
  if (AUX_RARITY_BASE_STEM[a] != null) stems.push(AUX_RARITY_BASE_STEM[a]);
  const byNormPath = RARITY_PATH_SLUG[norm];
  if (byNormPath) stems.push(byNormPath);
  for (const s of stems) {
    const hit = tryStem(s);
    if (hit) return hit;
  }

  const legacyNames = legacyPngByNorm[norm] || legacyPngByNorm.C;
  for (const n of legacyNames) {
    const p = path.join(baseDir, n);
    if (fs.existsSync(p)) return p;
  }
  const def = path.join(baseDir, 'default.png');
  if (fs.existsSync(def)) return def;
  const fallback = path.join(repoRoot, 'src', 'bot', 'tcg', 'base_card.png');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(
    `No base card in tools/base_card (or src/bot/tcg/base_card.png) for rarity ${a} (norm ${norm})`,
  );
}

function safePathSegmentFromName(name) {
  return String(name || 'card')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'card';
}

function fillRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function textWidthWithTracking(ctx, text, extraPerGap) {
  if (!text.length) return 0;
  let w = 0;
  for (let i = 0; i < text.length; i += 1) {
    w += ctx.measureText(text[i]).width;
    if (i < text.length - 1) w += extraPerGap;
  }
  return w;
}

/**
 * Renders centered string with extra letter gap (px). Applies outer glow + white inner stroke + fill.
 */
function drawGlowingTextCentered(ctx, text, cx, cy, {
  font: fontStr,
  fillColor,
  outerColor,
  maxWidth = null,
  minFontSize = 24,
} = {}) {
  let currentFont = fontStr;
  const sizeMatch = /(\d+)(px)/i.exec(currentFont);
  let fontSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 32;
  if (maxWidth) {
    ctx.font = currentFont;
    let w = ctx.measureText(text).width;
    while (w > maxWidth && fontSize > minFontSize) {
      fontSize -= 2;
      currentFont = currentFont.replace(/\d+px/i, `${fontSize}px`);
      ctx.font = currentFont;
      w = ctx.measureText(text).width;
    }
  }
  ctx.save();
  ctx.font = currentFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const layers = [
    { blur: 18, color: outerColor, alpha: 0.9 },
    { blur: 8, color: outerColor, alpha: 0.75 },
  ];
  for (const { blur, color, alpha } of layers) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 2; i += 1) {
    ctx.globalAlpha = 0.4 - i * 0.15;
    ctx.strokeText(text, cx, cy);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = fillColor;
  ctx.shadowBlur = 0;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function drawGlowingTextLeft(ctx, text, x, y, { font, fillColor, outerColor } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const blur of [14, 6]) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = outerColor;
    ctx.shadowBlur = blur;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.globalAlpha = 0.5;
  ctx.strokeText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fillColor;
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawClassPillText(ctx, text, cp, { font, fillColor, outerColor, letterSpacing = 4 } = {}) {
  const upper = String(text).toUpperCase();
  const cx = cp.cx;
  const cy = cp.cy;
  ctx.save();
  ctx.font = font;
  const tw = textWidthWithTracking(ctx, upper, letterSpacing);
  const pillW = Math.max(cp.w, tw + 48);
  const pillX = cx - pillW / 2;
  const pillY = cy - cp.h / 2;
  ctx.fillStyle = cp.bgColor;
  fillRoundRect(ctx, pillX, pillY, pillW, cp.h, cp.radius);
  let at = cx - tw / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const ch of upper) {
    const chW = ctx.measureText(ch).width;
    const tx = at + chW / 2;
    drawGlowingTextCentered(ctx, ch, tx, cy, { font, fillColor, outerColor, minFontSize: 10 });
    at += chW + letterSpacing;
  }
  ctx.restore();
}

/**
 * Downscales element/trait PNGs (e.g. 512×512) into the corner badge (2r × 2r px on the card).
 * @param {object} ctx
 * @param {{ width: number, height: number }} image
 * @param {{ cx: number, cy: number, r: number }} slot
 */
function drawCornerIconScaled(ctx, image, { cx, cy, r }) {
  const sw = image.width;
  const sh = image.height;
  if (!sw || !sh) return;
  const dw = r * 2;
  const dh = r * 2;
  const dx = cx - r;
  const dy = cy - r;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}

/**
 * Horizontally centered row of star PNGs. Center (cx, cy) is the center of the whole row.
 * @param {object} ctx
 * @param {{ width: number, height: number }} image
 */
function drawRarityStarRow(
  ctx,
  image,
  { cx, cy, count, size = CARD.rarityStarRow.size, gap = CARD.rarityStarRow.gap },
) {
  const n = Math.min(Math.max(0, Math.floor(Number(count) || 0)), 30);
  if (n < 1 || !image?.width) return;
  const w = size;
  const h = size;
  const total = n * w + (n - 1) * gap;
  let x = cx - total / 2;
  const y = cy - h / 2;
  const sw = image.width;
  const sh = image.height;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  for (let i = 0; i < n; i += 1) {
    ctx.drawImage(image, 0, 0, sw, sh, x, y, w, h);
    x += w + gap;
  }
  ctx.restore();
}

function splitOversizeWord(ctx, word, maxW) {
  if (ctx.measureText(word).width <= maxW) return [word];
  const parts = [];
  let acc = '';
  for (const ch of word) {
    const t2 = acc + ch;
    if (t2 && ctx.measureText(t2).width > maxW) {
      if (acc) {
        parts.push(acc);
        acc = ch;
      } else {
        parts.push(ch);
        acc = '';
      }
    } else {
      acc = t2;
    }
  }
  if (acc) parts.push(acc);
  return parts;
}

function wrapTextToLines(ctx, upperText, maxW) {
  const words = upperText.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w0 of words) {
    const wordPieces = splitOversizeWord(ctx, w0, maxW);
    for (const w of wordPieces) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Word-wrapped, vertically centered text in the description box (class / flavor on catalog art).
 * Shrinks type if the block would exceed the box height.
 */
function drawGlowingTextWrappedInBox(ctx, text, d, {
  fontForSize = (px) => `${px}px ui-sans-serif, system-ui, sans-serif`,
  fillColor,
  outerColor,
  minFontSize = 18,
} = {}) {
  const raw = String(text || '').trim();
  if (!raw) return;

  const upper = raw.toUpperCase();
  const maxLines = Math.max(1, Math.floor(d.h / d.lineHeight));
  const maxW = d.maxWidth;
  let fontSize = d.fontSize;

  const buildLines = (size) => {
    const fontStr = fontForSize(size);
    ctx.save();
    ctx.font = fontStr;
    const lines = wrapTextToLines(ctx, upper, maxW);
    ctx.restore();
    return { font: fontStr, lines };
  };

  let { font, lines } = buildLines(fontSize);
  const lh = d.lineHeight;
  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 2;
    ({ font, lines } = buildLines(fontSize));
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[maxLines - 1];
    let ell = last;
    ctx.save();
    ctx.font = font;
    while (ell.length > 1 && ctx.measureText(`${ell}…`).width > maxW) {
      ell = ell.slice(0, -1);
    }
    ctx.restore();
    lines[maxLines - 1] = `${ell}…`;
  }

  const n = lines.length;
  const startCy = d.cy - ((n - 1) * lh) / 2;
  for (let i = 0; i < n; i += 1) {
    const cy = startCy + i * lh;
    drawGlowingTextCentered(ctx, lines[i], d.cx, cy, {
      font,
      fillColor,
      outerColor,
      maxWidth: maxW,
      minFontSize,
    });
  }
}

function drawSubtleCardGradient(ctx) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, CARD.width, CARD.height);
  g.addColorStop(0, 'rgba(20, 15, 40, 0.5)');
  g.addColorStop(0.45, 'rgba(0, 0, 0, 0.2)');
  g.addColorStop(1, 'rgba(10, 30, 50, 0.45)');
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(0, 0, CARD.width, CARD.height);
  ctx.globalAlpha = 1;
  ctx.restore();
}

module.exports = {
  CARD,
  RARITY,
  RARITY_LAYOUT_OFFSET,
  RARITY_PATH_SLUG,
  normalizeRarityKey,
  rarityPathSlugFromKey,
  statLevelMultiplier,
  readableTextOuterGlowColor,
  cardLayoutForRarity,
  cardLayoutForRarityCatalog,
  nameAndClassLayout,
  POWER_SCORE_L1,
  BASE_STATS_L1,
  powerScoreAtLevel,
  combatStatsAtLevel,
  resolveBaseCardPath,
  safePathSegmentFromName,
  fillRoundRect,
  textWidthWithTracking,
  drawGlowingTextCentered,
  drawGlowingTextLeft,
  drawClassPillText,
  drawGlowingTextWrappedInBox,
  drawCornerIconScaled,
  drawRarityStarRow,
  drawSubtleCardGradient,
};
