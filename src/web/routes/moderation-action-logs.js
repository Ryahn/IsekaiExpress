const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');
const { VALID_ACTION_TYPES } = require('../../../database/repositories/moderationActionLogRepository');

const VALID_RANGES = new Set(['24h', '7d', '30d']);

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

function rangeStart(range) {
	const now = Date.now();
	if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000);
	if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
	return new Date(now - 30 * 24 * 60 * 60 * 1000);
}

function cleanToken(value, maxLength = 64) {
	const text = String(value || '').trim();
	if (!text || text.length > maxLength) return '';
	return /^[a-zA-Z0-9_.:-]+$/.test(text) ? text : '';
}

function cleanSnowflake(value) {
	const text = String(value || '').trim();
	if (!text || !/^\d{10,32}$/.test(text)) return '';
	return text;
}

function cleanSearch(value) {
	const text = String(value || '').trim();
	if (!text || text.length > 200) return '';
	return text;
}

function buildFilters(query = {}) {
	const range = VALID_RANGES.has(query.range) ? query.range : '24h';
	const actionType = cleanToken(query.action_type, 32);
	return {
		page: Math.max(1, parseInt(query.page || 1, 10) || 1),
		limit: 25,
		range,
		actionType: VALID_ACTION_TYPES.has(actionType) ? actionType : '',
		targetUserId: cleanSnowflake(query.target_user_id),
		moderatorUserId: cleanSnowflake(query.moderator_user_id),
		search: cleanSearch(query.search || query.q),
		from: rangeStart(range),
	};
}

function publicFilters(filters) {
	return {
		range: filters.range,
		actionType: filters.actionType,
		targetUserId: filters.targetUserId,
		moderatorUserId: filters.moderatorUserId,
		search: filters.search,
		page: filters.page,
	};
}

function uniqueIds(rows, key) {
	return [...new Set(
		(rows || [])
			.map((row) => row[key])
			.filter((value) => value != null && value !== '')
			.map((value) => String(value)),
	)];
}

async function lookupChannelNames(channelIds) {
	if (!channelIds.length) return new Map();
	try {
		const rows = await db.query('channel_stats')
			.select('channel_id', 'channel_name', 'month_day')
			.whereIn('channel_id', channelIds)
			.orderBy('month_day', 'desc');
		const names = new Map();
		for (const row of rows) {
			const id = String(row.channel_id);
			if (!names.has(id) && row.channel_name) names.set(id, row.channel_name);
		}
		return names;
	} catch {
		return new Map();
	}
}

function displayUser(row, prefix) {
	const username = row[`${prefix}_username`];
	const displayName = row[`${prefix}_display_name`];
	const userId = row[`${prefix}_user_id`];
	const serverLabel = displayName && displayName !== username ? displayName : null;
	const globalLabel = username || null;
	if (serverLabel && globalLabel && serverLabel !== globalLabel) {
		return `${serverLabel} / ${globalLabel} (${userId})`;
	}
	if (globalLabel) return `${globalLabel} (${userId})`;
	if (serverLabel) return `${serverLabel} (${userId})`;
	return userId || '-';
}

async function enrichRows(rows) {
	const channelIds = uniqueIds(rows, 'channel_id');
	const channelNames = await lookupChannelNames(channelIds);

	return rows.map((row) => ({
		...row,
		target_display: displayUser(row, 'target'),
		moderator_display: displayUser(row, 'moderator'),
		channel_display: row.channel_id
			? (channelNames.get(String(row.channel_id))
				? `${channelNames.get(String(row.channel_id))} (${row.channel_id})`
				: String(row.channel_id))
			: '-',
		target_avatar_url: row.target_user_id && /^\d{10,32}$/.test(String(row.target_user_id))
			? getDiscordAvatarUrl(row.target_user_id)
			: null,
		moderator_avatar_url: row.moderator_user_id && /^\d{10,32}$/.test(String(row.moderator_user_id))
			? getDiscordAvatarUrl(row.moderator_user_id)
			: null,
	}));
}

async function buildLogsState(query = {}) {
	const filters = buildFilters(query);
	const queryFilters = {
		page: filters.page,
		limit: filters.limit,
		actionType: filters.actionType || null,
		targetUserId: filters.targetUserId || null,
		moderatorUserId: filters.moderatorUserId || null,
		search: filters.search || null,
		from: filters.from,
	};
	const [metrics, page] = await Promise.all([
		db.getModerationActionLogMetrics(queryFilters),
		db.getModerationActionLogsPage(queryFilters),
	]);
	return {
		filters,
		publicFilters: publicFilters(filters),
		metrics,
		logs: await enrichRows(page.rows),
		page,
		actionTypes: [...VALID_ACTION_TYPES],
	};
}

router.get('/', async (req, res, next) => {
	try {
		if (!canView(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
		const state = await buildLogsState(req.query || {});
		if (wantsJson(req)) {
			return res.json({
				filters: state.publicFilters,
				metrics: state.metrics,
				logs: state.logs,
				page: state.page,
				actionTypes: state.actionTypes,
			});
		}
		return res.render('moderationActionLogs', baseView(req, {
			filters: state.filters,
			metrics: state.metrics,
			logs: state.logs,
			page: state.page,
			actionTypes: state.actionTypes,
			alpineStateJson: JSON.stringify({
				filters: state.publicFilters,
				metrics: state.metrics,
				logs: state.logs,
				page: state.page,
				actionTypes: state.actionTypes,
			}).replace(/</g, '\\u003c'),
		}));
	} catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
