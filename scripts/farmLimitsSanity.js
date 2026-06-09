/**
 * Quick sanity checks for farm limit helpers (no DB).
 * Run: node scripts/farmLimitsSanity.js
 */
const assert = require('assert');
const {
	MONEY_HARD_MAX,
	INVENTORY_HARD_MAX,
	moneyStatus,
	cropCountStatus,
	collectLimitWarnings,
	toSafeCount,
	FARM_XP_HARD_MAX,
} = require('../src/bot/utils/farm/farmLimits');
const {
	applyMoneyMitigation,
	applyInventoryAddWithMitigation,
	applyFarmXpGainWithMitigation,
	pickSinkCrop,
} = require('../src/bot/utils/farm/farmMitigation');

assert.strictEqual(moneyStatus(0).status, 'ok');
assert.strictEqual(moneyStatus(MONEY_HARD_MAX).status, 'warn');
assert.strictEqual(moneyStatus(MONEY_HARD_MAX + 1).status, 'hard');

assert.strictEqual(cropCountStatus(INVENTORY_HARD_MAX).status, 'warn');
assert.strictEqual(cropCountStatus(INVENTORY_HARD_MAX + 1).status, 'hard');

const sink = pickSinkCrop();
assert.ok(sink.cropName && sink.buyPrice >= 1);

const inv = { tomato: INVENTORY_HARD_MAX - 5 };
const add = applyInventoryAddWithMitigation(inv, 'tomato', 100, 0);
assert.ok(add.cappedUnits <= 100);
assert.ok(toSafeCount(add.inventory.tomato) <= INVENTORY_HARD_MAX);

const money = applyMoneyMitigation(MONEY_HARD_MAX + 50_000_000, {});
assert.ok(money.money <= MONEY_HARD_MAX);

const xp = applyFarmXpGainWithMitigation(1_000_000, 2_000_000_000_000);
assert.ok(xp.farmXp <= FARM_XP_HARD_MAX);

const warnings = collectLimitWarnings({ money: MONEY_HARD_MAX * 0.9, farmXp: 0, inventory: {} });
assert.ok(warnings.length >= 1);

console.log('farmLimitsSanity: all checks passed');
