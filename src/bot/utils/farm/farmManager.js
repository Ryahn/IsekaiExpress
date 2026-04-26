const knex = require('../../../../database/db').query;
const { getDailyBuyPrice, getDailySellPrice } = require('./cropManager');
const logger = require('../../../../libs/logger');

function defaultFarmState() {
	return {
		money: 5000,
		experience: 0,
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

function rowToUserFarm(row) {
	return {
		money: Number(row.money),
		experience: row.experience,
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
		const lastLogin = new Date(userFarm.lastLogin);
		const now = new Date();
		const utc7Offset = 7 * 60 * 60 * 1000;
		const lastLoginUTC7 = new Date(lastLogin.getTime() + utc7Offset);
		const nowUTC7 = new Date(now.getTime() + utc7Offset);
		const lastLoginDay = new Date(lastLoginUTC7.getFullYear(), lastLoginUTC7.getMonth(), lastLoginUTC7.getDate());
		const todayUTC7 = new Date(nowUTC7.getFullYear(), nowUTC7.getMonth(), nowUTC7.getDate());
		const nextLogin = new Date(lastLoginDay.getTime() + 24 * 60 * 60 * 1000 - utc7Offset);
		if (todayUTC7.getTime() > lastLoginDay.getTime()) {
			return { canLogin: true, nextLogin: null };
		}
		return { canLogin: false, nextLogin };
	}

	async processLogin(userId, guildId) {
		const { canLogin } = await this.canLogin(userId, guildId);
		if (!canLogin) return false;
		const userFarm = await this.getUserFarm(userId, guildId);
		await this.updateUserFarm(userId, guildId, {
			money: userFarm.money + 10000,
			lastLogin: new Date().toISOString(),
		});
		return true;
	}

	calculateYieldPenalty(overdueMs) {
		if (overdueMs <= 0) return 1.0;
		const hoursOverdue = Math.floor(overdueMs / (60 * 60 * 1000));
		const penalty = hoursOverdue * 0.1;
		return Math.max(0, 1.0 - penalty);
	}

	async getCropStatus(userId, guildId) {
		const userFarm = await this.getUserFarm(userId, guildId);
		if (!userFarm.currentCrop || !userFarm.plantedAt) {
			return { ready: false, timeLeft: 0, overdue: 0 };
		}
		const plantedAt = new Date(userFarm.plantedAt);
		const now = new Date();
		const elapsed = now.getTime() - plantedAt.getTime();
		const crop = userFarm.currentCrop;
		const growthTime = crop.growthTime;
		if (elapsed >= growthTime) {
			const overdue = elapsed - growthTime;
			return { ready: true, timeLeft: 0, overdue };
		}
		return { ready: false, timeLeft: growthTime - elapsed, overdue: 0 };
	}

	/**
	 * @param {string} userId
	 * @param {string} guildId
	 * @param {object} crop
	 * @returns {Promise<{ success: true, fromInventory: number, cashPaid: number } | { success: false }>}
	 */
	async plantCrop(userId, guildId, crop) {
		const userFarm = await this.getUserFarm(userId, guildId);
		if (userFarm.currentCrop) {
			return { success: false };
		}
		const plan = getPlantingPlan(userFarm, crop);
		if (userFarm.money < plan.cashCost) {
			return { success: false };
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
		await this.updateUserFarm(userId, guildId, {
			money: nextMoney,
			inventory,
			currentCrop: crop,
			plantedAt: new Date().toISOString(),
			maturityPinged: false,
		});
		return { success: true, fromInventory: plan.fromInv, cashPaid: plan.cashCost };
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
		const userFarm = await this.getUserFarm(userId, guildId);
		const cropStatus = await this.getCropStatus(userId, guildId);
		if (!cropStatus.ready || !userFarm.currentCrop) return null;
		const crop = userFarm.currentCrop;
		const penalty = this.calculateYieldPenalty(cropStatus.overdue);
		const baseYield = crop.yield * userFarm.landSlots;
		const actualYield = Math.floor(baseYield * penalty);
		const expGained = Math.floor(actualYield / 10);
		const inventory = { ...userFarm.inventory };
		inventory[crop.name] = (inventory[crop.name] || 0) + actualYield;
		await this.updateUserFarm(userId, guildId, {
			inventory,
			experience: userFarm.experience + expGained,
			currentCrop: null,
			plantedAt: null,
		});
		return { crop, yield: actualYield, penalty, experience: expGained };
	}

	async sellCrop(userId, guildId, cropName, amount = 'all') {
		const userFarm = await this.getUserFarm(userId, guildId);
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
			if (totalAmount === 0) return null;
			await this.updateUserFarm(userId, guildId, {
				money: userFarm.money + totalPrice,
				inventory: {},
			});
			return { amount: totalAmount, totalPrice, cropName: 'all' };
		}
		const availableAmount = inventory[cropName] || 0;
		if (availableAmount === 0) return null;
		let sellAmount;
		if (amount === 'all') {
			sellAmount = availableAmount;
		}
		else {
			sellAmount = parseInt(String(amount), 10);
			if (Number.isNaN(sellAmount) || sellAmount <= 0) return null;
			sellAmount = Math.min(sellAmount, availableAmount);
		}
		const dailyPrice = getDailySellPrice(cropName);
		const totalPrice = sellAmount * dailyPrice;
		inventory[cropName] = availableAmount - sellAmount;
		await this.updateUserFarm(userId, guildId, {
			money: userFarm.money + totalPrice,
			inventory,
		});
		return { amount: sellAmount, totalPrice, cropName };
	}
}

const farmManager = new FarmManager();

module.exports = { farmManager, FarmManager, getPlantingPlan };
