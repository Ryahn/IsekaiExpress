const db = require('../database/db');
const { sanitizeRarityAbbrev, rarityRank } = require('../src/bot/tcg/rarityOrder');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');
const tcgBattle = require('./tcgBattle');
const tcgAbilityBattle = require('./tcgAbilityBattle');
const tcgSetProgress = require('./tcgSetProgress');
const tcgSynergy = require('./tcgSynergy');
const tcgPvpRank = require('./tcgPvpRank');

const ACCEPT_DEADLINE_SEC = 10 * 60;
const PICK_DEADLINE_SEC = 5 * 60;
const PAIR_COOLDOWN_SEC = 30 * 60;
const HOUSE_TAX = 0.05;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function orderedPair(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? { low: x, high: y } : { low: y, high: x };
}

async function ensurePairCooldown(trx, uidA, uidB) {
  const { low, high } = orderedPair(uidA, uidB);
  const row = await trx('tcg_pvp_cooldowns').where({ user_low: low, user_high: high }).forUpdate().first();
  const now = nowUnix();
  if (row && Number(row.until_ts) > now) {
    return { ok: false, error: `PvP cooldown — try again <t:${row.until_ts}:R>.`, low, high };
  }
  return { ok: true, low, high };
}

async function setPairCooldown(trx, low, high) {
  const until = nowUnix() + PAIR_COOLDOWN_SEC;
  const ex = await trx('tcg_pvp_cooldowns').where({ user_low: low, user_high: high }).first();
  if (ex) {
    await trx('tcg_pvp_cooldowns').where({ user_low: low, user_high: high }).update({ until_ts: until });
  } else {
    await trx('tcg_pvp_cooldowns').insert({ user_low: low, user_high: high, until_ts: until });
  }
}

async function expireSessions(trx) {
  const now = nowUnix();
  await trx('tcg_pvp_sessions')
    .where({ status: 'pending_accept' })
    .where('accept_deadline', '<', now)
    .update({ status: 'expired' });

  // Pick timeout → forfeit to the player who already picked (or challenger if neither picked)
  const stalePick = await trx('tcg_pvp_sessions')
    .where({ status: 'awaiting_picks' })
    .where('pick_deadline', '<', now);
  for (const s of stalePick) {
    const pot = Number(s.pot_gold) || 0;
    const ch = Number(s.challenger_user_id);
    const tg = Number(s.target_user_id);
    const chPicked = s.challenger_pick_id != null;
    const tgPicked = s.target_pick_id != null;

    let forfeitWinner = null;
    if (chPicked && !tgPicked) forfeitWinner = ch;
    else if (tgPicked && !chPicked) forfeitWinner = tg;
    else forfeitWinner = ch; // neither picked → challenger defaults as winner per plan

    if (pot > 0) {
      await tcgEconomy.incrementGoldInternal(forfeitWinner, pot, trx);
    }

    // Release card wagers — give both cards back to original owners
    if (s.challenger_card_wager_id) {
      await trx('user_cards')
        .where({ user_card_id: Number(s.challenger_card_wager_id) })
        .update({ is_escrowed: false });
    }
    if (s.target_card_wager_id) {
      await trx('user_cards')
        .where({ user_card_id: Number(s.target_card_wager_id) })
        .update({ is_escrowed: false });
    }

    await trx('tcg_pvp_sessions')
      .where({ session_id: s.session_id })
      .update({ status: 'pick_expired', winner_user_id: forfeitWinner });
  }
}

/**
 * Create a PvP challenge with optional gold and/or card wager.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} challengerDiscord
 * @param {{ id: string, username: string }} targetDiscord
 * @param {number} wagerGold
 * @param {number|null} challengerCardWagerId - optional user_card_id to wager
 */
async function createChallenge(client, challengerDiscord, targetDiscord, wagerGold, challengerCardWagerId = null) {
  if (String(challengerDiscord.id) === String(targetDiscord.id)) {
    return { ok: false, error: 'You cannot challenge yourself.' };
  }

  await client.db.checkUser(challengerDiscord);
  await client.db.checkUser(targetDiscord);

  const chId = await tcgEconomy.getInternalUserId(challengerDiscord.id);
  const tgId = await tcgEconomy.getInternalUserId(targetDiscord.id);
  if (!chId || !tgId) return { ok: false, error: 'Both need profiles.' };

  const w = Math.max(0, Math.floor(Number(wagerGold) || 0));
  const isGoldOnlyWager = w > 0 && !challengerCardWagerId;

  let result;
  await db.query.transaction(async (trx) => {
    await expireSessions(trx);

    // Cooldown bypassed for gold-only wagers with no card on the line
    if (!isGoldOnlyWager) {
      const cd = await ensurePairCooldown(trx, chId, tgId);
      if (!cd.ok) { result = cd; return; }
    }

    // Rank row for challenger
    const chRankRow = await tcgPvpRank.ensureRankRow(chId, trx);

    // Validate gold wager cap
    let cardWagerRarity = null;
    if (challengerCardWagerId) {
      const cardInst = await trx('user_cards')
        .join('card_data', 'user_cards.card_id', 'card_data.card_id')
        .where({ 'user_cards.user_card_id': Number(challengerCardWagerId), 'user_cards.user_id': chId })
        .select('user_cards.is_escrowed', 'user_cards.is_lent', 'user_cards.tcg_preservation_sealed',
                'user_cards.lent_source_user_card_id', 'card_data.rarity')
        .first();
      if (!cardInst) { result = { ok: false, error: 'Card not found in your inventory.' }; return; }
      if (cardInst.is_escrowed) { result = { ok: false, error: 'That card is already escrowed.' }; return; }
      if (cardInst.is_lent || cardInst.lent_source_user_card_id) { result = { ok: false, error: 'Lent/borrowed cards cannot be wagered.' }; return; }
      if (Number(cardInst.tcg_preservation_sealed)) { result = { ok: false, error: 'Sealed cards cannot be wagered.' }; return; }
      cardWagerRarity = cardInst.rarity;
    }

    const capCheck = tcgPvpRank.validateWagerCaps(chRankRow.rank_tier, w, cardWagerRarity);
    if (!capCheck.ok) { result = capCheck; return; }

    if (w > 0) {
      await tcgEconomy.ensureWallet(chId, trx);
      const wRow = await trx('user_wallets').where({ user_id: chId }).forUpdate().first();
      if (Number(wRow.gold) < w) {
        result = { ok: false, error: `You need **${w}**g to stake this wager.` }; return;
      }
    }

    // Escrow challenger's card wager upfront
    if (challengerCardWagerId) {
      await trx('user_cards')
        .where({ user_card_id: Number(challengerCardWagerId) })
        .update({ is_escrowed: true });
    }

    const now = nowUnix();
    const [sid] = await trx('tcg_pvp_sessions').insert({
      challenger_user_id: chId,
      target_user_id: tgId,
      wager_gold: w,
      challenger_card_wager_id: challengerCardWagerId ? Number(challengerCardWagerId) : null,
      target_card_wager_id: null,
      status: 'pending_accept',
      challenger_pick_id: null,
      target_pick_id: null,
      winner_user_id: null,
      created_at: now,
      accept_deadline: now + ACCEPT_DEADLINE_SEC,
      pick_deadline: null,
      pot_gold: 0,
    });
    result = {
      ok: true,
      sessionId: Number(sid),
      acceptDeadline: now + ACCEPT_DEADLINE_SEC,
      wagerGold: w,
      challengerCardWagerId: challengerCardWagerId ? Number(challengerCardWagerId) : null,
      isGoldOnlyWager,
    };
  });

  return result;
}

/**
 * Decline a pending challenge — release gold and card escrow.
 */
async function declineChallenge(client, targetDiscord, sessionId) {
  await client.db.checkUser(targetDiscord);
  const tgId = await tcgEconomy.getInternalUserId(targetDiscord.id);
  if (!tgId) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const s = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).forUpdate().first();
    if (!s || s.status !== 'pending_accept') {
      result = { ok: false, error: 'Challenge not found or already handled.' }; return;
    }
    if (Number(s.target_user_id) !== tgId) {
      result = { ok: false, error: 'This challenge is not for you.' }; return;
    }
    // Release challenger card wager escrow
    if (s.challenger_card_wager_id) {
      await trx('user_cards')
        .where({ user_card_id: Number(s.challenger_card_wager_id) })
        .update({ is_escrowed: false });
    }
    await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({ status: 'declined' });
    result = { ok: true, sessionId };
  });
  return result;
}

/**
 * Accept a pending challenge. Optionally supply a card wager from the target's side.
 */
async function acceptChallenge(client, targetDiscord, sessionId, targetCardWagerId = null) {
  await client.db.checkUser(targetDiscord);
  const tgId = await tcgEconomy.getInternalUserId(targetDiscord.id);
  if (!tgId) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await expireSessions(trx);
    const s = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).forUpdate().first();
    if (!s || s.status !== 'pending_accept') {
      result = { ok: false, error: 'Challenge not found or already handled.' }; return;
    }
    if (Number(s.target_user_id) !== tgId) {
      result = { ok: false, error: 'This challenge is not for you.' }; return;
    }
    const now = nowUnix();
    if (Number(s.accept_deadline) < now) {
      // Release challenger card escrow
      if (s.challenger_card_wager_id) {
        await trx('user_cards').where({ user_card_id: Number(s.challenger_card_wager_id) }).update({ is_escrowed: false });
      }
      await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({ status: 'expired' });
      result = { ok: false, error: 'Challenge **expired**.' }; return;
    }

    const chId = Number(s.challenger_user_id);
    const wager = Math.floor(Number(s.wager_gold) || 0);

    // Validate target card wager if provided
    if (targetCardWagerId) {
      const tgRankRow = await tcgPvpRank.ensureRankRow(tgId, trx);
      const cardInst = await trx('user_cards')
        .join('card_data', 'user_cards.card_id', 'card_data.card_id')
        .where({ 'user_cards.user_card_id': Number(targetCardWagerId), 'user_cards.user_id': tgId })
        .select('user_cards.is_escrowed', 'user_cards.is_lent', 'user_cards.tcg_preservation_sealed',
                'user_cards.lent_source_user_card_id', 'card_data.rarity')
        .first();
      if (!cardInst) { result = { ok: false, error: 'Target card not found in your inventory.' }; return; }
      if (cardInst.is_escrowed) { result = { ok: false, error: 'That card is already escrowed.' }; return; }
      if (cardInst.is_lent || cardInst.lent_source_user_card_id) { result = { ok: false, error: 'Lent/borrowed cards cannot be wagered.' }; return; }
      if (Number(cardInst.tcg_preservation_sealed)) { result = { ok: false, error: 'Sealed cards cannot be wagered.' }; return; }
      const capCheck = tcgPvpRank.validateWagerCaps(tgRankRow.rank_tier, wager, cardInst.rarity);
      if (!capCheck.ok) { result = capCheck; return; }
    }

    if (wager > 0) {
      await tcgEconomy.ensureWallet(chId, trx);
      await tcgEconomy.ensureWallet(tgId, trx);
      const wCh = await trx('user_wallets').where({ user_id: chId }).forUpdate().first();
      const wTg = await trx('user_wallets').where({ user_id: tgId }).forUpdate().first();
      if (Number(wCh.gold) < wager) {
        result = { ok: false, error: 'Challenger no longer has enough gold — challenge void.' }; return;
      }
      if (Number(wTg.gold) < wager) {
        result = { ok: false, error: `You need **${wager}**g to match the wager.` }; return;
      }
      const pot = wager * 2;
      await trx('user_wallets').where({ user_id: chId }).update({ gold: Number(wCh.gold) - wager, updated_at: now });
      await trx('user_wallets').where({ user_id: tgId }).update({ gold: Number(wTg.gold) - wager, updated_at: now });
      await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({
        status: 'awaiting_picks',
        pot_gold: pot,
        pick_deadline: now + PICK_DEADLINE_SEC,
        target_card_wager_id: targetCardWagerId ? Number(targetCardWagerId) : null,
      });
    } else {
      await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({
        status: 'awaiting_picks',
        pot_gold: 0,
        pick_deadline: now + PICK_DEADLINE_SEC,
        target_card_wager_id: targetCardWagerId ? Number(targetCardWagerId) : null,
      });
    }

    // Escrow target card wager
    if (targetCardWagerId) {
      await trx('user_cards').where({ user_card_id: Number(targetCardWagerId) }).update({ is_escrowed: true });
    }

    result = { ok: true, sessionId, pickDeadline: now + PICK_DEADLINE_SEC };
  });

  return result;
}

/**
 * Lock a card pick. When both players have picked, resolves the match.
 */
async function submitPick(client, userDiscord, sessionId, instanceId) {
  await client.db.checkUser(userDiscord);
  const uid = await tcgEconomy.getInternalUserId(userDiscord.id);
  if (!uid) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await expireSessions(trx);
    const s = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).forUpdate().first();
    if (!s || s.status !== 'awaiting_picks') {
      result = { ok: false, error: 'No match awaiting picks.' }; return;
    }
    const now = nowUnix();
    if (Number(s.pick_deadline) < now) {
      result = { ok: false, error: 'Pick window **expired**.' }; return;
    }

    const chId = Number(s.challenger_user_id);
    const tgId = Number(s.target_user_id);
    const isCh = uid === chId;
    const isTg = uid === tgId;
    if (!isCh && !isTg) { result = { ok: false, error: 'Not a player in this match.' }; return; }
    if (isCh && s.challenger_pick_id != null) { result = { ok: false, error: 'You already locked a pick.' }; return; }
    if (isTg && s.target_pick_id != null) { result = { ok: false, error: 'You already locked a pick.' }; return; }

    const inst = await trx('user_cards').where({ user_card_id: instanceId, user_id: uid }).forUpdate().first();
    if (!inst || inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Invalid copy (missing, lent, or escrowed).' }; return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Sealed cards are blocked from PvP picks.' }; return;
    }
    if (inst.lent_source_user_card_id) {
      result = { ok: false, error: '**Borrowed** cards cannot be used in PvP.' }; return;
    }

    const patch = isCh ? { challenger_pick_id: instanceId } : { target_pick_id: instanceId };
    await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update(patch);

    const s2 = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).first();
    if (s2.challenger_pick_id == null || s2.target_pick_id == null) {
      result = { ok: true, sessionId, waitingForOpponent: true }; return;
    }

    // Both picks in — resolve match
    const rowCh = await trx('user_cards')
      .join('card_data', 'user_cards.card_id', 'card_data.card_id')
      .where({ 'user_cards.user_card_id': s2.challenger_pick_id })
      .select(
        'user_cards.user_card_id', 'user_cards.level', 'user_cards.ability_key',
        'card_data.name', 'card_data.element', 'card_data.class', 'card_data.rarity',
        'card_data.discord_id', 'card_data.base_atk', 'card_data.base_def',
        'card_data.base_spd', 'card_data.base_hp',
      ).first();
    const rowTg = await trx('user_cards')
      .join('card_data', 'user_cards.card_id', 'card_data.card_id')
      .where({ 'user_cards.user_card_id': s2.target_pick_id })
      .select(
        'user_cards.user_card_id', 'user_cards.level', 'user_cards.ability_key',
        'card_data.name', 'card_data.element', 'card_data.class', 'card_data.rarity',
        'card_data.discord_id', 'card_data.base_atk', 'card_data.base_def',
        'card_data.base_spd', 'card_data.base_hp',
      ).first();

    let pStats = tcgInventory.combatStatsFromJoinedRow(rowCh);
    let eStats = tcgInventory.combatStatsFromJoinedRow(rowTg);
    if (!pStats || !eStats) {
      result = { ok: false, error: 'Combat stats missing on a picked card.' }; return;
    }

    const nCh = rowCh.discord_id != null
      ? await tcgInventory.countDistinctRaritiesForMember(chId, rowCh.discord_id, trx) : 0;
    const nTg = rowTg.discord_id != null
      ? await tcgInventory.countDistinctRaritiesForMember(tgId, rowTg.discord_id, trx) : 0;

    let sigCh = null;
    if (rowCh.discord_id != null && nCh >= 6 && sanitizeRarityAbbrev(rowCh.rarity, 'C') === 'M') {
      sigCh = await tcgSetProgress.resolveMythicSignatureKey(rowCh.discord_id);
    }
    let sigTg = null;
    if (rowTg.discord_id != null && nTg >= 6 && sanitizeRarityAbbrev(rowTg.rarity, 'C') === 'M') {
      sigTg = await tcgSetProgress.resolveMythicSignatureKey(rowTg.discord_id);
    }

    // Resolve synergies for both sides (hidden from opponent — only revealed in result embed)
    // PvP has no loadout support slots, so synergy is minimal; pass null loadout support
    const synCh = tcgSynergy.computeCombatSynergy(
      { main: { element: rowCh.element, class: rowCh.class, rarity: rowCh.rarity,
                discord_id: rowCh.discord_id, tcg_region: null },
        support1: null, support2: null },
      rowTg.element,
      null, // no PvE region
    );
    const synTg = tcgSynergy.computeCombatSynergy(
      { main: { element: rowTg.element, class: rowTg.class, rarity: rowTg.rarity,
                discord_id: rowTg.discord_id, tcg_region: null },
        support1: null, support2: null },
      rowCh.element,
      null,
    );

    pStats = tcgSynergy.applySynergyToStats(pStats, synCh);
    eStats = tcgSynergy.applySynergyToStats(eStats, synTg);

    const sim = tcgBattle.simulateMainVsMain(pStats, eStats, rowCh.element, rowTg.element, {
      playerLabel: rowCh.name || 'Challenger',
      enemyLabel: rowTg.name || 'Target',
      playerNegateFirstHit: Boolean(synCh.playerNegateFirstHit),
      enemyAbilityProcPenalty: Number(synTg.enemyAbilityProcPenalty) || 0,
      combat: {
        player: tcgAbilityBattle.buildPlayerCombatSide({
          instanceAbilityKey: rowCh.ability_key,
          classKey: rowCh.class,
          rarityKey: rowCh.rarity,
          grantedSynergyAbilityKey: synCh.grantedBattleAbilityKey || null,
          distinctRaritiesForMember: nCh,
          signatureOverrideKey: sigCh,
          synergyProcBonus: Number(synCh.elementAbilityProcBonus) || 0,
        }),
        enemy: tcgAbilityBattle.buildPlayerCombatSide({
          instanceAbilityKey: rowTg.ability_key,
          classKey: rowTg.class,
          rarityKey: rowTg.rarity,
          grantedSynergyAbilityKey: synTg.grantedBattleAbilityKey || null,
          distinctRaritiesForMember: nTg,
          signatureOverrideKey: sigTg,
          synergyProcBonus: Number(synTg.elementAbilityProcBonus) || 0,
        }),
      },
    });

    const pot = Number(s2.pot_gold) || 0;
    let winnerId = null;
    let loserId = null;
    let goldToWinner = 0;

    if (sim.outcome === 'win') {
      winnerId = chId; loserId = tgId;
    } else if (sim.outcome === 'loss') {
      winnerId = tgId; loserId = chId;
    }

    // Gold payout
    if (sim.outcome !== 'draw' && pot > 0 && !sim.soulbindSuppressPot) {
      goldToWinner = Math.floor(pot * (1 - HOUSE_TAX));
      await tcgEconomy.incrementGoldInternal(winnerId, goldToWinner, trx);
    } else if (sim.outcome === 'draw' && pot > 0) {
      await tcgEconomy.incrementGoldInternal(chId, Math.floor(pot / 2), trx);
      await tcgEconomy.incrementGoldInternal(tgId, Math.floor(pot / 2), trx);
    }

    // Card wager transfer
    let cardWagerTransfer = null;
    const chCardWagerId = s2.challenger_card_wager_id ? Number(s2.challenger_card_wager_id) : null;
    const tgCardWagerId = s2.target_card_wager_id ? Number(s2.target_card_wager_id) : null;

    if (winnerId != null && (chCardWagerId || tgCardWagerId)) {
      // Winner gets loser's wagered card; own card returns
      const loserCardId = loserId === chId ? chCardWagerId : tgCardWagerId;
      const winnerCardId = loserId === chId ? tgCardWagerId : chCardWagerId;
      if (loserCardId) {
        // Transfer loser's card to winner
        await trx('user_cards').where({ user_card_id: loserCardId }).update({ user_id: winnerId, is_escrowed: false });
        cardWagerTransfer = { won: loserCardId };
      }
      if (winnerCardId) {
        // Return winner's own card
        await trx('user_cards').where({ user_card_id: winnerCardId }).update({ is_escrowed: false });
      }
    } else {
      // Draw or no winner — return both cards
      if (chCardWagerId) await trx('user_cards').where({ user_card_id: chCardWagerId }).update({ is_escrowed: false });
      if (tgCardWagerId) await trx('user_cards').where({ user_card_id: tgCardWagerId }).update({ is_escrowed: false });
    }

    // Set cooldown on non-gold-only wager matches
    const { low, high } = orderedPair(chId, tgId);
    if (pot > 0 || chCardWagerId || tgCardWagerId) {
      await setPairCooldown(trx, low, high);
    }

    await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({
      status: 'resolved',
      winner_user_id: winnerId,
    });

    // RP awards
    let rpResult = null;
    if (winnerId != null && loserId != null) {
      rpResult = await tcgPvpRank.applyMatchRp(trx, winnerId, loserId, pot);
    }

    const chUser = await trx('users').where({ id: chId }).first();
    const tgUser = await trx('users').where({ id: tgId }).first();

    result = {
      ok: true,
      sessionId,
      resolved: true,
      sim,
      winnerUserId: winnerId,
      potGold: pot,
      goldToWinner,
      challengerLabel: rowCh.name,
      targetLabel: rowTg.name,
      chDiscordId: chUser ? String(chUser.discord_id) : null,
      tgDiscordId: tgUser ? String(tgUser.discord_id) : null,
      chId,
      tgId,
      rpResult,
      cardWagerTransfer,
      // Synergy summaries — revealed in result embed only
      synCh: synCh.summaryLines,
      synTg: synTg.summaryLines,
    };
  });

  if (result && result.ok && result.resolved && result.chDiscordId && result.tgDiscordId) {
    await tcgEconomy.awardTcgBattleXp(client, { id: result.chDiscordId, username: '—' }, {
      won: result.winnerUserId === result.chId, isPvp: true,
    });
    await tcgEconomy.awardTcgBattleXp(client, { id: result.tgDiscordId, username: '—' }, {
      won: result.winnerUserId === result.tgId, isPvp: true,
    });
  }

  return result;
}

async function listMyPendingPvp(client, userDiscord) {
  await client.db.checkUser(userDiscord);
  const uid = await tcgEconomy.getInternalUserId(userDiscord.id);
  if (!uid) return [];
  await expireSessions(db.query);
  const now = nowUnix();
  return db
    .query('tcg_pvp_sessions')
    .where((q) => q.where('challenger_user_id', uid).orWhere('target_user_id', uid))
    .whereIn('status', ['pending_accept', 'awaiting_picks'])
    .andWhereRaw('(status = ? and accept_deadline > ?) or (status = ? and pick_deadline > ?)', [
      'pending_accept', now, 'awaiting_picks', now,
    ])
    .orderBy('session_id', 'desc');
}

module.exports = {
  HOUSE_TAX,
  createChallenge,
  declineChallenge,
  acceptChallenge,
  submitPick,
  listMyPendingPvp,
};
