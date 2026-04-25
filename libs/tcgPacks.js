const db = require('../database/db');
const { normalizeRarityKey } = require('../src/bot/tcg/cardLayout');
const tcgEconomy = require('./tcgEconomy');
const tcgCollectionSets = require('./tcgCollectionSets');
const {
  grantTemplateWithTrx,
  countPlayerInstancesWithClient,
  DEFAULT_INVENTORY_CAP,
} = require('./tcgInventory');

/** [CardSystem.md] Basic Pack */
const BASIC_PACK_COST = 500;
const BASIC_PACK_COUNT = 3;
/** 70% Common, 30% Uncommon */
const BASIC_PACK_COMMON_CHANCE = 0.7;
/** Consecutive packs with no UC in any of the 3 pulls; at >= this, next pack forces UC on last pull if needed. */
const BASIC_PACK_PITY_FORCE_AT = 9;

/** [CardSystem.md] Advanced Pack */
const ADVANCED_PACK_COST = 1500;
const ADVANCED_PACK_COUNT = 4;
/** Consecutive packs with no EP+ in any pull; at >= this, next pack forces EP on last pull if needed. */
const ADVANCED_PACK_PITY_FORCE_AT = 9;

/** [CardSystem.md] Premium Pack */
const PREMIUM_PACK_COST = 4000;
const PREMIUM_PACK_COUNT = 5;
/** Consecutive packs with no L/M; at >= this, next pack forces L on last pull if still needed. */
const PREMIUM_LEGENDARY_PITY_FORCE_AT = 19;
/** Consecutive packs with no M; at >= this, next pack forces M on last pull if still needed. */
const PREMIUM_MYTHIC_PITY_FORCE_AT = 49;

const ADVANCED_WEIGHTS = [
  ['C', 0.1],
  ['UC', 0.45],
  ['R', 0.3],
  ['EP', 0.14],
  ['L', 0.01],
];
const ADVANCED_FALLBACK_RARITIES = ['C', 'UC', 'R', 'EP', 'L'];

const PREMIUM_WEIGHTS = [
  ['UC', 0.05],
  ['R', 0.35],
  ['EP', 0.35],
  ['L', 0.2],
  ['M', 0.05],
];
const PREMIUM_FALLBACK_RARITIES = ['UC', 'R', 'EP', 'L', 'M'];

/** [CardSystem.md] Region Pack — random templates with matching `tcg_region` (Home Turf 1–6). */
const REGION_PACK_COST = 2000;
const REGION_PACK_COUNT = 4;
const REGION_ID_MIN = 1;
const REGION_ID_MAX = 6;

/** [CardSystem.md] Boss Pack — guaranteed Rare+; optional boss-tagged templates (`is_boss_card`). */
const BOSS_PACK_COST = 3000;
const BOSS_PACK_COUNT = 4;
/** Per pull: try `is_boss_card` pool before normal rarity roll. */
const BOSS_PACK_BOSS_TAG_CHANCE = 0.06;
const BOSS_PACK_RARE_PLUS_WEIGHTS = [
  ['R', 0.55],
  ['EP', 0.28],
  ['L', 0.14],
  ['M', 0.03],
];
const BOSS_PACK_RARE_PLUS_KEYS = ['R', 'EP', 'L', 'M'];

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function templateIsUncommon(t) {
  return normalizeRarityKey(t.rarity) === 'UC';
}

function templateIsEpicOrHigher(t) {
  const k = normalizeRarityKey(t.rarity);
  return k === 'EP' || k === 'L' || k === 'M';
}

function templateIsLegendaryOrHigher(t) {
  const k = normalizeRarityKey(t.rarity);
  return k === 'L' || k === 'M';
}

function templateIsMythic(t) {
  return normalizeRarityKey(t.rarity) === 'M';
}

function templateIsRarePlus(t) {
  return BOSS_PACK_RARE_PLUS_KEYS.includes(normalizeRarityKey(t.rarity));
}

/**
 * @param {Array<[string, number]>} pairs rarity key, weight (sum ~1)
 */
function pickWeightedRarity(pairs) {
  const r = Math.random();
  let acc = 0;
  for (const [rar, w] of pairs) {
    acc += w;
    if (r < acc) return rar;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * @param {import('knex').Knex} trx
 * @param {string} rarityKey
 * @param {string[]} fallbackRarities
 */
async function pickCatalogTemplateForRarity(trx, rarityKey, fallbackRarities) {
  const norm = normalizeRarityKey(rarityKey);
  const base = () =>
    trx('card_data')
      .whereNotNull('base_atk')
      .whereNotNull('base_def')
      .whereNotNull('base_spd')
      .whereNotNull('base_hp');
  let row = await base().where({ rarity: norm }).orderByRaw('RAND()').first();
  if (!row && fallbackRarities.length) {
    row = await base().whereIn('rarity', fallbackRarities).orderByRaw('RAND()').first();
  }
  return row || null;
}

/**
 * @param {import('knex').Knex} trx
 * @param {number} regionId
 */
async function pickRandomTemplateInRegion(trx, regionId) {
  return trx('card_data')
    .where({ tcg_region: regionId })
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();
}

function normalizeRegionPackId(regionId) {
  const r = Number(regionId);
  if (!Number.isInteger(r) || r < REGION_ID_MIN || r > REGION_ID_MAX) return null;
  return r;
}

/**
 * @param {import('knex').Knex} trx
 * @param {string} rarityKey
 */
async function pickRandomBossTaggedTemplateInRarity(trx, rarityKey) {
  const norm = normalizeRarityKey(rarityKey);
  return trx('card_data')
    .where({ is_boss_card: 1, rarity: norm })
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();
}

/**
 * @param {import('knex').Knex} trx
 * @param {string[]} rarities
 */
async function pickRandomBossTaggedInRarities(trx, rarities) {
  return trx('card_data')
    .where({ is_boss_card: 1 })
    .whereIn('rarity', rarities)
    .whereNotNull('base_atk')
    .whereNotNull('base_def')
    .whereNotNull('base_spd')
    .whereNotNull('base_hp')
    .orderByRaw('RAND()')
    .first();
}

/**
 * @param {import('knex').Knex} trx
 * @param {boolean} forceRarePlusSlot last slot when no Rare+ yet — forces R–M distribution
 */
async function resolveBossPackPullTemplate(trx, forceRarePlusSlot) {
  const rarity = forceRarePlusSlot
    ? pickWeightedRarity(BOSS_PACK_RARE_PLUS_WEIGHTS)
    : pickWeightedRarity(ADVANCED_WEIGHTS);

  const tryBoss = Math.random() < BOSS_PACK_BOSS_TAG_CHANCE;
  if (tryBoss) {
    const allowedFallback = forceRarePlusSlot ? BOSS_PACK_RARE_PLUS_KEYS : ADVANCED_FALLBACK_RARITIES;
    let boss = await pickRandomBossTaggedTemplateInRarity(trx, rarity);
    if (!boss) boss = await pickRandomBossTaggedInRarities(trx, allowedFallback);
    if (boss && (!forceRarePlusSlot || templateIsRarePlus(boss))) return boss;
  }

  const fallbacks = forceRarePlusSlot ? BOSS_PACK_RARE_PLUS_KEYS : ADVANCED_FALLBACK_RARITIES;
  return pickCatalogTemplateForRarity(trx, rarity, fallbacks);
}

/**
 * @param {import('knex').Knex} trx
 * @param {{ forceRarity?: string }} [opts]
 * @param {Array<[string, number]>} weights
 * @param {string[]} fallbackRarities
 */
async function pickPackTemplateWeighted(trx, weights, fallbackRarities, opts = {}) {
  const rarity = opts.forceRarity ? normalizeRarityKey(opts.forceRarity) : pickWeightedRarity(weights);
  return pickCatalogTemplateForRarity(trx, rarity, fallbackRarities);
}

/**
 * @param {import('knex').Knex} trx
 * @param {{ forceUncommon?: boolean }} [opts]
 */
async function pickBasicPackTemplate(trx, opts = {}) {
  const rarity = opts.forceUncommon ? 'UC' : Math.random() < BASIC_PACK_COMMON_CHANCE ? 'C' : 'UC';
  return pickCatalogTemplateForRarity(trx, rarity, ['C', 'UC']);
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function buyBasicPack(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < BASIC_PACK_COST) {
        result = { ok: false, error: `Need **${BASIC_PACK_COST}**g for a Basic Pack (you have **${gold}**g).` };
        throw new Error('PACK_ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(internalId, trx);
      if (owned + BASIC_PACK_COUNT > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **${BASIC_PACK_COUNT}** free slots (you have **${free}**).`,
        };
        throw new Error('PACK_ABORT');
      }

      const pityBefore = Number(w.tcg_basic_pack_pity) || 0;
      const mustPity = pityBefore >= BASIC_PACK_PITY_FORCE_AT;
      let gotUc = false;
      const pulls = [];
      for (let i = 0; i < BASIC_PACK_COUNT; i += 1) {
        const forceUc = mustPity && !gotUc && i === BASIC_PACK_COUNT - 1;
        const template = await pickBasicPackTemplate(trx, { forceUncommon: forceUc });
        if (!template) {
          result = {
            ok: false,
            error:
              'No Common/Uncommon catalog rows with full base stats. Ask staff to seed `card_data`.',
          };
          throw new Error('PACK_ABORT');
        }
        const g = await grantTemplateWithTrx(trx, internalId, template, { skipCapCheck: true });
        if (!g.ok) {
          result = g;
          throw new Error('PACK_ABORT');
        }
        pulls.push(g);
        if (templateIsUncommon(template)) gotUc = true;
      }

      const pityAfter = gotUc ? 0 : pityBefore + 1;

      const ts = nowUnix();
      const newGold = gold - BASIC_PACK_COST;
      await trx('user_wallets').where({ user_id: internalId }).update({
        gold: newGold,
        tcg_basic_pack_pity: pityAfter,
        updated_at: ts,
      });

      result = {
        ok: true,
        packKind: 'basic',
        pulls,
        newGold,
        cost: BASIC_PACK_COST,
        pityBefore,
        pityAfter,
        pityTriggered: mustPity,
      };
    });
  } catch (e) {
    if (e.message === 'PACK_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function buyAdvancedPack(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < ADVANCED_PACK_COST) {
        result = {
          ok: false,
          error: `Need **${ADVANCED_PACK_COST}**g for an Advanced Pack (you have **${gold}**g).`,
        };
        throw new Error('PACK_ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(internalId, trx);
      if (owned + ADVANCED_PACK_COUNT > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **${ADVANCED_PACK_COUNT}** free slots (you have **${free}**).`,
        };
        throw new Error('PACK_ABORT');
      }

      const pityBefore = Number(w.tcg_advanced_pack_pity) || 0;
      const mustPity = pityBefore >= ADVANCED_PACK_PITY_FORCE_AT;
      let gotEpicPlus = false;
      const pulls = [];
      for (let i = 0; i < ADVANCED_PACK_COUNT; i += 1) {
        const forceEp =
          mustPity && !gotEpicPlus && i === ADVANCED_PACK_COUNT - 1
            ? { forceRarity: 'EP' }
            : {};
        const template = await pickPackTemplateWeighted(
          trx,
          ADVANCED_WEIGHTS,
          ADVANCED_FALLBACK_RARITIES,
          forceEp,
        );
        if (!template) {
          result = {
            ok: false,
            error:
              'No Advanced-pool catalog rows with full base stats. Ask staff to seed `card_data`.',
          };
          throw new Error('PACK_ABORT');
        }
        const g = await grantTemplateWithTrx(trx, internalId, template, { skipCapCheck: true });
        if (!g.ok) {
          result = g;
          throw new Error('PACK_ABORT');
        }
        pulls.push(g);
        if (templateIsEpicOrHigher(template)) gotEpicPlus = true;
      }

      const pityAfter = gotEpicPlus ? 0 : pityBefore + 1;
      const ts = nowUnix();
      const newGold = gold - ADVANCED_PACK_COST;
      await trx('user_wallets').where({ user_id: internalId }).update({
        gold: newGold,
        tcg_advanced_pack_pity: pityAfter,
        updated_at: ts,
      });

      result = {
        ok: true,
        packKind: 'advanced',
        pulls,
        newGold,
        cost: ADVANCED_PACK_COST,
        pityBefore,
        pityAfter,
        pityTriggered: mustPity,
      };
    });
  } catch (e) {
    if (e.message === 'PACK_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function buyPremiumPack(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < PREMIUM_PACK_COST) {
        result = {
          ok: false,
          error: `Need **${PREMIUM_PACK_COST}**g for a Premium Pack (you have **${gold}**g).`,
        };
        throw new Error('PACK_ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(internalId, trx);
      if (owned + PREMIUM_PACK_COUNT > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **${PREMIUM_PACK_COUNT}** free slots (you have **${free}**).`,
        };
        throw new Error('PACK_ABORT');
      }

      const pityLegendaryBefore = Number(w.tcg_premium_pack_pity_legendary) || 0;
      const pityMythicBefore = Number(w.tcg_premium_pack_pity_mythic) || 0;
      const mustPityMythic = pityMythicBefore >= PREMIUM_MYTHIC_PITY_FORCE_AT;
      const mustPityLegendary = pityLegendaryBefore >= PREMIUM_LEGENDARY_PITY_FORCE_AT;

      let gotM = false;
      let gotLegendaryPlus = false;
      const pulls = [];
      for (let i = 0; i < PREMIUM_PACK_COUNT; i += 1) {
        const last = i === PREMIUM_PACK_COUNT - 1;
        let force = {};
        if (last) {
          if (mustPityMythic && !gotM) force = { forceRarity: 'M' };
          else if (mustPityLegendary && !gotLegendaryPlus) force = { forceRarity: 'L' };
        }
        const template = await pickPackTemplateWeighted(
          trx,
          PREMIUM_WEIGHTS,
          PREMIUM_FALLBACK_RARITIES,
          force,
        );
        if (!template) {
          result = {
            ok: false,
            error:
              'No Premium-pool catalog rows with full base stats. Ask staff to seed `card_data`.',
          };
          throw new Error('PACK_ABORT');
        }
        const g = await grantTemplateWithTrx(trx, internalId, template, { skipCapCheck: true });
        if (!g.ok) {
          result = g;
          throw new Error('PACK_ABORT');
        }
        pulls.push(g);
        if (templateIsMythic(template)) gotM = true;
        if (templateIsLegendaryOrHigher(template)) gotLegendaryPlus = true;
      }

      const pityLegendaryAfter = gotLegendaryPlus ? 0 : pityLegendaryBefore + 1;
      const pityMythicAfter = gotM ? 0 : pityMythicBefore + 1;

      const ts = nowUnix();
      const newGold = gold - PREMIUM_PACK_COST;
      await trx('user_wallets').where({ user_id: internalId }).update({
        gold: newGold,
        tcg_premium_pack_pity_legendary: pityLegendaryAfter,
        tcg_premium_pack_pity_mythic: pityMythicAfter,
        updated_at: ts,
      });

      result = {
        ok: true,
        packKind: 'premium',
        pulls,
        newGold,
        cost: PREMIUM_PACK_COST,
        pityLegendaryBefore,
        pityLegendaryAfter,
        pityMythicBefore,
        pityMythicAfter,
        pityLegendaryTriggered: mustPityLegendary,
        pityMythicTriggered: mustPityMythic,
      };
    });
  } catch (e) {
    if (e.message === 'PACK_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 */
async function buyBossPack(client, discordUser) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < BOSS_PACK_COST) {
        result = {
          ok: false,
          error: `Need **${BOSS_PACK_COST}**g for a Boss Pack (you have **${gold}**g).`,
        };
        throw new Error('PACK_ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(internalId, trx);
      if (owned + BOSS_PACK_COUNT > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **${BOSS_PACK_COUNT}** free slots (you have **${free}**).`,
        };
        throw new Error('PACK_ABORT');
      }

      let gotRarePlus = false;
      let bossTaggedPulls = 0;
      const pulls = [];
      for (let i = 0; i < BOSS_PACK_COUNT; i += 1) {
        const last = i === BOSS_PACK_COUNT - 1;
        const forceRarePlusSlot = last && !gotRarePlus;
        const template = await resolveBossPackPullTemplate(trx, forceRarePlusSlot);
        if (!template) {
          result = {
            ok: false,
            error:
              'Could not resolve Boss Pack pull (need Rare+ templates with full base stats). Ask staff to seed `card_data`.',
          };
          throw new Error('PACK_ABORT');
        }
        const g = await grantTemplateWithTrx(trx, internalId, template, { skipCapCheck: true });
        if (!g.ok) {
          result = g;
          throw new Error('PACK_ABORT');
        }
        pulls.push(g);
        if (Number(template.is_boss_card) === 1) bossTaggedPulls += 1;
        if (templateIsRarePlus(template)) gotRarePlus = true;
      }

      const ts = nowUnix();
      const newGold = gold - BOSS_PACK_COST;
      await trx('user_wallets').where({ user_id: internalId }).update({
        gold: newGold,
        updated_at: ts,
      });

      result = {
        ok: true,
        packKind: 'boss',
        pulls,
        newGold,
        cost: BOSS_PACK_COST,
        bossTaggedPulls,
      };
    });
  } catch (e) {
    if (e.message === 'PACK_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number} regionId Home Turf / PvE region 1–6 (`card_data.tcg_region`)
 */
async function buyRegionPack(client, discordUser, regionId) {
  const r = normalizeRegionPackId(regionId);
  if (r == null) {
    return { ok: false, error: '**Region** must be **1–6** (Home Turf / `tcg_region`).' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  let result;
  try {
    await db.query.transaction(async (trx) => {
      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);
      if (gold < REGION_PACK_COST) {
        result = {
          ok: false,
          error: `Need **${REGION_PACK_COST}**g for a Region Pack (you have **${gold}**g).`,
        };
        throw new Error('PACK_ABORT');
      }

      const cap = await tcgCollectionSets.resolveInventoryCap(trx, internalId, w, DEFAULT_INVENTORY_CAP);
      const owned = await countPlayerInstancesWithClient(internalId, trx);
      if (owned + REGION_PACK_COUNT > cap) {
        const free = cap - owned;
        result = {
          ok: false,
          error: `Need **${REGION_PACK_COUNT}** free slots (you have **${free}**).`,
        };
        throw new Error('PACK_ABORT');
      }

      const pulls = [];
      for (let i = 0; i < REGION_PACK_COUNT; i += 1) {
        const template = await pickRandomTemplateInRegion(trx, r);
        if (!template) {
          result = {
            ok: false,
            error: `No catalog cards with **tcg_region ${r}** and full base stats. Ask staff to tag \`card_data\`.`,
          };
          throw new Error('PACK_ABORT');
        }
        const g = await grantTemplateWithTrx(trx, internalId, template, { skipCapCheck: true });
        if (!g.ok) {
          result = g;
          throw new Error('PACK_ABORT');
        }
        pulls.push(g);
      }

      const ts = nowUnix();
      const newGold = gold - REGION_PACK_COST;
      await trx('user_wallets').where({ user_id: internalId }).update({
        gold: newGold,
        updated_at: ts,
      });

      result = {
        ok: true,
        packKind: 'region',
        regionId: r,
        pulls,
        newGold,
        cost: REGION_PACK_COST,
      };
    });
  } catch (e) {
    if (e.message === 'PACK_ABORT' && result) return result;
    throw e;
  }

  return result;
}

module.exports = {
  BASIC_PACK_COST,
  BASIC_PACK_COUNT,
  BASIC_PACK_PITY_FORCE_AT,
  ADVANCED_PACK_COST,
  ADVANCED_PACK_COUNT,
  ADVANCED_PACK_PITY_FORCE_AT,
  PREMIUM_PACK_COST,
  PREMIUM_PACK_COUNT,
  PREMIUM_LEGENDARY_PITY_FORCE_AT,
  PREMIUM_MYTHIC_PITY_FORCE_AT,
  REGION_PACK_COST,
  REGION_PACK_COUNT,
  REGION_ID_MIN,
  REGION_ID_MAX,
  BOSS_PACK_COST,
  BOSS_PACK_COUNT,
  BOSS_PACK_BOSS_TAG_CHANCE,
  buyBasicPack,
  buyAdvancedPack,
  buyPremiumPack,
  buyBossPack,
  buyRegionPack,
};
