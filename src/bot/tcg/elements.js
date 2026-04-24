const fs = require('fs');
const path = require('path');

const ELEMENT_IDS = Object.freeze([
  'fire',
  'water',
  'nature',
  'earth',
  'wind',
  'electric',
  'dark',
  'light',
  'cosmic',
  'time',
]);

const ADVANTAGE_VS = Object.freeze({
  fire: new Set(['nature', 'wind']),
  water: new Set(['fire', 'earth']),
  nature: new Set(['water', 'earth']),
  earth: new Set(['electric', 'fire']),
  wind: new Set(['nature', 'electric']),
  electric: new Set(['water', 'wind']),
  dark: new Set(['light', 'time']),
  light: new Set(['cosmic', 'electric']),
  cosmic: new Set(['dark', 'electric']),
  time: new Set(['light', 'cosmic']),
});

const DISPLAY_LABEL = Object.freeze({
  fire: 'Fire',
  water: 'Water',
  nature: 'Nature',
  earth: 'Earth',
  wind: 'Wind',
  electric: 'Electric',
  dark: 'Dark',
  light: 'Light',
  cosmic: 'Cosmic',
  time: 'Time',
});

const STRONG_BONUS = 0.25;
const WEAK_PENALTY = 0.2;

function normalizeElementKey(raw) {
  if (raw == null || raw === '') return null;
  const k = String(raw).trim().toLowerCase();
  if (ADVANTAGE_VS[k]) return k;
  const alias = { grass: 'nature', ice: null };
  if (alias[k] === null) return null;
  if (alias[k] && ADVANTAGE_VS[alias[k]]) return alias[k];
  return null;
}

function isValidElementKey(key) {
  return Boolean(key && ADVANTAGE_VS[key]);
}

function pickRandomElement() {
  const i = Math.floor(Math.random() * ELEMENT_IDS.length);
  return ELEMENT_IDS[i];
}

function elementAtkMultiplier(attackerElement, defenderElement) {
  const a = normalizeElementKey(attackerElement);
  const d = normalizeElementKey(defenderElement);
  if (!a || !d) return 1;
  let delta = 0;
  if (ADVANTAGE_VS[a].has(d)) delta += STRONG_BONUS;
  if (ADVANTAGE_VS[d].has(a)) delta -= WEAK_PENALTY;
  return 1 + delta;
}

function resolveElementIconPath(repoRoot, elementKey) {
  const k = normalizeElementKey(elementKey);
  if (!k) return null;
  const p = path.join(repoRoot, 'tools', 'card_elements', `${k}.png`);
  return fs.existsSync(p) ? p : null;
}

module.exports = {
  ELEMENT_IDS,
  ADVANTAGE_VS,
  DISPLAY_LABEL,
  STRONG_BONUS,
  WEAK_PENALTY,
  normalizeElementKey,
  isValidElementKey,
  pickRandomElement,
  elementAtkMultiplier,
  resolveElementIconPath,
};
