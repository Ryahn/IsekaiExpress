/** JavaScript Number safe integer — practical cap for money, inventory counts, and farm_xp in app logic. */
const JS_SAFE_MAX = Number.MAX_SAFE_INTEGER;

/** Leave headroom for one large harvest/sell before hitting unsafe math. */
const MONEY_HARD_MAX = JS_SAFE_MAX - 10_000_000_000;
const MONEY_WARN_AT = Math.floor(MONEY_HARD_MAX * 0.88);

const INVENTORY_HARD_MAX = JS_SAFE_MAX - 1_000_000_000;
const INVENTORY_WARN_AT = Math.floor(INVENTORY_HARD_MAX * 0.88);

const FARM_XP_HARD_MAX = JS_SAFE_MAX - 1_000_000_000;
const FARM_XP_WARN_AT = Math.floor(FARM_XP_HARD_MAX * 0.88);

const STATUS_OK = 'ok';
const STATUS_WARN = 'warn';
const STATUS_HARD = 'hard';

/**
 * @param {unknown} value
 * @returns {number}
 */
function toSafeCount(value) {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampMoney(value) {
	const n = toSafeCount(value);
	return Math.min(n, MONEY_HARD_MAX);
}

/**
 * @param {number} current
 * @param {number} [delta]
 * @returns {{ status: string, headroom: number, projected: number }}
 */
function moneyStatus(current, delta = 0) {
	const cur = toSafeCount(current);
	const proj = cur + toSafeCount(delta);
	let status = STATUS_OK;
	if (cur >= MONEY_WARN_AT || proj >= MONEY_WARN_AT) status = STATUS_WARN;
	if (cur > MONEY_HARD_MAX || proj > MONEY_HARD_MAX) status = STATUS_HARD;
	return { status, headroom: Math.max(0, MONEY_HARD_MAX - cur), projected: proj };
}

/**
 * @param {number} current
 * @param {number} [delta]
 * @returns {{ status: string, headroom: number, projected: number }}
 */
function cropCountStatus(current, delta = 0) {
	const cur = toSafeCount(current);
	const proj = cur + toSafeCount(delta);
	let status = STATUS_OK;
	if (cur >= INVENTORY_WARN_AT || proj >= INVENTORY_WARN_AT) status = STATUS_WARN;
	if (cur > INVENTORY_HARD_MAX || proj > INVENTORY_HARD_MAX) status = STATUS_HARD;
	return { status, headroom: Math.max(0, INVENTORY_HARD_MAX - cur), projected: proj };
}

/**
 * @param {number} current
 * @param {number} [delta]
 * @returns {{ status: string, headroom: number, projected: number }}
 */
function farmXpStatus(current, delta = 0) {
	const cur = toSafeCount(current);
	const proj = cur + toSafeCount(delta);
	let status = STATUS_OK;
	if (cur >= FARM_XP_WARN_AT || proj >= FARM_XP_WARN_AT) status = STATUS_WARN;
	if (cur > FARM_XP_HARD_MAX || proj > FARM_XP_HARD_MAX) status = STATUS_HARD;
	return { status, headroom: Math.max(0, FARM_XP_HARD_MAX - cur), projected: proj };
}

/**
 * @param {string} kind
 * @returns {string}
 */
function describeLimitBreach(kind) {
	switch (kind) {
		case 'money':
			return 'Cash balance is near the maximum the bot can track safely. Sell crops or spend on seeds before earning more.';
		case 'inventory':
			return 'Crop inventory for one crop is near the safe limit. Sell some units to make room.';
		case 'farmXp':
			return 'Farm XP is near the safe limit. Convert XP to gold (`xp convert`) to reduce it.';
		default:
			return 'A farm value is near the safe limit.';
	}
}

/**
 * @param {{ money?: number, farmXp?: number, inventory?: Record<string, number> }} state
 * @returns {string[]}
 */
function collectLimitWarnings(state) {
	const warnings = [];
	const money = toSafeCount(state.money);
	const farmXp = toSafeCount(state.farmXp);
	if (moneyStatus(money).status === STATUS_WARN) {
		warnings.push(`⚠️ **Cash:** ${describeLimitBreach('money')}`);
	}
	if (farmXpStatus(farmXp).status === STATUS_WARN) {
		warnings.push(`⚠️ **Farm XP:** ${describeLimitBreach('farmXp')}`);
	}
	const inv = state.inventory || {};
	let maxCrop = '';
	let maxQty = 0;
	for (const [name, qty] of Object.entries(inv)) {
		const q = toSafeCount(qty);
		if (q > maxQty) {
			maxQty = q;
			maxCrop = name;
		}
		if (cropCountStatus(q).status === STATUS_WARN) {
			warnings.push(`⚠️ **${name} inventory:** ${describeLimitBreach('inventory')}`);
		}
	}
	if (!warnings.some((w) => w.includes('inventory')) && maxCrop && cropCountStatus(maxQty).status === STATUS_WARN) {
		warnings.push(`⚠️ **${maxCrop} inventory:** ${describeLimitBreach('inventory')}`);
	}
	return warnings;
}

/**
 * @param {{ warnings?: string[], mitigation?: string[] } | null | undefined} limitMeta
 * @returns {string}
 */
function formatLimitNotes(limitMeta) {
	if (!limitMeta) return '';
	const parts = [];
	if (limitMeta.warnings?.length) {
		parts.push(limitMeta.warnings.join('\n'));
	}
	if (limitMeta.mitigation?.length) {
		parts.push(limitMeta.mitigation.join('\n'));
	}
	return parts.length ? `\n\n${parts.join('\n')}` : '';
}

/**
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {{ warnings?: string[], mitigation?: string[] } | null | undefined} limitMeta
 */
function applyLimitNotesToEmbed(embed, limitMeta) {
	const notes = formatLimitNotes(limitMeta);
	if (!notes) return;
	const prev = embed.data.description || '';
	embed.setDescription(`${prev}${notes}`.trim());
}

module.exports = {
	JS_SAFE_MAX,
	MONEY_HARD_MAX,
	MONEY_WARN_AT,
	INVENTORY_HARD_MAX,
	INVENTORY_WARN_AT,
	FARM_XP_HARD_MAX,
	FARM_XP_WARN_AT,
	STATUS_OK,
	STATUS_WARN,
	STATUS_HARD,
	toSafeCount,
	clampMoney,
	moneyStatus,
	cropCountStatus,
	farmXpStatus,
	describeLimitBreach,
	collectLimitWarnings,
	formatLimitNotes,
	applyLimitNotesToEmbed,
};
