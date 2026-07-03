const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/moderation-action-logs');
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

test('moderation action logs route denies non-staff access', async () => {
	const res = fakeRes();
	await routeHandler('/', 'get')(fakeReq({ staff: false }), res, assert.ifError);
	assert.equal(res.statusCode, 403);
});

test('staff can GET moderation action logs dashboard', async () => {
	const restore = patchDb({
		getModerationActionLogMetrics: async () => ({ total: 0, byActionType: {} }),
		getModerationActionLogsPage: async () => ({ page: 1, limit: 25, rows: [], hasMore: false }),
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);
		const render = res._calls.find((call) => call.type === 'render');
		assert.equal(render.view, 'moderationActionLogs');
		assert.equal(render.model.filters.range, '24h');
		assert.ok(Array.isArray(render.model.actionTypes));
	}
	finally {
		restore();
	}
});

test('moderation action logs filters are sanitized before querying', async () => {
	let observed = null;
	const restore = patchDb({
		getModerationActionLogMetrics: async (filters) => {
			observed = filters;
			return { total: 0, byActionType: {} };
		},
		getModerationActionLogsPage: async () => ({ page: 1, limit: 25, rows: [], hasMore: false }),
	});
	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq({
			query: {
				range: 'bad-range',
				action_type: 'not-valid',
				target_user_id: 'abc',
				moderator_user_id: '123456789012345678',
				search: 'spam link',
			},
		}), res, assert.ifError);

		assert.equal(observed.actionType, null);
		assert.equal(observed.targetUserId, null);
		assert.equal(observed.moderatorUserId, '123456789012345678');
		assert.equal(observed.search, 'spam link');
		assert.ok(observed.from instanceof Date);
	}
	finally {
		restore();
	}
});

test('moderation action logs JSON response includes enriched rows', async () => {
	const restore = patchDb({
		getModerationActionLogMetrics: async () => ({ total: 1, byActionType: { ban: 1 } }),
		getModerationActionLogsPage: async () => ({
			page: 1,
			limit: 25,
			hasMore: false,
			rows: [{
				id: 1,
				action_type: 'ban',
				target_user_id: '123',
				target_username: 'BadUser',
				target_display_name: 'BadNick',
				moderator_user_id: '456',
				moderator_username: 'ModUser',
				moderator_display_name: 'ModNick',
				channel_id: '789',
				reason: 'spam',
				deleted_content: 'bad message',
				source: 'bot_auto',
				created_at: '2026-07-03T12:00:00.000Z',
				metadata_json: null,
			}],
		}),
		query(table) {
			if (table === 'channel_stats') {
				return {
					select: () => ({
						whereIn: () => ({
							orderBy: async () => [{ channel_id: '789', channel_name: 'general' }],
						}),
					}),
				};
			}
			return db.query(table);
		},
	});
	try {
		const res = fakeRes();
		const req = fakeReq({ query: { range: '7d' } });
		req.xhr = true;
		req.get = () => 'application/json';
		await routeHandler('/', 'get')(req, res, assert.ifError);
		const json = res._calls.find((call) => call.type === 'json').payload;
		assert.equal(json.logs[0].target_display, 'BadNick / BadUser (123)');
		assert.equal(json.logs[0].channel_display, 'general (789)');
		assert.equal(json.metrics.total, 1);
	}
	finally {
		restore();
	}
});
