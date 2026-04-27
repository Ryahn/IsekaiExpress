const db = require('../database/db');
const { pickRandomAbilityKeyForRarity } = require('../src/bot/tcg/abilityPools');
const { statLevelMultiplier } = require('../src/bot/tcg/cardLayout');
const { nextRarityInOrder, sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
const { DISPLAY_LABEL } = require('../src/bot/tcg/elements');
const tcgEconomy = require('./tcgEconomy');
const tcgCollectionSets = require('./tcgCollectionSets');
const tcgSetProgress = require('./tcgSetProgress');

const DEFAULT_INVENTORY_CAP = 500;

/**
 * @param {{ tcg_inventory_bonus_slots?: number|null }|null|undefined} walletRow
 */
function effectiveInventoryCap(walletRow, setBonusSlots = 0) {
  const bonus = walletRow != null ? Number(walletRow.tcg_inventory_bonus_slots) || 0 : 0;
  return DEFAULT_INVENTORY_CAP + bonus + (Number(setBonusSlots) || 0);
}

/** @type {Record<string, number[]>} rarity abbreviation → breakdown gold L1–L5 */
const BREAKDOWN_GOLD_BY_RARITY = {
  N: [20, 35, 50, 70, 90],
  C: [50, 75, 100, 130, 165],
  UC: [120, 180, 240, 310, 390],
  R: [300, 450, 600, 775, 975],
  U: [400, 550, 700, 900, 1100],
  SR: [500, 700, 900, 1150, 1400],
  SSR: [750, 1125, 1500, 1950, 2450],
  SUR: [1000, 1500, 2000, 2550, 3200],
  UR: [1500, 2200, 3000, 3800, 4800],
  L: [2000, 3000, 4000, 5200, 6500],
  M: [6000, 9000, 12000, 15600, 19500],
};

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Combat stats for a joined instance + template row (user_cards + card_data base_*).
 * @param {{ level: number, base_atk?: number|null, base_def?: number|null, base_spd?: number|null, base_hp?: number|null }} row
 * @returns {{ atk: number, def: number, spd: number, hp: number }|null}
 */
function combatStatsFromJoinedRow(row) {
  if (row.base_atk == null || row.base_def == null || row.base_spd == null || row.base_hp == null) {
    return null;
  }
  const m = statLevelMultiplier(row.level);
  return {
    atk: Math.round(Number(row.base_atk) * m),
    def: Math.round(Number(row.base_def) * m),
    spd: Math.round(Number(row.base_spd) * m),
    hp: Math.round(Number(row.base_hp) * m),
  };
}

function breakdownGoldFor(normRarity, level) {
  const k = sanitizeRarityAbbrev(normRarity, 'C');
  const row = BREAKDOWN_GOLD_BY_RARITY[k];
  if (!row) return 0;
  const lv = Math.min(5, Math.max(1, Number(level) || 1));
  return row[lv - 1];
}

function nextElementRerollCost(currentRerollCount) {
  const idx = Math.min(Math.max(0, Number(currentRerollCount) || 0), 3);
  return [500, 1000, 2000, 4000][idx];
}

function nextRarityTier(normRarity) {
  return nextRarityInOrder(sanitizeRarityAbbrev(normRarity, 'C'));
}

/**
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 * @param {number} userCardId
 */
async function tryRarityDustUpgrade(trx, internalUserId, userCardId) {
  const w = await trx('user_wallets').where({ user_id: internalUserId }).forUpdate().first();
  if (!w || !Number(w.tcg_rarity_dust_next_fuse)) return { upgraded: false };

  await trx('user_wallets').where({ user_id: internalUserId }).update({
    tcg_rarity_dust_next_fuse: 0,
    updated_at: nowUnix(),
  });

  if (Math.random() >= 0.12) return { upgraded: false, dustConsumed: true };

  const row = await trx('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({ 'user_cards.user_card_id': userCardId, 'user_cards.user_id': internalUserId })
    .select('card_data.discord_id', 'card_data.rarity')
    .first();
  if (!row || row.discord_id == null) return { upgraded: false, dustConsumed: true };

  const nextR = nextRarityTier(row.rarity);
  if (!nextR) return { upgraded: false, dustConsumed: true };

  const picks = await trx('card_data')
    .where({ discord_id: row.discord_id, rarity: nextR })
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .select('*');
  if (!picks.length) return { upgraded: false, dustConsumed: true };

  const pick = picks[Math.floor(Math.random() * picks.length)];
  await trx('user_cards').where({ user_card_id: userCardId }).update({
    card_id: pick.card_id,
    updated_at: nowUnix(),
  });

  return { upgraded: true, dustConsumed: true, newRarity: pick.rarity, templateName: pick.name };
}

async function countDistinctRaritiesForMember(internalUserId, memberDiscordId, trx = db.query) {
  const rows = await trx('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({ 'user_cards.user_id': internalUserId })
    .andWhere({ 'card_data.discord_id': String(memberDiscordId) })
    .groupBy('card_data.rarity')
    .select('card_data.rarity');
  return rows.length;
}

async function countPlayerInstancesWithClient(internalUserId, trx = db.query) {
  const row = await trx('user_cards')
    .where({ user_id: internalUserId })
    .count('* as c')
    .first();
  return Number(row ? row.c : 0);
}

async function countPlayerInstances(internalUserId) {
  return countPlayerInstancesWithClient(internalUserId, db.query);
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function countInventoryForDiscordUser(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return 0;
  return countPlayerInstances(internalId);
}

/**
 * Shop bonus slots + set-collection (5/6) bonus per member ([CardSystem.md]).
 * @param {number} internalUserId
 */
async function getEffectiveInventoryCapForUser(internalUserId) {
  if (!internalUserId) return DEFAULT_INVENTORY_CAP;
  await tcgEconomy.ensureWallet(internalUserId);
  const w = await db.query('user_wallets').where({ user_id: internalUserId }).first();
  return tcgCollectionSets.resolveInventoryCap(db.query, internalUserId, w, DEFAULT_INVENTORY_CAP);
}

/**
 * Insert one owned copy from a catalog row (transaction-safe).
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 * @param {object} template card_data row
 * @param {{ skipCapCheck?: boolean }} [opts]
 */
async function grantTemplateWithTrx(trx, internalUserId, template, opts = {}) {
  if (!opts.skipCapCheck) {
    await tcgEconomy.ensureWallet(internalUserId, trx);
    const w = await trx('user_wallets').where({ user_id: internalUserId }).first();
    const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalUserId, w, DEFAULT_INVENTORY_CAP);
    const owned = await countPlayerInstancesWithClient(internalUserId, trx);
    if (owned >= cap) {
      return { ok: false, error: `Inventory full (${cap} cards).` };
    }
  }
  if (template.base_power == null || template.base_atk == null) {
    return { ok: false, error: 'Not a catalog template (missing base stats).' };
  }

  const ability = pickRandomAbilityKeyForRarity(template.rarity);
  const ts = nowUnix();
  const [insertId] = await trx('user_cards').insert({
    user_id: internalUserId,
    card_id: template.card_id,
    ability_key: ability,
    level: 1,
    acquired_at: ts,
    is_lent: false,
    is_escrowed: false,
    element_reroll_count: 0,
    tcg_preservation_sealed: false,
    lent_source_user_card_id: null,
    updated_at: ts,
    created_at: ts,
  });

  await tcgSetProgress.syncTitleUnlocks(trx, internalUserId);

  return {
    ok: true,
    userCardId: insertId,
    template: { name: template.name, uuid: template.uuid, rarity: template.rarity, element: template.element },
    ability_key: ability,
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {{ uuid?: string, cardId?: number }} opts
 */
async function grantCardToPlayer(client, discordUser, opts = {}) {
  const { uuid, cardId } = opts;
  if (!uuid && cardId == null) {
    return { ok: false, error: 'Provide a catalog `uuid` or `cardId`.' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const template = uuid
    ? await db.query('card_data').where({ uuid }).first()
    : await db.query('card_data').where({ card_id: cardId }).first();

  if (!template) return { ok: false, error: 'Catalog card not found.' };

  return grantTemplateWithTrx(db.query, internalId, template);
}

async function loadOwnedInstance(internalUserId, userCardId, trx = db.query) {
  return trx('user_cards')
    .where({ user_card_id: userCardId, user_id: internalUserId })
    .first();
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 */
async function breakdownInstance(client, discordUser, userCardId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const inst = await loadOwnedInstance(internalId, userCardId, trx);
    if (!inst) {
      result = { ok: false, error: 'Card not found in your inventory.' };
      return;
    }
    if (inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Cannot break down a lent or escrowed card.' };
      return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Preservation Sealed cards cannot be broken down.' };
      return;
    }

    const template = await trx('card_data').where({ card_id: inst.card_id }).first();
    if (!template) {
      result = { ok: false, error: 'Template missing.' };
      return;
    }

    let gold = breakdownGoldFor(template.rarity, inst.level);
    if (template.discord_id != null) {
      const n = await countDistinctRaritiesForMember(internalId, template.discord_id, trx);
      gold = Math.floor(gold * tcgCollectionSets.breakdownMultiplier(n));
    }

    await trx('user_cards').where({ user_card_id: userCardId }).delete();
    await tcgEconomy.ensureWallet(internalId, trx);
    const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
    const newGold = Number(w.gold) + gold;
    await trx('user_wallets').where({ user_id: internalId }).update({
      gold: newGold,
      updated_at: nowUnix(),
    });

    result = { ok: true, gold, newGold, templateName: template.name };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} instanceA
 * @param {number|null} instanceB
 * @param {{ fusionCatalyst?: boolean }} [opts]
 */
async function fuseInstances(client, discordUser, instanceA, instanceB, opts = {}) {
  const fusionCatalyst = !!opts.fusionCatalyst;
  if (instanceA === instanceB && instanceB != null) {
    return { ok: false, error: 'Choose two different copies.' };
  }
  if (fusionCatalyst && instanceB != null) {
    return { ok: false, error: 'With a **Fusion Catalyst**, fuse using **one** copy only (omit second ID).' };
  }
  if (!fusionCatalyst && (instanceB == null || instanceB === undefined)) {
    return { ok: false, error: 'Provide **two** copy IDs, or enable **catalyst** with one copy.' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const a = await loadOwnedInstance(internalId, instanceA, trx);
    if (!a) {
      result = { ok: false, error: 'Card not found in your inventory.' };
      return;
    }
    if (a.is_lent || a.is_escrowed) {
      result = { ok: false, error: 'Cannot fuse lent or escrowed cards.' };
      return;
    }
    if (Number(a.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Cannot fuse a Preservation Sealed card.' };
      return;
    }
    if (a.lent_source_user_card_id) {
      result = { ok: false, error: 'Cannot fuse a **borrowed** copy.' };
      return;
    }

    let b = null;
    if (!fusionCatalyst) {
      b = await loadOwnedInstance(internalId, instanceB, trx);
      if (!b) {
        result = { ok: false, error: 'Second copy not found in your inventory.' };
        return;
      }
      if (b.is_lent || b.is_escrowed) {
        result = { ok: false, error: 'Cannot fuse lent or escrowed cards.' };
        return;
      }
      if (Number(b.tcg_preservation_sealed)) {
        result = { ok: false, error: 'Cannot fuse a Preservation Sealed card.' };
        return;
      }
      if (b.lent_source_user_card_id) {
        result = { ok: false, error: 'Cannot fuse a **borrowed** copy.' };
        return;
      }
    }

    if (fusionCatalyst) {
      if (a.level >= 5) {
        result = { ok: false, error: 'Card is already max level (5).' };
        return;
      }
      await tcgEconomy.ensureWallet(internalId, trx);
      const wCat = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const catNow = Number(wCat.tcg_fusion_catalyst_charges) || 0;
      if (catNow < 1) {
        result = { ok: false, error: 'You need a **Fusion Catalyst** charge (shop: Fusion Catalyst).' };
        return;
      }
      const newLevel = a.level + 1;
      const ts = nowUnix();
      await trx('user_cards').where({ user_card_id: a.user_card_id }).delete();
      const [newId] = await trx('user_cards').insert({
        user_id: internalId,
        card_id: a.card_id,
        ability_key: a.ability_key,
        level: newLevel,
        acquired_at: ts,
        is_lent: false,
        is_escrowed: false,
        element_reroll_count: 0,
        tcg_preservation_sealed: false,
        lent_source_user_card_id: null,
        updated_at: ts,
        created_at: ts,
      });
      await trx('user_wallets')
        .where({ user_id: internalId })
        .update({
          tcg_fusion_catalyst_charges: catNow - 1,
          updated_at: ts,
        });
      const dust = await tryRarityDustUpgrade(trx, internalId, newId);
      result = {
        ok: true,
        userCardId: newId,
        newLevel,
        fusionCatalystUsed: true,
        rarityDust: dust,
      };
      return;
    }

    if (a.card_id !== b.card_id) {
      result = { ok: false, error: 'Fuse requires two copies of the **same** catalog card (same template).' };
      return;
    }
    if (a.level !== b.level) {
      result = { ok: false, error: 'Both copies must be the **same level**.' };
      return;
    }
    if (a.level >= 5) {
      result = { ok: false, error: 'Card is already max level (5).' };
      return;
    }

    const keeper = a.user_card_id < b.user_card_id ? a : b;
    const newLevel = a.level + 1;
    const ts = nowUnix();

    await trx('user_cards').whereIn('user_card_id', [a.user_card_id, b.user_card_id]).delete();
    const [newId] = await trx('user_cards').insert({
      user_id: internalId,
      card_id: a.card_id,
      ability_key: keeper.ability_key,
      level: newLevel,
      acquired_at: ts,
      is_lent: false,
      is_escrowed: false,
      element_reroll_count: 0,
      tcg_preservation_sealed: false,
      lent_source_user_card_id: null,
      updated_at: ts,
      created_at: ts,
    });

    const dust = await tryRarityDustUpgrade(trx, internalId, newId);
    result = { ok: true, userCardId: newId, newLevel, rarityDust: dust };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 */
async function rerollElement(client, discordUser, userCardId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    const inst = await loadOwnedInstance(internalId, userCardId, trx);
    if (!inst) {
      result = { ok: false, error: 'Card not found in your inventory.' };
      return;
    }
    if (inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Cannot reroll a lent or escrowed card.' };
      return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'Preservation Sealed — reroll blocked ([CardSystem.md]).' };
      return;
    }

    const template = await trx('card_data').where({ card_id: inst.card_id }).first();
    if (!template) {
      result = { ok: false, error: 'Template missing.' };
      return;
    }
    if (template.discord_id == null) {
      result = { ok: false, error: 'This catalog row has no `discord_id`; element reroll needs a full character template set.' };
      return;
    }

    const cost = nextElementRerollCost(inst.element_reroll_count);
    await tcgEconomy.ensureWallet(internalId, trx);
    const wallet = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
    if (Number(wallet.gold) < cost) {
      result = { ok: false, error: `Need **${cost}**g to reroll (you have ${Number(wallet.gold)}g).` };
      return;
    }

    let q = trx('card_data')
      .where({
        discord_id: template.discord_id,
        rarity: template.rarity,
      })
      .andWhereNot('card_id', template.card_id);

    if (template.element) {
      q = q.andWhereNot('element', template.element);
    }

    const pool = await q.select('*');
    if (!pool.length) {
      result = { ok: false, error: 'No alternate element template found for this character/rarity.' };
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const newGold = Number(wallet.gold) - cost;
    const ts = nowUnix();

    await trx('user_wallets').where({ user_id: internalId }).update({
      gold: newGold,
      updated_at: ts,
    });
    await trx('user_cards').where({ user_card_id: userCardId }).update({
      card_id: pick.card_id,
      element_reroll_count: inst.element_reroll_count + 1,
      updated_at: ts,
    });

    result = {
      ok: true,
      cost,
      newGold,
      newElement: pick.element,
      elementLabel: pick.element ? (DISPLAY_LABEL[pick.element] || pick.element) : 'N/A',
    };
  });

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} page 1-based
 * @param {number} pageSize
 */
async function fetchInventoryPage(client, discordUser, page = 1, pageSize = 8) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { rows: [], total: 0, page: 1, pageSize, totalPages: 1 };

  const countRow = await db.query('user_cards').where({ user_id: internalId }).count('* as c').first();
  const total = Number(countRow ? countRow.c : 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const offset = (p - 1) * pageSize;

  const rows = await db.query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({ 'user_cards.user_id': internalId })
    .select(
      'user_cards.user_card_id',
      'user_cards.level',
      'user_cards.ability_key',
      'card_data.name',
      'card_data.rarity',
      'card_data.element',
      'card_data.uuid',
      'card_data.image_url',
    )
    .orderBy('user_cards.user_card_id', 'desc')
    .limit(pageSize)
    .offset(offset);

  return { rows, total, page: p, pageSize, totalPages };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 */
async function applyPreservationSeal(client, discordUser, userCardId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  await db.query.transaction(async (trx) => {
    await tcgEconomy.ensureWallet(internalId, trx);
    const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
    const seals = Number(w.tcg_preservation_seal_charges) || 0;
    if (seals < 1) {
      result = { ok: false, error: 'No **Preservation Seal** applications — buy in `/tcg shop`.' };
      return;
    }
    const inst = await loadOwnedInstance(internalId, userCardId, trx);
    if (!inst) {
      result = { ok: false, error: 'Copy not found.' };
      return;
    }
    if (inst.is_lent || inst.is_escrowed) {
      result = { ok: false, error: 'Cannot seal a lent or escrowed copy.' };
      return;
    }
    if (Number(inst.tcg_preservation_sealed)) {
      result = { ok: false, error: 'This copy is already sealed.' };
      return;
    }
    const ts = nowUnix();
    await trx('user_wallets').where({ user_id: internalId }).update({
      tcg_preservation_seal_charges: seals - 1,
      updated_at: ts,
    });
    await trx('user_cards').where({ user_card_id: userCardId }).update({
      tcg_preservation_sealed: true,
      updated_at: ts,
    });
    result = { ok: true, sealsLeft: seals - 1 };
  });
  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} userCardId
 */
async function getInstanceDetailForOwner(client, discordUser, userCardId) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return null;

  const row = await db.query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where({
      'user_cards.user_card_id': userCardId,
      'user_cards.user_id': internalId,
    })
    .select(
      'user_cards.*',
      'card_data.name',
      'card_data.description',
      'card_data.image_url',
      'card_data.class',
      'card_data.rarity',
      'card_data.element',
      'card_data.stars',
      'card_data.uuid',
      'card_data.base_atk',
      'card_data.base_def',
      'card_data.base_spd',
      'card_data.base_hp',
      'card_data.base_power',
    )
    .first();

  return row || null;
}

module.exports = {
  DEFAULT_INVENTORY_CAP,
  effectiveInventoryCap,
  DEFAULT_INVENTORY_CAP,
  BREAKDOWN_GOLD_BY_RARITY,
  breakdownGoldFor,
  nextElementRerollCost,
  combatStatsFromJoinedRow,
  countPlayerInstancesWithClient,
  grantTemplateWithTrx,
  grantCardToPlayer,
  breakdownInstance,
  fuseInstances,
  applyPreservationSeal,
  rerollElement,
  countInventoryForDiscordUser,
  getEffectiveInventoryCapForUser,
  fetchInventoryPage,
  getInstanceDetailForOwner,
};
