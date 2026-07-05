const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');
const { hasModOrStaffRole } = require('../utils/roleAccess');

const VALID_RANGES = new Set(['24h', '7d', '30d']);
const VALID_HANDLED_STATES = new Set(['pending', 'handled']);

function canView(req) {
	return hasModOrStaffRole(req.session);
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

function buildFilters(query = {}) {
	const range = VALID_RANGES.has(query.range) ? query.range : '24h';
	const handledState = VALID_HANDLED_STATES.has(query.handled_state) ? query.handled_state : '';
	return {
		page: Math.max(1, parseInt(query.page || 1, 10) || 1),
		limit: 25,
		range,
		eventType: cleanToken(query.event_type, 48),
		subjectType: cleanToken(query.subject_type, 48),
		status: cleanToken(query.status, 32),
		action: cleanToken(query.action, 64),
		handledState,
		userId: cleanToken(query.user_id, 32),
		channelId: cleanToken(query.channel_id, 32),
		from: rangeStart(range),
	};
}

function publicFilters(filters) {
	return {
		range: filters.range,
		eventType: filters.eventType,
		subjectType: filters.subjectType,
		status: filters.status,
		action: filters.action,
		handledState: filters.handledState,
		userId: filters.userId,
		channelId: filters.channelId,
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

async function lookupUserNames(userIds) {
	if (!userIds.length) return new Map();
	try {
		const rows = await db.query('users')
			.select('discord_id', 'username')
			.whereIn('discord_id', userIds);
		return new Map(rows.map((row) => [String(row.discord_id), row.username]));
	} catch {
		return new Map();
	}
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

function displayWithId(name, id) {
	const idText = String(id || '');
	const nameText = String(name || '').trim();
	return nameText && nameText !== idText ? `${nameText} (${idText})` : idText;
}

async function enrichRows(rows) {
	const userIds = uniqueIds(rows, 'author_id')
		.concat(uniqueIds(rows, 'subject_id'))
		.filter((id) => /^\d{10,32}$/.test(id));
	const channelIds = uniqueIds(rows, 'channel_id');
	const [userNames, channelNames] = await Promise.all([
		lookupUserNames([...new Set(userIds)]),
		lookupChannelNames(channelIds),
	]);

	return rows.map((row) => ({
		...row,
		author_display: displayWithId(userNames.get(String(row.author_id)), row.author_id),
		subject_display: displayWithId(userNames.get(String(row.subject_id)), row.subject_id),
		channel_display: displayWithId(channelNames.get(String(row.channel_id)), row.channel_id),
	}));
}

async function buildHistoryState(query = {}) {
	const filters = buildFilters(query);
	const queryFilters = {
		page: filters.page,
		limit: filters.limit,
		eventType: filters.eventType || null,
		subjectType: filters.subjectType || null,
		status: filters.status || null,
		action: filters.action || null,
		handledState: filters.handledState || null,
		userId: filters.userId || null,
		channelId: filters.channelId || null,
		from: filters.from,
	};
	const [metrics, page] = await Promise.all([
		db.getModerationReviewHistoryMetrics(queryFilters),
		db.getModerationReviewHistoryPage(queryFilters),
	]);
	return {
		filters,
		publicFilters: publicFilters(filters),
		metrics,
		events: await enrichRows(page.rows),
		page,
	};
}

router.get('/', async (req, res, next) => {
	try {
		if (!canView(req)) return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
		const state = await buildHistoryState(req.query || {});
		if (wantsJson(req)) {
			return res.json({
				filters: state.publicFilters,
				metrics: state.metrics,
				events: state.events,
				page: state.page,
			});
		}
		return res.render('moderationReviewHistory', baseView(req, {
			filters: state.filters,
			metrics: state.metrics,
			events: state.events,
			page: state.page,
			alpineStateJson: JSON.stringify({
				filters: state.publicFilters,
				metrics: state.metrics,
				events: state.events,
				page: state.page,
			}).replace(/</g, '\\u003c'),
		}));
	} catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];
