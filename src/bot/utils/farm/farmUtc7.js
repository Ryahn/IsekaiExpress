/**
 * UTC+7 calendar helpers (aligned with farm daily login and market period dates in cropManager).
 * @param {Date} [d]
 * @returns {string} YYYY-MM-DD
 */
function utc7CalendarDateKey(d = new Date()) {
	const utc7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
	return utc7.toISOString().split('T')[0];
}

/**
 * Next UTC+7 local midnight after `now` (start of the next calendar day in UTC+7).
 * @param {Date} [now]
 * @returns {Date}
 */
function nextUtc7MidnightAfter(now = new Date()) {
	const key = utc7CalendarDateKey(now);
	const [y, m, d] = key.split('-').map(Number);
	const startTodayUtcMs = Date.UTC(y, m - 1, d) - 7 * 60 * 60 * 1000;
	return new Date(startTodayUtcMs + 24 * 60 * 60 * 1000);
}

module.exports = { utc7CalendarDateKey, nextUtc7MidnightAfter };
