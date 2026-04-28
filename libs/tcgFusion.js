const db = require('../database/db');
const { sanitizeRarityAbbrev, nextRarityInOrder, rarityRank } = require('../src/bot/tcg/rarityOrder');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');

const FUSION_PITY_FORCE = 12;
const BASE_SUCCESS = 0.62;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function fusionResourceCost(rarityAbbrev, mixedElements, gradeChars) {
  const rk = Math.max(0, rarityRank(sanitizeRarityAbbrev(rarityAbbrev, 'C')));
  let shards = 40 + rk * 25;
  let diamonds = 0;
  let rubies = 0;
  if (mixedElements) shards = Math.ceil(shards * 1.35);
  const grades = (gradeChars || ['D', 'D']).map((g) => String(g || 'D').toUpperCase());
  for (const g of grades) {
    if (g === 'A' || g === 'S') diamonds += 2;
    if (g === 'S') rubies += 1;
  }
  return { shards, diamonds, rubies };
}

/**
 * Rarity fusion: consume 2+ instances same rarity (and member), grant one instance next rarity up.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number[]} instanceIds
 */
async function attemptRarityFusion(client, discordUser, instanceIds) {
  const ids = [...new Set(instanceIds.map((n) => Number(n)).filter((n) => n > 0))];
  if (ids.length < 2) {
    return { ok: false, error: 'Select at least **2** copies to fuse (same rarity & character).' };
  }

  await client.db.checkUser(discordUser);
  const internalId = await tcgEconomy.getInternalUserId(discordUser.id);
  if (!internalId) return { ok: false, error: 'User not found.' };

  const rows = await db
    .query('user_cards')
    .join('card_data', 'user_cards.card_id', 'card_data.card_id')
    .whereIn('user_cards.user_card_id', ids)
    .where('user_cards.user_id', internalId)
    .select(
      'user_cards.user_card_id',
      'user_cards.grade',
      'user_cards.is_lent',
      'user_cards.is_escrowed',
      'card_data.card_id',
      'card_data.rarity',
      'card_data.element',
      'card_data.discord_id',
    );

  if (rows.length !== ids.length) {
    return { ok: false, error: 'One or more copies are missing or not yours.' };
  }
  for (const r of rows) {
    if (r.is_lent || r.is_escrowed) {
      return { ok: false, error: 'Lent or escrowed copies cannot be fused.' };
    }
  }

  const r0 = sanitizeRarityAbbrev(rows[0].rarity, 'C');
  const d0 = rows[0].discord_id != null ? String(rows[0].discord_id) : null;
  const e0 = rows[0].element;
  if (!d0) {
    return { ok: false, error: 'Fusion needs catalog cards tied to a **discord_id**.' };
  }
  const elements = new Set(rows.map((x) => String(x.element)));
  const mixedElements = elements.size > 1;
  for (const r of rows) {
    if (sanitizeRarityAbbrev(r.rarity, 'C') !== r0) {
      return { ok: false, error: 'All inputs must share the **same rarity**.' };
    }
    if (String(r.discord_id) !== d0) {
      return { ok: false, error: 'All inputs must be the **same character**.' };
    }
  }

  const nextR = nextRarityInOrder(r0);
  if (!nextR) {
    return { ok: false, error: 'Already at **max rarity** — cannot fuse higher.' };
  }

  const cost = fusionResourceCost(r0, mixedElements, rows.map((x) => x.grade));

  let outcome;
  await db.query.transaction(async (trx) => {
    const spend = await tcgEconomy.trySpendTcgResources(trx, internalId, cost);
    if (!spend.ok) {
      outcome = spend;
      return;
    }

    let pityRow = await trx('tcg_fusion_pity').where({ user_id: internalId }).forUpdate().first();
    if (!pityRow) {
      await trx('tcg_fusion_pity').insert({ user_id: internalId, attempt_count: 0, last_attempt_at: null });
      pityRow = { attempt_count: 0 };
    }
    let attempts = Number(pityRow.attempt_count) || 0;
    const forceSuccess = attempts >= FUSION_PITY_FORCE;
    const success = forceSuccess || Math.random() < BASE_SUCCESS;

    if (!success) {
      attempts += 1;
      await trx('tcg_fusion_pity').where({ user_id: internalId }).update({
        attempt_count: attempts,
        last_attempt_at: nowUnix(),
      });
      for (const id of ids) {
        await trx('user_cards').where({ user_card_id: id, user_id: internalId }).delete();
      }
      outcome = {
        ok: true,
        success: false,
        attemptsNow: attempts,
        cost,
        message: 'Fusion **failed** — materials consumed. Pity counter increased.',
      };
      return;
    }

    const outPool = mixedElements ? [...elements] : [e0];
    const outEl = outPool[Math.floor(Math.random() * outPool.length)];
    let pick = await trx('card_data')
      .where({
        discord_id: d0,
        rarity: nextR,
        element: outEl,
      })
      .whereNotNull('base_atk')
      .first();
    if (!pick) {
      const picks = await trx('card_data')
        .where({ discord_id: d0, rarity: nextR })
        .whereNotNull('base_atk');
      if (picks.length) pick = picks[Math.floor(Math.random() * picks.length)];
    }
    if (!pick) {
      outcome = { ok: false, error: `No catalog template for **${nextR}** for this character/element.` };
      return;
    }

    for (const id of ids) {
      await trx('user_cards').where({ user_card_id: id, user_id: internalId }).delete();
    }

    const ins = await tcgInventory.grantTemplateWithTrx(trx, internalId, pick, {});
    await trx('tcg_fusion_pity').where({ user_id: internalId }).update({
      attempt_count: 0,
      last_attempt_at: nowUnix(),
    });

    outcome = {
      ok: true,
      success: true,
      cost,
      userCardId: ins.userCardId,
      template: pick,
      forcedPity: forceSuccess,
    };
  });

  return (
    outcome || {
      ok: false,
      error: 'Fusion failed.',
    }
  );
}

module.exports = {
  attemptRarityFusion,
  fusionResourceCost,
  FUSION_PITY_FORCE,
};
