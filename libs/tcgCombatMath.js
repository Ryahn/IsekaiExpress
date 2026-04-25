const { elementAtkMultiplier } = require('../src/bot/tcg/elements');

/**
 * [CardSystem.md § Combat]: base step `ATK − (DEF × 0.5)` with elemental multiplier applied to the attack side
 * (implemented as `ATK × mult − DEF × 0.5`, floor 1). Matches stacking rules in § Elemental Combat Modifiers.
 * @param {number} [elementMultOverride] if set, used instead of elementAtkMultiplier(...)
 */
function damageForHit(attackerAtk, attackerElement, defenderDef, defenderElement, elementMultOverride) {
  const mult =
    elementMultOverride != null
      ? elementMultOverride
      : elementAtkMultiplier(attackerElement, defenderElement);
  const raw = attackerAtk * mult - defenderDef * 0.5;
  return Math.max(1, Math.floor(raw));
}

module.exports = { damageForHit };
