const db = require('../database/db');
const tcgEconomy = require('./tcgEconomy');
const tcgShop = require('./tcgShop');

const { SHOP_ITEMS, utcDateString, lockOrCreateUserRow, buildWalletPatchForSkuDef } = tcgShop;

const FEATURED_USER_SKU = 'featured_daily';

/** @type {readonly string[]} */
const POOL_A_ELIGIBLE = Object.freeze(
  Object.keys(SHOP_ITEMS).filter((k) => k !== 'inventory_expander'),
);

const EXCLUSIVE_POOL_B = Object.freeze({
  element_anchor: Object.freeze({
    label: 'Element Anchor Kit',
    description:
      'Grants **1× application charge** — `/tcg craft anchor` locks **element** on a copy (no gold reroll ever).',
    cost: 4200,
  }),
  golden_frame_kit: Object.freeze({
    label: 'Golden Frame Kit',
    description: 'Grants **1× application charge** — `/tcg craft frame` adds a **golden** embed accent to a copy.',
    cost: 3600,
  }),
  double_drop_token: Object.freeze({
    label: 'Double Drop Token',
    description:
      '**Next Battle Boss** win uses **two** pool-drop rolls (same pity rules; consumes **1** charge on win).',
    cost: 2400,
  }),
  season_recall: Object.freeze({
    label: 'Season Recall',
    description:
      '**One per meta-season** purchase — holds a recall token for **Stage 7** season decay rules (`/tcg account season_recall` when live).',
    cost: 5200,
  }),
  boss_magnet: Object.freeze({
    label: 'Boss Magnet',
    description: '**Next Battle Boss** fight treats pool pity as **≥10 / 11** before the drop roll; then consumed.',
    cost: 2900,
  }),
});

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function hashDaySeed(dayUtc) {
  let h = 2166136261;
  const s = String(dayUtc);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickPool(dayUtc) {
  return hashDaySeed(`${dayUtc}:pool`) % 2 === 0 ? 'A' : 'B';
}

/**
 * @param {string} dayUtc
 * @param {string} [_metaSeasonKey]
 */
async function ensureFeaturedOfferForDay(dayUtc = utcDateString(), _metaSeasonKey = 's0') {
  const existing = await db.query('tcg_featured_daily').where({ day_utc: dayUtc }).first();
  if (existing) return existing;

  const seed = hashDaySeed(dayUtc);
  const pool = pickPool(dayUtc);
  const ts = nowUnix();

  if (pool === 'A') {
    const sku = POOL_A_ELIGIBLE[seed % POOL_A_ELIGIBLE.length];
    const discounts = [50, 55, 60, 65, 70];
    const discount_percent = discounts[seed % discounts.length];
    const caps = [1, 2, 3];
    const stock_cap = caps[(seed >> 3) % caps.length];
    await db.query('tcg_featured_daily').insert({
      day_utc: dayUtc,
      pool: 'A',
      offer_key: sku,
      base_sku: sku,
      discount_percent,
      stock_cap,
      sold_count: 0,
      rolled_at: ts,
    });
  } else {
    const keys = Object.keys(EXCLUSIVE_POOL_B);
    const offer_key = keys[seed % keys.length];
    const caps = [1, 2];
    const stock_cap = caps[(seed >> 5) % caps.length];
    await db.query('tcg_featured_daily').insert({
      day_utc: dayUtc,
      pool: 'B',
      offer_key,
      base_sku: null,
      discount_percent: null,
      stock_cap,
      sold_count: 0,
      rolled_at: ts,
    });
  }

  return db.query('tcg_featured_daily').where({ day_utc: dayUtc }).first();
}

/**
 * Human-readable offer for embeds / browse.
 * @param {Record<string, unknown>} row tcg_featured_daily row
 */
function describeOffer(row) {
  const pool = String(row.pool);
  if (pool === 'A') {
    const sku = String(row.offer_key);
    const def = SHOP_ITEMS[sku];
    const disc = Number(row.discount_percent) || 0;
    const cost = def ? Math.max(1, Math.ceil((def.cost * (100 - disc)) / 100)) : 0;
    return {
      pool: 'A',
      title: `**Featured — ${disc}% off**`,
      label: def ? def.label : sku,
      description: def ? def.description : '',
      cost,
      stockCap: Number(row.stock_cap),
      sold: Number(row.sold_count) || 0,
      baseSku: sku,
    };
  }
  const ex = EXCLUSIVE_POOL_B[/** @type {keyof typeof EXCLUSIVE_POOL_B} */ (String(row.offer_key))];
  if (!ex) {
    return {
      pool: 'B',
      title: '**Featured — Exclusive**',
      label: String(row.offer_key),
      description: '',
      cost: 0,
      stockCap: Number(row.stock_cap),
      sold: Number(row.sold_count) || 0,
    };
  }
  return {
    pool: 'B',
    title: '**Featured — Exclusive**',
    label: ex.label,
    description: ex.description,
    cost: ex.cost,
    stockCap: Number(row.stock_cap),
    sold: Number(row.sold_count) || 0,
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {string} metaSeasonKey
 */
async function buyFeaturedOffer(client, discordUser, metaSeasonKey) {
  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'Profile not found.' };

  const day = utcDateString();
  await ensureFeaturedOfferForDay(day, metaSeasonKey);

  let result;
  try {
    await db.query.transaction(async (trx) => {
      const row = await trx('tcg_featured_daily').where({ day_utc: day }).forUpdate().first();
      if (!row) {
        result = { ok: false, error: 'No featured offer today.' };
        throw new Error('FEAT_ABORT');
      }
      const sold = Number(row.sold_count) || 0;
      const cap = Number(row.stock_cap) || 0;
      if (sold >= cap) {
        result = { ok: false, error: 'Today’s **featured** is sold out.' };
        throw new Error('FEAT_ABORT');
      }

      const userRow = await lockOrCreateUserRow(trx, internalId, day, FEATURED_USER_SKU);
      if (Number(userRow.purchase_count) >= 1) {
        result = { ok: false, error: 'You already bought **today’s featured** (1/day).' };
        throw new Error('FEAT_ABORT');
      }

      await tcgEconomy.ensureWallet(internalId, trx);
      const w = await trx('user_wallets').where({ user_id: internalId }).forUpdate().first();
      const gold = Number(w.gold);

      const pool = String(row.pool);
      let cost = 0;
      /** @type {Record<string, unknown>} */
      let walletExtra = { updated_at: nowUnix() };

      if (pool === 'A') {
        const sku = String(row.offer_key);
        const def = SHOP_ITEMS[sku];
        if (!def) {
          result = { ok: false, error: 'Featured item misconfigured.' };
          throw new Error('FEAT_ABORT');
        }
        const disc = Number(row.discount_percent) || 0;
        cost = Math.max(1, Math.ceil((def.cost * (100 - disc)) / 100));
        if (gold < cost) {
          result = { ok: false, error: `Featured costs **${cost}**g (you have **${gold}**g).` };
          throw new Error('FEAT_ABORT');
        }

        const newGold = gold - cost;
        const ts = nowUnix();
        const { walletPatch: effectPatch } = buildWalletPatchForSkuDef(w, def, ts);
        await trx('user_wallets').where({ user_id: internalId }).update({ ...effectPatch, gold: newGold });
        result = {
          ok: true,
          pool: 'A',
          label: def.label,
          cost,
          newGold,
          discount: disc,
        };
      } else {
        const key = String(row.offer_key);
        const ex = EXCLUSIVE_POOL_B[/** @type {keyof typeof EXCLUSIVE_POOL_B} */ (key)];
        if (!ex) {
          result = { ok: false, error: 'Featured exclusive misconfigured.' };
          throw new Error('FEAT_ABORT');
        }
        cost = ex.cost;
        if (gold < cost) {
          result = { ok: false, error: `**${ex.label}** costs **${cost}**g (you have **${gold}**g).` };
          throw new Error('FEAT_ABORT');
        }

        if (key === 'season_recall') {
          const purchasedFor = w.tcg_season_recall_purchased_for
            ? String(w.tcg_season_recall_purchased_for)
            : null;
          if (purchasedFor === metaSeasonKey) {
            result = {
              ok: false,
              error: `**Season Recall** is **one per meta-season** — already claimed for **${metaSeasonKey}**.`,
            };
            throw new Error('FEAT_ABORT');
          }
          walletExtra.tcg_season_recall_purchased_for = metaSeasonKey;
          walletExtra.tcg_season_recall_ready = 1;
        } else if (key === 'element_anchor') {
          const n = Math.min(9, (Number(w.tcg_element_anchor_charges) || 0) + 1);
          walletExtra.tcg_element_anchor_charges = n;
        } else if (key === 'golden_frame_kit') {
          const n = Math.min(9, (Number(w.tcg_golden_frame_charges) || 0) + 1);
          walletExtra.tcg_golden_frame_charges = n;
        } else if (key === 'double_drop_token') {
          const n = Math.min(9, (Number(w.tcg_double_drop_charges) || 0) + 1);
          walletExtra.tcg_double_drop_charges = n;
        } else if (key === 'boss_magnet') {
          walletExtra.tcg_bb_magnet_next = 1;
        }

        const newGold = gold - cost;
        await trx('user_wallets').where({ user_id: internalId }).update({
          gold: newGold,
          ...walletExtra,
        });

        result = { ok: true, pool: 'B', label: ex.label, cost, newGold, exclusiveKey: key };
      }

      await trx('tcg_featured_daily').where({ day_utc: day }).increment('sold_count', 1);
      await trx('tcg_shop_user_daily')
        .where({ user_id: internalId, day_utc: day, sku: FEATURED_USER_SKU })
        .increment('purchase_count', 1);
    });
  } catch (e) {
    if (e.message === 'FEAT_ABORT' && result) return result;
    throw e;
  }

  return result;
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {string} metaSeasonKey
 */
async function postFeaturedAnnouncementIfConfigured(client, channelId, metaSeasonKey) {
  if (!channelId) return { ok: false, skipped: true };
  const day = utcDateString();
  const row = await ensureFeaturedOfferForDay(day, metaSeasonKey);
  if (row.announce_message_id && row.announce_channel_id === channelId) {
    return { ok: true, skipped: true, reason: 'already_posted' };
  }

  const { EmbedBuilder } = require('discord.js');
  const desc = describeOffer(row);
  const left = Math.max(0, desc.stockCap - desc.sold);
  const embed = new EmbedBuilder()
    .setTitle('TCG — Daily featured offer (UTC)')
    .setDescription(
      `${desc.title}\n**${desc.label}** — **${desc.cost}**g\n${desc.description}\n\n_Server stock:_ **${left}** / **${desc.stockCap}** · _Player limit:_ **1**/day\n\`/tcg store buy_featured\``,
    )
    .setColor(0xe67e22)
    .setFooter({ text: `UTC day ${day} · Pool ${row.pool}` });

  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || !ch.isTextBased()) return { ok: false, error: 'Invalid featured channel.' };
    const msg = await ch.send({ embeds: [embed] });
    await db.query('tcg_featured_daily').where({ day_utc: day }).update({
      announce_message_id: String(msg.id),
      announce_channel_id: String(channelId),
    });
    return { ok: true, messageId: msg.id };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = {
  POOL_A_ELIGIBLE,
  EXCLUSIVE_POOL_B,
  FEATURED_USER_SKU,
  ensureFeaturedOfferForDay,
  describeOffer,
  buyFeaturedOffer,
  postFeaturedAnnouncementIfConfigured,
  utcDateString,
};
