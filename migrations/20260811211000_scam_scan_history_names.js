exports.up = async function(knex) {
	const hasHistory = await knex.schema.hasTable('scam_scan_history');
	if (!hasHistory) return;

	const hasUserName = await knex.schema.hasColumn('scam_scan_history', 'user_name');
	const hasChannelName = await knex.schema.hasColumn('scam_scan_history', 'channel_name');
	if (hasUserName && hasChannelName) return;

	await knex.schema.alterTable('scam_scan_history', (table) => {
		if (!hasUserName) table.string('user_name', 100).nullable().after('user_id');
		if (!hasChannelName) table.string('channel_name', 100).nullable().after('channel_id');
	});
};

exports.down = async function(knex) {
	const hasHistory = await knex.schema.hasTable('scam_scan_history');
	if (!hasHistory) return;

	const hasUserName = await knex.schema.hasColumn('scam_scan_history', 'user_name');
	const hasChannelName = await knex.schema.hasColumn('scam_scan_history', 'channel_name');
	if (!hasUserName && !hasChannelName) return;

	await knex.schema.alterTable('scam_scan_history', (table) => {
		if (hasUserName) table.dropColumn('user_name');
		if (hasChannelName) table.dropColumn('channel_name');
	});
};
