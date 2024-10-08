const db = require('./database/db');

async function test() {
	const result = await db.query(`SELECT guildId FROM GuildConfigurable`);
	console.log(result);
}

test();