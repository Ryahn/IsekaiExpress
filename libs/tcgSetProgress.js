/**
 * Set collection: 3/6 title unlocks, 6/6 catalog signatures ([CardSystem.md]).
 */
const db = require('../database/db');
const { ABILITY_SEEDS } = require('../src/bot/tcg/tcgAbilitySeeds');
const { byTier } = require('../src/bot/tcg/abilityPools');

const SIGNATURE_KEYS = new Set(
  ABILITY_SEEDS.filter((r) => Number(r.tier) === 4).map((r) => r.ability_key),
);

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function assertValidSignatureKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!SIGNATURE_KEYS.has(k)) return null;
  return k;
}

/**
 * @param {import('knex').Knex} trx
 * @param {string} memberDiscordId
 * @param {string} abilityKey tier-4 ability_key
 */
async function upsertCatalogSignature(trx, memberDiscordId, abilityKey) {
  const k = assertValidSignatureKey(abilityKey);
  if (!k) {
    return { ok: false, error: 'Invalid **ability_key** — must be a Tier 4 (signature) ability from the catalog.' };
  }
  const did = String(memberDiscordId).trim();
  if (!did) return { ok: false, error: '**member_discord_id** required.' };

  const ts = nowUnix();
  const exists = await trx('tcg_catalog_signatures').where({ member_discord_id: did }).first();
  if (exists) {
    await trx('tcg_catalog_signatures').where({ member_discord_id: did }).update({
      ability_key: k,
      updated_at: ts,
    });
  } else {
    await trx('tcg_catalog_signatures').insert({
      member_discord_id: did,
      ability_key: k,
      updated_at: ts,
    });
  }
  return { ok: true, member_discord_id: did, ability_key: k };
}

/**
 * @param {string} memberDiscordId card_data.discord_id
 */
async function getCatalogSignatureKey(memberDiscordId) {
  if (memberDiscordId == null || String(memberDiscordId).trim() === '') return null;
  const row = await db
    .query('tcg_catalog_signatures')
    .where({ member_discord_id: String(memberDiscordId).trim() })
    .first();
  const k = row?.ability_key ? String(row.ability_key).toLowerCase() : null;
  if (k && SIGNATURE_KEYS.has(k)) return k;
  return null;
}

/**
 * Admin row if present, else random Tier 4 pool ([CardSystem.md] Signature Abilities).
 * @param {string|null|undefined} memberDiscordId
 */
async function resolveMythicSignatureKey(memberDiscordId) {
  const admin = await getCatalogSignatureKey(memberDiscordId);
  if (admin) return admin;
  const pool = byTier[4];
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Grant 3/6 titles for any member with ≥3 distinct rarities owned.
 * @param {import('knex').Knex} trx
 * @param {number} internalUserId
 */
async function syncTitleUnlocks(trx, internalUserId) {
  const groups = await trx('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .where('user_cards.user_id', internalUserId)
    .whereNotNull('card_data.discord_id')
    .groupBy('card_data.discord_id')
    .havingRaw('COUNT(DISTINCT card_data.rarity) >= 3')
    .select(trx.raw('card_data.discord_id as member_discord_id'));

  const ts = nowUnix();
  for (const g of groups) {
    const did = String(g.member_discord_id);
    const exists = await trx('tcg_set_title_unlocks')
      .where({ user_id: internalUserId, member_discord_id: did })
      .first();
    if (exists) continue;

    const template = await trx('card_data').where({ discord_id: did }).whereNotNull('base_atk').first();
    const name = template?.name ? String(template.name) : did.slice(0, 8);
    const displayTitle = `Collector · ${name}`.slice(0, 128);

    try {
      await trx('tcg_set_title_unlocks').insert({
        user_id: internalUserId,
        member_discord_id: did,
        display_title: displayTitle,
        unlocked_at: ts,
      });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e;
    }
  }
}

/**
 * @param {number} internalUserId
 */
async function listUnlockedTitles(internalUserId) {
  return db
    .query('tcg_set_title_unlocks')
    .where({ user_id: internalUserId })
    .orderBy('unlocked_at', 'desc')
    .select('display_title', 'member_discord_id', 'unlocked_at');
}

module.exports = {
  SIGNATURE_KEYS,
  assertValidSignatureKey,
  upsertCatalogSignature,
  getCatalogSignatureKey,
  resolveMythicSignatureKey,
  syncTitleUnlocks,
  listUnlockedTitles,
};
