/**
 * Legacy DBs may have users.id as signed BIGINT (or INT) while Knex defaults use UNSIGNED.
 * Foreign keys must match the referenced column exactly; read COLUMN_TYPE from information_schema.
 */

async function currentDatabaseName(knex) {
  let name = knex.client.database();
  if (name) return name;
  const [rows] = await knex.raw('SELECT DATABASE() AS db');
  return rows && rows[0] ? rows[0].db : null;
}

function normalizeIntegerColumnType(columnType) {
  if (columnType == null) return '';
  return String(columnType)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\d+\)/g, '')
    .trim();
}

async function usersIdColumnType(knex, dbName) {
  const row = await knex('information_schema.COLUMNS')
    .select('COLUMN_TYPE')
    .where({
      TABLE_SCHEMA: dbName,
      TABLE_NAME: 'users',
      COLUMN_NAME: 'id',
    })
    .first();
  return row && row.COLUMN_TYPE ? row.COLUMN_TYPE : null;
}

async function resolveUsersIdType(knex) {
  const dbName = await currentDatabaseName(knex);
  if (!dbName) {
    throw new Error('Cannot resolve database name for users.id');
  }
  const idType = await usersIdColumnType(knex, dbName);
  if (!idType) {
    throw new Error('users.id not found; run users migration first');
  }
  return { dbName, idType };
}

async function columnSqlType(knex, dbName, tableName, columnName) {
  const row = await knex('information_schema.COLUMNS')
    .select('COLUMN_TYPE')
    .where({
      TABLE_SCHEMA: dbName,
      TABLE_NAME: tableName,
      COLUMN_NAME: columnName,
    })
    .first();
  return row && row.COLUMN_TYPE ? row.COLUMN_TYPE : null;
}

async function hasUserForeignKey(knex, dbName, tableName, columnName) {
  const row = await knex('information_schema.KEY_COLUMN_USAGE as kcu')
    .join('information_schema.TABLE_CONSTRAINTS as tc', function joinTc() {
      this.on('tc.CONSTRAINT_NAME', '=', 'kcu.CONSTRAINT_NAME').andOn(
        'tc.TABLE_SCHEMA',
        '=',
        'kcu.TABLE_SCHEMA'
      );
    })
    .where({
      'kcu.TABLE_SCHEMA': dbName,
      'kcu.TABLE_NAME': tableName,
      'kcu.COLUMN_NAME': columnName,
      'kcu.REFERENCED_TABLE_NAME': 'users',
      'tc.CONSTRAINT_TYPE': 'FOREIGN KEY',
    })
    .first();
  return Boolean(row);
}

/**
 * Add or align a nullable column with users.id and add FK if missing (partial-run safe).
 */
/**
 * Fix legacy/partial runs: column type must match users.id before MySQL accepts the FK.
 */
async function alignColumnToUsersIdAndFk(
  knex,
  tableName,
  columnName,
  fkOpts = {},
  { nullable = false } = {}
) {
  const { dbName, idType } = await resolveUsersIdType(knex);
  if (!(await knex.schema.hasTable(tableName))) return;
  if (!(await knex.schema.hasColumn(tableName, columnName))) return;

  const nullSql = nullable ? 'NULL' : 'NOT NULL';
  const cur = await columnSqlType(knex, dbName, tableName, columnName);
  if (
    cur &&
    normalizeIntegerColumnType(cur) !== normalizeIntegerColumnType(idType)
  ) {
    await knex.raw(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${idType} ${nullSql}`
    );
  }
  if (!(await hasUserForeignKey(knex, dbName, tableName, columnName))) {
    await knex.schema.alterTable(tableName, (table) => {
      const fk = table.foreign(columnName).references('id').inTable('users');
      if (fkOpts.onDelete) fk.onDelete(fkOpts.onDelete);
      if (fkOpts.onUpdate) fk.onUpdate(fkOpts.onUpdate);
    });
  }
}

async function alignUserIdColumnAndFk(knex, tableName, fkOpts = {}) {
  await alignColumnToUsersIdAndFk(knex, tableName, 'user_id', fkOpts, {
    nullable: false,
  });
}

async function ensureNullableUserFkColumn(knex, tableName, columnName, fkOpts = {}) {
  const dbName = await currentDatabaseName(knex);
  if (!dbName) {
    throw new Error(`Cannot resolve database name for ${tableName}.${columnName}`);
  }
  const idType = await usersIdColumnType(knex, dbName);
  if (!idType) {
    throw new Error('users.id not found; run users migration first');
  }

  const hasCol = await knex.schema.hasColumn(tableName, columnName);
  if (!hasCol) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${idType} NULL`);
  } else {
    const existing = await columnSqlType(knex, dbName, tableName, columnName);
    if (
      existing &&
      normalizeIntegerColumnType(existing) !== normalizeIntegerColumnType(idType)
    ) {
      await knex.raw(
        `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${idType} NULL`
      );
    }
  }

  if (!(await hasUserForeignKey(knex, dbName, tableName, columnName))) {
    await knex.schema.alterTable(tableName, (table) => {
      const fk = table.foreign(columnName).references('id').inTable('users');
      if (fkOpts.onDelete) fk.onDelete(fkOpts.onDelete);
      if (fkOpts.onUpdate) fk.onUpdate(fkOpts.onUpdate);
    });
  }
}

module.exports = {
  currentDatabaseName,
  normalizeIntegerColumnType,
  usersIdColumnType,
  resolveUsersIdType,
  columnSqlType,
  hasUserForeignKey,
  alignColumnToUsersIdAndFk,
  alignUserIdColumnAndFk,
  ensureNullableUserFkColumn,
};
