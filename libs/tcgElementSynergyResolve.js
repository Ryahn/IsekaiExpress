/**
 * Stage 3 element synergy (TCG Master Plan): Focus, Pairs, Trinity.
 * Plan element names map to game keys: Lightning→electric, Ice→nature, Void→cosmic.
 */
const { normalizeElementKey } = require('../src/bot/tcg/elements');

/** @param {string|null|undefined} raw */
function synEl(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  const alias = {
    lightning: 'electric',
    ice: 'nature',
    void: 'cosmic',
  };
  return normalizeElementKey(alias[s] || s);
}

/**
 * @param {{ main?: object|null, support1?: object|null, support2?: object|null }} loadout
 * @returns {Set<string>}
 */
function loadoutElementSet(loadout) {
  const set = new Set();
  for (const key of ['main', 'support1', 'support2']) {
    const c = loadout[key];
    const e = synEl(c && c.element);
    if (e) set.add(e);
  }
  return set;
}

/** @param {Set<string>} set */
function hasAll(set, els) {
  return els.every((e) => set.has(e));
}

/**
 * @param {object|null} lead
 * @returns {'atk'|'def'|'spd'|'hp'}
 */
function leadPrimaryStatForFocus(lead) {
  const ck = String(lead?.class || '')
    .trim()
    .toLowerCase();
  if (ck === 'artisan') return 'atk';
  if (ck === 'guardian') return 'def';
  if (ck === 'phantom') return 'spd';
  if (ck === 'warden') return 'hp';
  if (ck === 'sage') return 'atk';
  if (ck === 'commander' || ck === 'staff') return 'def';
  if (ck === 'sovereign') return 'atk';
  return 'atk';
}

function pctSlice(pct, stat) {
  const o = { atk: 0, def: 0, spd: 0, hp: 0, all: 0 };
  if (stat === 'atk') o.atk = pct;
  else if (stat === 'def') o.def = pct;
  else if (stat === 'spd') o.spd = pct;
  else if (stat === 'hp') o.hp = pct;
  return o;
}

const PAIRS = [
  { a: 'fire', b: 'wind', bonus: { atk: 0.08 }, label: 'Fire + Wind' },
  { a: 'water', b: 'nature', bonus: { def: 0.08 }, label: 'Water + Ice' },
  { a: 'electric', b: 'cosmic', bonus: { spd: 0.08 }, label: 'Lightning + Void' },
  { a: 'earth', b: 'time', bonus: { def: 0.05, hp: 0.05 }, label: 'Earth + Time' },
  { a: 'dark', b: 'light', bonus: { atk: 0.1, def: -0.05 }, label: 'Dark + Light' },
  { a: 'fire', b: 'nature', bonus: { atk: -0.05, def: 0.12 }, label: 'Fire + Ice' },
  { a: 'water', b: 'electric', bonus: { atk: 0.08, def: -0.03 }, label: 'Water + Lightning' },
  { a: 'dark', b: 'time', bonus: { spd: 0.06, atk: 0.06 }, label: 'Dark + Time' },
  { a: 'light', b: 'wind', bonus: { spd: 0.1 }, label: 'Light + Wind' },
  { a: 'earth', b: 'cosmic', bonus: { hp: 0.08 }, label: 'Earth + Void' },
];

const TRINITIES = [
  {
    els: ['fire', 'wind', 'electric'],
    name: 'Storm Front',
    score: 50,
    bonus: { atk: 0.12, abilityProcBonus: 0.15 },
    coversPairs: [['fire', 'wind']],
  },
  {
    els: ['water', 'nature', 'earth'],
    name: 'Glacial Fortress',
    score: 48,
    bonus: { def: 0.15, negateFirstPlayerHit: true },
    coversPairs: [
      ['water', 'nature'],
      ['water', 'earth'],
    ],
  },
  {
    els: ['dark', 'cosmic', 'time'],
    name: 'Entropy',
    score: 52,
    bonus: { atk: 0.1, spd: 0.1, enemyDefPct: -0.08 },
    coversPairs: [
      ['dark', 'time'],
      ['dark', 'cosmic'],
    ],
  },
  {
    els: ['light', 'wind', 'electric'],
    name: 'Radiant Surge',
    score: 49,
    bonus: { spd: 0.15, atk: 0.08 },
    coversPairs: [['light', 'wind']],
  },
  {
    els: ['earth', 'fire', 'time'],
    name: 'Forged Legacy',
    score: 47,
    bonus: { def: 0.1, hp: 0.1, goldMult: 1.05 },
    coversPairs: [['earth', 'time']],
  },
  {
    els: ['water', 'dark', 'cosmic'],
    name: 'Abyssal Tide',
    score: 46,
    bonus: { atk: 0.12, enemyAbilityProcPenalty: 0.1 },
    coversPairs: [['water', 'dark']],
  },
];

/**
 * @param {{ main: object|null, support1: object|null, support2: object|null }} loadout
 * @param {object|null} lead same as loadout.main
 * @returns {{
 *   atkPct: number, defPct: number, spdPct: number, hpPct: number, allPct: number,
 *   goldMult: number, lines: string[],
 *   grantTier2AbilityOnRound1: boolean,
 *   abilityProcBonus: number,
 *   negateFirstPlayerHit: boolean,
 *   enemyDefPct: number,
 *   enemyAbilityProcPenalty: number,
 * }}
 */
function resolveElementSynergy(loadout, lead) {
  const lines = [];
  const acc = {
    atkPct: 0,
    defPct: 0,
    spdPct: 0,
    hpPct: 0,
    allPct: 0,
    goldMult: 1,
    grantTier2AbilityOnRound1: false,
    abilityProcBonus: 0,
    negateFirstPlayerHit: false,
    enemyDefPct: 0,
    enemyAbilityProcPenalty: 0,
  };

  const leadEl = synEl(lead && lead.element);
  if (!leadEl) {
    return { ...acc, lines };
  }

  const els = loadoutElementSet(loadout);
  let matchLead = 0;
  for (const key of ['main', 'support1', 'support2']) {
    const c = loadout[key];
    if (synEl(c && c.element) === leadEl) matchLead += 1;
  }

  if (matchLead >= 2) {
    const tier = matchLead >= 5 ? 5 : matchLead;
    const pct =
      tier === 2 ? 0.03 : tier === 3 ? 0.06 : tier === 4 ? 0.09 : tier === 5 ? 0.15 : 0;
    if (pct > 0) {
      const primary = leadPrimaryStatForFocus(lead);
      const slice = pctSlice(pct, primary);
      acc.atkPct += slice.atk;
      acc.defPct += slice.def;
      acc.spdPct += slice.spd;
      acc.hpPct += slice.hp;
      lines.push(
        `**Elemental Focus** (${matchLead}× ${leadEl}) +${Math.round(pct * 100)}% ${primary.toUpperCase()}`,
      );
      if (tier === 5) {
        acc.grantTier2AbilityOnRound1 = true;
        lines.push('**Elemental Focus** — mono · bonus Tier 2 proc round 1');
      }
    }
  }

  let bestTrinity = null;
  for (const t of TRINITIES) {
    if (hasAll(els, t.els) && (!bestTrinity || t.score > bestTrinity.score)) {
      bestTrinity = t;
    }
  }

  const coveredPairKeys = new Set();
  if (bestTrinity) {
    const b = { ...bestTrinity.bonus };
    if (b.atk) acc.atkPct += b.atk;
    if (b.def) acc.defPct += b.def;
    if (b.spd) acc.spdPct += b.spd;
    if (b.hp) acc.hpPct += b.hp;
    if (b.goldMult) acc.goldMult *= b.goldMult;
    if (b.negateFirstPlayerHit) acc.negateFirstPlayerHit = true;
    if (b.enemyDefPct) acc.enemyDefPct += b.enemyDefPct;
    if (b.abilityProcBonus) acc.abilityProcBonus += b.abilityProcBonus;
    if (b.enemyAbilityProcPenalty) acc.enemyAbilityProcPenalty += b.enemyAbilityProcPenalty;
    lines.push(`⚡ **${bestTrinity.name}** (Trinity)`);
    for (const [x, y] of bestTrinity.coversPairs || []) {
      coveredPairKeys.add(`${x}:${y}`);
      coveredPairKeys.add(`${y}:${x}`);
    }
  }

  let bestPair = null;
  let bestPairScore = -1;
  for (const p of PAIRS) {
    const key = `${p.a}:${p.b}`;
    if (coveredPairKeys.has(key)) continue;
    if (!els.has(p.a) || !els.has(p.b)) continue;
    const sc =
      Math.abs(p.bonus.atk || 0)
      + Math.abs(p.bonus.def || 0)
      + Math.abs(p.bonus.spd || 0)
      + Math.abs(p.bonus.hp || 0);
    if (sc > bestPairScore) {
      bestPairScore = sc;
      bestPair = p;
    }
  }

  if (bestPair) {
    acc.atkPct += bestPair.bonus.atk || 0;
    acc.defPct += bestPair.bonus.def || 0;
    acc.spdPct += bestPair.bonus.spd || 0;
    acc.hpPct += bestPair.bonus.hp || 0;
    lines.push(`**Pair:** ${bestPair.label}`);
  }

  return {
    atkPct: acc.atkPct,
    defPct: acc.defPct,
    spdPct: acc.spdPct,
    hpPct: acc.hpPct,
    allPct: acc.allPct,
    goldMult: acc.goldMult,
    lines,
    grantTier2AbilityOnRound1: acc.grantTier2AbilityOnRound1,
    abilityProcBonus: acc.abilityProcBonus,
    negateFirstPlayerHit: acc.negateFirstPlayerHit,
    enemyDefPct: acc.enemyDefPct,
    enemyAbilityProcPenalty: acc.enemyAbilityProcPenalty,
  };
}

module.exports = {
  resolveElementSynergy,
  synEl,
};
