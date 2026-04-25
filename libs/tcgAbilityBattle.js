/**
 * [CardSystem.md] Stage 1 — passive abilities, class combat modifiers.
 * Element math matches `elementAtkMultiplier` (+25% / −20% stack). Damage uses `damageForHit`.
 *
 * **Sovereign:** `opponentItemEffectsVsPlayer` / `opponentItemEffectsVsEnemy` model effects the
 * opponent applies to stats before passives; blocked if the defender has Sovereign. Self-buffs and
 * Null Ward (holder’s consumable) are not opponent effects and are not passed through these opts.
 */
const { elementAtkMultiplier, DISPLAY_LABEL } = require('../src/bot/tcg/elements');
const { normalizeRarityKey } = require('../src/bot/tcg/cardLayout');
const { damageForHit } = require('./tcgCombatMath');
const { pickRandomAbilityKeyForRarity, byTier } = require('../src/bot/tcg/abilityPools');

const RARITY_ORDER = ['C', 'UC', 'R', 'EP', 'L', 'M'];

function rarityIdx(r) {
  const k = normalizeRarityKey(r);
  const i = RARITY_ORDER.indexOf(k);
  return i >= 0 ? i : 0;
}

function normClassKey(classRaw) {
  if (classRaw == null || String(classRaw).trim() === '') return null;
  const s = String(classRaw).trim().toLowerCase();
  if (['commander', 'staff'].includes(s)) return 'commander';
  if (['guardian', 'mod', 'mods', 'moderator'].includes(s)) return 'guardian';
  if (['artisan', 'uploader', 'uploaders'].includes(s)) return 'artisan';
  return null;
}

const CLASS_INCOMING_MULT = { guardian: 0.95, commander: 1, artisan: 1 };
const CLASS_OUTGOING_MULT = { artisan: 1.05, commander: 1, guardian: 1 };

function hasAbility(set, key) {
  return key && set.has(String(key).toLowerCase());
}

function buildAbilitySet(keys) {
  const s = new Set();
  for (const k of keys || []) {
    if (k) s.add(String(k).toLowerCase());
  }
  return s;
}

function effectiveSpdInitiative(fighter, round) {
  let spd = fighter.spd;
  if (round === 1 && hasAbility(fighter.abilities, 'quick_draw')) {
    spd = Math.round(spd * 1.15);
  }
  return spd;
}

function applyLastStandMult(fighter) {
  if (!hasAbility(fighter.abilities, 'last_stand')) return 1;
  if (fighter.hp > fighter.maxHp * 0.25) return 1;
  return 1.3;
}

function applyTenacityMult(fighter) {
  if (!hasAbility(fighter.abilities, 'tenacity')) return 1;
  if (fighter.hp > fighter.maxHp * 0.5) return 1;
  return 1.1;
}

function applyExploitMult(attacker, defender) {
  if (!hasAbility(attacker.abilities, 'exploit')) return 1;
  if (defender.baseDef > attacker.baseDef) return 1.2;
  return 1;
}

function applyScrapperMult(fighter) {
  if (!hasAbility(fighter.abilities, 'scrapper')) return 1;
  return 1 + 0.05 * Math.max(0, fighter.completedRounds);
}

function applyMomentumMult(fighter) {
  if (!hasAbility(fighter.abilities, 'momentum')) return 1;
  return 1 + 0.05 * Math.min(3, fighter.momentumStacks);
}

function applyBerserkerMult(fighter) {
  if (!hasAbility(fighter.abilities, 'berserkers_call')) return 1;
  return 1 + 0.08 * Math.max(0, fighter.completedRounds);
}

function applyApexMult(attacker, defender) {
  if (!hasAbility(attacker.abilities, 'apex_predator')) return 1;
  if (rarityIdx(defender.rarityKey) > rarityIdx(attacker.rarityKey)) return 1.25;
  return 1;
}

function applyColossusMult(attacker, defender) {
  if (!hasAbility(attacker.abilities, 'colossus')) return 1;
  const d = normalizeRarityKey(defender.rarityKey);
  if (d === 'L' || d === 'M') return 1.2;
  return 1;
}

function effectiveDefForDamage(fighter, round) {
  let d = fighter.def;
  if (round === 1 && hasAbility(fighter.abilities, 'bulwark')) {
    d = Math.round(d * 1.1);
  }
  if (hasAbility(fighter.abilities, 'unbreakable')) {
    d = Math.max(d, Math.round(fighter.baseDef * 0.5));
  }
  d = Math.round(d * applyLastStandMult(fighter));
  return d;
}

function effectiveAtkForStrike(attacker, defender) {
  let atk = attacker.atk;
  atk = Math.round(atk * applyLastStandMult(attacker));
  atk = Math.round(atk * applyTenacityMult(attacker));
  atk = Math.round(atk * applyExploitMult(attacker, defender));
  atk = Math.round(atk * applyScrapperMult(attacker));
  atk = Math.round(atk * applyMomentumMult(attacker));
  atk = Math.round(atk * applyBerserkerMult(attacker));
  atk = Math.round(atk * applyApexMult(attacker, defender));
  atk = Math.round(atk * applyColossusMult(attacker, defender));
  return atk;
}

function applyIncomingDamageMult(fighter) {
  let m = 1;
  if (hasAbility(fighter.abilities, 'steady')) m *= 0.95;
  if (hasAbility(fighter.abilities, 'wardens_eye')) m *= 0.75;
  const ck = fighter.classKey;
  if (ck && CLASS_INCOMING_MULT[ck]) m *= CLASS_INCOMING_MULT[ck];
  return m;
}

function applyOutgoingDamageMult(fighter) {
  const ck = fighter.classKey;
  if (ck && CLASS_OUTGOING_MULT[ck]) return CLASS_OUTGOING_MULT[ck];
  return 1;
}

function phantomDodge(fighter) {
  if (!hasAbility(fighter.abilities, 'phantom_step')) return false;
  return Math.random() < 0.2;
}

function simulateMainVsMainWithPassives(
  playerStats,
  enemyStats,
  playerElement,
  enemyElement,
  opts = {},
) {
  const {
    playerLabel = 'You',
    enemyLabel = 'Foe',
    maxRounds = 40,
    fracturedMeridianSpdSwap = false,
    defenderWeaknessImmune = false,
    negateEnemyElementAdvantageOnce = false,
    reviveOnLoss = false,
    combat = null,
    /** Optional multipliers/debuffs the opponent applies to your fighter before passives. Blocked if you have **Sovereign** ([CardSystem.md]). */
    opponentItemEffectsVsPlayer = null,
    /** Optional effects you apply to the enemy before passives. Blocked if enemy has **Sovereign**. */
    opponentItemEffectsVsEnemy = null,
  } = opts;

  let multEnemyVsPlayer = elementAtkMultiplier(enemyElement, playerElement);
  if (defenderWeaknessImmune && multEnemyVsPlayer > 1) {
    multEnemyVsPlayer = 1;
  }

  const pKeys = buildAbilitySet(combat?.player?.abilityKeys || []);
  const eKeys = buildAbilitySet(combat?.enemy?.abilityKeys || []);

  if (hasAbility(pKeys, 'void_touch')) {
    eKeys.clear();
  }
  if (hasAbility(eKeys, 'void_touch')) {
    pKeys.clear();
  }

  const player = {
    label: playerLabel,
    hp: playerStats.hp,
    maxHp: playerStats.hp,
    atk: playerStats.atk,
    def: playerStats.def,
    spd: playerStats.spd,
    baseAtk: playerStats.atk,
    baseDef: playerStats.def,
    baseSpd: playerStats.spd,
    baseHp: playerStats.hp,
    abilities: pKeys,
    classKey: normClassKey(combat?.player?.classKey),
    rarityKey: combat?.player?.rarityKey || 'C',
    ironWillAvailable: hasAbility(pKeys, 'iron_will'),
    completedRounds: 0,
    momentumStacks: 0,
    stolenAtk: 0,
  };

  const enemy = {
    label: enemyLabel,
    hp: enemyStats.hp,
    maxHp: enemyStats.hp,
    atk: enemyStats.atk,
    def: enemyStats.def,
    spd: enemyStats.spd,
    baseAtk: enemyStats.atk,
    baseDef: enemyStats.def,
    baseSpd: enemyStats.spd,
    baseHp: enemyStats.hp,
    abilities: eKeys,
    classKey: normClassKey(combat?.enemy?.classKey),
    rarityKey: combat?.enemy?.rarityKey || 'C',
    ironWillAvailable: hasAbility(eKeys, 'iron_will'),
    completedRounds: 0,
    momentumStacks: 0,
    stolenAtk: 0,
  };

  function applyItemFx(target, fx) {
    if (!fx || typeof fx !== 'object') return;
    const applyMult = (field, mult) => {
      if (mult == null || !Number.isFinite(mult)) return;
      target[field] = Math.max(1, Math.round(target[field] * mult));
    };
    applyMult('atk', fx.atkMult);
    applyMult('def', fx.defMult);
    applyMult('spd', fx.spdMult);
    applyMult('hp', fx.hpMult);
    if (fx.hpMult != null && Number.isFinite(fx.hpMult)) {
      target.maxHp = target.hp;
    }
  }

  if (opponentItemEffectsVsPlayer && !hasAbility(pKeys, 'sovereign')) {
    applyItemFx(player, opponentItemEffectsVsPlayer);
    player.baseAtk = player.atk;
    player.baseDef = player.def;
    player.baseSpd = player.spd;
    player.baseHp = player.hp;
    player.maxHp = player.hp;
  }
  if (opponentItemEffectsVsEnemy && !hasAbility(eKeys, 'sovereign')) {
    applyItemFx(enemy, opponentItemEffectsVsEnemy);
    enemy.baseAtk = enemy.atk;
    enemy.baseDef = enemy.def;
    enemy.baseSpd = enemy.spd;
    enemy.baseHp = enemy.hp;
    enemy.maxHp = enemy.hp;
  }

  if (hasAbility(pKeys, 'time_thief')) {
    const steal = Math.round(enemy.atk * 0.1);
    player.stolenAtk += steal;
    enemy.atk = Math.max(1, enemy.atk - steal);
  }
  if (hasAbility(eKeys, 'time_thief')) {
    const steal = Math.round(player.atk * 0.1);
    enemy.stolenAtk += steal;
    player.atk = Math.max(1, player.atk - steal);
  }

  if (hasAbility(pKeys, 'colossus')) {
    const d = normalizeRarityKey(enemy.rarityKey);
    if (d === 'L' || d === 'M') {
      player.atk = Math.round(player.atk * 1.2);
      player.def = Math.round(player.def * 1.2);
      player.spd = Math.round(player.spd * 1.2);
      player.hp = Math.round(player.hp * 1.2);
      player.maxHp = player.hp;
    }
  }
  if (hasAbility(eKeys, 'colossus')) {
    const d = normalizeRarityKey(player.rarityKey);
    if (d === 'L' || d === 'M') {
      enemy.atk = Math.round(enemy.atk * 1.2);
      enemy.def = Math.round(enemy.def * 1.2);
      enemy.spd = Math.round(enemy.spd * 1.2);
      enemy.hp = Math.round(enemy.hp * 1.2);
      enemy.maxHp = enemy.hp;
    }
  }

  if (hasAbility(pKeys, 'apex_predator') && rarityIdx(enemy.rarityKey) > rarityIdx(player.rarityKey)) {
    player.atk = Math.round(player.atk * 1.25);
    player.spd = Math.round(player.spd * 1.25);
  }
  if (hasAbility(eKeys, 'apex_predator') && rarityIdx(player.rarityKey) > rarityIdx(enemy.rarityKey)) {
    enemy.atk = Math.round(enemy.atk * 1.25);
    enemy.spd = Math.round(enemy.spd * 1.25);
  }

  if (hasAbility(pKeys, 'absolute_zero')) {
    enemy.spd = Math.min(1, enemy.spd);
  }
  if (hasAbility(eKeys, 'absolute_zero')) {
    player.spd = Math.min(1, player.spd);
  }

  player.atk += player.stolenAtk;
  enemy.atk += enemy.stolenAtk;

  const fullLog = [];
  let globalRound = 0;
  let nullWardConsumed = false;
  let reviveUsed = false;
  function capAbsoluteZero() {
    if (hasAbility(player.abilities, 'absolute_zero')) {
      enemy.spd = Math.min(enemy.spd, player.spd);
    }
    if (hasAbility(enemy.abilities, 'absolute_zero')) {
      player.spd = Math.min(player.spd, enemy.spd);
    }
  }

  /**
   * @returns {{ dmg: number, dodged: boolean }}
   */
  function applyStrike(attacker, defender, aIsPlayer, phaseLog, rLabel) {
    const atkStat = effectiveAtkForStrike(attacker, defender);
    const defStat = effectiveDefForDamage(defender, rLabel);
    const aEl = aIsPlayer ? playerElement : enemyElement;
    const dEl = aIsPlayer ? enemyElement : playerElement;
    let multOverride = null;
    if (!aIsPlayer) {
      multOverride = multEnemyVsPlayer;
      if (negateEnemyElementAdvantageOnce && !nullWardConsumed && multOverride > 1) {
        multOverride = 1;
        nullWardConsumed = true;
        phaseLog.push('_Null Ward — negated enemy elemental advantage on this hit._');
      }
    }
    let core = damageForHit(atkStat, aEl, defStat, dEl, multOverride);
    core = Math.max(1, Math.floor(core * applyOutgoingDamageMult(attacker)));
    if (aIsPlayer && hasAbility(player.abilities, 'eternal_flame')) {
      core += Math.max(1, Math.floor(defender.maxHp * 0.03));
    }
    if (!aIsPlayer && hasAbility(enemy.abilities, 'eternal_flame')) {
      core += Math.max(1, Math.floor(defender.maxHp * 0.03));
    }
    const incomingM = applyIncomingDamageMult(defender);
    const finalDmg = Math.max(1, Math.floor(core * incomingM));

    if (phantomDodge(defender)) {
      phaseLog.push(`_R${rLabel}: ${defender.label} **Phantom Step** — dodged!_`);
      return { dmg: 0, dodged: true };
    }

    let hpNext = defender.hp - finalDmg;
    if (hpNext <= 0 && defender.ironWillAvailable) {
      defender.ironWillAvailable = false;
      hpNext = 1;
      phaseLog.push(`_R${rLabel}: ${defender.label} **Iron Will** — survives at **1** HP!_`);
    }
    defender.hp = hpNext;

    if (hasAbility(defender.abilities, 'retaliate') && finalDmg > 0 && attacker.hp > 0) {
      const ref = Math.max(1, Math.floor(finalDmg * 0.15));
      attacker.hp = Math.max(0, attacker.hp - ref);
      phaseLog.push(`… **Retaliate** **${ref}** → ${attacker.label}`);
    }

    return { dmg: finalDmg, dodged: false };
  }

  function runPhase(initialHpP, initialHpE, initialSpdP, initialSpdE) {
    player.hp = initialHpP;
    enemy.hp = initialHpE;
    let spdP = initialSpdP;
    let spdE = initialSpdE;
    player.spd = spdP;
    enemy.spd = spdE;

    const phaseLog = [];

    while (player.hp > 0 && enemy.hp > 0 && globalRound < maxRounds) {
      globalRound += 1;
      const rLabel = globalRound;

      if (hasAbility(player.abilities, 'death_mark')) {
        const dm = Math.max(1, Math.floor(enemy.maxHp * 0.05));
        enemy.hp = Math.max(0, enemy.hp - dm);
        phaseLog.push(`_R${rLabel}: **Death Mark** — ${enemy.label} **−${dm}** HP_`);
        if (enemy.hp <= 0) break;
      }
      if (hasAbility(enemy.abilities, 'death_mark')) {
        const dm = Math.max(1, Math.floor(player.maxHp * 0.05));
        player.hp = Math.max(0, player.hp - dm);
        phaseLog.push(`_R${rLabel}: **Death Mark** — ${player.label} **−${dm}** HP_`);
        if (player.hp <= 0) break;
      }

      const pHpAtRoundStart = player.hp;
      const eHpAtRoundStart = enemy.hp;

      if (fracturedMeridianSpdSwap && globalRound > 1 && globalRound % 3 === 0) {
        const t = spdP;
        spdP = spdE;
        spdE = t;
        player.spd = spdP;
        enemy.spd = spdE;
        phaseLog.push(`_R${rLabel}: SPD swap (Fractured Meridian)_`);
      }

      capAbsoluteZero();

      const pSpd = effectiveSpdInitiative(player, rLabel);
      const eSpd = effectiveSpdInitiative(enemy, rLabel);
      const playerFirst = pSpd >= eSpd;

      if (playerFirst) {
        const r1 = applyStrike(player, enemy, true, phaseLog, rLabel);
        phaseLog.push(
          `**R${rLabel}** · ${player.label} → ${enemy.label} **${r1.dmg}** · ${enemy.label} **${Math.max(0, enemy.hp)}** HP`,
        );
        if (enemy.hp <= 0) break;
        const r2 = applyStrike(enemy, player, false, phaseLog, rLabel);
        phaseLog.push(
          `… ${enemy.label} → ${player.label} **${r2.dmg}** · ${player.label} **${Math.max(0, player.hp)}** HP`,
        );
      } else {
        const r1 = applyStrike(enemy, player, false, phaseLog, rLabel);
        phaseLog.push(
          `**R${rLabel}** · ${enemy.label} → ${player.label} **${r1.dmg}** · ${player.label} **${Math.max(0, player.hp)}** HP`,
        );
        if (player.hp <= 0) break;
        const r2 = applyStrike(player, enemy, true, phaseLog, rLabel);
        phaseLog.push(
          `… ${player.label} → ${enemy.label} **${r2.dmg}** · ${enemy.label} **${Math.max(0, enemy.hp)}** HP`,
        );
      }

      if (hasAbility(player.abilities, 'momentum')) {
        if (player.hp < pHpAtRoundStart) player.momentumStacks = 0;
        else if (enemy.hp < eHpAtRoundStart) {
          player.momentumStacks = Math.min(3, player.momentumStacks + 1);
        }
      }
      if (hasAbility(enemy.abilities, 'momentum')) {
        if (enemy.hp < eHpAtRoundStart) enemy.momentumStacks = 0;
        else if (player.hp < pHpAtRoundStart) {
          enemy.momentumStacks = Math.min(3, enemy.momentumStacks + 1);
        }
      }

      player.completedRounds += 1;
      enemy.completedRounds += 1;
    }

    let outcome;
    if (player.hp > 0 && enemy.hp <= 0) outcome = 'win';
    else if (player.hp <= 0 && enemy.hp > 0) outcome = 'loss';
    else outcome = 'draw';

    return {
      outcome,
      playerHpEnd: Math.max(0, player.hp),
      enemyHpEnd: Math.max(0, enemy.hp),
      spdP,
      spdE,
      log: phaseLog,
    };
  }

  let phase = runPhase(player.maxHp, enemy.maxHp, player.baseSpd, enemy.baseSpd);
  fullLog.push(...phase.log);

  if (
    reviveOnLoss
    && phase.outcome === 'loss'
    && phase.playerHpEnd <= 0
    && phase.enemyHpEnd > 0
    && globalRound < maxRounds
  ) {
    reviveUsed = true;
    const hpP2 = Math.max(1, Math.round(playerStats.hp * 0.3));
    const hpE2 = phase.enemyHpEnd;
    fullLog.push(
      `**Revive Shard** — ${playerLabel} rallies at **${hpP2}** HP (${enemyLabel} **${hpE2}** HP).`,
    );
    phase = runPhase(hpP2, hpE2, phase.spdP, phase.spdE);
    fullLog.push(...phase.log);
  }

  const outcome = phase.outcome;
  /** Loser's Soulbind: winner gets no wager payout; winner's Soulbind on loser: same ([CardSystem.md]). */
  const soulbindSuppressPot =
    (outcome === 'win' && hasAbility(enemy.abilities, 'soulbind'))
    || (outcome === 'loss' && hasAbility(player.abilities, 'soulbind'));
  const pe = playerElement ? (DISPLAY_LABEL[playerElement] || playerElement) : '—';
  const ee = enemyElement ? (DISPLAY_LABEL[enemyElement] || enemyElement) : '—';
  const mult = elementAtkMultiplier(playerElement, enemyElement);
  let note = 'neutral';
  if (mult > 1) note = `your attacks **×${mult.toFixed(2)}** (advantage)`;
  else if (mult < 1) note = `your attacks **×${mult.toFixed(2)}** (disadvantage)`;

  return {
    outcome,
    rounds: fullLog.length,
    playerHpEnd: phase.playerHpEnd,
    enemyHpEnd: phase.enemyHpEnd,
    log: fullLog,
    elementSummary: `${pe} vs ${ee} — ${note}`,
    reviveUsed,
    nullWardConsumed,
    soulbindSuppressPot,
  };
}

/**
 * PvE/spar enemy: catalog row only — roll ability from rarity if template has none.
 */
function buildEnemyCombatSide(templateRow) {
  const keys = [];
  if (templateRow.ability_key) keys.push(templateRow.ability_key);
  else {
    const k = pickRandomAbilityKeyForRarity(templateRow.rarity);
    if (k) keys.push(k);
  }
  return {
    abilityKeys: keys,
    classKey: templateRow.class ?? null,
    rarityKey: templateRow.rarity ?? 'C',
  };
}

/**
 * @param {object} opts
 * @param {string|null} [opts.instanceAbilityKey] from `user_cards.ability_key`
 * @param {string|null} [opts.classKey] from `card_data.class`
 * @param {string|null} [opts.rarityKey]
 * @param {string|null} [opts.grantedSynergyAbilityKey] e.g. Full Resonance Tier 2
 * @param {number|null} [opts.distinctRaritiesForMember] for 6/6 + Mythic signature
 * @param {string|null} [opts.signatureOverrideKey] admin catalog signature or pre-resolved Tier 4
 */
function buildPlayerCombatSide(opts) {
  const {
    instanceAbilityKey,
    classKey,
    rarityKey,
    grantedSynergyAbilityKey,
    distinctRaritiesForMember,
    signatureOverrideKey,
  } = opts;
  const keys = [];
  let main = instanceAbilityKey || null;
  if (
    distinctRaritiesForMember != null
    && distinctRaritiesForMember >= 6
    && normalizeRarityKey(rarityKey || 'C') === 'M'
  ) {
    const pool = byTier[4];
    const override = signatureOverrideKey ? String(signatureOverrideKey).toLowerCase() : null;
    if (override && pool && pool.includes(override)) main = override;
    else if (pool && pool.length) main = pool[Math.floor(Math.random() * pool.length)];
  }
  if (main) keys.push(main);
  if (grantedSynergyAbilityKey) keys.push(grantedSynergyAbilityKey);
  return {
    abilityKeys: keys,
    classKey,
    rarityKey: rarityKey ?? 'C',
  };
}

module.exports = {
  simulateMainVsMainWithPassives,
  normClassKey,
  COMMANDER_BATTLE_GOLD_BONUS: 0.03,
  buildEnemyCombatSide,
  buildPlayerCombatSide,
};
