/**
 * Catalog templates: base stats + member_id on card_data; paths …/cards/<slug>/<rarity>/<element>.png
 * Inventory: user_cards per-instance (drop quantity + composite unique), ability/level on instance.
 */

async function currentDatabaseName(knex) {
  let name = knex.client.database();
  if (name) return name;
  const [rows] = await knex.raw('SELECT DATABASE() AS db');
  return rows && rows[0] ? rows[0].db : null;
}

exports.up = async function up(knex) {
  const hasBaseAtk = await knex.schema.hasColumn('card_data', 'base_atk');
  if (!hasBaseAtk) {
    await knex.schema.alterTable('card_data', (table) => {
      table.integer('base_atk').unsigned().nullable();
      table.integer('base_def').unsigned().nullable();
      table.integer('base_spd').unsigned().nullable();
      table.integer('base_hp').unsigned().nullable();
      table.integer('base_power').unsigned().nullable();
    });
  }

  const hasMemberId = await knex.schema.hasColumn('card_data', 'member_id');
  if (!hasMemberId) {
    await knex.schema.alterTable('card_data', (table) => {
      table.bigInteger('member_id').unsigned().nullable()
        .references('id').inTable('users');
    });
  }

  const hasLevelCol = await knex.schema.hasColumn('card_data', 'level');
  if (hasLevelCol) {
    await knex.schema.alterTable('card_data', (table) => {
      table.string('level', 64).nullable().alter();
    });
  }
  const hasPowerCol = await knex.schema.hasColumn('card_data', 'power');
  if (hasPowerCol) {
    await knex.schema.alterTable('card_data', (table) => {
      table.string('power', 64).nullable().alter();
    });
  }

  const hasAbilityOnUser = await knex.schema.hasColumn('user_cards', 'ability_key');
  if (!hasAbilityOnUser) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.string('ability_key', 64).nullable();
      table.tinyint('level').unsigned().notNullable().defaultTo(1);
      table.bigInteger('acquired_at').nullable();
      table.boolean('is_lent').notNullable().defaultTo(false);
      table.boolean('is_escrowed').notNullable().defaultTo(false);
    });
  }

  const dbName = await currentDatabaseName(knex);
  if (dbName) {
    const idxRows = await knex('information_schema.statistics')
      .select('INDEX_NAME as indexName')
      .where('TABLE_SCHEMA', dbName)
      .andWhere('TABLE_NAME', 'user_cards')
      .andWhere('NON_UNIQUE', 0)
      .whereNot('INDEX_NAME', 'PRIMARY');
    const names = [...new Set((idxRows || []).map((r) => r.indexName).filter(Boolean))];
    for (const indexName of names) {
      await knex.raw(`ALTER TABLE user_cards DROP INDEX \`${indexName}\``);
    }
  }

  const hasQuantity = await knex.schema.hasColumn('user_cards', 'quantity');
  if (hasQuantity) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.dropColumn('quantity');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('user_cards', 'ability_key')) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.dropColumn('is_escrowed');
      table.dropColumn('is_lent');
      table.dropColumn('acquired_at');
      table.dropColumn('level');
      table.dropColumn('ability_key');
    });
  }

  if (!(await knex.schema.hasColumn('user_cards', 'quantity'))) {
    await knex.schema.alterTable('user_cards', (table) => {
      table.integer('quantity').unsigned().notNullable().defaultTo(1);
    });
  }

  try {
    await knex.schema.alterTable('user_cards', (table) => {
      table.unique(['user_id', 'card_id']);
    });
  } catch (e) {
    /* duplicates may exist after up; resolve manually before rollback */
  }

  if (await knex.schema.hasColumn('card_data', 'member_id')) {
    await knex.schema.alterTable('card_data', (table) => {
      table.dropForeign(['member_id']);
      table.dropColumn('member_id');
    });
  }

  if (await knex.schema.hasColumn('card_data', 'base_atk')) {
    await knex.schema.alterTable('card_data', (table) => {
      table.dropColumn('base_power');
      table.dropColumn('base_hp');
      table.dropColumn('base_spd');
      table.dropColumn('base_def');
      table.dropColumn('base_atk');
    });
  }
};
