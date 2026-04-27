const db = require('../database/db');
const { sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');
const tcgBattle = require('./tcgBattle');
const tcgAbilityBattle = require('./tcgAbilityBattle');
const tcgSetProgress = require('./tcgSetProgress');

const ACCEPT_DEADLINE_SEC = 10 * 60;
const PICK_DEADLINE_SEC = 5 * 60;
const PAIR_COOLDOWN_SEC = 30 * 60;
/** [CardSystem.md] Bronze cap until rank system exists. */
const MAX_GOLD_WAGER = 500;
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
    return { ok: false, error: `PvP cooldown — try again <t:${row.until_ts}:R>.` };
  }
  return { ok: true, low, high };
}

async function setPairCooldown(trx, low, high) {
  const until = nowUnix() + PAIR_COOLDOWN_SEC;
  const ex = await trx('tcg_pvp_cooldowns').where({ user_low: low, user_high: high }).first();
  if (ex) {
    await trx('tcg_pvp_cooldowns')
      .where({ user_low: low, user_high: high })
      .update({ until_ts: until });
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

  const stalePick = await trx('tcg_pvp_sessions')
    .where({ status: 'awaiting_picks' })
    .where('pick_deadline', '<', now);
  for (const s of stalePick) {
    const pot = Number(s.pot_gold) || 0;
    const ch = Number(s.challenger_user_id);
    const tg = Number(s.target_user_id);
    if (pot > 0) {
      await tcgEconomy.incrementGoldInternal(ch, Math.floor(pot / 2), trx);
      await tcgEconomy.incrementGoldInternal(tg, Math.floor(pot / 2), trx);
    }
    await trx('tcg_pvp_sessions').where({ session_id: s.session_id }).update({ status: 'pick_expired' });
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} challengerDiscord
 * @param {{ id: string, username: string }} targetDiscord
 * @param {number} wagerGold
 */
async function createChallenge(client, challengerDiscord, targetDiscord, wagerGold) {
  if (String(challengerDiscord.id) === String(targetDiscord.id)) {
    return { ok: false, error: 'You cannot challenge yourself.' };
  }

  const w = Math.max(0, Math.min(MAX_GOLD_WAGER, Math.floor(Number(wagerGold) || 0)));

  await client.db.checkUser(challengerDiscord);
  await client.db.checkUser(targetDiscord);

  const chId = await tcgEconomy.getInternalUserId(challengerDiscord.id);
  const tgId = await tcgEconomy.getInternalUserId(targetDiscord.id);
  if (!chId || !tgId) return { ok: false, error: 'Both need profiles.' };

  let result;
  await db.query.transaction(async (trx) => {
    await expireSessions(trx);
    if (w > 0) {
      const cd = await ensurePairCooldown(trx, chId, tgId);
      if (!cd.ok) {
        result = cd;
        return;
      }
      await tcgEconomy.ensureWallet(chId, trx);
      const wRow = await trx('user_wallets').where({ user_id: chId }).forUpdate().first();
      if (Number(wRow.gold) < w) {
        result = { ok: false, error: `You need **${w}**g to stake this wager.` };
        return;
      }
    }

    const now = nowUnix();
    const [sid] = await trx('tcg_pvp_sessions').insert({
      challenger_user_id: chId,
      target_user_id: tgId,
      wager_gold: w,
      status: 'pending_accept',
      challenger_pick_id: null,
      target_pick_id: null,
      winner_user_id: null,
      created_at: now,
      accept_deadline: now + ACCEPT_DEADLINE_SEC,
      pick_deadline: null,
      pot_gold: 0,
    });
    result = { ok: true, sessionId: Number(sid), acceptDeadline: now + ACCEPT_DEADLINE_SEC, wagerGold: w };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} targetDiscord
 * @param {number} sessionId
 */
async function acceptChallenge(client, targetDiscord, sessionId) {
  await client.db.checkUser(targetDiscord);
  const tgId = await tcgEconomy.getInternalUserId(targetDiscord.id);
  if (!tgId) return { ok: false, error: 'Profile not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await expireSessions(trx);
    const s = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).forUpdate().first();
    if (!s || s.status !== 'pending_accept') {
      result = { ok: false, error: 'Challenge not found or already handled.' };
      return;
    }
    if (Number(s.target_user_id) !== tgId) {
      result = { ok: false, error: 'This challenge is not for you.' };
      return;
    }
    const now = nowUnix();
    if (Number(s.accept_deadline) < now) {
      await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update({ status: 'expired' });
      result = { ok: false, error: 'Challenge **expired**.' };
      return;
    }

    const chId = Number(s.challenger_user_id);
    const wager = Math.floor(Number(s.wager_gold) || 0);

    if (wager > 0) {
      await tcgEconomy.ensureWallet(chId, trx);
      await tcgEconomy.ensureWallet(tgId, trx);
      const wCh = await trx('user_wallets').where({ user_id: chId }).forUpdate().first();
      const wTg = await trx('user_wallets').where({ user_id: tgId }).forUpdate().first();
      if (Number(wCh.gold) < wager) {
        result = { ok: false, error: 'Challenger no longer has enough gold — challenge void.' };
        return;
      }
      if (Number(wTg.gold) < wager) {
        result = { ok: false, error: `You need **${wager}**g to match the wager.` };
        return;
      }
      const pot = wager * 2;
      await trx('user_wallets')
        .where({ user_id: chId })
        .update({ gold: Number(wCh.gold) - wager, updated_at: now });
      await trx('user_wallets')
        .where({ user_id: tgId })
        .update({ gold: Number(wTg.gold) - wager, updated_at: now });
      await trx('tcg_pvp_sessions')
        .where({ session_id: sessionId })
        .update({
          status: 'awaiting_picks',
          pot_gold: pot,
          pick_deadline: now + PICK_DEADLINE_SEC,
        });
    } else {
      await trx('tcg_pvp_sessions')
        .where({ session_id: sessionId })
        .update({
          status: 'awaiting_picks',
          pot_gold: 0,
          pick_deadline: now + PICK_DEADLINE_SEC,
        });
    }

    result = { ok: true, sessionId, pickDeadline: now + PICK_DEADLINE_SEC };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} userDiscord
 * @param {number} sessionId
 * @param {number} instanceId
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
      result = { ok: false, error: 'No match awaiting picks.' };
      return;
    }
    const now = nowUnix();
    if (Number(s.pick_deadline) < now) {
      result = { ok: false, error: 'Pick window **expired**.' };
      return;
    }

    const chId = Number(s.challenger_user_id);
    const tgId = Number(s.target_user_id);
    const isCh = uid === chId;
    const isTg = uid === tgId;
    if (!isCh && !isTg) {
      result = { ok: false, error: 'Not a player in this match.' };
      return;
    }

    if (isCh && s.challenger_pick_id != null) {
      result = { ok: false, error: 'You already locked a pick.' };
      return;
    }
    if (isTg && s.target_pick_id != null) {
      result = { ok: false, error: 'You already locked a pick.' };
      return;
    }

    const inst = await trx('user_cards')
      .where({ user_card_id: instanceId, user_id: uid })
      .forUpdate()
      .first();
    if (!inst || inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Invalid copy (missing, lent, or escrowed).' };
      return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Pick a different copy (sealed cards are PvP-blocked for now).' };
      return;
    }
    if (inst.lent_source_user_card_id) {
      result = { ok: false, error: '**Borrowed** cards cannot be used in PvP ([CardSystem.md]).' };
      return;
    }

    const patch = isCh ? { challenger_pick_id: instanceId } : { target_pick_id: instanceId };
    await trx('tcg_pvp_sessions').where({ session_id: sessionId }).update(patch);

    const s2 = await trx('tcg_pvp_sessions').where({ session_id: sessionId }).first();
    if (s2.challenger_pick_id == null || s2.target_pick_id == null) {
      result = { ok: true, sessionId, waitingForOpponent: true };
      return;
    }

    const rowCh = await trx('user_cards')
      .join('card_data', 'user_cards.card_id', 'card_data.card_id')
      .where({ 'user_cards.user_card_id': s2.challenger_pick_id })
      .select(
        'user_cards.user_card_id',
        'user_cards.level',
        'user_cards.ability_key',
        'card_data.name',
        'card_data.element',
        'card_data.class',
        'card_data.rarity',
        'card_data.discord_id',
        'card_data.base_atk',
        'card_data.base_def',
        'card_data.base_spd',
        'card_data.base_hp',
      )
      .first();
    const rowTg = await trx('user_cards')
      .join('card_data', 'user_cards.card_id', 'card_data.card_id')
      .where({ 'user_cards.user_card_id': s2.target_pick_id })
      .select(
        'user_cards.user_card_id',
        'user_cards.level',
        'user_cards.ability_key',
        'card_data.name',
        'card_data.element',
        'card_data.class',
        'card_data.rarity',
        'card_data.discord_id',
        'card_data.base_atk',
        'card_data.base_def',
        'card_data.base_spd',
        'card_data.base_hp',
      )
      .first();

    const pStats = tcgInventory.combatStatsFromJoinedRow(rowCh);
    const eStats = tcgInventory.combatStatsFromJoinedRow(rowTg);
    if (!pStats || !eStats) {
      result = { ok: false, error: 'Combat stats missing on a picked card.' };
      return;
    }

    const nCh =
      rowCh.discord_id != null
        ? await tcgInventory.countDistinctRaritiesForMember(chId, rowCh.discord_id, trx)
        : 0;
    const nTg =
      rowTg.discord_id != null
        ? await tcgInventory.countDistinctRaritiesForMember(tgId, rowTg.discord_id, trx)
        : 0;

    let sigCh = null;
    if (
      rowCh.discord_id != null
      && nCh >= 6
      && sanitizeRarityAbbrev(rowCh.rarity, 'C') === 'M'
    ) {
      sigCh = await tcgSetProgress.resolveMythicSignatureKey(rowCh.discord_id);
    }
    let sigTg = null;
    if (
      rowTg.discord_id != null
      && nTg >= 6
      && sanitizeRarityAbbrev(rowTg.rarity, 'C') === 'M'
    ) {
      sigTg = await tcgSetProgress.resolveMythicSignatureKey(rowTg.discord_id);
    }

    const sim = tcgBattle.simulateMainVsMain(pStats, eStats, rowCh.element, rowTg.element, {
      playerLabel: rowCh.name || 'Challenger',
      enemyLabel: rowTg.name || 'Target',
      combat: {
        player: tcgAbilityBattle.buildPlayerCombatSide({
          instanceAbilityKey: rowCh.ability_key,
          classKey: rowCh.class,
          rarityKey: rowCh.rarity,
          grantedSynergyAbilityKey: null,
          distinctRaritiesForMember: nCh,
          signatureOverrideKey: sigCh,
        }),
        enemy: tcgAbilityBattle.buildPlayerCombatSide({
          instanceAbilityKey: rowTg.ability_key,
          classKey: rowTg.class,
          rarityKey: rowTg.rarity,
          grantedSynergyAbilityKey: null,
          distinctRaritiesForMember: nTg,
          signatureOverrideKey: sigTg,
        }),
      },
    });

    const pot = Number(s2.pot_gold) || 0;
    let winnerId = null;
    let goldToWinner = 0;

    if (sim.outcome === 'win') {
      winnerId = chId;
      if (pot > 0 && !sim.soulbindSuppressPot) {
        goldToWinner = Math.floor(pot * (1 - HOUSE_TAX));
        await tcgEconomy.incrementGoldInternal(winnerId, goldToWinner, trx);
      }
    } else if (sim.outcome === 'loss') {
      winnerId = tgId;
      if (pot > 0 && !sim.soulbindSuppressPot) {
        goldToWinner = Math.floor(pot * (1 - HOUSE_TAX));
        await tcgEconomy.incrementGoldInternal(winnerId, goldToWinner, trx);
      }
    } else if (pot > 0) {
      await tcgEconomy.incrementGoldInternal(chId, Math.floor(pot / 2), trx);
      await tcgEconomy.incrementGoldInternal(tgId, Math.floor(pot / 2), trx);
    }

    const { low, high } = orderedPair(chId, tgId);
    if (pot > 0 && winnerId != null) {
      await setPairCooldown(trx, low, high);
    }

    await trx('tcg_pvp_sessions')
      .where({ session_id: sessionId })
      .update({
        status: 'resolved',
        winner_user_id: winnerId,
      });

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
    };
  });

  if (result && result.ok && result.resolved && result.chDiscordId && result.tgDiscordId) {
    await tcgEconomy.awardTcgBattleXp(client, { id: result.chDiscordId, username: '—' }, {
      won: result.winnerUserId === result.chId,
      isPvp: true,
    });
    await tcgEconomy.awardTcgBattleXp(client, { id: result.tgDiscordId, username: '—' }, {
      won: result.winnerUserId === result.tgId,
      isPvp: true,
    });
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} userDiscord
 */
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
      'pending_accept',
      now,
      'awaiting_picks',
      now,
    ])
    .orderBy('session_id', 'desc');
}

module.exports = {
  MAX_GOLD_WAGER,
  HOUSE_TAX,
  createChallenge,
  acceptChallenge,
  submitPick,
  listMyPendingPvp,
};
