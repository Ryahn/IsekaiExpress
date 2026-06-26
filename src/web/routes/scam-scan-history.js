const express = require('express');
const router = express.Router();
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');

const VALID_RANGES = new Set(['24h', '7d', '30d']);
const VALID_STATUSES = new Set(['clean', 'hit', 'timeout', 'failed', 'skipped']);

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

function publicFilters(filters) {
	return {
		range: filters.range,
		status: filters.status,
		failureStage: filters.failureStage,
		reasonCode: filters.reasonCode,
		manualReviewQueued: filters.manualReviewQueued,
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

function displayNameWithId(name, id) {
	const idText = String(id || '');
	const nameText = String(name || '').trim();
	return nameText && nameText !== idText ? `${nameText} (${idText})` : idText;
}

async function lookupUserNames(userIds) {
	if (!userIds.length) return new Map();
	try {
		const rows = await db.query('users')
			.select('discord_id', 'username')
			.whereIn('discord_id', userIds);
		return new Map(rows.map((row) => [String(row.discord_id), row.username]));
	}
	catch {
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
	}
	catch {
		return new Map();
	}
}

async function enrichScanDisplayNames(scans) {
	const rows = scans || [];
	const [userNames, channelNames] = await Promise.all([
		lookupUserNames(uniqueIds(rows, 'user_id')),
		lookupChannelNames(uniqueIds(rows, 'channel_id')),
	]);
	return rows.map((scan) => ({
		...scan,
		user_display: displayNameWithId(userNames.get(String(scan.user_id)), scan.user_id),
		channel_display: displayNameWithId(channelNames.get(String(scan.channel_id)), scan.channel_id),
	}));
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
	const status = VALID_STATUSES.has(query.status) ? query.status : '';
	const failureStage = cleanToken(query.failure_stage, 32);
	const reasonCode = cleanToken(query.reason_code, 64);
	const manualReviewQueued =
    query.manual_review_queued === 'true'
    	? true
    	: query.manual_review_queued === 'false'
    		? false
    		: null;
	return {
		page: Math.max(1, parseInt(query.page || 1, 10) || 1),
		limit: 25,
		range,
		status,
		failureStage,
		reasonCode,
		manualReviewQueued,
		from: rangeStart(range),
	};
}

async function buildHistoryState(query = {}) {
	const filters = buildFilters(query);
	const queryFilters = {
		page: filters.page,
		limit: filters.limit,
		status: filters.status || null,
		reasonCode: filters.reasonCode || null,
		failureStage: filters.failureStage || null,
		manualReviewQueued: filters.manualReviewQueued,
		from: filters.from,
	};
	const [metrics, ruleHits, page] = await Promise.all([
		db.getScamScanMetrics(queryFilters),
		db.getScamScanRuleHitMetrics(queryFilters),
		db.getScamScanHistoryPage(queryFilters),
	]);
	return {
		filters,
		publicFilters: publicFilters(filters),
		metrics,
		ruleHits,
		scans: await enrichScanDisplayNames(page.rows),
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
				ruleHits: state.ruleHits,
				scans: state.scans,
				page: state.page,
			});
		}
		return res.render('scamScanHistory', baseView(req, {
			filters: state.filters,
			metrics: state.metrics,
			ruleHits: state.ruleHits,
			scans: state.scans,
			page: state.page,
			alpineStateJson: JSON.stringify({
				filters: state.publicFilters,
				metrics: state.metrics,
				ruleHits: state.ruleHits,
				scans: state.scans,
				page: state.page,
			}).replace(/</g, '\\u003c'),
		}));
	}
	catch (e) {
		next(e);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff];
