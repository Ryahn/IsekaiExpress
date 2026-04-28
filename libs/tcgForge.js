const db = require('../database/db');
const { sanitizeRarityAbbrev } = require('../src/bot/tcg/rarityOrder');
const tcgEconomy = require('./tcgEconomy');
const tcgInventory = require('./tcgInventory');

function shardYieldFromRarity(r) {
  const k = sanitizeRarityAbbrev(r, 'C');
  const table = { N: 3, C: 5, UC: 8, R: 12, U: 16, SR: 22, SSR: 30, SUR: 38, UR: 48, L: 60, M: 100 };
  return table[k] || 5;
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username: string }} discordUser
 * @param {number[]} instanceIds
 * @param {'guaranteed'|'gamble'} mode
 */
async function forgeCards(client, discordUser, instanceIds, mode) {
  const ids = [...new Set(instanceIds.map((n) => Number(n)).filter((n) => n > 0))];
  if (!ids.length) return { ok: false, error: 'Select at least one copy to forge.' };

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
      'user_cards.is_lent',
      'user_cards.is_escrowed',
      'card_data.rarity',
    );

  if (rows.length !== ids.length) {
    return { ok: false, error: 'One or more copies missing or not yours.' };
  }
  for (const r of rows) {
    if (r.is_lent || r.is_escrowed) {
      return { ok: false, error: 'Lent or escrowed copies cannot be forged.' };
    }
  }

  let totalShards = 0;
  for (const r of rows) {
    totalShards += shardYieldFromRarity(r.rarity);
  }

  const rewards = { shards: 0, diamonds: 0, rubies: 0, bonusCard: null };
  let summary = '';

  await db.query.transaction(async (trx) => {
    for (const id of ids) {
      await trx('user_cards').where({ user_card_id: id, user_id: internalId }).delete();
    }

    if (mode === 'guaranteed') {
      rewards.shards = totalShards;
      summary = `**Guaranteed** — **+${totalShards}** shards.`;
      await tcgEconomy.incrementTcgResources(trx, internalId, { shards: totalShards });
      return;
    }

    const roll = Math.random();
    rewards.shards = Math.floor(totalShards * (0.85 + Math.random() * 0.3));
    summary = `**Gamble** — **+${rewards.shards}** shards`;
    if (roll > 0.92) {
      rewards.rubies = 1;
      summary += ' · **+1** ruby _(jackpot)_';
    } else if (roll > 0.78) {
      rewards.diamonds = 1 + (Math.random() < 0.25 ? 1 : 0);
      summary += ` · **+${rewards.diamonds}** diamond(s)`;
    } else if (roll > 0.55) {
      const bonus = await trx('card_data').whereNotNull('base_atk').orderByRaw('RAND()').first();
      if (bonus) {
        const g = await tcgInventory.grantTemplateWithTrx(trx, internalId, bonus, {});
        if (g.ok) {
          rewards.bonusCard = g;
          summary += ` · bonus card **#${g.userCardId}** ${bonus.name}`;
        }
      }
    }

    await tcgEconomy.incrementTcgResources(trx, internalId, {
      shards: rewards.shards,
      diamonds: rewards.diamonds,
      rubies: rewards.rubies,
    });
  });

  return { ok: true, rewards, summary };
}

module.exports = { forgeCards, shardYieldFromRarity };
