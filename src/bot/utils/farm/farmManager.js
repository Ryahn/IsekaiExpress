const knex = require('../../../../database/db').query;
const { getDailyBuyPrice, getDailySellPrice, calculateSlotPrice } = require('./cropManager');
const logger = require('../../../../libs/logger');
const { utc7CalendarDateKey, nextUtc7MidnightAfter } = require('./farmUtc7');

function defaultFarmState() {
	return {
		money: 5000,
		experience: 0,
		farmXp: 0,
		landSlots: 10,
		inventory: {},
		currentCrop: null,
		plantedAt: null,
		lastLogin: null,
		maturityPinged: false,
		lastFarmGuildId: null,
		harvestRemindersEnabled: true,
	};
}

/**
 * Knex + mysql2 can generate invalid SQL for plain objects on JSON columns
 * (e.g. `set col = {key: val}` instead of a quoted JSON string). Always bind a string.
 * @param {unknown} value
 * @returns {string|null}
 */
function serializeMysqlJson(value) {
	if (value == null) return null;
	return JSON.stringify(value);
}

function parseJson(val, fallback) {
	if (val == null) return fallback;
	if (Buffer.isBuffer(val)) {
		try {
			return JSON.parse(val.toString('utf8'));
		}
		catch {
			return fallback;
		}
	}
	if (typeof val === 'object') return val;
	try {
		return JSON.parse(val);
	}
	catch {
		return fallback;
	}
}

function rowMaturityPinged(val) {
	if (val == null) return false;
	if (val === 0 || val === false) return false;
	return true;
}

function rowHarvestRemindersEnabled(val) {
	if (val == null) return true;
	if (val === 0 || val === false) return false;
	return true;
}

function cropStatusFromPlanted(userFarm) {
	if (!userFarm.currentCrop || !userFarm.plantedAt) {
		return { ready: false, timeLeft: 0, overdue: 0 };
	}
	const plantedAt = new Date(userFarm.plantedAt);
	const now = new Date();
	const elapsed = now.getTime() - plantedAt.getTime();
	const growthTime = userFarm.currentCrop.growthTime;
	if (elapsed >= growthTime) {
		return { ready: true, timeLeft: 0, overdue: elapsed - growthTime };
	}
	return { ready: false, timeLeft: growthTime - elapsed, overdue: 0 };
}

function rowToUserFarm(row) {
	const todayKey = utc7CalendarDateKey(new Date());
	const rawConverted = row.farm_xp_converted_today != null ? Number(row.farm_xp_converted_today) : 0;
	const storedKey = row.farm_xp_conversion_day_key != null ? String(row.farm_xp_conversion_day_key) : null;
	const farmXpConvertedToday = storedKey === todayKey ? rawConverted : 0;
	return {
		money: Number(row.money),
		experience: row.experience,
		farmXp: row.farm_xp != null ? Number(row.farm_xp) : 0,
		farmXpConvertedToday,
		landSlots: row.land_slots,
		inventory: parseJson(row.inventory, {}),
		currentCrop: row.current_crop ? parseJson(row.current_crop, null) : null,
		plantedAt: row.planted_at ? new Date(row.planted_at).toISOString() : null,
		lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
		maturityPinged: rowMaturityPinged(row.maturity_pinged),
		lastFarmGuildId: row.last_farm_guild_id ? String(row.last_farm_guild_id) : null,
		harvestRemindersEnabled: rowHarvestRemindersEnabled(row.harvest_reminders_enabled),
	};
}

/**
 * @param {object} userFarm
 * @param {{ name: string }} crop
 * @returns {{ buyPrice: number, landSlots: number, fromInv: number, cashSlots: number, cashCost: number }}
 */
function getPlantingPlan(userFarm, crop) {
	const buyPrice = getDailyBuyPrice(crop.name);
	const needSlots = userFarm.landSlots;
	const available = userFarm.inventory[crop.name] || 0;
	const fromInv = Math.min(available, needSlots);
	const cashSlots = needSlots - fromInv;
	const cashCost = buyPrice * cashSlots;
	return { buyPrice, landSlots: needSlots, fromInv, cashSlots, cashCost };
}

/**
 * Same timing math as getCropStatus, without a DB round trip.
 * @param {ReturnType<typeof rowToUserFarm>} userFarm
 */
function cropTimeStatusFromFarm(userFarm) {
	if (!userFarm.currentCrop || !userFarm.plantedAt) {
		return { ready: false, timeLeft: 0, overdue: 0 };
	}
	const plantedAt = new Date(userFarm.plantedAt);
	const now = new Date();
	const elapsed = now.getTime() - plantedAt.getTime();
	const growthTime = userFarm.currentCrop.growthTime;
	if (elapsed >= growthTime) {
		return { ready: true, timeLeft: 0, overdue: elapsed - growthTime };
	}
	return { ready: false, timeLeft: growthTime - elapsed, overdue: 0 };
}

/**
 * @param {import('discord.js').Channel} channel
 * @returns {string|null}
 */
function effectiveChannelIdForFarmLock(channel) {
	if (!channel) return null;
	if (channel.isThread?.()) {
		return channel.parentId ?? null;
	}
	return channel.id;
}

class FarmManager {
	async _ensureFarmGuildRow(guildId) {
		const id = String(guildId);
		let row = await knex('farm_guild_settings').where({ guild_id: id }).first();
		if (!row) {
			await knex('farm_guild_settings').insert({
				guild_id: id,
				prefix: 'h',
				minigame_enabled: true,
				user_enabled_json: serializeMysqlJson({}),
				role_shop_json: null,
			});
			row = await knex('farm_guild_settings').where({ guild_id: id }).first();
		}
		return row;
	}

	/**
	 * @param {import('discord.js').Channel} channel
	 * @returns {Promise<string|null>} Ephemeral user message if blocked, or null if allowed
	 */
	async getWrongFarmChannelMessageIfAny(guildId, channel) {
		const row = await this._ensureFarmGuildRow(guildId);
		const locked = row.farm_channel_id;
		if (locked == null || locked === '') {
			return null;
		}
		const effective = effectiveChannelIdForFarmLock(channel);
		if (effective == null) {
			return 'Farm commands are not available in this channel.';
		}
		if (String(effective) === String(locked)) {
			return null;
		}
		return `Farm commands are only allowed in <#${locked}>.`;
	}

	/**
	 * @param {string | null} channelId
	 */
	async setLockedFarmChannelId(guildId, channelId) {
		const id = String(guildId);
		await this._ensureFarmGuildRow(guildId);
		const v = channelId == null || channelId === '' ? null : String(channelId);
		await knex('farm_guild_settings').where({ guild_id: id }).update({ farm_channel_id: v });
	}

	async isGuildMinigameEnabled(guildId) {
		const row = await this._ensureFarmGuildRow(guildId);
		return row.minigame_enabled !== false && row.minigame_enabled !== 0;
	}

	async setGuildMinigameEnabled(guildId, enabled) {
		const id = String(guildId);
		const existing = await knex('farm_guild_settings').where({ guild_id: id }).first();
		if (existing) {
			await knex('farm_guild_settings').where({ guild_id: id }).update({ minigame_enabled: enabled });
		}
		else {
			await knex('farm_guild_settings').insert({
				guild_id: id,
				prefix: 'h',
				minigame_enabled: enabled,
				user_enabled_json: serializeMysqlJson({}),
				role_shop_json: null,
			});
		}
	}

	async getServerPrefix(guildId) {
		const row = await this._ensureFarmGuildRow(guildId);
		return row.prefix || 'h';
	}

	async setServerPrefix(guildId, prefix) {
		const id = String(guildId);
		const existing = await knex('farm_guild_settings').where({ guild_id: id }).first();
		if (existing) {
			await knex('farm_guild_settings').where({ guild_id: id }).update({ prefix });
		}
		else {
			await knex('farm_guild_settings').insert({
				guild_id: id,
				prefix,
				minigame_enabled: true,
				user_enabled_json: serializeMysqlJson({}),
				role_shop_json: null,
			});
		}
	}

	async getUserFarm(userId, guildId) {
		void guildId;
		const uid = String(userId);
		let row = await knex('farm_profiles').where({ discord_user_id: uid }).first();
		if (!row) {
			const d = defaultFarmState();
			const insert = {
				discord_user_id: uid,
				money: d.money,
				experience: d.experience,
				land_slots: d.landSlots,
				inventory: serializeMysqlJson(d.inventory),
				current_crop: null,
				planted_at: null,
				last_login: null,
			};
			const hasFarmXp = await knex.schema.hasColumn('farm_profiles', 'farm_xp');
			if (hasFarmXp) {
				insert.farm_xp = 0;
				insert.farm_xp_converted_today = 0;
				insert.farm_xp_conversion_day_key = null;
			}
			const hasMaturity = await knex.schema.hasColumn('farm_profiles', 'maturity_pinged');
			if (hasMaturity) {
				insert.maturity_pinged = d.maturityPinged ? 1 : 0;
				insert.last_farm_guild_id = d.lastFarmGuildId;
				insert.harvest_reminders_enabled = d.harvestRemindersEnabled ? 1 : 0;
			}
			await knex('farm_profiles').insert(insert);
			row = await knex('farm_profiles').where({ discord_user_id: uid }).first();
		}
		return rowToUserFarm(row);
	}

	async updateUserFarm(userId, guildId, updates) {
		const uid = String(userId);
		await this.getUserFarm(userId, guildId);
		const data = {};
		if ('money' in updates) data.money = updates.money;
		if ('experience' in updates) data.experience = updates.experience;
		if ('farmXp' in updates) data.farm_xp = updates.farmXp;
		if ('farmXpConvertedToday' in updates) data.farm_xp_converted_today = updates.farmXpConvertedToday;
		if ('farmXpConversionDayKey' in updates) {
			const k = updates.farmXpConversionDayKey;
			data.farm_xp_conversion_day_key = k == null || k === '' ? null : String(k);
		}
		if ('landSlots' in updates) data.land_slots = updates.landSlots;
		if ('inventory' in updates) data.inventory = serializeMysqlJson(updates.inventory);
		if ('currentCrop' in updates) {
			data.current_crop = updates.currentCrop == null ? null : serializeMysqlJson(updates.currentCrop);
		}
		if ('plantedAt' in updates) {
			data.planted_at = updates.plantedAt ? new Date(updates.plantedAt) : null;
		}
		if ('lastLogin' in updates) {
			data.last_login = updates.lastLogin ? new Date(updates.lastLogin) : null;
		}
		if ('maturityPinged' in updates) {
			data.maturity_pinged = updates.maturityPinged ? 1 : 0;
		}
		if ('lastFarmGuildId' in updates) {
			const v = updates.lastFarmGuildId;
			data.last_farm_guild_id = v == null || v === '' ? null : String(v);
		}
		if ('harvestRemindersEnabled' in updates) {
			data.harvest_reminders_enabled = updates.harvestRemindersEnabled ? 1 : 0;
		}
		await knex('farm_profiles').where({ discord_user_id: uid }).update(data);
	}

	async isFarmingEnabled(userId, guildId) {
		const row = await this._ensureFarmGuildRow(guildId);
		const map = parseJson(row.user_enabled_json, {});
		return map[userId] !== false;
	}

	async setFarmingEnabled(userId, guildId, enabled) {
		const id = String(guildId);
		const row = await this._ensureFarmGuildRow(guildId);
		const map = { ...parseJson(row.user_enabled_json, {}) };
		map[userId] = enabled;
		await knex('farm_guild_settings').where({ guild_id: id }).update({
			user_enabled_json: serializeMysqlJson(map),
		});
	}

	async getRoleShopConfig(guildId) {
		const row = await this._ensureFarmGuildRow(guildId);
		const rs = parseJson(row.role_shop_json, null);
		if (!rs || !rs.enabled) return null;
		return rs;
	}

	async canLogin(userId, guildId) {
		const userFarm = await this.getUserFarm(userId, guildId);
		if (!userFarm.lastLogin) {
			return { canLogin: true, nextLogin: null };
		}
		const lastKey = utc7CalendarDateKey(new Date(userFarm.lastLogin));
		const todayKey = utc7CalendarDateKey(new Date());
		if (lastKey !== todayKey) {
			return { canLogin: true, nextLogin: null };
		}
		const nextLogin = nextUtc7MidnightAfter(new Date());
		return { canLogin: false, nextLogin };
	}

	async processLogin(userId, guildId) {
		void guildId;
		const uid = String(userId);
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		let claimed = false;
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				return;
			}
			if (row.last_login) {
				const lastKey = utc7CalendarDateKey(new Date(row.last_login));
				const todayKey = utc7CalendarDateKey(new Date());
				if (lastKey === todayKey) {
					return;
				}
			}
			const farmXp = row.farm_xp != null ? Number(row.farm_xp) : 0;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				money: Number(row.money) + 10000,
				last_login: trx.fn.now(),
				farm_xp: farmXp + 50,
			});
			if (hasLog) {
				await trx('farm_xp_log').insert({
					discord_user_id: uid,
					event_type: 'earn',
					amount: 50,
					source: 'login',
					gold_gained: null,
				});
			}
			claimed = true;
		});
		return claimed;
	}

	/**
	 * @param {import('knex').Knex.Transaction} trx
	 * @param {{
	 *   harvestUnits?: number,
	 *   plantActions?: number,
	 *   shopSeedUnits?: number,
	 *   plantBuyUnits?: number,
	 *   soldUnits?: number,
	 *   landExpansions?: number,
	 * }} deltas
	 */
	async _bumpFarmGlobalStats(trx, deltas) {
		const has = await trx.schema.hasTable('farm_global_stats');
		if (!has) {
			return;
		}
		const harvestUnits = deltas.harvestUnits ?? 0;
		const plantActions = deltas.plantActions ?? 0;
		const shopSeedUnits = deltas.shopSeedUnits ?? 0;
		const plantBuyUnits = deltas.plantBuyUnits ?? 0;
		const soldUnits = deltas.soldUnits ?? 0;
		const landExpansions = deltas.landExpansions ?? 0;
		if (
			harvestUnits === 0 && plantActions === 0 && shopSeedUnits === 0
			&& plantBuyUnits === 0 && soldUnits === 0 && landExpansions === 0
		) {
			return;
		}
		await trx('farm_global_stats')
			.where({ id: 1 })
			.update({
				total_harvest_units: trx.raw('total_harvest_units + ?', [harvestUnits]),
				total_plant_actions: trx.raw('total_plant_actions + ?', [plantActions]),
				total_shop_seed_units_bought: trx.raw('total_shop_seed_units_bought + ?', [shopSeedUnits]),
				total_seed_units_bought_while_planting: trx.raw('total_seed_units_bought_while_planting + ?', [plantBuyUnits]),
				total_crop_units_sold: trx.raw('total_crop_units_sold + ?', [soldUnits]),
				total_land_expansions: trx.raw('total_land_expansions + ?', [landExpansions]),
				updated_at: trx.fn.now(),
			});
	}

	/**
	 * Buy one land slot with cash; awards +100 Farm XP on success (atomic).
	 * @returns {Promise<{ ok: true, newSlots: number, remainingMoney: number, price: number } | { ok: false, reason: string }>}
	 */
	async purchaseLandSlot(userId, guildId) {
		const bulk = await this.purchaseLandSlots(userId, guildId, 1);
		if (!bulk.ok) return bulk;
		return {
			ok: true,
			newSlots: bulk.newSlots,
			remainingMoney: bulk.remainingMoney,
			price: bulk.totalPrice,
		};
	}

	/**
	 * Buy multiple land slots with cash; awards +100 Farm XP per slot (atomic).
	 * Pass a positive integer to buy that many, or 'max' to buy as many as affordable
	 * (capped at 100 total slots).
	 * @param {string} userId
	 * @param {string} guildId
	 * @param {number|'max'} countOrMax
	 * @returns {Promise<{ ok: true, slotsBought: number, newSlots: number, remainingMoney: number, totalPrice: number, nextPrice: number } | { ok: false, reason: string, currentSlots?: number, money?: number, nextPrice?: number }>}
	 */
	async purchaseLandSlots(userId, guildId, countOrMax) {
		void guildId;
		const uid = String(userId);
		const isMax = countOrMax === 'max';
		const requested = isMax ? Infinity : Math.floor(Number(countOrMax));
		if (!isMax && (!Number.isFinite(requested) || requested < 1)) {
			return { ok: false, reason: 'invalid_count' };
		}
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		let result = { ok: false, reason: 'unknown' };
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				result = { ok: false, reason: 'no_profile' };
				return;
			}
			const startingSlots = Number(row.land_slots);
			let money = Number(row.money);
			if (startingSlots >= 100) {
				result = { ok: false, reason: 'max', currentSlots: startingSlots, money };
				return;
			}
			const maxBuyable = 100 - startingSlots;
			const slotsRemainingCapacity = Math.min(requested, maxBuyable);

			let slotsBought = 0;
			let totalPrice = 0;
			while (slotsBought < slotsRemainingCapacity) {
				const nextSlotPrice = calculateSlotPrice(startingSlots + slotsBought);
				if (money - totalPrice < nextSlotPrice) break;
				totalPrice += nextSlotPrice;
				slotsBought += 1;
			}

			if (slotsBought === 0) {
				const nextPrice = calculateSlotPrice(startingSlots);
				result = { ok: false, reason: 'funds', currentSlots: startingSlots, money, nextPrice };
				return;
			}

			if (!isMax && slotsBought < requested) {
				const nextPrice = calculateSlotPrice(startingSlots + slotsBought);
				result = { ok: false, reason: 'funds', currentSlots: startingSlots, money, nextPrice };
				return;
			}

			const newSlots = startingSlots + slotsBought;
			const remainingMoney = money - totalPrice;
			const xpGained = slotsBought * 100;
			const farmXp = row.farm_xp != null ? Number(row.farm_xp) : 0;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				land_slots: newSlots,
				money: remainingMoney,
				farm_xp: farmXp + xpGained,
			});
			if (hasLog) {
				await trx('farm_xp_log').insert({
					discord_user_id: uid,
					event_type: 'earn',
					amount: xpGained,
					source: 'expand',
					gold_gained: null,
				});
			}
			await this._bumpFarmGlobalStats(trx, { landExpansions: slotsBought });
			const nextPrice = newSlots < 100 ? calculateSlotPrice(newSlots) : 0;
			result = {
				ok: true,
				slotsBought,
				newSlots,
				remainingMoney,
				totalPrice,
				nextPrice,
			};
		});
		return result;
	}

	calculateYieldPenalty(overdueMs) {
		if (overdueMs <= 0) return 1.0;
		const hoursOverdue = Math.floor(overdueMs / (60 * 60 * 1000));
		const penalty = hoursOverdue * 0.1;
		return Math.max(0, 1.0 - penalty);
	}

	async getCropStatus(userId, guildId) {
		const userFarm = await this.getUserFarm(userId, guildId);
		return cropStatusFromPlanted(userFarm);
	}

	/**
	 * @param {string} userId
	 * @param {string} guildId
	 * @param {object} crop
	 * @returns {Promise<{ success: true, fromInventory: number, cashPaid: number } | { success: false }>}
	 */
	async plantCrop(userId, guildId, crop) {
		const uid = String(userId);
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		let out = { success: false };
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				return;
			}
			const userFarm = rowToUserFarm(row);
			if (userFarm.currentCrop) {
				return;
			}
			const plan = getPlantingPlan(userFarm, crop);
			if (userFarm.money < plan.cashCost) {
				return;
			}
			const inventory = { ...userFarm.inventory };
			if (plan.fromInv > 0) {
				const next = (inventory[crop.name] || 0) - plan.fromInv;
				if (next <= 0) {
					delete inventory[crop.name];
				}
				else {
					inventory[crop.name] = next;
				}
			}
			const nextMoney = userFarm.money - plan.cashCost;
			const farmXp = userFarm.farmXp + 5;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				money: nextMoney,
				inventory: serializeMysqlJson(inventory),
				current_crop: serializeMysqlJson(crop),
				planted_at: trx.fn.now(),
				maturity_pinged: 0,
				farm_xp: farmXp,
			});
			if (hasLog) {
				await trx('farm_xp_log').insert({
					discord_user_id: uid,
					event_type: 'earn',
					amount: 5,
					source: 'plant',
					gold_gained: null,
				});
			}
			await this._bumpFarmGlobalStats(trx, {
				plantActions: 1,
				plantBuyUnits: plan.cashSlots,
			});
			out = { success: true, fromInventory: plan.fromInv, cashPaid: plan.cashCost };
		});
		return out;
	}

	/**
	 * @param {string} userId
	 * @param {string} guildId
	 */
	async setLastFarmGuildId(userId, guildId) {
		const uid = String(userId);
		const gid = String(guildId);
		await this.getUserFarm(userId, guildId);
		const has = await knex.schema.hasColumn('farm_profiles', 'last_farm_guild_id');
		if (!has) {
			return;
		}
		await knex('farm_profiles').where({ discord_user_id: uid }).update({ last_farm_guild_id: gid });
	}

	/**
	 * @param {string} userId
	 * @param {string} guildId
	 * @param {boolean} enabled
	 */
	async setHarvestRemindersEnabled(userId, guildId, enabled) {
		await this.updateUserFarm(userId, guildId, { harvestRemindersEnabled: enabled });
	}

	/**
	 * @param {import('discord.js').Client} client
	 */
	async runHarvestMaturityPings(client) {
		const hasMaturity = await knex.schema.hasColumn('farm_profiles', 'maturity_pinged');
		if (!hasMaturity) {
			return;
		}
		const rows = await knex('farm_profiles')
			.whereNotNull('current_crop')
			.whereNotNull('planted_at')
			.where('maturity_pinged', 0)
			.where('harvest_reminders_enabled', 1);

		for (const row of rows) {
			const userId = String(row.discord_user_id);
			const userFarm = rowToUserFarm(row);
			if (!userFarm.harvestRemindersEnabled) {
				continue;
			}
			const t = cropTimeStatusFromFarm(userFarm);
			if (!t.ready) {
				continue;
			}
			const crop = userFarm.currentCrop;
			if (!crop) {
				continue;
			}
			const displayName = crop.displayName || crop.name;
			const guildIdStr = userFarm.lastFarmGuildId;
			const prefix = guildIdStr
				? await this.getServerPrefix(guildIdStr)
				: 'h';

			const sendDm = async () => {
				const u = await client.users.fetch(userId).catch(() => null);
				if (!u) {
					return false;
				}
				const text = `**${displayName}** is ready to harvest! Use your server farm prefix, e.g. \`${prefix}harvest\` (run \`/farm help\` in a server to see the exact prefix).`;
				try {
					await u.send({ content: text });
					return true;
				}
				catch (err) {
					logger.error(`[FARM-REMIND] DM failed for ${userId}:`, err);
					return false;
				}
			};

			const markPinged = async () => {
				await knex('farm_profiles').where({ discord_user_id: userId }).update({ maturity_pinged: 1 });
			};

			if (!guildIdStr) {
				if (await sendDm()) {
					await markPinged();
				}
				continue;
			}

			const guild =
				client.guilds.cache.get(guildIdStr)
				|| (await client.guilds.fetch(guildIdStr).catch(() => null));
			if (!guild) {
				if (await sendDm()) {
					await markPinged();
				}
				continue;
			}

			const canGuild =
				(await this.isGuildMinigameEnabled(guildIdStr))
				&& (await this.isFarmingEnabled(userId, guildIdStr));
			if (!canGuild) {
				if (await sendDm()) {
					await markPinged();
				}
				continue;
			}

			const settingsRow = await this._ensureFarmGuildRow(guildIdStr);
			const farmChannelId = settingsRow.farm_channel_id
				? String(settingsRow.farm_channel_id)
				: null;
			let channel = null;
			if (farmChannelId) {
				const ch = await guild.channels.fetch(farmChannelId).catch(() => null);
				if (ch && ch.isTextBased() && 'send' in ch) {
					channel = ch;
				}
			}
			if (!channel) {
				if (guild.systemChannel && guild.systemChannel.isTextBased()) {
					channel = guild.systemChannel;
				}
			}
			if (!channel) {
				for (const ch of guild.channels.cache.values()) {
					if (ch.isTextBased() && 'send' in ch && ch.viewable) {
						channel = ch;
						break;
					}
				}
			}

			const p = await this.getServerPrefix(guildIdStr);
			const messageContent = `<@${userId}> **${displayName}** is ready to harvest! Use \`${p}harvest\` (overdue harvests lose yield / hour).`;
			if (channel) {
				try {
					await channel.send({
						content: messageContent,
						allowedMentions: { users: [userId] },
					});
					await markPinged();
					continue;
				}
				catch (err) {
					logger.error(`[FARM-REMIND] Channel send failed for ${userId} in ${guildIdStr}:`, err);
				}
			}

			if (await sendDm()) {
				await markPinged();
			}
		}
	}

	async harvestCrop(userId, guildId) {
		void guildId;
		const uid = String(userId);
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		let result = null;
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				return;
			}
			const userFarm = rowToUserFarm(row);
			const cropStatus = cropStatusFromPlanted(userFarm);
			if (!cropStatus.ready || !userFarm.currentCrop) {
				return;
			}
			const crop = userFarm.currentCrop;
			const penalty = this.calculateYieldPenalty(cropStatus.overdue);
			const baseYield = crop.yield * userFarm.landSlots;
			const actualYield = Math.floor(baseYield * penalty);
			const farmXpGained = actualYield;
			const inventory = { ...userFarm.inventory };
			inventory[crop.name] = (inventory[crop.name] || 0) + actualYield;
			const newFarmXp = userFarm.farmXp + farmXpGained;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				inventory: serializeMysqlJson(inventory),
				farm_xp: newFarmXp,
				current_crop: null,
				planted_at: null,
			});
			if (hasLog) {
				await trx('farm_xp_log').insert({
					discord_user_id: uid,
					event_type: 'earn',
					amount: farmXpGained,
					source: 'harvest',
					gold_gained: null,
				});
			}
			await this._bumpFarmGlobalStats(trx, { harvestUnits: actualYield });
			result = { crop, yield: actualYield, penalty, farmXpGained };
		});
		return result;
	}

	/**
	 * Buy seed units from the shop (`buy` / `purchase` command). Atomic with global stats.
	 * @param {string} userId
	 * @param {string} guildId
	 * @param {{ name: string }} crop — internal crop key from getCrop()
	 * @param {number} buyQuantity — positive integer
	 * @returns {Promise<{ ok: true, buyQuantity: number, totalCost: number, dailyPrice: number, remainingMoney: number } | { ok: false, reason: 'no_profile' | 'funds' | 'invalid_qty' }>}
	 */
	async purchaseShopSeeds(userId, guildId, crop, buyQuantity) {
		void guildId;
		const uid = String(userId);
		if (!crop || typeof crop.name !== 'string') {
			return { ok: false, reason: 'invalid_qty' };
		}
		const qty = Math.floor(Number(buyQuantity));
		if (!Number.isFinite(qty) || qty <= 0) {
			return { ok: false, reason: 'invalid_qty' };
		}
		const buyPrice = getDailyBuyPrice(crop.name);
		const totalCost = buyPrice * qty;
		/** @type {{ ok: true, buyQuantity: number, totalCost: number, dailyPrice: number, remainingMoney: number } | { ok: false, reason: 'no_profile' | 'funds' | 'invalid_qty' }} */
		let out = { ok: false, reason: 'invalid_qty' };
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				out = { ok: false, reason: 'no_profile' };
				return;
			}
			const userFarm = rowToUserFarm(row);
			if (userFarm.money < totalCost) {
				out = { ok: false, reason: 'funds' };
				return;
			}
			const inventory = { ...userFarm.inventory };
			inventory[crop.name] = (inventory[crop.name] || 0) + qty;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				money: userFarm.money - totalCost,
				inventory: serializeMysqlJson(inventory),
			});
			await this._bumpFarmGlobalStats(trx, { shopSeedUnits: qty });
			out = {
				ok: true,
				buyQuantity: qty,
				totalCost,
				dailyPrice: buyPrice,
				remainingMoney: userFarm.money - totalCost,
			};
		});
		return out;
	}

	async sellCrop(userId, guildId, cropName, amount = 'all') {
		const uid = String(userId);
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		let result = null;
		await knex.transaction(async (trx) => {
			const row = await trx('farm_profiles').where({ discord_user_id: uid }).forUpdate().first();
			if (!row) {
				return;
			}
			const userFarm = rowToUserFarm(row);
			const inventory = { ...userFarm.inventory };
			if (cropName.toLowerCase() === 'all') {
				let totalPrice = 0;
				let totalAmount = 0;
				for (const [name, qty] of Object.entries(inventory)) {
					if (qty > 0) {
						const dailyPrice = getDailySellPrice(name);
						totalPrice += qty * dailyPrice;
						totalAmount += qty;
					}
				}
				if (totalAmount === 0) {
					return;
				}
				const newFarmXp = userFarm.farmXp + 10;
				await trx('farm_profiles').where({ discord_user_id: uid }).update({
					money: userFarm.money + totalPrice,
					inventory: serializeMysqlJson({}),
					farm_xp: newFarmXp,
				});
				if (hasLog) {
					await trx('farm_xp_log').insert({
						discord_user_id: uid,
						event_type: 'earn',
						amount: 10,
						source: 'sell',
						gold_gained: null,
					});
				}
				await this._bumpFarmGlobalStats(trx, { soldUnits: totalAmount });
				result = { amount: totalAmount, totalPrice, cropName: 'all' };
				return;
			}
			const availableAmount = inventory[cropName] || 0;
			if (availableAmount === 0) {
				return;
			}
			let sellAmount;
			if (amount === 'all') {
				sellAmount = availableAmount;
			}
			else {
				sellAmount = parseInt(String(amount), 10);
				if (Number.isNaN(sellAmount) || sellAmount <= 0) {
					return;
				}
				sellAmount = Math.min(sellAmount, availableAmount);
			}
			const dailyPrice = getDailySellPrice(cropName);
			const totalPrice = sellAmount * dailyPrice;
			inventory[cropName] = availableAmount - sellAmount;
			const newFarmXp = userFarm.farmXp + 10;
			await trx('farm_profiles').where({ discord_user_id: uid }).update({
				money: userFarm.money + totalPrice,
				inventory: serializeMysqlJson(inventory),
				farm_xp: newFarmXp,
			});
			if (hasLog) {
				await trx('farm_xp_log').insert({
					discord_user_id: uid,
					event_type: 'earn',
					amount: 10,
					source: 'sell',
					gold_gained: null,
				});
			}
			await this._bumpFarmGlobalStats(trx, { soldUnits: sellAmount });
			result = { amount: sellAmount, totalPrice, cropName };
		});
		return result;
	}

	/**
	 * @param {string} userId
	 * @returns {Promise<Array<{ id: string, eventType: string, amount: number, source: string, goldGained: number | null, createdAt: Date }>>}
	 */
	async getFarmXpLogEntries(userId, limit = 10) {
		const uid = String(userId);
		const hasLog = await knex.schema.hasTable('farm_xp_log');
		if (!hasLog) {
			return [];
		}
		const rows = await knex('farm_xp_log')
			.where({ discord_user_id: uid })
			.orderBy('id', 'desc')
			.limit(limit);
		return rows.map((r) => ({
			id: String(r.id),
			eventType: r.event_type,
			amount: Number(r.amount),
			source: r.source,
			goldGained: r.gold_gained != null ? Number(r.gold_gained) : null,
			createdAt: r.created_at ? new Date(r.created_at) : new Date(),
		}));
	}
}

const farmManager = new FarmManager();

module.exports = { farmManager, FarmManager, getPlantingPlan, utc7CalendarDateKey };
