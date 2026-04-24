const { ABILITY_SEEDS } = require('../src/bot/tcg/tcgAbilitySeeds');

function now() {
  return Date.now();
}

exports.up = async function up(knex) {
  const hasElement = await knex.schema.hasColumn('card_data', 'element');
  const hasAbilityKey = await knex.schema.hasColumn('card_data', 'ability_key');
  if (!hasElement || !hasAbilityKey) {
    await knex.schema.table('card_data', (table) => {
      if (!hasElement) table.string('element', 32).nullable().index();
      if (!hasAbilityKey) table.string('ability_key', 64).nullable().index();
    });
  }

  const exists = await knex.schema.hasTable('tcg_abilities');
  if (!exists) {
    await knex.schema.createTable('tcg_abilities', (table) => {
      table.increments('ability_id').primary();
      table.string('ability_key', 64).notNullable().unique();
      table.tinyint('tier').notNullable().index();
      table.string('name', 128).notNullable();
      table.text('description').nullable();
      table.bigInteger('created_at');
      table.bigInteger('updated_at');
    });

    const t = now();
    const rows = ABILITY_SEEDS.map((r) => ({
      ability_key: r.ability_key,
      tier: r.tier,
      name: r.name,
      description: r.description,
      created_at: t,
      updated_at: t,
    }));
    await knex('tcg_abilities').insert(rows);
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('tcg_abilities');
  const hasElement = await knex.schema.hasColumn('card_data', 'element');
  const hasAbilityKey = await knex.schema.hasColumn('card_data', 'ability_key');
  if (hasElement || hasAbilityKey) {
    await knex.schema.table('card_data', (table) => {
      if (hasElement) table.dropColumn('element');
      if (hasAbilityKey) table.dropColumn('ability_key');
    });
  }
};