const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/db');
const router = require('../src/web/routes/server-stats');
const config = require('../config');

function routeHandler(path, method) {
	const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
	assert.ok(layer, `${method.toUpperCase()} ${path} route should exist`);
	return layer.route.stack[0].handle;
}

function fakeReq({ staff = true, query = {}, accept = '' } = {}) {
	return {
		query,
		headers: accept ? { accept } : {},
		get(name) {
			if (name === 'accept') return accept;
			return undefined;
		},
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

test('server stats route denies non-staff access', async () => {
	const res = fakeRes();
	await routeHandler('/', 'get')(fakeReq({ staff: false }), res, assert.ifError);

	assert.equal(res.statusCode, 403);
});

test('server stats default today mode renders channel and xp sections', async () => {
	const restore = patchDb({
		sumChannelMessagesForQuery: async () => 120,
		countChannelStatsForQuery: async () => 2,
		listChannelStatsForQuery: async () => ([
			{ channel_name: 'general', total: 80 },
			{ channel_name: 'off-topic', total: 40 },
		]),
		getXpSummary: async () => ({ rankedUsers: 10, totalXp: 5000 }),
		getLeaderboardPage: async () => ({
			rows: [{ user_id: '1', username: 'Alice', xp: 900, level: 5, message_count: 100 }],
			total: 10,
			page: 1,
			pages: 1,
			limit: 25,
		}),
	});

	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq(), res, assert.ifError);

		assert.equal(res.statusCode, 200);
		const renderCall = res._calls.find((call) => call.type === 'render');
		assert.ok(renderCall);
		assert.equal(renderCall.view, 'serverStats');
		assert.equal(renderCall.model.channelFilters.mode, 'today');
		assert.equal(renderCall.model.channel.rows.length, 2);
		assert.equal(renderCall.model.channel.totalMessages, 120);
		assert.equal(renderCall.model.xp.rows.length, 1);
		assert.equal(renderCall.model.xp.summary.rankedUsers, 10);
	}
	finally {
		restore();
	}
});

test('server stats date mode uses repository query with standardized date', async () => {
	let listArgs = null;
	const restore = patchDb({
		sumChannelMessagesForQuery: async (mode, params) => {
			assert.equal(mode, 'date');
			assert.equal(params.date, '2026-07-04');
			return 50;
		},
		countChannelStatsForQuery: async () => 1,
		listChannelStatsForQuery: async (mode, params, paging) => {
			listArgs = { mode, params, paging };
			return [{ channel_name: 'dev', total: 50 }];
		},
		getXpSummary: async () => ({ rankedUsers: 1, totalXp: 100 }),
		getLeaderboardPage: async () => ({
			rows: [],
			total: 0,
			page: 1,
			pages: 1,
			limit: 25,
		}),
	});

	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq({
			query: { channel_mode: 'date', date: '2026-07-04' },
		}), res, assert.ifError);

		assert.equal(listArgs.mode, 'date');
		assert.equal(listArgs.params.date, '2026-07-04');
		const renderCall = res._calls.find((call) => call.type === 'render');
		assert.equal(renderCall.model.channel.periodLabel, '2026-07-04');
	}
	finally {
		restore();
	}
});

test('server stats invalid date handled gracefully', async () => {
	const restore = patchDb({
		sumChannelMessagesForQuery: async () => {
			throw new Error('should not be called');
		},
		countChannelStatsForQuery: async () => {
			throw new Error('should not be called');
		},
		listChannelStatsForQuery: async () => {
			throw new Error('should not be called');
		},
		getXpSummary: async () => ({ rankedUsers: 0, totalXp: 0 }),
		getLeaderboardPage: async () => ({
			rows: [],
			total: 0,
			page: 1,
			pages: 1,
			limit: 25,
		}),
	});

	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq({
			query: { channel_mode: 'date', date: 'not-a-date' },
		}), res, assert.ifError);

		const renderCall = res._calls.find((call) => call.type === 'render');
		assert.match(renderCall.model.channel.error, /Invalid date format/);
		assert.equal(renderCall.model.channel.rows.length, 0);
	}
	finally {
		restore();
	}
});

test('server stats xp pagination returns correct page metadata', async () => {
	const restore = patchDb({
		sumChannelMessagesForQuery: async () => 0,
		countChannelStatsForQuery: async () => 0,
		listChannelStatsForQuery: async () => [],
		getXpSummary: async () => ({ rankedUsers: 50, totalXp: 99999 }),
		getLeaderboardPage: async ({ page, limit }) => {
			assert.equal(page, 2);
			assert.equal(limit, 25);
			return {
				rows: [{ user_id: '2', username: 'Bob', xp: 500, level: 3, message_count: 20 }],
				total: 50,
				page: 2,
				pages: 2,
				limit: 25,
			};
		},
	});

	try {
		const res = fakeRes();
		await routeHandler('/', 'get')(fakeReq({
			query: { xp_page: '2' },
			accept: 'application/json',
		}), res, assert.ifError);

		const jsonCall = res._calls.find((call) => call.type === 'json');
		assert.ok(jsonCall);
		assert.equal(jsonCall.payload.xp.page, 2);
		assert.equal(jsonCall.payload.xp.pages, 2);
		assert.equal(jsonCall.payload.xp.rows[0].rank, 26);
	}
	finally {
		restore();
	}
});

test('server stats route requires staff role export', () => {
	assert.deepEqual(router.requiredRoles, [config.roles.staff]);
});
