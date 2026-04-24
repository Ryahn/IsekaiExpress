const { elementAtkMultiplier, DISPLAY_LABEL } = require('../src/bot/tcg/elements');

/**
 * Damage per [CardSystem.md]: ATK × element modifier − (DEF × 0.5), minimum 1.
 */
function damageForHit(attackerAtk, attackerElement, defenderDef, defenderElement) {
  const mult = elementAtkMultiplier(attackerElement, defenderElement);
  const raw = attackerAtk * mult - defenderDef * 0.5;
  return Math.max(1, Math.floor(raw));
}

/**
 * Turn-based: higher SPD strikes first each round; then the other counterattacks if alive.
 * Passives / loadout synergies not applied yet (Stage 4 baseline).
 */
function simulateMainVsMain(playerStats, enemyStats, playerElement, enemyElement, labels = {}, maxRounds = 40) {
  const { playerLabel = 'You', enemyLabel = 'Foe' } = labels;
  let hpP = playerStats.hp;
  let hpE = enemyStats.hp;
  const log = [];

  for (let round = 1; round <= maxRounds && hpP > 0 && hpE > 0; round += 1) {
    const playerFirst = playerStats.spd >= enemyStats.spd;

    if (playerFirst) {
      const dmg = damageForHit(playerStats.atk, playerElement, enemyStats.def, enemyElement);
      hpE -= dmg;
      log.push(`**R${round}** · ${playerLabel} → ${enemyLabel} **${dmg}** · ${enemyLabel} **${Math.max(0, hpE)}** HP`);
      if (hpE <= 0) break;
      const dmg2 = damageForHit(enemyStats.atk, enemyElement, playerStats.def, playerElement);
      hpP -= dmg2;
      log.push(`… ${enemyLabel} → ${playerLabel} **${dmg2}** · ${playerLabel} **${Math.max(0, hpP)}** HP`);
    } else {
      const dmg2 = damageForHit(enemyStats.atk, enemyElement, playerStats.def, playerElement);
      hpP -= dmg2;
      log.push(`**R${round}** · ${enemyLabel} → ${playerLabel} **${dmg2}** · ${playerLabel} **${Math.max(0, hpP)}** HP`);
      if (hpP <= 0) break;
      const dmg = damageForHit(playerStats.atk, playerElement, enemyStats.def, enemyElement);
      hpE -= dmg;
      log.push(`… ${playerLabel} → ${enemyLabel} **${dmg}** · ${enemyLabel} **${Math.max(0, hpE)}** HP`);
    }
  }

  let outcome;
  if (hpP > 0 && hpE <= 0) outcome = 'win';
  else if (hpP <= 0 && hpE > 0) outcome = 'loss';
  else outcome = 'draw';

  return {
    outcome,
    rounds: log.length,
    playerHpEnd: Math.max(0, hpP),
    enemyHpEnd: Math.max(0, hpE),
    log,
    elementSummary: elementSummaryLine(playerElement, enemyElement),
  };
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
