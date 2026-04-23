const knex = require('../../../../database/db').query;
const { getDailyBuyPrice, getDailySellPrice } = require('./cropManager');

function defaultFarmState() {
	return {
		money: 5000,
		experience: 0,
		landSlots: 10,
		inventory: {},
		currentCrop: null,
		plantedAt: null,
		lastLogin: null,
	};
}

function parseJson(val, fallback) {
	if (val == null) return fallback;
	if (typeof val === 'object') return val;
	try {
		return JSON.parse(val);
	}
	catch {
		return fallback;
	}
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
	};
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
				user_enabled_json: {},
				role_shop_json: null,
			});
			row = await knex('farm_guild_settings').where({ guild_id: id }).first();
		}
		return row;
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
				user_enabled_json: {},
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
				user_enabled_json: {},
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
			await knex('farm_profiles').insert({
				discord_user_id: uid,
				money: d.money,
				experience: d.experience,
				land_slots: d.landSlots,
				inventory: d.inventory,
				current_crop: null,
				planted_at: null,
				last_login: null,
			});
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
		if ('inventory' in updates) data.inventory = updates.inventory;
		if ('currentCrop' in updates) data.current_crop = updates.currentCrop;
		if ('plantedAt' in updates) {
			data.planted_at = updates.plantedAt ? new Date(updates.plantedAt) : null;
		}
		if ('lastLogin' in updates) {
			data.last_login = updates.lastLogin ? new Date(updates.lastLogin) : null;
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
			user_enabled_json: map,
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

	async plantCrop(userId, guildId, crop) {
		const userFarm = await this.getUserFarm(userId, guildId);
		if (userFarm.currentCrop) return false;
		const buyPrice = getDailyBuyPrice(crop.name);
		const totalCost = buyPrice * userFarm.landSlots;
		if (userFarm.money < totalCost) return false;
		await this.updateUserFarm(userId, guildId, {
			money: userFarm.money - totalCost,
			currentCrop: crop,
			plantedAt: new Date().toISOString(),
		});
		return true;
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

module.exports = { farmManager, FarmManager };
