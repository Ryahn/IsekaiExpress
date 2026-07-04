const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const { standardizeDate } = require('../../../libs/standardizeDate');
const db = require('../../../database/db');
const config = require('../../../config');

const VALID_CHANNEL_MODES = new Set(['today', 'date', 'month', 'all']);
const CHANNEL_PAGE_SIZE = 25;
const XP_PAGE_SIZE = 25;

function canView(req) {
	return Boolean(req.session?.roles?.includes(config.roles.staff));
}

function wantsJson(req) {
	const accept = typeof req.get === 'function' ? req.get('accept') : req.headers?.accept;
	return req.xhr || String(accept || '').includes('application/json');
}

function baseView(req, extra = {}) {
	return {
		username: req.session.user.username,
		avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar),
		csrfToken: req.session.csrf,
		...extra,
	};
}

function fmt(n) {
	return Number(n || 0).toLocaleString('en-US');
}

function pct(part, whole) {
	if (!whole) return '0%';
	return `${((Number(part) / Number(whole)) * 100).toFixed(1)}%`;
}

function parsePage(value) {
	return Math.max(1, parseInt(value || 1, 10) || 1);
}

function parseMonth(value) {
	const month = parseInt(value, 10);
	if (!Number.isFinite(month) || month < 1 || month > 12) return null;
	return month;
}

function parseYear(value) {
	const year = parseInt(value, 10);
	if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
	return year;
}

function buildChannelFilters(query = {}) {
	const mode = VALID_CHANNEL_MODES.has(query.channel_mode) ? query.channel_mode : 'all';
	const channelPage = parsePage(query.channel_page);
	let date = '';
	let month = null;
	let year = null;
	let error = '';

	if (mode === 'date') {
		const rawDate = String(query.date || '').trim();
		if (!rawDate) {
			error = 'Enter a date when using the specific date filter.';
		} else {
			date = standardizeDate(rawDate) || '';
			if (!date) {
				error = 'Invalid date format. Use YYYY-MM-DD or similar.';
			}
		}
	} else if (mode === 'month') {
		month = parseMonth(query.month);
		year = parseYear(query.year);
		if (!month || !year) {
			error = 'Enter a valid month (1–12) and year when using the month filter.';
		}
	}

	return {
		mode,
		date,
		month,
		year,
		channelPage,
		error,
	};
}

function channelPeriodLabel(filters) {
	if (filters.mode === 'today') {
		return `Today (${new Date().toISOString().split('T')[0]})`;
	}
	if (filters.mode === 'date') {
		return filters.date || 'Specific date';
	}
	if (filters.mode === 'month') {
		return `${filters.month}/${filters.year}`;
	}
	return 'All time';
}

function channelQueryParams(filters) {
	return {
		channel_mode: filters.mode,
		date: filters.date || undefined,
		month: filters.month || undefined,
		year: filters.year || undefined,
		channel_page: filters.channelPage,
	};
}

function buildChannelEmptyHint(filters, coverage) {
	if (!coverage?.rowCount) {
		return 'No channel message stats have been recorded yet.';
	}
	if (filters.mode === 'today') {
		return `No messages recorded for ${channelPeriodLabel(filters)}. `
			+ `Stored stats span ${coverage.earliest} through ${coverage.latest}. `
			+ 'Try All time or pick a date in that range.';
	}
	if (filters.mode === 'all') {
		return 'No channel activity for this filter.';
	}
	return `No channel activity for ${channelPeriodLabel(filters)}. `
		+ `Stored stats span ${coverage.earliest} through ${coverage.latest}. `
		+ 'Try All time or another date in that range.';
}

async function buildChannelSection(filters, coverage) {
	if (filters.error) {
		return {
			periodLabel: channelPeriodLabel(filters),
			totalMessages: 0,
			totalMessagesLabel: '0',
			channelCount: 0,
			rows: [],
			page: filters.channelPage,
			pages: 1,
			error: filters.error,
			emptyHint: '',
			coverage,
		};
	}

	const queryParams = {
		date: filters.date,
		month: filters.month,
		year: filters.year,
	};
	const offset = (filters.channelPage - 1) * CHANNEL_PAGE_SIZE;
	const [totalMessages, channelCount, rows] = await Promise.all([
		db.sumChannelMessagesForQuery(filters.mode, queryParams),
		db.countChannelStatsForQuery(filters.mode, queryParams),
		db.listChannelStatsForQuery(filters.mode, queryParams, {
			limit: CHANNEL_PAGE_SIZE,
			offset,
		}),
	]);
	const pages = Math.max(1, Math.ceil(channelCount / CHANNEL_PAGE_SIZE));
	const mappedRows = rows.map((row, index) => ({
		rank: offset + index + 1,
		channelName: row.channel_name || 'Unknown channel',
		total: Number(row.total) || 0,
		totalLabel: fmt(row.total),
		shareLabel: pct(row.total, totalMessages),
	}));

	return {
		periodLabel: channelPeriodLabel(filters),
		totalMessages,
		totalMessagesLabel: fmt(totalMessages),
		channelCount,
		rows: mappedRows,
		page: Math.min(filters.channelPage, pages),
		pages,
		error: '',
		emptyHint: mappedRows.length ? '' : buildChannelEmptyHint(filters, coverage),
		coverage,
	};
}

async function buildXpSection(xpPage) {
	const page = parsePage(xpPage);
	const [summary, leaderboard] = await Promise.all([
		db.getXpSummary(),
		db.getLeaderboardPage({ page, limit: XP_PAGE_SIZE }),
	]);

	const offset = (leaderboard.page - 1) * leaderboard.limit;
	return {
		summary: {
			rankedUsers: summary.rankedUsers,
			rankedUsersLabel: fmt(summary.rankedUsers),
			totalXp: summary.totalXp,
			totalXpLabel: fmt(summary.totalXp),
		},
		rows: leaderboard.rows.map((row, index) => ({
			rank: offset + index + 1,
			username: row.username || `User ·${String(row.user_id || '').slice(-4)}`,
			level: row.level,
			levelLabel: fmt(row.level),
			xp: row.xp,
			xpLabel: fmt(row.xp),
			messageCount: row.message_count,
			messageCountLabel: fmt(row.message_count),
		})),
		page: leaderboard.page,
		pages: leaderboard.pages,
		total: leaderboard.total,
	};
}

async function buildServerStatsState(query = {}) {
	const channelFilters = buildChannelFilters(query);
	const xpPage = parsePage(query.xp_page);
	const coverage = await db.getChannelStatsCoverage();
	const [channel, xp] = await Promise.all([
		buildChannelSection(channelFilters, coverage),
		buildXpSection(xpPage),
	]);

	return {
		channelFilters,
		channel,
		xp,
		xpPage,
	};
}

router.get('/', async (req, res, next) => {
	try {
		if (!canView(req)) {
			return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
		}

		const state = await buildServerStatsState(req.query || {});

		if (wantsJson(req)) {
			return res.json({
				channelFilters: state.channelFilters,
				channel: state.channel,
				xp: state.xp,
			});
		}

		return res.render('serverStats', baseView(req, {
			channelFilters: state.channelFilters,
			channel: state.channel,
			xp: state.xp,
			xpPage: state.xpPage,
			channelQueryParams: channelQueryParams(state.channelFilters),
		}));
	}
	catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
