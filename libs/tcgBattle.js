const { elementAtkMultiplier, DISPLAY_LABEL } = require('../src/bot/tcg/elements');
const { damageForHit } = require('./tcgCombatMath');
const { simulateMainVsMainWithPassives } = require('./tcgAbilityBattle');

/**
 * Turn-based: higher SPD strikes first each round; then the other counterattacks if alive.
 *
 * @param {object} opts
 * @param {string} [opts.playerLabel]
 * @param {string} [opts.enemyLabel]
 * @param {number} [opts.maxRounds=40]
 * @param {boolean} [opts.fracturedMeridianSpdSwap] Region 6 — swap effective SPD at start of rounds 3, 6, 9…
 * @param {boolean} [opts.defenderWeaknessImmune] Mono Element — cap enemy attack mult vs you at ×1 ([CardSystem.md])
 * @param {boolean} [opts.negateEnemyElementAdvantageOnce] Null Ward — first time enemy would use ×>1 vs you, use ×1 instead
 * @param {boolean} [opts.reviveOnLoss] Revive Shard — if you lose at 0 HP, one continuation at 30% max HP vs enemy’s remaining HP
 */
function simulateMainVsMain(playerStats, enemyStats, playerElement, enemyElement, opts = {}) {
  const combat = opts.combat ?? { player: {}, enemy: {} };
  return simulateMainVsMainWithPassives(playerStats, enemyStats, playerElement, enemyElement, {
    ...opts,
    combat,
  });
}

function elementSummaryLine(playerEl, enemyEl) {
  const pe = playerEl ? (DISPLAY_LABEL[playerEl] || playerEl) : '—';
  const ee = enemyEl ? (DISPLAY_LABEL[enemyEl] || enemyEl) : '—';
  const mult = elementAtkMultiplier(playerEl, enemyEl);
  let note = 'neutral';
  if (mult > 1) note = `your attacks **×${mult.toFixed(2)}** (advantage)`;
  else if (mult < 1) note = `your attacks **×${mult.toFixed(2)}** (disadvantage)`;
  return `${pe} vs ${ee} — ${note}`;
}

module.exports = {
  damageForHit,
  simulateMainVsMain,
};
