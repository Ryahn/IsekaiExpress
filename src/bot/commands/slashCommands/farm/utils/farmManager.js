import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDailyBuyPrice, getDailySellPrice } from './cropManager.js';
import { getPrisma } from '../db/prisma.js';
import { useDatabase } from './useDatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const farmDataFile = path.join(__dirname, '../configs/farmData.json');
const serverConfigFile = path.join(__dirname, '../configs/farmServerConfig.json');

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

/** @param {import('@prisma/client').FarmProfile} row */
function rowToUserFarm(row) {
    return {
        money: row.money,
        experience: row.experience,
        landSlots: row.landSlots,
        inventory: typeof row.inventory === 'object' && row.inventory !== null ? row.inventory : {},
        currentCrop: row.currentCrop,
        plantedAt: row.plantedAt ? row.plantedAt.toISOString() : null,
        lastLogin: row.lastLogin ? row.lastLogin.toISOString() : null,
    };
}

class FarmManager {
    loadFarmData() {
        if (fs.existsSync(farmDataFile)) {
            return JSON.parse(fs.readFileSync(farmDataFile, 'utf8'));
        }
        this.saveFarmData({});
        return {};
    }

    saveFarmData(farmData) {
        fs.writeFileSync(farmDataFile, JSON.stringify(farmData, null, 4));
    }

    loadServerConfig() {
        if (fs.existsSync(serverConfigFile)) {
            return JSON.parse(fs.readFileSync(serverConfigFile, 'utf8'));
        }
        this.saveServerConfig({});
        return {};
    }

    saveServerConfig(config) {
        fs.writeFileSync(serverConfigFile, JSON.stringify(config, null, 4));
    }

    async _ensureFarmGuildRow(guildId) {
        const prisma = getPrisma();
        let row = await prisma.farmGuildSettings.findUnique({ where: { guildId } });
        if (!row) {
            row = await prisma.farmGuildSettings.create({
                data: {
                    guildId,
                    prefix: 'h',
                    minigameEnabled: true,
                    userEnabledJson: {},
                },
            });
        }
        return row;
    }

    /**
     * @param {string} guildId
     * @returns {Promise<boolean>}
     */
    async isGuildMinigameEnabled(guildId) {
        if (useDatabase()) {
            const row = await this._ensureFarmGuildRow(guildId);
            return row.minigameEnabled !== false;
        }
        const config = this.loadServerConfig();
        if (!config[guildId]) return true;
        return config[guildId].minigameEnabled !== false;
    }

    /**
     * @param {string} guildId
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setGuildMinigameEnabled(guildId, enabled) {
        if (useDatabase()) {
            const prisma = getPrisma();
            await prisma.farmGuildSettings.upsert({
                where: { guildId },
                create: {
                    guildId,
                    prefix: 'h',
                    minigameEnabled: enabled,
                    userEnabledJson: {},
                },
                update: { minigameEnabled: enabled },
            });
            return;
        }
        const config = this.loadServerConfig();
        if (!config[guildId]) {
            config[guildId] = { prefix: 'h', enabled: {} };
        }
        config[guildId].minigameEnabled = enabled;
        this.saveServerConfig(config);
    }

    /**
     * @param {string} guildId
     * @returns {Promise<string>}
     */
    async getServerPrefix(guildId) {
        if (useDatabase()) {
            const row = await this._ensureFarmGuildRow(guildId);
            return row.prefix || 'h';
        }
        const config = this.loadServerConfig();
        return config[guildId]?.prefix || 'h';
    }

    /**
     * @param {string} guildId
     * @param {string} prefix
     * @returns {Promise<void>}
     */
    async setServerPrefix(guildId, prefix) {
        if (useDatabase()) {
            const prisma = getPrisma();
            await prisma.farmGuildSettings.upsert({
                where: { guildId },
                create: {
                    guildId,
                    prefix,
                    minigameEnabled: true,
                    userEnabledJson: {},
                },
                update: { prefix },
            });
            return;
        }
        const config = this.loadServerConfig();
        if (!config[guildId]) {
            config[guildId] = { prefix: 'h', enabled: {} };
        }
        config[guildId].prefix = prefix;
        this.saveServerConfig(config);
    }

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<object>}
     */
    async getUserFarm(userId, guildId) {
        if (useDatabase()) {
            const prisma = getPrisma();
            let row = await prisma.farmProfile.findUnique({ where: { userId } });
            if (!row) {
                const d = defaultFarmState();
                row = await prisma.farmProfile.create({
                    data: {
                        userId,
                        money: d.money,
                        experience: d.experience,
                        landSlots: d.landSlots,
                        inventory: d.inventory,
                    },
                });
            }
            return rowToUserFarm(row);
        }
        const farmData = this.loadFarmData();
        const key = userId;
        if (!farmData[key]) {
            farmData[key] = defaultFarmState();
            this.saveFarmData(farmData);
        }
        return farmData[key];
    }

    /**
     * @param {string} userId
     * @param {string} guildId
     * @param {object} updates
     * @returns {Promise<void>}
     */
    async updateUserFarm(userId, guildId, updates) {
        if (useDatabase()) {
            const prisma = getPrisma();
            await this.getUserFarm(userId, guildId);
            const data = {};
            if ('money' in updates) data.money = updates.money;
            if ('experience' in updates) data.experience = updates.experience;
            if ('landSlots' in updates) data.landSlots = updates.landSlots;
            if ('inventory' in updates) data.inventory = updates.inventory;
            if ('currentCrop' in updates) data.currentCrop = updates.currentCrop;
            if ('plantedAt' in updates) {
                data.plantedAt = updates.plantedAt ? new Date(updates.plantedAt) : null;
            }
            if ('lastLogin' in updates) {
                data.lastLogin = updates.lastLogin ? new Date(updates.lastLogin) : null;
            }
            await prisma.farmProfile.update({ where: { userId }, data });
            return;
        }
        const farmData = this.loadFarmData();
        const key = userId;
        if (!farmData[key]) {
            farmData[key] = await this.getUserFarm(userId, guildId);
        }
        farmData[key] = { ...farmData[key], ...updates };
        this.saveFarmData(farmData);
    }

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<boolean>}
     */
    async isFarmingEnabled(userId, guildId) {
        if (useDatabase()) {
            const row = await this._ensureFarmGuildRow(guildId);
            const map = row.userEnabledJson && typeof row.userEnabledJson === 'object'
                ? row.userEnabledJson
                : {};
            return map[userId] !== false;
        }
        const config = this.loadServerConfig();
        if (!config[guildId]) return true;
        return config[guildId].enabled?.[userId] !== false;
    }

    /**
     * @param {string} userId
     * @param {string} guildId
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setFarmingEnabled(userId, guildId, enabled) {
        if (useDatabase()) {
            const prisma = getPrisma();
            const row = await this._ensureFarmGuildRow(guildId);
            const map = { ...(typeof row.userEnabledJson === 'object' ? row.userEnabledJson : {}) };
            map[userId] = enabled;
            await prisma.farmGuildSettings.update({
                where: { guildId },
                data: { userEnabledJson: map },
            });
            return;
        }
        const config = this.loadServerConfig();
        if (!config[guildId]) {
            config[guildId] = { prefix: 'h', enabled: {} };
        }
        if (!config[guildId].enabled) {
            config[guildId].enabled = {};
        }
        config[guildId].enabled[userId] = enabled;
        this.saveServerConfig(config);
    }

    /**
     * @param {string} guildId
     * @returns {Promise<object|null>}
     */
    async getRoleShopConfig(guildId) {
        if (useDatabase()) {
            const row = await this._ensureFarmGuildRow(guildId);
            const rs = row.roleShopJson && typeof row.roleShopJson === 'object' ? row.roleShopJson : null;
            if (!rs || !rs.enabled) return null;
            return rs;
        }
        const config = this.loadServerConfig();
        if (!config[guildId] || !config[guildId].roleShop || !config[guildId].roleShop.enabled) {
            return null;
        }
        return config[guildId].roleShop;
    }

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<object>}
     */
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

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<boolean>}
     */
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

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<object>}
     */
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
     * @returns {Promise<boolean>}
     */
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

    /**
     * @param {string} userId
     * @param {string} guildId
     * @returns {Promise<object|null>}
     */
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

    /**
     * @param {string} userId
     * @param {string} guildId
     * @param {string} cropName
     * @param {number|string} amount
     * @returns {Promise<object|null>}
     */
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
        } else {
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

export const farmManager = new FarmManager();
