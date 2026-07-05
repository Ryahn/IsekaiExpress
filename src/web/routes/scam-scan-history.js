const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const db = require('../../../database/db');
const config = require('../../../config');
const { hasModOrStaffRole } = require('../utils/roleAccess');

const VALID_RANGES = new Set(['24h', '7d', '30d']);
const VALID_STATUSES = new Set(['clean', 'hit', 'timeout', 'failed', 'skipped']);
const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const DISCORD_NAME_CACHE_MS = 10 * 60 * 1000;
const discordNameCache = new Map();

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

function localNameMap(rows, idKey, nameKey) {
	const names = new Map();
	for (const row of rows || []) {
		const id = row[idKey] == null ? '' : String(row[idKey]);
		const name = row[nameKey] == null ? '' : String(row[nameKey]).trim();
		if (id && name && !names.has(id)) names.set(id, name);
	}
	return names;
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

async function fetchDiscordName(kind, id) {
	if (!config.discord.botToken || !id) return '';
	const cacheKey = `${kind}:${id}`;
	const cached = discordNameCache.get(cacheKey);
	if (cached && Date.now() - cached.t < DISCORD_NAME_CACHE_MS) return cached.name;

	try {
		const path = kind === 'channel' ? `/channels/${id}` : `/users/${id}`;
		const response = await axios.get(`${DISCORD_API_BASE_URL}${path}`, {
			headers: { Authorization: `Bot ${config.discord.botToken}` },
			timeout: 3000,
		});
		const data = response.data || {};
		const name = kind === 'channel'
			? data.name
			: (data.global_name || data.username);
		discordNameCache.set(cacheKey, { t: Date.now(), name: name || '' });
		return name || '';
	}
	catch {
		discordNameCache.set(cacheKey, { t: Date.now(), name: '' });
		return '';
	}
}

async function fillDiscordNames(ids, kind, names) {
	const missingIds = ids.filter((id) => !names.has(id));
	await Promise.all(missingIds.map(async (id) => {
		const name = await fetchDiscordName(kind, id);
		if (name) names.set(id, name);
	}));
}

async function persistHistoryName(kind, id, name) {
	if (!id || !name) return;
	const column = kind === 'channel' ? 'channel_name' : 'user_name';
	const idColumn = kind === 'channel' ? 'channel_id' : 'user_id';
	try {
		await db.query('scam_scan_history')
			.where({ [idColumn]: id })
			.update({ [column]: String(name).slice(0, 100) });
	}
	catch {
		// Older databases may not have the name columns until migrations run.
	}
}

async function persistResolvedNames(rows, userNames, channelNames) {
	const missingUsers = uniqueIds(
		rows.filter((scan) => !String(scan.user_name || '').trim()),
		'user_id',
	);
	const missingChannels = uniqueIds(
		rows.filter((scan) => !String(scan.channel_name || '').trim()),
		'channel_id',
	);
	await Promise.all([
		...missingUsers.map((id) => persistHistoryName('user', id, userNames.get(id))),
		...missingChannels.map((id) => persistHistoryName('channel', id, channelNames.get(id))),
	]);
}

async function enrichScanDisplayNames(scans) {
	const rows = scans || [];
	const userIds = uniqueIds(rows, 'user_id');
	const channelIds = uniqueIds(rows, 'channel_id');
	const storedUserNames = localNameMap(rows, 'user_id', 'user_name');
	const storedChannelNames = localNameMap(rows, 'channel_id', 'channel_name');
	const [userNames, channelNames] = await Promise.all([
		lookupUserNames(userIds),
		lookupChannelNames(channelIds),
	]);
	const resolvedUserNames = new Map([...userNames, ...storedUserNames]);
	const resolvedChannelNames = new Map([...channelNames, ...storedChannelNames]);

	await Promise.all([
		fillDiscordNames(userIds, 'user', resolvedUserNames),
		fillDiscordNames(channelIds, 'channel', resolvedChannelNames),
	]);
	await persistResolvedNames(rows, resolvedUserNames, resolvedChannelNames);

	return rows.map((scan) => ({
		...scan,
		user_display: displayNameWithId(resolvedUserNames.get(String(scan.user_id)), scan.user_id),
		channel_display: displayNameWithId(resolvedChannelNames.get(String(scan.channel_id)), scan.channel_id),
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
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];
