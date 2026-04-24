const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');

const SLOT_COLUMN = {
  main: 'main_user_card_id',
  support1: 'support1_user_card_id',
  support2: 'support2_user_card_id',
};

const VALID_SLOTS = new Set(['main', 'support1', 'support2']);

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

async function ensureLoadoutRow(internalId) {
  const existing = await db.query('tcg_user_loadouts').where({ user_id: internalId }).first();
  if (existing) return existing;
  const ts = nowUnix();
  try {
    await db.query('tcg_user_loadouts').insert({
      user_id: internalId,
      main_user_card_id: null,
      support1_user_card_id: null,
      support2_user_card_id: null,
      updated_at: ts,
    });
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e;
  }
  return db.query('tcg_user_loadouts').where({ user_id: internalId }).first();
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function getLoadoutDetail(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return null;

  const row = await ensureLoadoutRow(internalId);
  const ids = [row.main_user_card_id, row.support1_user_card_id, row.support2_user_card_id].filter(Boolean);
  if (!ids.length) {
    return { row, main: null, support1: null, support2: null };
  }

  const cards = await db.query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .whereIn('user_cards.user_card_id', ids)
    .where('user_cards.user_id', internalId)
    .select(
      'user_cards.user_card_id',
      'user_cards.level',
      'user_cards.ability_key',
      'card_data.name',
      'card_data.rarity',
      'card_data.element',
      'card_data.image_url',
    );

  const byId = new Map(cards.map((c) => [Number(c.user_card_id), c]));
  const pick = (id) => (id ? byId.get(Number(id)) || null : null);

  return {
    row,
    main: pick(row.main_user_card_id),
    support1: pick(row.support1_user_card_id),
    support2: pick(row.support2_user_card_id),
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {'main'|'support1'|'support2'} slot
 * @param {number|null} userCardId instance id or null to clear
 */
async function setLoadoutSlot(client, discordUser, slot, userCardId) {
  if (!VALID_SLOTS.has(slot)) {
    return { ok: false, error: 'Invalid slot.' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  await ensureLoadoutRow(internalId);
  const col = SLOT_COLUMN[slot];

  if (userCardId == null) {
    await db.query('tcg_user_loadouts').where({ user_id: internalId }).update({
      [col]: null,
      updated_at: nowUnix(),
    });
    return { ok: true, cleared: true };
  }

  const inst = await db.query('user_cards')
    .where({ user_card_id: userCardId, user_id: internalId })
    .first();
  if (!inst) {
    return { ok: false, error: 'That copy is not in your inventory.' };
  }
  if (inst.is_lent || inst.is_escrowed) {
    return { ok: false, error: 'Lent or escrowed cards cannot be equipped.' };
  }

  const lo = await db.query('tcg_user_loadouts').where({ user_id: internalId }).first();
  const usedElsewhere =
    (slot !== 'main' && Number(lo.main_user_card_id) === Number(userCardId))
    || (slot !== 'support1' && Number(lo.support1_user_card_id) === Number(userCardId))
    || (slot !== 'support2' && Number(lo.support2_user_card_id) === Number(userCardId));
  if (usedElsewhere) {
    return { ok: false, error: 'That copy is already in another loadout slot.' };
  }

  await db.query('tcg_user_loadouts').where({ user_id: internalId }).update({
    [col]: userCardId,
    updated_at: nowUnix(),
  });

  return { ok: true, cleared: false };
}

module.exports = {
  SLOT_COLUMN,
  getLoadoutDetail,
  setLoadoutSlot,
  ensureLoadoutRow,
};
