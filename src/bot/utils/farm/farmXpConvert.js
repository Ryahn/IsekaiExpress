const db = require('../../../../database/db').query;
const config = require('../../../../config');
const tcgEconomy = require('../../../../libs/tcgEconomy');
const { FARM_XP_PER_GOLD } = require('./farmXpConstants');
const { utc7CalendarDateKey } = require('./farmUtc7');

/**
 * @param {import('discord.js').Client} client
 * @param {{ id: string, username?: string }} discordUser
 * @param {{ mode: 'all' | 'amount', amount?: number }} opts
 * @returns {Promise<object>}
 */
async function convertFarmXpToGold(client, discordUser, opts) {
	const { mode, amount: requestedAmount } = opts;
	const dailyCap = config.farm?.xpDailyConvertCap ?? 500;
	const xpPerGold = FARM_XP_PER_GOLD;

	await client.db.checkUser(discordUser);
	const internalId = await tcgEconomy.getInternalUserId(String(discordUser.id));
	if (!internalId) {
		return {
			ok: false,
			error: 'You need a bot profile before converting Farm XP. Interact with the bot or site once to register.',
		};
	}

	const uid = String(discordUser.id);
	const todayKey = utc7CalendarDateKey(new Date());
	const hasLog = await db.schema.hasTable('farm_xp_log');

	/** @type {any} */
	let result;

	await db.transaction(async (trx) => {
		const farmRow = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
		if (!farmRow) {
			result = { ok: false, error: 'No farm profile yet. Use the farming commands first.' };
			return;
		}

		let convertedToday = farmRow.farm_xp_converted_today != null ? Number(farmRow.farm_xp_converted_today) : 0;
		let dayKey = farmRow.farm_xp_conversion_day_key != null ? String(farmRow.farm_xp_conversion_day_key) : null;
		if (dayKey !== todayKey) {
			convertedToday = 0;
			dayKey = todayKey;
		}

		const farmXp = farmRow.farm_xp != null ? Number(farmRow.farm_xp) : 0;
		const remainingCap = Math.max(0, dailyCap - convertedToday);

		let xpToSpend;
		if (mode === 'all') {
			xpToSpend = Math.min(farmXp, remainingCap);
		}
		else {
			const n = Math.floor(Number(requestedAmount));
			if (!Number.isFinite(n) || n < xpPerGold) {
				result = { ok: false, error: `Enter at least **${xpPerGold}** Farm XP to convert (minimum **1** gold).` };
				return;
			}
			if (n > farmXp) {
				result = { ok: false, error: 'Not enough Farm XP.' };
				return;
			}
			if (n > remainingCap) {
				result = {
					ok: false,
					error: `You can only convert **${remainingCap}** more Farm XP today (daily cap **${dailyCap}**).`,
				};
				return;
			}
			xpToSpend = n;
		}

		const gold = Math.floor(xpToSpend / xpPerGold);
		if (gold < 1) {
			result = {
				ok: false,
				error:
					mode === 'all'
						? `Not enough Farm XP for 1 gold under today’s cap. Balance: **${farmXp}** · Cap left: **${remainingCap}** · Need **${xpPerGold}** XP per gold.`
						: `Not enough XP for 1 gold after applying the daily cap (need **${xpPerGold}** per gold).`,
			};
			return;
		}

		const xpDeduct = gold * xpPerGold;
		const newFarmXp = farmXp - xpDeduct;
		const newConvertedToday = convertedToday + xpDeduct;

		await tcgEconomy.ensureWallet(internalId, trx);
		const inc = await tcgEconomy.incrementGoldInternal(internalId, gold, trx);
		if (!inc.ok) {
			result = { ok: false, error: 'Could not credit gold. Try again.' };
			return;
		}

		await trx('farm_profiles').where({ discord_user_id: uid }).update({
			farm_xp: newFarmXp,
			farm_xp_converted_today: newConvertedToday,
			farm_xp_conversion_day_key: dayKey,
		});

		if (hasLog) {
			await trx('farm_xp_log').insert({
				discord_user_id: uid,
				event_type: 'convert',
				amount: xpDeduct,
				source: 'convert',
				gold_gained: gold,
			});
		}

		const newWallet = await trx('user_wallets').where({ user_id: internalId }).first();
		result = {
			ok: true,
			goldGained: gold,
			xpSpent: xpDeduct,
			newFarmXp,
			newGold: Number(newWallet.gold),
			convertedToday: newConvertedToday,
			dailyCap,
			remainingCapAfter: dailyCap - newConvertedToday,
		};
	});

	return result;
}

module.exports = { convertFarmXpToGold, FARM_XP_PER_GOLD };
