const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');
const tcgPve = require('./tcgPve');
function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

const TYPE_STANDARD = 'standard';
const TYPE_DIAMOND_MINE = 'diamond_mine';
const TYPE_RUBY_MINE = 'ruby_mine';

function durationSec(expeditionType, region) {
  const r = Math.min(6, Math.max(1, Number(region) || 1));
  if (expeditionType === TYPE_DIAMOND_MINE) return 3600 + r * 600;
  if (expeditionType === TYPE_RUBY_MINE) return 5400 + r * 900;
  return 2400 + r * 400;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 * @param {number} region 1–6
 * @param {string} expeditionType
 */
async function sendExpedition(client, discordUser, userCardId, region, expeditionType) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const r = Math.min(6, Math.max(1, Number(region) || 1));
  const types = new Set([TYPE_STANDARD, TYPE_DIAMOND_MINE, TYPE_RUBY_MINE]);
  const et = types.has(expeditionType) ? expeditionType : TYPE_STANDARD;

  const progress = await tcgPve.ensureProgress(internalId);
  const maxReg = Number(progress.max_region_unlocked) || 1;
  if (r > maxReg) {
    return { ok: false, error: `Clear **region ${r}** in PvE before sending expeditions there.` };
  }
  if (et === TYPE_DIAMOND_MINE && maxReg < 3) {
    return { ok: false, error: '**Diamond Mine** unlocks after region **3** cleared.' };
  }
  if (et === TYPE_RUBY_MINE && maxReg < 5) {
    return { ok: false, error: '**Ruby Mine** unlocks after region **5** cleared.' };
  }

  const existing = await db
    .query('tcg_expeditions')
    .where({ user_id: internalId, claimed: false })
    .first();
  if (existing) {
    return { ok: false, error: 'You already have an active expedition. Claim it first.' };
  }

  const inst = await db
    .query('user_cards')
    .where({ user_card_id: userCardId, user_id: internalId })
    .first();
  if (!inst) return { ok: false, error: 'Copy not found.' };
  if (inst.is_lent || inst.is_escrowed) {
    return { ok: false, error: 'Lent/escrowed copies cannot expedition.' };
  }

  const started = nowUnix();
  const dur = durationSec(et, r);
  const [expId] = await db.query('tcg_expeditions').insert({
    user_id: internalId,
    user_card_id: userCardId,
    region: r,
    expedition_type: et,
    started_at: started,
    returns_at: started + dur,
    claimed: false,
  });

  return { ok: true, expeditionId: Number(expId), returnsAt: started + dur, durationSec: dur };
}

async function listExpeditions(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const rows = await db
    .query('tcg_expeditions as e')
    .join('user_cards as u', 'e.user_card_id', 'u.user_card_id')
    .join('card_data as c', 'u.card_id', 'c.card_id')
    .where('e.user_id', internalId)
    .where('e.claimed', false)
    .select(
      'e.expedition_id',
      'e.region',
      'e.expedition_type',
      'e.started_at',
      'e.returns_at',
      'c.name',
      'c.rarity',
    )
    .orderBy('e.expedition_id', 'desc');

  return { ok: true, rows };
}

async function claimExpedition(client, discordUser, expeditionId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const ex = await trx('tcg_expeditions')
      .where({ expedition_id: expeditionId, user_id: internalId })
      .forUpdate()
      .first();
    if (!ex) {
      result = { ok: false, error: 'Expedition not found.' };
      return;
    }
    if (ex.claimed) {
      result = { ok: false, error: 'Already claimed.' };
      return;
    }
    const now = nowUnix();
    if (Number(ex.returns_at) > now) {
      result = { ok: false, error: 'Not back yet.' };
      return;
    }

    const type = String(ex.expedition_type);
    const reg = Number(ex.region) || 1;
    let shards = 0;
    let diamonds = 0;
    let rubies = 0;
    let gold = 30 + reg * 10;
    let xp = 15 + reg * 5;

    if (type === TYPE_STANDARD) {
      shards = Math.random() < 0.22 ? 2 + Math.floor(Math.random() * 4) : 0;
    } else if (type === TYPE_DIAMOND_MINE) {
      diamonds = 2 + Math.floor(Math.random() * 4);
    } else if (type === TYPE_RUBY_MINE) {
      rubies = 1 + (Math.random() < 0.35 ? 1 : 0);
    }

    await tcgEconomy.incrementTcgResources(trx, internalId, { shards, diamonds, rubies });
    if (gold > 0) await tcgEconomy.incrementGoldInternal(internalId, gold, trx);
    await tcgEconomy.applyXpDeltaWithClient(trx, discordUser.id, xp);

    await trx('tcg_expeditions').where({ expedition_id: expeditionId }).update({ claimed: true });
    result = {
      ok: true,
      gold,
      xp,
      shards,
      diamonds,
      rubies,
    };
  });

  return result || { ok: false, error: 'Claim failed.' };
}

module.exports = {
  sendExpedition,
  listExpeditions,
  claimExpedition,
  TYPE_STANDARD,
  TYPE_DIAMOND_MINE,
  TYPE_RUBY_MINE,
};
