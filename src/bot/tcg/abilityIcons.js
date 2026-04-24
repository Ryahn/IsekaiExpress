const fs = require('fs');
const path = require('path');
const { ABILITY_SEEDS } = require('./tcgAbilitySeeds');

const VALID_KEYS = new Set(ABILITY_SEEDS.map((r) => r.ability_key));

function normalizeAbilityKey(raw) {
  if (raw == null || raw === '') return null;
  const k = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_KEYS.has(k)) return k;
  return null;
}

function resolveAbilityTraitIconPath(repoRoot, abilityKey) {
  const k = normalizeAbilityKey(abilityKey);
  if (!k) return null;
  const p = path.join(repoRoot, 'tools', 'card_traits', `${k}.png`);
  return fs.existsSync(p) ? p : null;
}

module.exports = {
  normalizeAbilityKey,
  resolveAbilityTraitIconPath,
  VALID_ABILITY_ICON_KEYS: VALID_KEYS,
};
