const logger = require('../../../../libs/logger');
const { getAllCropNames, getDailyBuyPrice, getDailySellPrice } = require('./cropManager');
const {
	MONEY_HARD_MAX,
	INVENTORY_HARD_MAX,
	FARM_XP_HARD_MAX,
	toSafeCount,
	clampMoney,
	collectLimitWarnings,
} = require('./farmLimits');

const MAX_SINK_BUY_ITERATIONS = 5000;

/**
 * @returns {{ cropName: string, buyPrice: number }}
 */
function pickSinkCrop() {
	const names = getAllCropNames().slice().sort();
	let best = null;
	for (const cropName of names) {
		const buyPrice = getDailyBuyPrice(cropName);
		if (!best || buyPrice < best.buyPrice || (buyPrice === best.buyPrice && cropName < best.cropName)) {
			best = { cropName, buyPrice };
		}
	}
	return best || { cropName: names[0] || 'tomato', buyPrice: getDailyBuyPrice('tomato') };
}

/**
 * @param {Record<string, number>} inventory
 * @param {string} cropName
 * @param {number} units
 * @returns {{ inventory: Record<string, number>, moneyGained: number, soldUnits: number }}
 */
function sellCropUnits(inventory, cropName, units) {
	const inv = { ...inventory };
	const available = toSafeCount(inv[cropName]);
	const sellUnits = Math.min(units, available);
	if (sellUnits <= 0) {
		return { inventory: inv, moneyGained: 0, soldUnits: 0 };
	}
	const sellPrice = getDailySellPrice(cropName);
	const moneyGained = Math.floor(sellUnits * sellPrice);
	const next = available - sellUnits;
	if (next <= 0) {
		delete inv[cropName];
	}
	else {
		inv[cropName] = next;
	}
	return { inventory: inv, moneyGained, soldUnits: sellUnits };
}

/**
 * @param {Record<string, number>} inventory
 * @param {string} cropName
 * @param {number} addUnits
 * @param {number} money
 * @returns {{ inventory: Record<string, number>, money: number, mitigation: string[], cappedUnits: number }}
 */
function applyInventoryAddWithMitigation(inventory, cropName, addUnits, money) {
	let inv = { ...inventory };
	let cash = toSafeCount(money);
	const mitigation = [];
	let units = toSafeCount(addUnits);
	if (units <= 0) {
		return { inventory: inv, money: cash, mitigation, cappedUnits: 0 };
	}

	const current = toSafeCount(inv[cropName]);
	let projected = current + units;

	if (projected > INVENTORY_HARD_MAX) {
		const overflow = projected - INVENTORY_HARD_MAX;
		const sold = sellCropUnits(inv, cropName, overflow);
		inv = sold.inventory;
		cash += sold.moneyGained;
		if (sold.soldUnits > 0) {
			mitigation.push(
				`🔄 Auto-sold **${sold.soldUnits.toLocaleString()}** ${cropName} ($${sold.moneyGained.toLocaleString()}) — inventory cap.`,
			);
		}
		projected = toSafeCount(inv[cropName]) + units;
	}

	if (projected > INVENTORY_HARD_MAX) {
		const headroom = Math.max(0, INVENTORY_HARD_MAX - toSafeCount(inv[cropName]));
		if (headroom < units) {
			mitigation.push(
				`⚠️ Harvest/purchase capped: only **${headroom.toLocaleString()}** ${cropName} could be stored (inventory cap).`,
			);
			units = headroom;
		}
	}

	if (units > 0) {
		inv[cropName] = toSafeCount(inv[cropName]) + units;
	}

	return { inventory: inv, money: cash, mitigation, cappedUnits: units };
}

/**
 * @param {number} money
 * @param {Record<string, number>} inventory
 * @returns {{ money: number, inventory: Record<string, number>, mitigation: string[] }}
 */
function applyMoneyMitigation(money, inventory) {
	let cash = toSafeCount(money);
	let inv = { ...inventory };
	const mitigation = [];
	let iterations = 0;

	while (cash > MONEY_HARD_MAX && iterations < MAX_SINK_BUY_ITERATIONS) {
		iterations += 1;
		const sink = pickSinkCrop();
		const price = sink.buyPrice;
		if (price <= 0 || cash < price) {
			mitigation.push('⚠️ Cash is above the safe cap and could not be reduced further automatically.');
			cash = clampMoney(cash);
			break;
		}
		const excess = cash - MONEY_HARD_MAX;
		let units = Math.max(1, Math.min(Math.floor(excess / price), Math.floor(cash / price)));
		const spend = Math.floor(units * price);
		if (spend > cash) {
			units = Math.floor(cash / price);
			if (units < 1) break;
		}
		const finalSpend = Math.floor(units * price);
		cash -= finalSpend;
		const addResult = applyInventoryAddWithMitigation(inv, sink.cropName, units, cash);
		inv = addResult.inventory;
		cash = addResult.money;
		mitigation.push(
			`🔄 Auto-bought **${addResult.cappedUnits.toLocaleString()}** ${sink.cropName} ($${finalSpend.toLocaleString()}) — cash cap.`,
		);
		for (const line of addResult.mitigation) {
			if (!mitigation.includes(line)) mitigation.push(line);
		}
	}

	if (cash > MONEY_HARD_MAX) {
		cash = MONEY_HARD_MAX;
		mitigation.push('⚠️ Cash clamped to the safe maximum.');
	}

	return { money: clampMoney(cash), inventory: inv, mitigation };
}

/**
 * @param {number} farmXp
 * @param {number} gain
 * @returns {{ farmXp: number, gainApplied: number, mitigation: string[] }}
 */
function applyFarmXpGainWithMitigation(farmXp, gain) {
	const current = toSafeCount(farmXp);
	const want = toSafeCount(gain);
	const mitigation = [];
	if (want <= 0) {
		return { farmXp: current, gainApplied: 0, mitigation };
	}
	const projected = current + want;
	if (projected > FARM_XP_HARD_MAX) {
		const applied = Math.max(0, FARM_XP_HARD_MAX - current);
		if (applied < want) {
			mitigation.push(
				`⚠️ Farm XP gain capped at **${applied.toLocaleString()}** (was **${want.toLocaleString()}**) — XP cap.`,
			);
		}
		return { farmXp: current + applied, gainApplied: applied, mitigation };
	}
	return { farmXp: projected, gainApplied: want, mitigation };
}

/**
 * @param {{ money: number, inventory: Record<string, number>, farmXp?: number }} state
 * @returns {{ warnings: string[], mitigation: string[] }}
 */
function buildLimitMetaFromState(state) {
	const moneyResult = applyMoneyMitigation(toSafeCount(state.money), state.inventory || {});
	const mitigation = [...moneyResult.mitigation];
	const warnings = collectLimitWarnings({
		money: moneyResult.money,
		farmXp: state.farmXp,
		inventory: moneyResult.inventory,
	});
	if (mitigation.length) {
		logger.info('[FARM-LIMITS] mitigation applied', { mitigation });
	}
	return { warnings, mitigation, money: moneyResult.money, inventory: moneyResult.inventory };
}

/**
 * @param {string[]} lists
 * @returns {{ warnings: string[], mitigation: string[] }}
 */
function mergeLimitMeta(...lists) {
	const warnings = [];
	const mitigation = [];
	for (const meta of lists) {
		if (!meta) continue;
		for (const w of meta.warnings || []) {
			if (!warnings.includes(w)) warnings.push(w);
		}
		for (const m of meta.mitigation || []) {
			if (!mitigation.includes(m)) mitigation.push(m);
		}
	}
	return { warnings, mitigation };
}

module.exports = {
	pickSinkCrop,
	sellCropUnits,
	applyInventoryAddWithMitigation,
	applyMoneyMitigation,
	applyFarmXpGainWithMitigation,
	buildLimitMetaFromState,
	mergeLimitMeta,
};
