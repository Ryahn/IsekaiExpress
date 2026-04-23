const fs = require('fs');
const path = require('path');

const CARD = {
  width: 1024,
  height: 1536,
  // Portrait: original design 855×900, reduced 30% (70% scale), centered in the same frame
  portrait: { x: 213, y: 280, w: 599, h: 630 },
  level: {
    cx: 105, cy: 105, r: 65, fontSize: 64, align: 'center', baseline: 'middle',
  },
  power: {
    cx: 845, cy: 105, w: 250, h: 100, fontSize: 56, align: 'center', baseline: 'middle',
  },
  name: {
    cx: 512, cy: 1145, fontSize: 72, maxWidth: 860, align: 'center', baseline: 'middle',
  },
  classPill: {
    cx: 512, cy: 1245, w: 240, h: 58, radius: 12, bgColor: 'transparent', fontSize: 28, letterSpacing: 4,
  },
  elementIcon: { cx: 105, cy: 1430, r: 70 },
};

/**
 * Per-rarity layout nudges from CARD defaults. All keys optional per tier.
 * - Top-level **number** — same nudge (px) for `name` and `class` only; portrait/level/power unchanged.
 * - **object**:
 *   - `name` / `class` — vertical shift for title and class pill (px), or one number for both (legacy).
 *   - `level` / `power` — number = Δcy, or `{ cx, cy }` for badge position (px).
 *   - `portrait` — avatar clip: `{ x, y, w, h }` as **deltas** from CARD.portrait.
 */
const RARITY_LAYOUT_OFFSET = {
  C: 0,
  UC: { name: 20, class: 20 },
  R: 40,
  EP: 55,
  L: 50,
  M: 80,
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
 * @returns {{ name: number, class: number, level: {cx,cy}, power: {cx,cy}, portrait: {x,y,w,h} }}
 */
function expandRarityLayoutEntry(entry) {
  const out = {
    name: 0, class: 0,
    level: { cx: 0, cy: 0 },
    power: { cx: 0, cy: 0 },
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
    out.portrait = nudgePortrait(entry.portrait);
  }
  return out;
}

/**
 * Merged layout for one tier: portrait (avatar), level, power, name, class — includes CARD + offsets.
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
    classPill: { ...CARD.classPill, cy: CARD.classPill.cy + o.class },
  };
}

function nameAndClassLayout(norm) {
  const L = cardLayoutForRarity(norm);
  return { name: L.name, classPill: L.classPill };
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

/** Level-1 power scores from [CardSystem.md] — per tier, before level bonus */
const POWER_SCORE_L1 = {
  C: 627, UC: 816, R: 1058, EP: 1372, L: 1776, M: 2312,
};

/**
 * @param {string} rarityKey - batch key (C…M or legacy)
 * @param {number} [level=1] - card level 1–5, +15% all stats per level over previous
 * @returns {number}
 */
function powerScoreAtLevel(rarityKey, level = 1) {
  const k = normalizeRarityKey(rarityKey);
  const base = POWER_SCORE_L1[k] ?? POWER_SCORE_L1.C;
  const lv = Math.min(5, Math.max(1, Number(level) || 1));
  return Math.round(base * (1.15 ** (lv - 1)));
}

const baseNamesByRarity = {
  C: ['C.png', 'COMMON.png', 'c.png'],
  UC: ['UC.png', 'UNCOMMON.png', 'uc.png'],
  R: ['R.png', 'RARE.png', 'r.png'],
  EP: ['EP.png', 'EPIC.png', 'ep.png'],
  L: ['L.png', 'LEGENDARY.png', 'l.png'],
  M: ['M.png', 'MYTHIC.png', 'm.png', 'MYTHIC.PNG'],
};

function resolveBaseCardPath(repoRoot, norm) {
  const baseDir = path.join(repoRoot, 'tools', 'base_card');
  const names = baseNamesByRarity[norm] || baseNamesByRarity.C;
  for (const n of names) {
    const p = path.join(baseDir, n);
    if (fs.existsSync(p)) return p;
  }
  const def = path.join(baseDir, 'default.png');
  if (fs.existsSync(def)) return def;
  const fallback = path.join(repoRoot, 'src', 'bot', 'tcg', 'base_card.png');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(
    `No base card in tools/base_card (or src/bot/tcg/base_card.png) for rarity ${norm}`,
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
  normalizeRarityKey,
  readableTextOuterGlowColor,
  cardLayoutForRarity,
  nameAndClassLayout,
  POWER_SCORE_L1,
  powerScoreAtLevel,
  resolveBaseCardPath,
  safePathSegmentFromName,
  fillRoundRect,
  textWidthWithTracking,
  drawGlowingTextCentered,
  drawGlowingTextLeft,
  drawClassPillText,
  drawSubtleCardGradient,
};
