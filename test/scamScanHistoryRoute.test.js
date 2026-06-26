const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/scam-scan-history');
const config = require('../config');

function routeHandler(path, method) {
	const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
	assert.ok(layer, `${method.toUpperCase()} ${path} route should exist`);
	return layer.route.stack[0].handle;
}

function fakeReq({ staff = true, query = {} } = {}) {
	return {
		query,
		headers: {},
		session: {
			csrf: 'token',
			roles: staff ? [config.roles.staff] : ['user-role'],
			user: { id: 'user-1', username: 'Staff', avatar: null },
		},
	};
}

function fakeRes() {
	const calls = [];
	return {
		statusCode: 200,
		status(code) {
			this.statusCode = code;
			calls.push({ type: 'status', code });
			return this;
		},
		json(payload) {
			calls.push({ type: 'json', payload, statusCode: this.statusCode });
			return this;
		},
		render(view, model) {
			calls.push({ type: 'render', view, model, statusCode: this.statusCode });
			return this;
		},
		_calls: calls,
	};
}

function patchDb(overrides) {
	const originals = {};
	for (const [key, value] of Object.entries(overrides)) {
		originals[key] = db[key];
		db[key] = value;
	}
	return () => {
		for (const [key, value] of Object.entries(originals)) {
			db[key] = value;
		}
	};
}

function emptyMetrics() {
	return {
		total: 0,
		byStatus: {},
		byReasonCode: {},
		byFailureStage: {},
		manualReviewQueued: 0,
		averages: {},
		max: {},
		slowRecent: [],
	};
}

test('scam scan history route denies non-staff access', async () => {
	const res = fakeRes();
	await routeHandler('/', 'get')(fakeReq({ staff: false }), res, assert.ifError);

	assert.equal(res.statusCode, 403);
});

test('staff can GET scam scan history dashboard', async () => {
	const restore = patchDb({
		getScamScanMetrics: async () => emptyMetrics(),
		getScamScanRuleHitMetrics: async () => [],
		getScamScanHistoryPage: async () => ({ page: 1, limit: 25, rows: [], hasMore: false }),
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
		const render = res._calls.find((call) => call.type === 'render');

		assert.equal(render.view, 'scamScanHistory');
		assert.equal(render.model.filters.range, '24h');
	}
	finally {
		restore();
	}
});

test('scam scan history filters are sanitized before querying', async () => {
	let observed = null;
	const restore = patchDb({
		getScamScanMetrics: async (filters) => {
			observed = filters;
			return emptyMetrics();
		},
		getScamScanRuleHitMetrics: async () => [],
		getScamScanHistoryPage: async () => ({ page: 1, limit: 25, rows: [], hasMore: false }),
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq({
			query: {
				range: 'bad-range',
				status: 'not-a-status',
				reason_code: '<script>',
				failure_stage: 'ocr',
				manual_review_queued: 'true',
			},
		}), res, assert.ifError);

		assert.equal(observed.status, null);
		assert.equal(observed.reasonCode, null);
		assert.equal(observed.failureStage, 'ocr');
		assert.equal(observed.manualReviewQueued, true);
		assert.ok(observed.from instanceof Date);
	}
	finally {
		restore();
	}
});

test('scam scan history dashboard does not receive raw attachment URLs', async () => {
	const restore = patchDb({
		getScamScanMetrics: async () => emptyMetrics(),
		getScamScanRuleHitMetrics: async () => [],
		getScamScanHistoryPage: async () => ({
			page: 1,
			limit: 25,
			hasMore: false,
			rows: [{
				id: 1,
				status: 'hit',
				reason_code: 'ocr',
				attachment_url_hash: 'a'.repeat(64),
				ocr_preview: 'short preview only',
				matched_rule_ids: ['7'],
			}],
		}),
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
		const row = res._calls.find((call) => call.type === 'render').model.scans[0];

		assert.equal(row.attachment_url, undefined);
		assert.equal(row.ocr_preview, 'short preview only');
	}
	finally {
		restore();
	}
});

test('scam scan history resolves user and channel display names', async () => {
	const query = db.query;
	const restore = patchDb({
		getScamScanMetrics: async () => emptyMetrics(),
		getScamScanRuleHitMetrics: async () => [],
		getScamScanHistoryPage: async () => ({
			page: 1,
			limit: 25,
			hasMore: false,
			rows: [{
				id: 1,
				user_id: '123',
				channel_id: '456',
				matched_rule_ids: [],
			}],
		}),
		query(table) {
			if (table === 'users') {
				return {
					select: () => ({
						whereIn: async () => [{ discord_id: '123', username: 'Alice' }],
					}),
				};
			}
			if (table === 'channel_stats') {
				return {
					select: () => ({
						whereIn: () => ({
							orderBy: async () => [{ channel_id: '456', channel_name: 'mod-log', month_day: '2026-06-26' }],
						}),
					}),
				};
			}
			return query(table);
		},
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
		const row = res._calls.find((call) => call.type === 'render').model.scans[0];

		assert.equal(row.user_display, 'Alice (123)');
		assert.equal(row.channel_display, 'mod-log (456)');
	}
	finally {
		restore();
	}
});
